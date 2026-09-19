import sharp from 'sharp'
import { validateMediaKey } from '../../services/storage/keys'
export default defineEventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)
  const url = getRouterParam(event, 'thumbnailUrl', { decode: true }) || ''
  if (!url.startsWith('/media/'))
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid thumbnail URL',
    })
  const key = decodeURIComponent(url.slice('/media/'.length))
  if (!validateMediaKey(key, storageProvider.config?.prefix || ''))
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  const buffer = await storageProvider.get(key)
  if (!buffer)
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail not found' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Content-Type', 'image/jpeg')
  return sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer()
})
