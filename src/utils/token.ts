import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export function generateAppId(): string {
  return `app_${randomBytes(12).toString("hex")}`;
}

export function generateToken(): string {
  return `docora_${randomBytes(32).toString("hex")}`;
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, SALT_ROUNDS);
}

export async function verifyToken(
  token: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(token, hash);
}
