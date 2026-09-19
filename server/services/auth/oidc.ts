import * as oidc from 'openid-client'

export interface OIDCSettings {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  allowedSubjects: string
}
let configuration: Promise<oidc.Configuration> | undefined
export function validateOIDCSettings(
  settings: OIDCSettings,
  production: boolean,
) {
  if (
    !settings.issuer ||
    !settings.clientId ||
    !settings.clientSecret ||
    !settings.redirectUri
  )
    throw new Error(
      'OIDC issuer, client ID, client secret and redirect URI are required',
    )
  const issuer = new URL(settings.issuer)
  const redirect = new URL(settings.redirectUri)
  if (
    production &&
    (issuer.protocol !== 'https:' || redirect.protocol !== 'https:')
  )
    throw new Error('Production OIDC requires HTTPS')
  if (
    redirect.pathname !== '/api/auth/oidc/callback' ||
    redirect.search ||
    redirect.hash
  )
    throw new Error('OIDC redirect URI must end with /api/auth/oidc/callback')
  if (!settings.allowedSubjects.trim())
    throw new Error('OIDC allowed subjects must be configured')
}
export function subjectAllowed(subject: string, allowed: string) {
  return allowed
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(subject)
}
export function getOIDCConfiguration(settings: OIDCSettings) {
  if (!configuration) {
    configuration = oidc
      .discovery(
        new URL(settings.issuer),
        settings.clientId,
        settings.clientSecret,
        undefined,
        {
          execute:
            process.env.NODE_ENV === 'production'
              ? [oidc.enableNonRepudiationChecks]
              : [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks],
        },
      )
      .catch((error) => {
        configuration = undefined
        throw error
      })
  }
  return configuration
}
