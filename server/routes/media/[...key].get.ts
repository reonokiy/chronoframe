import { Readable } from 'node:stream'
import { S3StorageProvider } from '../../services/storage'
import { validateMediaKey } from '../../services/storage/keys'

export default defineEventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)
  const key = getRouterParam(event, 'key', { decode: true }) || ''
  if (!validateMediaKey(key, storageProvider.config?.prefix || ''))
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  if (storageProvider instanceof S3StorageProvider) {
    try {
      const range = getHeader(event, 'range')
      if (range && !/^bytes=\d*-\d*$/.test(range))
        throw createError({ statusCode: 416, statusMessage: 'Invalid range' })
      const object = await storageProvider.open(key, range)
      if (!object.Body)
        throw createError({ statusCode: 404, statusMessage: 'Media not found' })
      setHeader(
        event,
        'Content-Type',
        object.ContentType || 'application/octet-stream',
      )
      setHeader(event, 'Accept-Ranges', 'bytes')
      if (object.ContentLength !== undefined)
        setHeader(event, 'Content-Length', object.ContentLength)
      if (object.ContentRange) {
        setResponseStatus(event, 206)
        setHeader(event, 'Content-Range', object.ContentRange)
      }
      return sendStream(event, object.Body as Readable)
    } catch (error) {
      const status =
        (error as any).$metadata?.httpStatusCode || (error as any).statusCode
      throw createError({
        statusCode: status === 404 ? 404 : status === 416 ? 416 : 502,
        statusMessage: 'Media unavailable',
      })
    }
  }
  return sendRedirect(
    event,
    `/storage/${key.split('/').map(encodeURIComponent).join('/')}`,
  )
})
