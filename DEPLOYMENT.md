# ChronoFrame personal deployment fork

This fork uses PostgreSQL in all environments, private S3 object storage in production, and local files by default during development. Authentication uses OIDC Authorization Code Flow with PKCE, state, nonce and ID-token signature validation. Password/GitHub login, the setup wizard, OpenList and editable storage credentials have been removed.

## Runtime architecture

One Nuxt/Nitro process serves the UI/API/media and runs the photo processing queue. PostgreSQL stores users, settings, albums, photo metadata and queue state. Original files, thumbnails and Live/Motion Photo files live in S3. Database media URLs point to stable same-origin `/media/...` paths, never public bucket URLs or persisted expiring signatures.

Use **one application replica** and a Recreate update strategy. PostgreSQL queue claims use `FOR UPDATE SKIP LOCKED`, but startup recovery still assumes a single application instance and settings are cached in process. This is not a multi-replica release. Shutdown drains active workers; the image sets `NITRO_SHUTDOWN_TIMEOUT=110000` (milliseconds). Allow 120 seconds and increase this if large-file processing requires longer. Interrupted jobs are retried at the next start.

`/app/data` holds temporary processing files and local logs in production; `/tmp` must also be writable. Mount ephemeral volumes at both paths. PostgreSQL and S3 contain durable application state; no application database PVC is needed. The image runs as UID/GID 65532 without a shell.

## Configuration and OIDC

Copy `.env.example` for development. In production supply configuration via ConfigMap/Secret (OpenBao and ESO in the Talos cluster). `DATABASE_URL` must address an existing PostgreSQL database; migrations run before request handling. Use PostgreSQL TLS settings in the connection URL as appropriate for the cluster.

Configure the OIDC application with the exact callback `https://<gallery-host>/api/auth/oidc/callback` and scopes `openid profile email`. Set issuer, client ID, client secret and redirect URI using `NUXT_OIDC_*`. `NUXT_OIDC_ALLOWED_SUBJECTS` is a mandatory comma-separated allowlist of exact `sub` claims from that issuer. Every allowed identity is a gallery administrator. There is no first-login claim, email account linking, local password, or development authentication bypass. Pocket ID application access restrictions can additionally limit the users allowed to obtain tokens.

Identity is keyed by `(issuer, subject)`; names and email are profile attributes. Sessions last 12 hours. The allowlist is rechecked on protected requests. Changes to deployment settings require restart. Logout clears the local application session; it does not end the identity provider's session.

Set `NUXT_SESSION_PASSWORD` to a strong random value of at least 32 characters. Production requires it explicitly and HTTPS for both OIDC issuer and callback. Production session cookies are Secure, HttpOnly and SameSite=Lax. TLS terminates at the gateway. Do not put S3/OIDC secrets in the database or frontend runtime configuration.

The gallery defaults to requiring sign-in for pages, APIs and media. `NUXT_PUBLIC_GALLERY_PUBLIC=true` permits public gallery browsing and public delivery through the application while keeping the bucket private. This is a site-level visibility setting, not per-photo sharing. Hidden albums are a display feature, not an authorization boundary for their media. Administrative operations still require an allowed OIDC session.

## Private S3

Create a dedicated **private** bucket: no public-read ACL, no anonymous bucket policy, and public-access blocking where supported. Give the application credentials bucket list and object read/write/delete permissions only for this bucket/prefix. Never expose bucket credentials to browsers.

Set `NUXT_STORAGE_S3_ENDPOINT`, `BUCKET`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` and, if needed, `FORCE_PATH_STYLE`. An empty endpoint uses the AWS regional endpoint. The prefix defaults to `photos`.

Reads are streamed from S3 by the application, including video byte ranges. They do not need public access or browser S3 read permissions. Uploads use short-lived presigned PUT URLs and require bucket CORS allowing the gallery origin, PUT, and Content-Type (plus any S3 checksum headers requested by the browser). Presigned upload URLs are bearer capabilities; keep their query strings out of access logs. TLS and browser reachability are required for the upload endpoint.

Production refuses the local provider; OpenList and CDN/public bucket URL settings do not exist. Environment configuration is authoritative, so rotating a Secret and restarting takes effect without editing database settings.

## Development

Use Node.js 24.21.0 (pinned in `.node-version`, CI and the Docker image) and pnpm 10.34.1. The supported runtime is Node.js 24.x.

```sh
docker compose -f compose.dev.yml up -d
cp .env.example .env
# Fill OIDC settings, allowed subjects and session password.
pnpm install --frozen-lockfile
pnpm dev
```

Development still uses PostgreSQL and OIDC. The included database uses trust authentication only on a loopback-bound local Docker port; do not deploy that compose file to production. Local images are stored in `data/storage`. HTTP OIDC is accepted only outside production for a local test identity provider.

## Talos/Kubernetes

Deploy the fork's digest-pinned image with a single-replica Deployment, Recreate strategy, ClusterIP Service on 3000, and the existing Envoy Gateway HTTPRoute/ListenerSet/Certificate pattern. Use the existing CNPG database service and a dedicated database/user. Inject configuration through ESO. Mount `emptyDir` at `/app/data` and `/tmp`, set fsGroup/runAsUser/runAsGroup 65532, readOnlyRootFilesystem, drop all capabilities, and disable privilege escalation.

Use `/api/health/live` for liveness and `/api/health/ready` for readiness; readiness checks the database and initialized storage provider, not external S3/IdP availability. Allow startup time for migrations. Set CPU/memory limits after testing real photo imports; the worker count defaults to two and is controlled by `CFRAME_WORKER_COUNT`. Gateway upload timeouts matter when using the development local provider; production S3 uploads go directly to the bucket.

Back up PostgreSQL and S3 independently and test a combined restore. This fork starts with a new PostgreSQL schema; it does **not** import an existing upstream SQLite database or rewrite old public media URLs.

## Validation

```sh
pnpm test
pnpm run typecheck:server
pnpm run build:deps
pnpm build
pnpm run test:integration
```

The integration test needs Docker and runs disposable PostgreSQL and MinIO containers plus a local OIDC issuer. It exercises the real built application and cleans up the test containers; no live cluster, bucket or identity-provider credentials are used.

The server TypeScript check is a CI gate. Full-project `vue-tsc --build` still reports frontend/shared typing errors and is not claimed as passing; the production build and end-to-end suite validate the application paths changed here.
