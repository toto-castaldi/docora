import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

// ============================================================================
// Content Encoding
// ============================================================================

export const ContentEncodingSchema = z
  .enum(["plain", "base64"])
  .openapi({
    description: "Content encoding: plain for text files, base64 for binary",
    example: "base64",
  });

// ============================================================================
// Chunk Info (for large binary files)
// ============================================================================

export const ChunkInfoSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Unique identifier for this file transfer",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    index: z.number().int().min(0).openapi({
      description: "Zero-based chunk index",
      example: 0,
    }),
    total: z.number().int().min(1).openapi({
      description: "Total number of chunks",
      example: 10,
    }),
  })
  .openapi("ChunkInfo");

// ============================================================================
// Repository Info
// ============================================================================

export const RepositoryInfoSchema = z
  .object({
    repository_id: z.string().openapi({ example: "repo_abc123" }),
    github_url: z.string().url().openapi({
      example: "https://github.com/owner/repo",
    }),
    owner: z.string().openapi({ example: "owner" }),
    name: z.string().openapi({ example: "repo" }),
  })
  .openapi("RepositoryInfo");

// ============================================================================
// File Payload
// ============================================================================

export const FilePayloadSchema = z
  .object({
    path: z.string().openapi({
      description: "File path relative to repository root",
      example: "src/index.ts",
    }),
    sha: z.string().openapi({
      description: "SHA-256 hash of file content",
      example: "abc123def456...",
    }),
    size: z.number().int().optional().openapi({
      description: "File size in bytes",
      example: 1234,
    }),
    content: z.string().optional().openapi({
      description: "File content (plain text or Base64 encoded)",
    }),
    content_encoding: ContentEncodingSchema.optional().openapi({
      description: "Present only for binary files",
    }),
    chunk: ChunkInfoSchema.optional().openapi({
      description: "Present only for chunked binary files",
    }),
  })
  .openapi("FilePayload");

// ============================================================================
// Notification Payloads
// ============================================================================

export const CreateNotificationSchema = z
  .object({
    repository: RepositoryInfoSchema,
    file: FilePayloadSchema,
    commit_sha: z.string().openapi({ example: "a1b2c3d4e5f6..." }),
    timestamp: z.string().datetime().openapi({
      example: "2025-01-11T12:00:00Z",
    }),
  })
  .openapi("CreateNotification");

export const UpdateNotificationSchema = z
  .object({
    repository: RepositoryInfoSchema,
    file: FilePayloadSchema,
    previous_sha: z.string().openapi({
      description: "SHA of the previous file version",
      example: "old123sha456...",
    }),
    commit_sha: z.string().openapi({ example: "a1b2c3d4e5f6..." }),
    timestamp: z.string().datetime().openapi({
      example: "2025-01-11T12:00:00Z",
    }),
  })
  .openapi("UpdateNotification");

export const DeleteNotificationSchema = z
  .object({
    repository: RepositoryInfoSchema,
    file: z.object({
      path: z.string(),
      sha: z.string(),
    }),
    commit_sha: z.string().openapi({ example: "a1b2c3d4e5f6..." }),
    timestamp: z.string().datetime().openapi({
      example: "2025-01-11T12:00:00Z",
    }),
  })
  .openapi("DeleteNotification");

// ============================================================================
// Type Exports
// ============================================================================

export type ContentEncoding = z.infer<typeof ContentEncodingSchema>;
export type ChunkInfo = z.infer<typeof ChunkInfoSchema>;
export type RepositoryInfo = z.infer<typeof RepositoryInfoSchema>;
export type FilePayload = z.infer<typeof FilePayloadSchema>;
export type CreateNotification = z.infer<typeof CreateNotificationSchema>;
export type UpdateNotification = z.infer<typeof UpdateNotificationSchema>;
export type DeleteNotification = z.infer<typeof DeleteNotificationSchema>;
