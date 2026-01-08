import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types/index.js";

let db: Kysely<Database> | null = null;

export function getDatabase(): Kysely<Database> {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString }),
      }),
    });
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

export async function initDatabase(): Promise<void> {
  const db = getDatabase();
  await db.selectFrom("apps").select("app_id").limit(1).execute();
}
