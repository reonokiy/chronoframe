import { min } from 'drizzle-orm'
import z from 'zod'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
    }).parse,
  )

  const db = useDB()

  const album = await db.transaction(async (tx) => {
    // Place new album first (min position minus one gap), preserving the
    // default "newest first" order
    const minRow = (
      await tx.select({ min: min(tables.albums.position) }).from(tables.albums)
    )[0]
    const position = (minRow?.min ?? 1000) - 1000

    const newAlbum = (
      await tx
        .insert(tables.albums)
        .values({
          title: body.title,
          description: body.description || null,
          coverPhotoId: body.coverPhotoId || null,
          isHidden: body.isHidden || false,
          position,
        })
        .returning()
    )[0]

    if (!newAlbum) throw new Error('Album insert failed')
    const albumId = newAlbum.id
    const photoIds = new Set(body.photoIds || [])

    if (body.coverPhotoId) {
      photoIds.add(body.coverPhotoId)
    }

    if (photoIds.size > 0) {
      let pos = 1000000
      for (const photoId of photoIds) {
        await tx
          .insert(tables.albumPhotos)
          .values({
            albumId,
            photoId,
            position: (pos += 10),
          })
          .onConflictDoNothing()
      }
    }

    return newAlbum
  })

  return album
})
