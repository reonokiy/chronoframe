export type { StorageProvider, StorageObject } from './interfaces'

export {
  s3StorageConfigSchema,
  localStorageConfigSchema,
  storageConfigSchema,
} from '../../../shared/types/storage'

export type {
  S3StorageConfig,
  LocalStorageConfig,
  StorageConfig,
} from '../../../shared/types/storage'

export { StorageProviderFactory, StorageManager } from './manager'

export type {
  StorageManagerEventType,
  StorageManagerEventListener,
  StorageManagerEvent,
} from './manager'

export { S3StorageProvider } from './providers/s3'
export { LocalStorageProvider } from './providers/local'

export {
  setGlobalStorageManager,
  getGlobalStorageManager,
  getStorageManager,
  isStorageManagerInitialized,
} from './events'
