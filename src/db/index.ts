import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";

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
