import { subjectAllowed } from '../services/auth/oidc'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  const media = /^\/(media|image|storage|thumb)\//.test(path)
  // Errors, redirects and denied requests must not inherit Cloudflare's default
  // caching for image extensions. Only successful media handlers opt in below.
  if (media) setHeader(event, 'Cache-Control', PRIVATE_MEDIA_CACHE_CONTROL)
  if (
    path === '/api/login' ||
    path === '/api/auth/github' ||
    path.startsWith('/api/wizard/') ||
    path.startsWith('/onboarding')
  )
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const config = useRuntimeConfig(event)
  if (
    path.startsWith('/_nuxt/') ||
    path.startsWith('/_i18n/') ||
    path.startsWith('/_fonts/') ||
    path.startsWith('/api/_nuxt_icon/') ||
    path === '/favicon.ico' ||
    path === '/signin' ||
    path === '/api/health/live' ||
    path === '/api/health/ready' ||
    path === '/api/auth/oidc' ||
    path === '/api/auth/oidc/callback' ||
    path === '/api/_auth/session' ||
    path === '/api/system/settings/all'
  )
    return
  const read = event.method === 'GET' || event.method === 'HEAD'
  const publicRead =
    config.public.galleryPublic === true &&
    read &&
    (media
      ? await isPublicMedia(event)
      : (!path.startsWith('/api/') && !path.startsWith('/dashboard')) ||
        path === '/api/photos' ||
        path === '/api/photos/visible' ||
        path === '/api/photos/reactions' ||
        path === '/api/albums' ||
        /^\/api\/albums\/\d+$/.test(path))
  if (publicRead) {
    if (media) event.context.publicMedia = true
    // Public media does not depend on a session. Its successful response also
    // strips cookies from nuxt-auth-utils' eager WebSocket session hook.
    return
  }
  const session = await getUserSession(event)
  const allowed =
    session.user &&
    session.user.oidcIssuer === config.oidc.issuer &&
    subjectAllowed(session.user.oidcSubject, config.oidc.allowedSubjects)
  if (!allowed && !publicRead) {
    if (
      path.startsWith('/api/') ||
      path.startsWith('/media/') ||
      path.startsWith('/storage/') ||
      path.startsWith('/image/') ||
      path.startsWith('/thumb/')
    )
      throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
    return sendRedirect(event, '/signin')
  }
  if (!publicRead) setHeader(event, 'Cache-Control', 'private, no-store')
})
