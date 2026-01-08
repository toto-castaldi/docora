import { getDatabase } from "../db/index.js";
import { encryptToken } from "../utils/crypto.js";
import { randomBytes } from "crypto";
import type { AppRepositoryStatus } from "../db/types/index.js";

export interface CreateRepositoryInput {
  githubUrl: string;
  owner: string;
  name: string;
  isPrivate: boolean;
}

export interface LinkAppToRepositoryInput {
  appId: string;
  repositoryId: string;
  githubToken?: string;
}

export interface RepositoryWithLink {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  is_private: boolean;
  created_at: Date;
}

function generateRepositoryId(): string {
  return `repo_${randomBytes(12).toString("hex")}`;
}

/**
 * Find a repository by GitHub URL, or create it if it doesn't exist
 */
export async function findOrCreateRepository(
  input: CreateRepositoryInput
): Promise<{ repositoryId: string; created: boolean }> {
  const db = getDatabase();

  // Check if repo already exists
  const existing = await db
    .selectFrom("repositories")
    .select(["repository_id"])
    .where("github_url", "=", input.githubUrl)
    .executeTakeFirst();

  if (existing) {
    return { repositoryId: existing.repository_id, created: false };
  }

  // Create new repository
  const repositoryId = generateRepositoryId();
  const now = new Date();

  await db
    .insertInto("repositories")
    .values({
      repository_id: repositoryId,
      github_url: input.githubUrl,
      owner: input.owner,
      name: input.name,
      is_private: input.isPrivate,
      created_at: now,
      updated_at: now,
    })
    .execute();

  return { repositoryId, created: true };
}

/**
 * Check if an app is already linked to a repository
 */
export async function isAppLinkedToRepository(
  appId: string,
  repositoryId: string
): Promise<boolean> {
  const db = getDatabase();

  const existing = await db
    .selectFrom("app_repositories")
    .select(["id"])
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .executeTakeFirst();

  return !!existing;
}

/**
 * Link an app to a repository
 */
export async function linkAppToRepository(
  input: LinkAppToRepositoryInput
): Promise<void> {
  const db = getDatabase();

  const encryptedToken = input.githubToken
    ? encryptToken(input.githubToken)
    : null;

  await db
    .insertInto("app_repositories")
    .values({
      app_id: input.appId,
      repository_id: input.repositoryId,
      github_token_encrypted: encryptedToken,
      created_at: new Date(),
    })
    .execute();
}

/**
 * Get repository by ID
 */
export async function getRepositoryById(
  repositoryId: string
): Promise<RepositoryWithLink | null> {
  const db = getDatabase();

  const repo = await db
    .selectFrom("repositories")
    .select([
      "repository_id",
      "github_url",
      "owner",
      "name",
      "is_private",
      "created_at",
    ])
    .where("repository_id", "=", repositoryId)
    .executeTakeFirst();

  return repo ?? null;
}

/**
 * Get all repositories for an app
 */
export async function findRepositoriesByAppId(
  appId: string
): Promise<RepositoryWithLink[]> {
  const db = getDatabase();

  const repos = await db
    .selectFrom("app_repositories")
    .innerJoin(
      "repositories",
      "repositories.repository_id",
      "app_repositories.repository_id"
    )
    .select([
      "repositories.repository_id",
      "repositories.github_url",
      "repositories.owner",
      "repositories.name",
      "repositories.is_private",
      "repositories.created_at",
    ])
    .where("app_repositories.app_id", "=", appId)
    .execute();

  return repos;
}

export async function findPendingSnapshots(): Promise<
  Array<{
    app_id: string;
    repository_id: string;
    github_token_encrypted: string | null;
    base_url: string;
    github_url: string;
    owner: string;
    name: string;
    client_auth_key_encrypted : string;
  }>
> {
  const db = getDatabase();

  const results = await db
    .selectFrom("app_repositories")
    .innerJoin("apps", "apps.app_id", "app_repositories.app_id")
    .innerJoin(
      "repositories",
      "repositories.repository_id",
      "app_repositories.repository_id"
    )
    .select([
      "app_repositories.app_id",
      "app_repositories.repository_id",
      "app_repositories.github_token_encrypted",
      "apps.base_url",
      "apps.client_auth_key_encrypted",
      "repositories.github_url",
      "repositories.owner",
      "repositories.name",
    ])
    .where("app_repositories.status", "=", "pending_snapshot")
    .execute();

  return results;
}

/**
 * Update status for an app-repository link
 */
export async function updateAppRepositoryStatus(
  appId: string,
  repositoryId: string,
  status: AppRepositoryStatus,
  lastError?: string
): Promise<void> {
  const db = getDatabase();

  await db
    .updateTable("app_repositories")
    .set({
      status,
      last_error: lastError ?? null,
      last_scanned_at: status === "synced" ? new Date() : undefined,
    })
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();

  console.log(`Updated status for ${appId}/${repositoryId}: ${status}`);
}

/**
 * Increment retry count and update error
 */
export async function incrementRetryCount(
  appId: string,
  repositoryId: string,
  error: string
): Promise<number> {
  const db = getDatabase();

  // Get current count
  const current = await db
    .selectFrom("app_repositories")
    .select("retry_count")
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .executeTakeFirst();

  const newCount = (current?.retry_count ?? 0) + 1;

  await db
    .updateTable("app_repositories")
    .set({
      retry_count: newCount,
      last_error: error,
    })
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();

  console.log(`Retry count for ${appId}/${repositoryId}: ${newCount}`);
  return newCount;
}

/**
 * Reset retry count (after successful sync)
 */
export async function resetRetryCount(
  appId: string,
  repositoryId: string
): Promise<void> {
  const db = getDatabase();

  await db
    .updateTable("app_repositories")
    .set({
      retry_count: 0,
      last_error: null,
    })
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();
}
