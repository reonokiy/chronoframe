import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'
export const tables = schema
export { eq, and, or, inArray } from 'drizzle-orm'
let client: ReturnType<typeof postgres> | undefined
let db: ReturnType<typeof drizzle<typeof schema>> | undefined
export function useDB() {
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url || !/^postgres(ql)?:\/\//.test(url))
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL')
    client = postgres(url, { max: 10 })
    db = drizzle(client, { schema })
  }
  return db
}
export async function closeDB() {
  await client?.end({ timeout: 10 })
  client = undefined
  db = undefined
}
export type User = typeof schema.users.$inferSelect
export type Photo = typeof schema.photos.$inferSelect
export type PipelineQueueItem = typeof schema.pipelineQueue.$inferSelect
export type NewPipelineQueueItem = typeof schema.pipelineQueue.$inferInsert
export type PhotoReaction = typeof schema.photoReactions.$inferSelect
export type Album = typeof schema.albums.$inferSelect
export type NewAlbum = typeof schema.albums.$inferInsert
export type AlbumPhoto = typeof schema.albumPhotos.$inferSelect
export type NewAlbumPhoto = typeof schema.albumPhotos.$inferInsert
export type AlbumWithPhotos = Album & { photos: Photo[] }
