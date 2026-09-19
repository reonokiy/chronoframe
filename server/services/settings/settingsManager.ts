import type {
  SettingConfig,
  SettingType,
  SettingValue,
} from '~~/shared/types/settings'
import type { SettingKey, SettingNamespace } from './contants'

export class SettingsManager {
  private static instance: SettingsManager
  protected settingsCache: Map<string, SettingValue> = new Map()
  protected _logger = logger.dynamic('settings-mgr')
  protected isInitializing = false

  private constructor() {}

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  /**
   * Set the initializing flag externally
   * Used during plugin initialization to prevent storage provider switch triggers
   * @param flag Boolean flag to set
   */
  setInitializingFlag(flag: boolean): void {
    this.isInitializing = flag
  }

  /**
   * Check if currently initializing
   * @returns true if initializing, false otherwise
   */
  isInitializing_(): boolean {
    return this.isInitializing
  }

  /**
   * Validate setting value against enum if defined
   * @param value Setting value
   * @param enumValues Enum values if defined
   * @returns true if valid, false if not valid
   */
  private validateEnum(
    value: SettingValue,
    enumValues: string[] | null,
  ): boolean {
    // Allow null values if no enum is defined
    if (value === null) {
      return !enumValues || enumValues.length === 0
    }

    if (!enumValues || enumValues.length === 0) {
      return true
    }
    return enumValues.includes(String(value))
  }

  /**
   * Generate cache key for a setting
   * @param namespace
   * @param key
   * @returns Cache key string
   * @example
   * getCacheKey('app', 'theme') => 'app:theme'
   */
  private getCacheKey(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
  ): string {
    return `${namespace}:${key}`
  }

  /**
   * Serialize setting value to string for storage
   * @param value Setting value
   * @returns Serialized string
   * @example
   * serialize(true) => 'true'
   * serialize({ theme: 'dark' }) => '{"theme":"dark"}'
   * serialize(null) => 'null'
   */
  private serialize(value: SettingValue): string | null {
    if (value === null) return null
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  /**
   * Deserialize setting value from string
   * @param value Serialized string or null
   * @param type Setting type
   * @returns Deserialized setting value
   * @example
   * deserialize('true', 'boolean') => true
   * deserialize('{"theme":"dark"}', 'json') => { theme: 'dark' }
   * deserialize('null', 'string') => null
   * deserialize(null, 'string') => null
   */
  private deserialize(value: string | null, type: SettingType): SettingValue {
    // Handle null or 'null' string value
    if (value === null || value === 'null') {
      return null
    }

    switch (type) {
      case 'string':
        return value
      case 'number':
        return Number(value)
      case 'boolean':
        return value === 'true'
      default:
        return JSON.parse(value)
    }
  }

  /**
   * Initialize settings manager with default settings
   * @param configs Array of setting configurations
   */
  async init(configs: SettingConfig[]): Promise<void> {
    const db = useDB()

    this._logger.info('Initializing settings manager with default settings')

    for (const config of configs) {
      // Skip if namespace or key is missing
      if (!config.namespace || !config.key) {
        this._logger.warn('Skipping config with missing namespace or key')
        continue
      }

      // Check if setting exists
      const existing = (
        await db
          .select()
          .from(tables.settings)
          .where(
            and(
              eq(tables.settings.namespace, config.namespace),
              eq(tables.settings.key, config.key),
            ),
          )
      )[0]

      // If not exists and has default value, insert it
      if (!existing) {
        await db.insert(tables.settings).values({
          namespace: config.namespace,
          key: config.key,
          type: config.type,
          value: this.serialize(config.defaultValue),
          defaultValue: this.serialize(config.defaultValue),
          label: config.label,
          description: config.description,
          isPublic: config.isPublic,
          isReadonly: config.isReadonly,
          isSecret: config.isSecret,
          enum: config.enum ? [...config.enum] : null,
        })
      }
    }
  }

  async get<T = SettingValue>(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
    defaultValue?: T,
  ): Promise<T | null> {
    const cacheKey = this.getCacheKey(namespace, key)

    // Check cache first
    if (this.settingsCache.has(cacheKey)) {
      this._logger.debug(`Cache hit for setting ${cacheKey}`)
      return this.settingsCache.get(cacheKey) as T
    }

    // If not in cache, fetch from database
    const db = useDB()
    const setting = (
      await db
        .select()
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
        )
    )[0]

    // If not found, return default value
    if (!setting) {
      this._logger.debug(
        `Setting ${cacheKey} not found, returning default value`,
      )
      return defaultValue ?? null
    }

    this._logger.debug(`Setting ${cacheKey} fetched from database`)
    const value = this.deserialize(setting.value, setting.type)
    this.settingsCache.set(cacheKey, value)

    return value as T
  }

