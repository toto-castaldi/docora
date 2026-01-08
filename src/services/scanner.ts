/**
  ┌──────────────────┬───────────────────────────────────┐
  │     Feature      │          Implementation           │
  ├──────────────────┼───────────────────────────────────┤
  │ Hash algorithm   │ SHA-256 (64 char hex)             │
  ├──────────────────┼───────────────────────────────────┤
  │ Binary detection │ Check for null bytes in first 8KB │
  ├──────────────────┼───────────────────────────────────┤
  │ Ignored files    │ Filtered during directory walk    │
  ├──────────────────┼───────────────────────────────────┤
  │ Symlinks         │ Skipped (only regular files)      │
  ├──────────────────┼───────────────────────────────────┤
  │ Encoding         │ UTF-8 for text files              │
  └──────────────────┴───────────────────────────────────┘
 */

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { Ignore } from "ignore";

export interface ScannedFile {
  path: string; 
  sha: string; 
  size: number; 
  content: string; // File content (text)
}

/**
 * Compute SHA-256 hash of content
 */
function computeSha(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Check if a file is likely binary
 */
function isBinaryFile(buffer: Buffer): boolean {
  // Check for null bytes in first 8KB (common binary indicator)
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively walk directory and collect file paths
 */
function walkDirectory(
  dirPath: string,
  basePath: string,
  ig: Ignore
): string[] {
  const files: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(basePath, fullPath);

    // Check if ignored
    if (ig.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Also check directory with trailing slash
      if (ig.ignores(relativePath + "/")) {
        continue;
      }
      files.push(...walkDirectory(fullPath, basePath, ig));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
    // Skip symlinks and other special files
  }

  return files;
}

/**
 * Scan a repository and return all non-ignored files with content
 */
export async function scanRepository(
  repoPath: string,
  ig: Ignore
): Promise<ScannedFile[]> {
  const filePaths = walkDirectory(repoPath, repoPath, ig);
  const scannedFiles: ScannedFile[] = [];

  for (const fullPath of filePaths) {
    try {
      const relativePath = relative(repoPath, fullPath);
      const stats = statSync(fullPath);
      const buffer = readFileSync(fullPath);

      // Skip binary files
      if (isBinaryFile(buffer)) {
        console.log(`Skipping binary file: ${relativePath}`);
        continue;
      }

      const content = buffer.toString("utf-8");
      const sha = computeSha(content);

      scannedFiles.push({
        path: relativePath,
        sha,
        size: stats.size,
        content,
      });
    } catch (err) {
      console.warn(`Failed to read file ${fullPath}: ${err}`);
    }
  }

  console.log(`Scanned ${scannedFiles.length} files from ${repoPath}`);
  return scannedFiles;
}
