/**
  ┌──────────────────┬───────────────────────────────────┐
  │     Feature      │          Implementation           │
  ├──────────────────┼───────────────────────────────────┤
  │ Hash algorithm   │ SHA-256 (64 char hex)             │
  ├──────────────────┼───────────────────────────────────┤
  │ Binary detection │ isbinaryfile package              │
  ├──────────────────┼───────────────────────────────────┤
  │ Ignored files    │ Filtered during directory walk    │
  ├──────────────────┼───────────────────────────────────┤
  │ Symlinks         │ Skipped (only regular files)      │
  ├──────────────────┼───────────────────────────────────┤
  │ Encoding         │ UTF-8 for text, Base64 for binary │
  └──────────────────┴───────────────────────────────────┘
 */

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { Ignore } from "ignore";
import { isBinaryBuffer } from "../utils/binary.js";

export type ContentEncoding = "plain" | "base64";

export interface ScannedFile {
  path: string;
  sha: string;
  size: number;
  content: string;
  isBinary: boolean;
  contentEncoding: ContentEncoding;
}

/**
 * Compute SHA-256 hash of buffer content
 */
function computeSha(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
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
 * Scan a repository and return all non-ignored files with content.
 * Text files are stored as UTF-8, binary files as Base64.
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
      const sha = computeSha(buffer);
      const isBinary = await isBinaryBuffer(buffer, stats.size);

      const content = isBinary
        ? buffer.toString("base64")
        : buffer.toString("utf-8");

      const contentEncoding: ContentEncoding = isBinary ? "base64" : "plain";

      scannedFiles.push({
        path: relativePath,
        sha,
        size: stats.size,
        content,
        isBinary,
        contentEncoding,
      });
    } catch (err) {
      console.warn(`Failed to read file ${fullPath}: ${err}`);
    }
  }

  const textCount = scannedFiles.filter((f) => !f.isBinary).length;
  const binaryCount = scannedFiles.filter((f) => f.isBinary).length;
  console.log(
    `Scanned ${scannedFiles.length} files (${textCount} text, ${binaryCount} binary) from ${repoPath}`
  );

  return scannedFiles;
}
