import z from 'zod'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const { albumIds } = await readValidatedBody(
    event,
    z.object({
      albumIds: z.array(z.number().int()),
    }).parse,
  )

  const db = useDB()

  // Reassign position by incoming order (gap of 1000 to ease future inserts)
  await db.transaction(async (tx) => {
    for (const [index, id] of albumIds.entries()) {
      await tx
        .update(tables.albums)
        .set({ position: index * 1000 })
        .where(eq(tables.albums.id, id))
    }
  })

  return { success: true }
})
