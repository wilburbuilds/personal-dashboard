import { sqliteTable,text } from 'drizzle-orm/sqlite-core';
export const dashboardRecords=sqliteTable('dashboard_records',{id:text('id').primaryKey(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