  /**
   * Check whether a setting still holds its default value, i.e. it has never
   * been customized by the user (via the dashboard, the wizard, or a previous
   * runtime-config migration with a non-default value).
   * @returns true if the stored value equals the stored default value.
   *          Also true if the setting does not exist.
   */
  async isDefault(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
  ): Promise<boolean> {
    const db = useDB()
    const setting = (
      await db
        .select({
          value: tables.settings.value,
          defaultValue: tables.settings.defaultValue,
        })
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
        )
    )[0]

    if (!setting) return true
    return setting.value === setting.defaultValue
  }

  async set(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
    value: SettingValue,
    updatedBy?: number,
    sudo = false,
  ): Promise<void> {
    const db = useDB()
    const cacheKey = this.getCacheKey(namespace, key)

    const existing = (
      await db
        .select()
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
        )
    )[0]

    if (!existing) {
      this._logger.warn(`Setting ${namespace}:${key} does not exist`)
      throw new Error(`Setting ${namespace}:${key} does not exist`)
    }

    if (existing.isReadonly && !sudo) {
      this._logger.warn(
        `Attempt to modify readonly setting ${namespace}:${key}`,
      )
      throw new Error(`Setting ${namespace}:${key} is readonly`)
    }

    if (!this.validateEnum(value, existing.enum)) {
      this._logger.warn(
        `Invalid value for enum setting ${namespace}:${key}. Value: ${value}, allowed: ${existing.enum?.join(', ')}`,
      )
      throw new Error(
        `Invalid value for setting ${namespace}:${key}. Allowed values: ${existing.enum?.join(', ')}`,
      )
    }

    const serializedValue = this.serialize(value)

    await db
      .update(tables.settings)
      .set({
        value: serializedValue,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      })
      .where(
        and(
          eq(tables.settings.namespace, namespace),
          eq(tables.settings.key, key),
        ),
      )

    this._logger.info(`Setting ${namespace}:${key} updated`)
    this.settingsCache.set(cacheKey, value)
  }

  async getNamespace(
    namespace: SettingNamespace,
  ): Promise<Record<string, SettingValue>> {
    const db = useDB()
    const settings = await db
      .select()
      .from(tables.settings)
      .where(eq(tables.settings.namespace, namespace))

    const result: Record<string, SettingValue> = {}

    for (const setting of settings) {
      result[setting.key] = this.deserialize(setting.value, setting.type)
    }
    return result
  }

  async getSchema(): Promise<SettingConfig[]> {
    const db = useDB()
    const settings = await db.select().from(tables.settings)

    return settings.map((setting) => ({
      namespace: setting.namespace,
      key: setting.key,
      type: setting.type,
      value: this.deserialize(setting.value, setting.type),
      defaultValue:
        setting.defaultValue &&
        this.deserialize(setting.defaultValue, setting.type),
      label: setting.label,
      description: setting.description,
      isReadonly: setting.isReadonly,
      isSecret: setting.isSecret,
      // 包含枚举值，过滤掉 null
      ...(setting.enum ? { enum: setting.enum } : {}),
    }))
  }
}

export const settingsManager = SettingsManager.getInstance()
