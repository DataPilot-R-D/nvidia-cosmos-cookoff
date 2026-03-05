import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: text('role').notNull().default('Operator'),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
})

export type DbUser = typeof users.$inferSelect
export type NewDbUser = typeof users.$inferInsert
