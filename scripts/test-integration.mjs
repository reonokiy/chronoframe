import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createServer as createTLSServer } from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, generateKeyPairSync, sign, createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import postgres from 'postgres'
import sharp from 'sharp'

// Isolated, disposable services. No real IdP, bucket or cluster credentials.
const suffix = randomBytes(4).toString('hex')
const containers = []
const clients = []
const servers = []
let app
const certDir = mkdtempSync(join(tmpdir(), 'chronoframe-test-tls-'))
const docker = (...args) => {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    throw new Error(
      `Docker ${args[0]} failed; verify the test image is available and Docker is running`,
    )
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function listen(server, protocol = 'http') {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  servers.push(server)
  return `${protocol}://127.0.0.1:${server.address().port}`
}
async function until(fn, description) {
  for (let n = 0; n < 180; n++) {
    try {
      if (await fn()) return
    } catch {}
    if (app?.exitCode !== null && app?.exitCode !== undefined)
      throw new Error('Application exited before readiness')
    await sleep(500)
  }
  throw new Error(`Timed out: ${description}`)
}

try {
  const dbName = `chronoframe-test-pg-${suffix}`
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    dbName,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=chronoframe',
    '-p',
    '127.0.0.1::5432',
    'postgres:17-alpine',
  )
  containers.push(dbName)
  const dbPort = docker('port', dbName, '5432/tcp').split(':').at(-1)
  const databaseUrl = `postgresql://postgres@127.0.0.1:${dbPort}/chronoframe`
  const db = postgres(databaseUrl, { onnotice() {} })
  clients.push(db)
  await until(async () => (await db`select 1`).length, 'PostgreSQL')

  const s3Name = `chronoframe-test-s3-${suffix}`
  const accessKeyId = randomBytes(12).toString('hex')
  const secretAccessKey = randomBytes(24).toString('hex')
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    s3Name,
    '-e',
    `MINIO_ROOT_USER=${accessKeyId}`,
    '-e',
    `MINIO_ROOT_PASSWORD=${secretAccessKey}`,
    '-p',
    '127.0.0.1::9000',
    'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z',
    'server',
    '/data',
  )
  containers.push(s3Name)
  const endpoint = `http://127.0.0.1:${docker('port', s3Name, '9000/tcp').split(':').at(-1)}`
  await until(
    async () => (await fetch(`${endpoint}/minio/health/ready`)).ok,
    'S3',
  )
  const s3 = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  const bucket = 'chronoframe-private'
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  const photo = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#336699' },
  })
    .jpeg()
    .toBuffer()
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: 'photos/test.jpg',
      Body: photo,
      ContentType: 'image/jpeg',
    }),
  )
  assert.equal(
    (await fetch(`${endpoint}/${bucket}/photos/test.jpg`)).status,
    403,
    'bucket must reject anonymous reads',
  )

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'integration',
    alg: 'RS256',
    use: 'sig',
  }
  const codes = new Map()
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(certDir, 'key.pem'),
      '-out',
      join(certDir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  let issuer
  issuer = await listen(
    createTLSServer(
      {
        key: readFileSync(join(certDir, 'key.pem')),
        cert: readFileSync(join(certDir, 'cert.pem')),
      },
      async (req, res) => {
        const url = new URL(req.url, issuer)
        res.setHeader('content-type', 'application/json')
        if (url.pathname === '/.well-known/openid-configuration')
          return res.end(
            JSON.stringify({
              issuer,
              authorization_endpoint: `${issuer}/authorize`,
              token_endpoint: `${issuer}/token`,
              jwks_uri: `${issuer}/jwks`,
              response_types_supported: ['code'],
              subject_types_supported: ['public'],
              id_token_signing_alg_values_supported: ['RS256'],
              token_endpoint_auth_methods_supported: ['client_secret_post'],
              code_challenge_methods_supported: ['S256'],
            }),
          )
        if (url.pathname === '/jwks')
          return res.end(JSON.stringify({ keys: [jwk] }))
        if (url.pathname === '/token') {
          let body = ''
          for await (const chunk of req) body += chunk
          const params = new URLSearchParams(body)
          const entry = codes.get(params.get('code'))
          codes.delete(params.get('code'))
          if (
            !entry ||
            createHash('sha256')
              .update(params.get('code_verifier') || '')
              .digest('base64url') !== entry.challenge
          ) {
            res.statusCode = 400
            return res.end(JSON.stringify({ error: 'invalid_grant' }))
          }
          const header = Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: jwk.kid }),
          ).toString('base64url')
          const claims = Buffer.from(
            JSON.stringify({
              iss: issuer,
              aud: 'chronoframe',
              sub: entry.subject,
              nonce: entry.nonce,
              name: 'Integration User',
              email: 'test@example.invalid',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 300,
            }),
          ).toString('base64url')
          const signature = sign(
            'RSA-SHA256',
            Buffer.from(`${header}.${claims}`),
            privateKey,
          ).toString('base64url')
          return res.end(
            JSON.stringify({
              access_token: randomBytes(32).toString('hex'),
              token_type: 'Bearer',
              expires_in: 300,
              id_token: `${header}.${claims}.${entry.invalidSignature ? 'invalid' : signature}`,
            }),
          )
        }
        res.statusCode = 404
        res.end('{}')
      },
    ),
    'https',
  )
  const portServer = createServer()
  const base = await listen(portServer)
  await new Promise((resolve) => portServer.close(resolve))
  app = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_EXTRA_CA_CERTS: join(certDir, 'cert.pem'),
      DATABASE_URL: databaseUrl,
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: new URL(base).port,
      NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
      NUXT_OIDC_ISSUER: issuer,
      NUXT_OIDC_CLIENT_ID: 'chronoframe',
      NUXT_OIDC_CLIENT_SECRET: randomBytes(24).toString('hex'),
      NUXT_OIDC_REDIRECT_URI: `${base.replace('http:', 'https:')}/api/auth/oidc/callback`,
      NUXT_OIDC_ALLOWED_SUBJECTS: 'owner',
      NUXT_STORAGE_DRIVER: 's3',
      NUXT_STORAGE_S3_ENDPOINT: endpoint,
      NUXT_STORAGE_S3_BUCKET: bucket,
      NUXT_STORAGE_S3_REGION: 'us-east-1',
      NUXT_STORAGE_S3_ACCESS_KEY_ID: accessKeyId,
      NUXT_STORAGE_S3_SECRET_ACCESS_KEY: secretAccessKey,
      NUXT_STORAGE_S3_FORCE_PATH_STYLE: 'true',
      NUXT_PUBLIC_GALLERY_PUBLIC: 'false',
      CFRAME_WORKER_COUNT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let appOutput = ''
  app.stdout.on('data', (b) => {
    appOutput += b
  })
  app.stderr.on('data', (b) => {
    appOutput += b
  })
  try {
    await until(
      async () => (await fetch(`${base}/api/health/ready`)).ok,
      'application',
    )
  } catch (error) {
    throw new Error(
      `${error.message}; application error categories: ${[...appOutput.matchAll(/(?:Error|error): ([^\n]+)/g)].map((m) => m[1]).join('; ')}`,
    )
  }

  const request = (path, cookie, options = {}) =>
    fetch(`${base}${path}`, {
      redirect: 'manual',
      ...options,
      headers: { ...(cookie ? { cookie } : {}), ...options.headers },
    })
  assert.equal((await request('/')).status, 302)
  const signInPage = await request('/signin')
  assert.equal(signInPage.status, 200)
  assert.match(await signInPage.text(), /Single sign-on/)
  for (const path of [
    '/api/photos',
    '/media/photos/test.jpg',
    '/image/photos/test.jpg',
    '/storage/photos/test.jpg',
    '/thumb/test',
  ])
    assert.equal((await request(path)).status, 401, path)

  async function login(subject, tamper = '') {
    const start = await request('/api/auth/oidc')
    assert.equal(start.status, 302)
    const location = new URL(start.headers.get('location'))
    const cookie = start.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const code = randomBytes(12).toString('hex')
    codes.set(code, {
      subject,
      nonce: tamper === 'nonce' ? 'wrong' : location.searchParams.get('nonce'),
      invalidSignature: tamper === 'signature',
      challenge: location.searchParams.get('code_challenge'),
    })
    return request(
      `/api/auth/oidc/callback?code=${code}&state=${tamper === 'state' ? 'wrong' : location.searchParams.get('state')}`,
      cookie,
    )
  }
  assert.equal(
    (await login('owner', 'state')).status,
    401,
    'state mismatch must fail',
  )
  assert.equal(
    (await login('owner', 'nonce')).status,
    401,
    'nonce mismatch must fail',
  )
  assert.equal(
    (await login('owner', 'signature')).status,
    401,
    'invalid signature must fail',
  )
  assert.equal(
    (await login('unlisted')).status,
    403,
    'unlisted subject must fail',
  )
  const signedIn = await login('owner')
  assert.equal(signedIn.status, 302, 'OIDC code flow')
  const cookie = signedIn.headers
    .getSetCookie()
    .filter((c) => !c.startsWith('chronoframe-oidc='))
    .map((c) => c.split(';')[0])
    .join('; ')
  assert.ok(cookie)
  assert.equal((await request('/api/profile', cookie)).status, 200)
  assert.equal(
    (
      await request('/api/login', cookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    404,
  )
  assert.equal((await request('/api/auth/github', cookie)).status, 404)
  assert.equal(
    (await request('/api/wizard/admin', cookie, { method: 'POST' })).status,
    404,
  )

  const media = await request('/media/photos/test.jpg', cookie)
  assert.equal(media.status, 200)
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), photo)
  assert.match(media.headers.get('cache-control'), /private/)
  assert.equal(
    (
      await request(
        `/thumb/${encodeURIComponent('/media/photos/test.jpg')}`,
        cookie,
      )
    ).status,
    200,
  )
  const ranged = await request('/media/photos/test.jpg', cookie, {
    headers: { range: 'bytes=0-9' },
  })
  assert.equal(ranged.status, 206)
  assert.equal((await ranged.arrayBuffer()).byteLength, 10)
  const prepared = await request('/api/photos', cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'upload.jpg', contentType: 'image/jpeg' }),
  })
  assert.equal(
    prepared.status,
    200,
    [
      ...appOutput.matchAll(
        /(?:TypeError|ReferenceError|PostgresError): ([^\n]+)/g,
      ),
    ]
      .map((m) => m[1])
      .join('; '),
  )
  const upload = await prepared.json()
  assert.ok(new URL(upload.signedUrl).searchParams.has('X-Amz-Signature'))
  assert.ok(
    (
      await fetch(upload.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: photo,
      })
    ).ok,
  )
  assert.equal(
    (await fetch(`${endpoint}/${bucket}/photos/upload.jpg`)).status,
    403,
  )

  const queued = await request('/api/queue/add-task', cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payload: { type: 'photo', storageKey: 'photos/upload.jpg' },
      maxAttempts: 1,
    }),
  })
  assert.equal(queued.status, 200)
  const { taskId } = await queued.json()
  await until(async () => {
    const [task] =
      await db`select status from pipeline_queue where id = ${taskId}`
    if (task?.status === 'failed') throw new Error('Photo processing failed')
    return task?.status === 'completed'
  }, 'photo processing')
  const [indexedPhoto] =
    await db`select original_url, thumbnail_url from photos`
  assert.ok(indexedPhoto.original_url.startsWith('/media/'))
  assert.ok(indexedPhoto.thumbnail_url.startsWith('/media/'))
  assert.equal((await request(indexedPhoto.thumbnail_url, cookie)).status, 200)
  const filteredQueue = await request('/api/queue/task/list?type=photo', cookie)
  assert.equal(filteredQueue.status, 200)
  assert.equal((await filteredQueue.json()).data.length, 1)

  const createAlbum = await request('/api/albums', cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'PostgreSQL integration' }),
  })
  assert.equal(createAlbum.status, 200)
  const album = await createAlbum.json()
  assert.ok(Number.isInteger(album.id))
  const editedAlbum = await request(`/api/albums/${album.id}`, cookie, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated in PostgreSQL' }),
  })
  assert.equal(editedAlbum.status, 200)
  assert.equal((await editedAlbum.json()).title, 'Updated in PostgreSQL')
  assert.equal((await request(`/api/albums/${album.id}`, cookie)).status, 200)
  assert.equal(
    (
      await request('/api/albums/reorder', cookie, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ albumIds: [album.id] }),
      })
    ).status,
    200,
  )
  assert.equal(
    (await request(`/api/albums/${album.id}`, cookie, { method: 'DELETE' }))
      .status,
    200,
  )
  const stats = await request('/api/system/stats', cookie)
  assert.equal(stats.status, 200)
  assert.equal(typeof (await stats.json()).photos.total, 'number')
  assert.equal((await login('owner')).status, 302)
  assert.equal(
    (
      await request('/api/queue/task/clear?olderThanDays=0', cookie, {
        method: 'DELETE',
      })
    ).status,
    200,
  )
  const users = await db`select oidc_subject from users`
  assert.deepEqual(
    users.map((u) => u.oidc_subject),
    ['owner'],
  )
  console.log(
    'PASS: PostgreSQL migration and album CRUD; OIDC signature/state/allowlist; retired login routes; private S3 upload/read/range and photo pipeline; anonymous access denial',
  )
} finally {
  if (app && app.exitCode === null) {
    app.kill('SIGTERM')
    await Promise.race([once(app, 'exit'), sleep(10_000)])
    if (app.exitCode === null) app.kill('SIGKILL')
  }
  for (const client of clients) await client.end({ timeout: 2 })
  for (const server of servers) server.close()
  for (const name of containers.reverse()) {
    try {
      docker('rm', '-f', name)
    } catch {}
  }
  rmSync(certDir, { recursive: true, force: true })
}
