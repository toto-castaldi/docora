import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const RegisterRepositoryRequestSchema = z
  .object({
    github_url: z
      .string()
      .url("Must be a valid URL")
      .regex(
        /^https:\/\/github\.com\/[^/]+\/[^/.]+$/,
        "Must be a valid GitHub repository URL (https://github.com/owner/repo)"
      )
      .max(2048)
      .openapi({
        description: "GitHub repository URL",
        example: "https://github.com/owner/repo",
      }),
    github_token: z
      .string()
      .regex(
        /^(ghp_|github_pat_)/,
        "Must be a valid GitHub token (starts with ghp_ or github_pat_)"
      )
      .max(255)
      .optional()
      .openapi({
        description:
          "GitHub personal access token (required for private repos)",
        example: "ghp_xxxxxxxxxxxx",
      }),
  })
  .openapi("RegisterRepositoryRequest");

export const RegisterRepositoryResponseSchema = z
  .object({
    repository_id: z.string().openapi({ example: "repo_abc123def456" }),
    github_url: z
      .string()
      .openapi({ example: "https://github.com/owner/repo" }),
    owner: z.string().openapi({ example: "owner" }),
    name: z.string().openapi({ example: "repo" }),
    is_private: z.boolean().openapi({ example: false }),
    created_at: z
      .string()
      .datetime()
      .openapi({ example: "2025-01-08T12:00:00Z" }),
  })
  .openapi("RegisterRepositoryResponse");

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "Error message" }),
  })
  .openapi("ErrorResponse");

export const RepositoryParamsSchema = z
  .object({
    repository_id: z
      .string()
      .regex(/^repo_[a-f0-9]{24}$/, "Invalid repository ID format")
      .openapi({
        description: "Repository ID",
        example: "repo_abc123def456abc123def456",
      }),
  })
  .openapi("RepositoryParams");

export type RegisterRepositoryRequest = z.infer<
  typeof RegisterRepositoryRequestSchema
>;
export type RegisterRepositoryResponse = z.infer<
  typeof RegisterRepositoryResponseSchema
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type RepositoryParams = z.infer<typeof RepositoryParamsSchema>;
