import * as oidc from 'openid-client'
import {
  getOIDCConfiguration,
  subjectAllowed,
} from '../../../services/auth/oidc'
export default defineEventHandler(async (event) => {
  const settings = useRuntimeConfig().oidc
  const transaction = await useOIDCTransaction(event)
  const { state, nonce, verifier, expiresAt } = transaction.data
  await transaction.clear()
  setHeader(event, 'Cache-Control', 'no-store')
  if (!state || !nonce || !verifier || !expiresAt || expiresAt < Date.now())
    throw createError({
      statusCode: 400,
      statusMessage: 'Login expired. Please sign in again.',
    })
  try {
    const config = await getOIDCConfiguration(settings)
    const callback = new URL(settings.redirectUri)
    callback.search = getRequestURL(event).search
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    })
    const claims = tokens.claims()!
    if (!subjectAllowed(claims.sub, settings.allowedSubjects))
      throw createError({
        statusCode: 403,
        statusMessage: 'Account is not allowed to access this gallery',
      })
    const profile = config.serverMetadata().userinfo_endpoint
      ? await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)
      : claims
    const values = {
      oidcIssuer: claims.iss,
      oidcSubject: claims.sub,
      username: typeof profile.name === 'string' ? profile.name : claims.sub,
      email: typeof profile.email === 'string' ? profile.email : null,
      avatar: typeof profile.picture === 'string' ? profile.picture : null,
      isAdmin: 1,
    }
    const [user] = await useDB()
      .insert(tables.users)
      .values({ ...values, createdAt: new Date() })
      .onConflictDoUpdate({
        target: [tables.users.oidcIssuer, tables.users.oidcSubject],
        set: values,
      })
      .returning()
    if (!user) throw new Error('User could not be created')
    await clearUserSession(event)
    await setUserSession(event, { user })
    return sendRedirect(event, '/')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 403) throw error
    // Do not log authorization codes, provider responses or tokens.
    throw createError({
      statusCode: 401,
      statusMessage: 'OIDC sign-in failed. Please try again.',
    })
  }
})
