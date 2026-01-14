/**
  ┌──────────────────┬───────────────────────────────────┐
  │     Feature      │          Implementation           │
  ├──────────────────┼───────────────────────────────────┤
  │ Hash algorithm   │ SHA-256 (64 char hex)             │
  ├──────────────────┼───────────────────────────────────┤
  │ Binary detection │ isbinaryfile package              │
  ├──────────────────┼───────────────────────────────────┤
  │ Excluded         │ Only .git folder                  │
  ├──────────────────┼───────────────────────────────────┤
  │ Symlinks         │ Skipped (only regular files)      │
  ├──────────────────┼───────────────────────────────────┤
  │ Encoding         │ UTF-8 for text, Base64 for binary │
  └──────────────────┴───────────────────────────────────┘
 */

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { isBinaryBuffer } from "../utils/binary.js";

/** Only .git folder is excluded - everything else is sent to apps */
const EXCLUDED_DIRS = [".git"];

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
 * Recursively walk directory and collect file paths.
 * Only .git folder is excluded.
 */
function walkDirectory(dirPath: string, basePath: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded directories (.git)
    if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) {
      continue;
    }

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkDirectory(fullPath, basePath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
    // Skip symlinks and other special files
  }

  return files;
}

/**
 * Scan a repository and return all files with content.
 * Only .git folder is excluded - everything else is sent to apps.
 * Text files are stored as UTF-8, binary files as Base64.
 */
export async function scanRepository(repoPath: string): Promise<ScannedFile[]> {
  const filePaths = walkDirectory(repoPath, repoPath);
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
