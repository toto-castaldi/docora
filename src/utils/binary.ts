import { isBinaryFile } from "isbinaryfile";

/**
 * Check if a file is binary based on its content.
 *
 * Uses the isbinaryfile package which analyzes the first bytes
 * of the file to detect binary content (null bytes, etc.).
 *
 * @param filePath - Absolute path to the file
 * @returns True if the file is binary, false if text
 */
export async function isBinary(filePath: string): Promise<boolean> {
  return isBinaryFile(filePath);
}

/**
 * Check if a buffer contains binary data.
 *
 * @param buffer - Buffer to analyze
 * @param size - Optional total file size (for better detection)
 * @returns True if the buffer is binary, false if text
 */
export async function isBinaryBuffer(
  buffer: Buffer,
  size?: number
): Promise<boolean> {
  return isBinaryFile(buffer, size ? { size } : undefined);
}
