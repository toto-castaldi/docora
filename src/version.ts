/**
 * Docora Version - Single Source of Truth
 *
 * This version is updated authomatically 
 * do not change by hand.
 */
export const VERSION = "0.10.2";

/**
 * Build info filled at build time from CI.
 * Local dev use default values
 */
export const BUILD_INFO = {
  version: VERSION,
  buildNumber: process.env.BUILD_NUMBER || "dev",
  gitSha: process.env.COMMIT_SHA || process.env.GIT_SHA || "local",
  buildDate: process.env.BUILD_DATE || new Date().toISOString(),
} as const;

export type BuildInfo = typeof BUILD_INFO;

export function getVersionString(): string {
  return `v${BUILD_INFO.version}`;
}

export function getFullVersionString(): string {
  return `v${BUILD_INFO.version} (${BUILD_INFO.buildNumber}-${BUILD_INFO.gitSha.slice(0, 7)})`;
}
