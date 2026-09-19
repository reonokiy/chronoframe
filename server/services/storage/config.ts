import {
  s3StorageConfigSchema,
  localStorageConfigSchema,
} from '../../../shared/types/storage'
export function resolveStorageConfig(
  config: {
    driver: string
    localPath: string
    prefix: string
    s3: {
      endpoint: string
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      forcePathStyle: boolean
    }
  },
  production: boolean,
) {
  const driver = config.driver || (production ? 's3' : 'local')
  if (production && driver !== 's3')
    throw new Error('Production requires S3 storage')
  if (driver === 'local')
    return localStorageConfigSchema.parse({
      provider: 'local',
      basePath: config.localPath,
      prefix: config.prefix,
    })
  if (driver !== 's3') throw new Error('Unsupported storage driver')
  for (const key of ['bucket', 'accessKeyId', 'secretAccessKey'] as const) {
    if (!config.s3[key]) throw new Error(`S3 ${key} is required`)
  }
  return s3StorageConfigSchema.parse({
    ...config.s3,
    provider: 's3',
    prefix: config.prefix,
  })
}
