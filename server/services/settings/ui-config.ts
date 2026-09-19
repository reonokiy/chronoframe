import i18nOptions from '~~/i18n/i18n.options'
import type { FieldUIConfig } from '~~/shared/types/settings'

/**
 * Extended settings configuration with UI descriptions
 * This defines how the frontend displays and interacts with each settings field
 *
 * Note:
 * - This is only used on the Server side
 * - UI configuration information is returned to the frontend via API
 * - Avoid duplicating these configurations on the frontend
 */
export const APP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  title: {
    type: 'input',
    placeholder: 'ChronoFrame',
    required: true,
  },
  slogan: {
    type: 'input',
    placeholder: 'Your gallery slogan',
    help: 'settings.app.slogan.help',
  },
  author: {
    type: 'input',
    placeholder: 'Your name',
  },
  avatarUrl: {
    type: 'url',
    placeholder: 'https://example.com/avatar.jpg',
    help: 'settings.app.avatarUrl.help',
  },
  'appearance.theme': {
    type: 'tabs',
    options: [
      {
        label: 'settings.app.appearance.theme.light',
        value: 'light',
        icon: 'tabler:sun',
      },
      {
        label: 'settings.app.appearance.theme.dark',
        value: 'dark',
        icon: 'tabler:moon',
      },
      {
        label: 'settings.app.appearance.theme.system',
        value: 'system',
        icon: 'tabler:device-desktop',
      },
    ],
    help: 'settings.app.appearance.theme.help',
  },
}

export const MAP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'tabs',
    options: [
      { label: 'MapBox', value: 'mapbox' },
      { label: 'MapLibre', value: 'maplibre' },
    ],
  },
  'mapbox.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    required: true,
    visibleIf: { fieldKey: 'provider', value: 'mapbox' },
    help: 'settings.map.mapbox.token.help',
  },
  'mapbox.style': {
    type: 'input',
    placeholder: 'mapbox://styles/mapbox/light-v11',
    visibleIf: { fieldKey: 'provider', value: 'mapbox' },
  },
  'maplibre.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    required: true,
    visibleIf: { fieldKey: 'provider', value: 'maplibre' },
    help: 'settings.map.maplibre.token.help',
  },
  'maplibre.style': {
    type: 'input',
    placeholder: 'https://example.com/style.json',
    visibleIf: { fieldKey: 'provider', value: 'maplibre' },
  },
}

export const LOCATION_SETTINGS_UI: Record<string, FieldUIConfig> = {
  language: {
    type: 'select',
    options: i18nOptions.locales.map((locale) => ({
      label: locale.label,
      value: locale.language,
    })),
    help: 'settings.location.language.help',
  },
  'mapbox.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    help: 'settings.location.mapbox.token.help',
  },
  'nominatim.baseUrl': {
    type: 'url',
    placeholder: 'https://nominatim.openstreetmap.org',
    help: 'settings.location.nominatim.baseUrl.help',
  },
}

export const PRIVACY_SETTINGS_UI: Record<string, FieldUIConfig> = {
  'upload.autoEraseLocation': {
    type: 'toggle',
    help: 'settings.privacy.upload.autoEraseLocation.help',
  },
}

export const ANALYTICS_SETTINGS_UI: Record<string, FieldUIConfig> = {
  headScripts: {
    type: 'textarea',
    rows: 12,
    placeholder:
      "<!-- Google Analytics -->\n<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-XXXX\"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'G-XXXX');\n</script>",
    help: 'settings.analytics.headScripts.help',
  },
  bodyScripts: {
    type: 'textarea',
    rows: 12,
    placeholder:
      '<!-- Umami / Openpanel SDK -->\n<script src="https://analytics.example.com/script.js" data-website-id="xxx" defer></script>',
    help: 'settings.analytics.bodyScripts.help',
  },
}

export const SYSTEM_SETTINGS_UI: Record<string, FieldUIConfig> = {
  'upload.maxFileSize': {
    type: 'number',
    help: 'settings.app.upload.maxFileSize.help',
    min: 1,
    max: 10240,
  },
  'upload.duplicateCheck.enabled': {
    type: 'toggle',
    help: 'settings.system.upload.duplicateCheck.enabled.help',
  },
  'upload.duplicateCheck.mode': {
    type: 'tabs',
    options: [
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.skip',
        value: 'skip',
        icon: 'tabler:player-track-next',
      },
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.warn',
        value: 'warn',
        icon: 'tabler:alert-triangle',
      },
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.block',
        value: 'block',
        icon: 'tabler:ban',
      },
    ],
    help: 'settings.system.upload.duplicateCheck.mode.help',
  },
  webglImageViewerDebug: {
    type: 'toggle',
    help: 'settings.system.webglImageViewerDebug.help',
  },
}

export function getSettingUIConfig(
  namespace: string,
  key: string,
): FieldUIConfig | undefined {
  const uiConfigMap: Record<string, Record<string, FieldUIConfig>> = {
    app: APP_SETTINGS_UI,
    system: SYSTEM_SETTINGS_UI,
    privacy: PRIVACY_SETTINGS_UI,
    map: MAP_SETTINGS_UI,
    location: LOCATION_SETTINGS_UI,
    analytics: ANALYTICS_SETTINGS_UI,
  }

  return uiConfigMap[namespace]?.[key]
}
