import { sql } from 'drizzle-orm'
import { getStorageManager } from '../../services/storage'
export default defineEventHandler(async () => {
  await useDB().execute(sql`select 1`)
  getStorageManager()
  return { status: 'ok' }
})
