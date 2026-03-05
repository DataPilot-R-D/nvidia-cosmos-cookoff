import fs from 'node:fs'
import path from 'node:path'
import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const dataDir = path.resolve(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'auth.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export const sqlite: DatabaseType = new Database(dbPath)
export const db = drizzle(sqlite)
