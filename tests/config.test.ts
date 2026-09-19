import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalStorageProvider } from '../server/services/storage/providers/local'
import { resolveStorageConfig } from '../server/services/storage/config'
import { validateMediaKey } from '../server/services/storage/keys'
import {
  subjectAllowed,
  validateOIDCSettings,
} from '../server/services/auth/oidc'

const storage = {
  driver: '',
  localPath: './data/storage',
  prefix: 'photos',
  s3: {
    bucket: '',
    endpoint: '',
    region: 'auto',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
  },
}

test('development defaults to local; production requires configured S3', () => {
  assert.equal(resolveStorageConfig(storage, false).provider, 'local')
  assert.throws(() => resolveStorageConfig(storage, true), /required/)
  assert.throws(
    () => resolveStorageConfig({ ...storage, driver: 'local' }, true),
    /requires S3/,
  )
  assert.throws(
    () => resolveStorageConfig({ ...storage, driver: 'openlist' }, false),
    /Unsupported/,
  )
})

test('media keys stay inside the configured prefix', () => {
  assert.equal(validateMediaKey('photos/旅途.jpg', 'photos'), true)
  for (const key of [
    '../secret',
    'photos/../secret',
    '/photos/a',
    'photos\\a',
    'other/a',
    'photos//a',
    'photos/\0a',
  ]) {
    assert.equal(validateMediaKey(key, 'photos'), false, key)
  }
})

test('development local storage round-trips files and prevents directory escape', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'chronoframe-local-test-'))
  try {
    const provider = new LocalStorageProvider({
      provider: 'local',
      basePath,
      prefix: 'photos',
    })
    const bytes = Buffer.from('local test image')
    const object = await provider.create('photos/旅途.jpg', bytes)
    assert.equal(object.key, 'photos/旅途.jpg')
    assert.deepEqual(await provider.get(object.key), bytes)
    assert.equal((await provider.getFileMeta(object.key))?.size, bytes.length)
    assert.equal(
      provider.getMediaUrl(object.key),
      '/media/photos/%E6%97%85%E9%80%94.jpg',
    )
    await assert.rejects(
      provider.create('../../outside', bytes),
      /Invalid storage key/,
    )
    await provider.delete(object.key)
    assert.equal(await provider.get(object.key), null)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

test('OIDC fails closed and matches complete subjects, never email or substring', () => {
  assert.equal(subjectAllowed('user-1', ' user-1, user-2 '), true)
  assert.equal(subjectAllowed('user', 'user-1,user-2'), false)
  assert.equal(subjectAllowed('user-1', ''), false)
  const settings = {
    issuer: 'https://id.example.test',
    clientId: 'test',
    clientSecret: 'test',
    redirectUri: 'https://photos.example.test/api/auth/oidc/callback',
    allowedSubjects: 'user-1',
  }
  assert.doesNotThrow(() => validateOIDCSettings(settings, true))
  assert.throws(
    () => validateOIDCSettings({ ...settings, allowedSubjects: '' }, true),
    /subjects/,
  )
  assert.throws(
    () =>
      validateOIDCSettings(
        { ...settings, issuer: 'http://id.example.test' },
        true,
      ),
    /HTTPS/,
  )
  assert.throws(
    () =>
      validateOIDCSettings(
        { ...settings, redirectUri: 'https://photos.example.test/other' },
        true,
      ),
    /redirect URI/,
  )
})
