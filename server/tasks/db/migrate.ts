import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { resolve } from 'node:path'
export default defineTask({
  meta: { name: 'db:migrate', description: 'Apply PostgreSQL migrations' },
  async run() {
    await migrate(useDB(), {
      migrationsFolder: resolve('server/database/migrations'),
    })
    return { result: 'success' }
  },
})
