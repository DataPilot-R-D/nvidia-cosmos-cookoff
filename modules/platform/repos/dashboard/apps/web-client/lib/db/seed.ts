import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, sqlite } from './index'
import { users } from './schema'

async function seed() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Operator',
      createdAt INTEGER NOT NULL
    )
  `)

  const email = 'admin@datapilot.com'
  const existingUser = db.select().from(users).where(eq(users.email, email)).limit(1).all()[0]

  if (existingUser) {
    console.log('Seed skipped: admin user already exists')
    return
  }

  const passwordHash = await bcrypt.hash('admin123', 10)

  db.insert(users)
    .values({
      id: randomUUID(),
      email,
      passwordHash,
      role: 'Admin',
      createdAt: Date.now(),
    })
    .run()

  console.log('Seed complete: admin@datapilot.com created')
}

seed().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
