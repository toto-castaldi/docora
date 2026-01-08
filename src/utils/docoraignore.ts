import ignore, { Ignore } from "ignore";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DOCORAIGNORE_FILE = ".docoraignore";

const DEFAULT_EXCLUSIONS = [".git", ".git/**"];

export function parseDocoraignore(repoPath: string): Ignore {
  const ig = ignore();

  ig.add(DEFAULT_EXCLUSIONS);

  // Check for .docoraignore file
  const docoraignorePath = join(repoPath, DOCORAIGNORE_FILE);

  if (existsSync(docoraignorePath)) {
    try {
      const content = readFileSync(docoraignorePath, "utf-8");
      ig.add(content);
      console.log(`Loaded .docoraignore from ${docoraignorePath}`);
    } catch (err) {
      console.warn(`Failed to read .docoraignore: ${err}`);
    }
  }

  return ig;
}

export function isIgnored(ig: Ignore, filePath: string): boolean {
  // The ignore library expects paths without leading slash
  const normalizedPath = filePath.replace(/^\/+/, "");
  return ig.ignores(normalizedPath);
}

export function filterIgnored(ig: Ignore, filePaths: string[]): string[] {
  return filePaths.filter((filePath) => !isIgnored(ig, filePath));
}
