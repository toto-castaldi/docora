import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const OnboardRequestSchema = z
  .object({
    base_url: z
      .string()
      .url("Must be a valid URL")
      .startsWith("https://", "Must use HTTPS")
      .max(2048)
      .openapi({
        description: "Webhook URL for receiving updates",
        example: "https://example-app.com/webhooks",
      }),
    app_name: z
      .string()
      .min(3, "App name must be at least 3 characters")
      .max(100, "App name must be at most 100 characters")
      .openapi({
        description: "Name of the application",
        example: "Example App",
      }),
    email: z
      .string()
      .email("Must be a valid email")
      .max(255)
      .openapi({
        description: "Contact email",
        example: "team@example-app.com",
      }),
    website: z
      .string()
      .url("Must be a valid URL")
      .max(2048)
      .optional()
      .openapi({
        description: "Application website (optional)",
        example: "https://example-app.com",
      }),
    description: z
      .string()
      .max(500, "Description must be at most 500 characters")
      .optional()
      .openapi({
        description: "Short description (optional)",
        example: "An app that tracks repository changes",
      }),
  })
  .openapi("OnboardRequest");

export const OnboardResponseSchema = z
  .object({
    app_id: z.string().openapi({ example: "app_123456abcdef" }),
    token: z.string().openapi({ example: "docora_abcdef123456..." }),
    created_at: z
      .string()
      .datetime()
      .openapi({ example: "2025-01-01T12:00:00Z" }),
  })
  .openapi("OnboardResponse");

export type OnboardRequest = z.infer<typeof OnboardRequestSchema>;
export type OnboardResponse = z.infer<typeof OnboardResponseSchema>;
