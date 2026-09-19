import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { validateOIDCSettings } from '../services/auth/oidc'
import { initializeSessionPassword } from '../services/auth/session-password'
import { DEFAULT_SETTINGS } from '../services/settings/contants'
import { settingsManager } from '../services/settings/settingsManager'
import { StorageManager, setGlobalStorageManager } from '../services/storage'
import { resolveStorageConfig } from '../services/storage/config'
import { WorkerPool } from '../services/pipeline-queue'

export default defineNitroPlugin((app) => {
  const config = useRuntimeConfig()
  const production = process.env.NODE_ENV === 'production'
  validateOIDCSettings(config.oidc, production)
  if (production && (process.env.NUXT_SESSION_PASSWORD?.length || 0) < 32)
    throw new Error(
      'NUXT_SESSION_PASSWORD must contain at least 32 characters in production',
    )
  const storageConfig = resolveStorageConfig(config.storage, production)
  const workerCount = Number(process.env.CFRAME_WORKER_COUNT || 2)
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 16)
    throw new Error('CFRAME_WORKER_COUNT must be an integer between 1 and 16')
  const storage = new StorageManager(storageConfig, logger.storage)
  const pool = new WorkerPool(
    {
      workerCount,
      intervalMs: 1500,
      intervalOffset: 300,
      enableLoadBalancing: true,
      statsReportInterval: 600_000,
    },
    logger.dynamic('queue'),
  )
  let rebalanceTimer: ReturnType<typeof setInterval> | undefined

  // Nitro 2 invokes plugins synchronously without awaiting returned promises.
  // Register hooks now, then gate every business request on this one sequence.
  const ready = (async () => {
    await initializeSessionPassword()
    await migrate(useDB(), {
      migrationsFolder: resolve('server/database/migrations'),
    })
    await settingsManager.init(DEFAULT_SETTINGS)
    if (storageConfig.provider === 'local')
      await mkdir(storageConfig.basePath, { recursive: true })
    setGlobalStorageManager(storage)
    await pool.start()
    globalThis.__workerPool = pool
    rebalanceTimer = setInterval(() => {
      void pool
        .rebalance()
        .catch(() => logger.chrono.error('Queue rebalance failed'))
    }, 300_000)
    logger.chrono.success('Runtime initialized')
  })()
  void ready.catch(() =>
    logger.chrono.error(
      'Runtime initialization failed; requests will remain unavailable',
    ),
  )

  app.hooks.hook('request', async (event) => {
    if (getRequestURL(event).pathname === '/api/health/live') return
    try {
      await ready
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'Application initialization failed',
      })
    }
    event.context.storage = storage
  })
  app.hooks.hook('close', async () => {
    await ready.catch(() => {})
    clearInterval(rebalanceTimer)
    await pool.stop()
    await closeDB()
  })
})
