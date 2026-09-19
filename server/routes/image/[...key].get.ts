export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key', { decode: true }) || ''
  return sendRedirect(
    event,
    `/media/${key.split('/').map(encodeURIComponent).join('/')}`,
  )
})
