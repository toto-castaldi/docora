import { getDatabase } from "../db/index.js";
import { encryptToken } from "../utils/crypto.js";
import { generateAppId, generateToken, hashToken } from "../utils/token.js";
import type { OnboardRequest, OnboardResponse } from "../schemas/apps.js";

export async function createApp(
  data: OnboardRequest
): Promise<OnboardResponse> {
  const db = getDatabase();
  const appId = generateAppId();
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const now = new Date();

  // Encrypt the client auth key before storing
  const clientAuthKeyEncrypted = encryptToken(data.client_auth_key);

  await db
    .insertInto("apps")
    .values({
      app_id: appId,
      token_hash: tokenHash,
      app_name: data.app_name,
      base_url: data.base_url,
      email: data.email,
      website: data.website ?? null,
      description: data.description ?? null,
      created_at: now,
      updated_at: now,
      client_auth_key_encrypted: clientAuthKeyEncrypted
    })
    .execute();

  return {
    app_id: appId,
    token: token, // Plain token returned only once!
    created_at: now.toISOString(),
  };
}

export async function findAppById(
  appId: string
): Promise<{ app_id: string } | undefined> {
  const db = getDatabase();
  return db
    .selectFrom("apps")
    .select("app_id")
    .where("app_id", "=", appId)
    .executeTakeFirst();
}
