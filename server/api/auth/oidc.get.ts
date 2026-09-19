import * as oidc from 'openid-client'
import { getOIDCConfiguration } from '../../services/auth/oidc'
export default defineEventHandler(async (event) => {
  const settings = useRuntimeConfig().oidc
  const config = await getOIDCConfiguration(settings)
  const transaction = await useOIDCTransaction(event)
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const verifier = oidc.randomPKCECodeVerifier()
  await transaction.update({
    state,
    nonce,
    verifier,
    expiresAt: Date.now() + 300_000,
  })
  setHeader(event, 'Cache-Control', 'no-store')
  return sendRedirect(
    event,
    oidc.buildAuthorizationUrl(config, {
      redirect_uri: settings.redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    }).href,
  )
})
