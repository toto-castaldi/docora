/**
 * 
  ┌─────────────────┬─────────────────────────────────────────────┐
  │     Feature     │               Implementation                │
  ├─────────────────┼─────────────────────────────────────────────┤
  │ Local path      │ /data/repos/{owner}/{repo}                  │
  ├─────────────────┼─────────────────────────────────────────────┤
  │ Authentication  │ Token embedded in URL for private repos     │
  ├─────────────────┼─────────────────────────────────────────────┤
  │ Clone options   │ --single-branch --depth 1 for faster clones │
  ├─────────────────┼─────────────────────────────────────────────┤
  │ Update strategy │ fetch + reset --hard to ensure clean state  │
  └─────────────────┴─────────────────────────────────────────────┘
 * 
 */

import { simpleGit,  SimpleGit } from "simple-git";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || "/data/repos";

export interface CloneResult {
  localPath: string;
  commitSha: string;
  branch: string;
}

/**
 * Build the local path for a repository: /data/repos/{owner}/{repo}
 */
export function getLocalRepoPath(owner: string, name: string): string {
  return join(REPOS_BASE_PATH, owner, name);
}

/**
 * Build authenticated URL for private repos
 * https://github.com/owner/repo -> https://{token}@github.com/owner/repo
 */
function buildAuthenticatedUrl(
  githubUrl: string,
  githubToken?: string
): string {
  if (!githubToken) {
    return githubUrl;
  }

  const url = new URL(githubUrl);
  url.username = githubToken;
  return url.toString();
}

/**
 * Clone a repository or pull if it already exists
 */
export async function cloneOrPull(
  githubUrl: string,
  owner: string,
  name: string,
  githubToken?: string
): Promise<CloneResult> {
  const localPath = getLocalRepoPath(owner, name);
  const authenticatedUrl = buildAuthenticatedUrl(githubUrl, githubToken);

  // Ensure parent directory exists
  const parentDir = join(REPOS_BASE_PATH, owner);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  let git: SimpleGit;

  if (existsSync(join(localPath, ".git"))) {
    // Repository exists, pull latest
    console.log(`Pulling latest changes for ${owner}/${name}`);
    git = simpleGit(localPath);

    // Update remote URL in case token changed
    await git.remote(["set-url", "origin", authenticatedUrl]);
    // Use --depth 1 for shallow clone compatibility
    await git.fetch(["--depth", "1", "origin", "main"]);
    await git.reset(["--hard", "origin/main"]);
  } else {
    // Clone fresh
    console.log(`Cloning ${owner}/${name} to ${localPath}`);
    git = simpleGit();
    await git.clone(authenticatedUrl, localPath, [
      "--branch",
      "main",
      "--single-branch",
      "--depth",
      "1",
    ]);
    git = simpleGit(localPath);
  }

  const commitSha = await getCurrentCommitSha(localPath);
  const branch = await getCurrentBranch(localPath);

  console.log(`Git sync complete: ${owner}/${name} at commit ${commitSha.substring(0, 7)}`);

  return { localPath, commitSha, branch };
}

/**
 * Get the current commit SHA
 */
export async function getCurrentCommitSha(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const log = await git.log({ maxCount: 1 });

  if (!log.latest) {
    throw new Error(`No commits found in repository at ${repoPath}`);
  }

  return log.latest.hash;
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const branchSummary = await git.branch();
  return branchSummary.current;
}
