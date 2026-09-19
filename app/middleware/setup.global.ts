export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (to.path === '/signin') return
  if (
    !loggedIn.value &&
    (!useRuntimeConfig().public.galleryPublic ||
      to.path.startsWith('/dashboard'))
  ) {
    return navigateTo('/signin')
  }
})
