import { desc } from 'drizzle-orm'

export default eventHandler(async (_event) => {
  return await useDB()
    .select()
    .from(tables.photos)
    .orderBy(desc(tables.photos.dateTaken))
})
