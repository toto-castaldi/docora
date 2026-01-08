import { Octokit } from "@octokit/rest";

export interface ParsedGitHubUrl {
  owner: string;
  name: string;
}

export interface GitHubValidationResult {
  valid: boolean;
  isPrivate?: boolean;
  error?: string;
}

/**
 * Parse a GitHub URL to extract owner and repo name
 * Supports: https://github.com/owner/repo or https://github.com/owner/repo.git
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const pattern = /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(\.git)?$/;
  const match = url.match(pattern);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    name: match[2],
  };
}

/**
 * Validate that a GitHub repository exists and is accessible
 * If githubToken is provided, uses authenticated request (for private repos)
 */
export async function validateRepository(
  owner: string,
  name: string,
  githubToken?: string
): Promise<GitHubValidationResult> {
  const octokit = new Octokit({
    auth: githubToken,
  });

  try {
    const { data } = await octokit.repos.get({
      owner,
      repo: name,
    });

    return {
      valid: true,
      isPrivate: data.private,
    };
  } catch (error: unknown) {
    if (error instanceof Error && "status" in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        return {
          valid: false,
          error: "Repository not found or not accessible",
        };
      }
      if (status === 401) {
        return {
          valid: false,
          error: "Invalid GitHub token",
        };
      }
    }
    return {
      valid: false,
      error: "Failed to validate repository",
    };
  }
}
