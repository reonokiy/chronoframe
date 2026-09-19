import type { H3Event } from 'h3'
import { validateMediaKey } from '../services/storage/keys'

export const PRIVATE_MEDIA_CACHE_CONTROL = 'private, no-store'
// Visibility can change at the same URL: never use immutable or serve stale media.
export const PUBLIC_MEDIA_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, must-revalidate'

export async function isPublicMedia(event: H3Event): Promise<boolean> {
  if (useRuntimeConfig(event).public.galleryPublic !== true) return false

  const path = getRequestURL(event).pathname
  let key: string
  try {
    if (path.startsWith('/thumb/')) {
      const url = decodeURIComponent(path.slice('/thumb/'.length))
      if (!url.startsWith('/media/')) return false
      key = decodeURIComponent(url.slice('/media/'.length))
    } else {
      key = decodeURIComponent(path.replace(/^\/(media|image|storage)\//, ''))
    }
  } catch {
    return false
  }
  const { storageProvider } = useStorageProvider(event)
  if (!validateMediaKey(key, storageProvider.config?.prefix || '')) return false

  // Fail closed for pending uploads/orphan objects. A hidden album wins even
  // when a photo (or shared storage key) also belongs to a visible album.
  const matches = await useDB()
    .select({ hidden: tables.albums.isHidden })
    .from(tables.photos)
    .leftJoin(
      tables.albumPhotos,
      eq(tables.albumPhotos.photoId, tables.photos.id),
    )
    .leftJoin(tables.albums, eq(tables.albums.id, tables.albumPhotos.albumId))
    .where(
      or(
        eq(tables.photos.storageKey, key),
        eq(tables.photos.thumbnailKey, key),
        eq(tables.photos.livePhotoVideoKey, key),
      ),
    )
  return matches.length > 0 && matches.every((photo) => photo.hidden !== true)
}

export function setMediaCacheHeaders(event: H3Event) {
  // nuxt-auth-utils eagerly initializes sessions in its WebSocket request hook.
  // Strip those cookies only for successfully authorized public media; otherwise
  // Cloudflare bypasses the response (or could cache a session cookie).
  if (event.context.publicMedia === true)
    removeResponseHeader(event, 'set-cookie')
  setHeader(
    event,
    'Cache-Control',
    event.context.publicMedia === true
      ? PUBLIC_MEDIA_CACHE_CONTROL
      : PRIVATE_MEDIA_CACHE_CONTROL,
  )
}
