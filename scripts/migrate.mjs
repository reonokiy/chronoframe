import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const client = postgres(process.env.DATABASE_URL, { max: 1 })
try {
  await migrate(drizzle(client), {
    migrationsFolder: 'server/database/migrations',
  })
} finally {
  await client.end()
}
