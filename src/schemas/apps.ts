import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const OnboardRequestSchema = z
  .object({
    base_url: z
      .string()
      .max(2048)
      .url("Must be a valid URL")
      .refine(
        (url) => {
          const isDev = process.env.NODE_ENV === "dev";
          if (isDev) {
            return url.startsWith("http://") || url.startsWith("https://");
          }
          return url.startsWith("https://");
        },
        process.env.NODE_ENV === "dev"
          ? "Must use HTTP or HTTPS"
          : "Must use HTTPS"
      )
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
    email: z.string().email("Must be a valid email").max(255).openapi({
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
    client_auth_key: z
      .string()
      .min(16, "Auth key must be at least 16 characters")
      .max(500, "Auth key must be at most 500 characters")
      .openapi({
        description:
          "Secret key Docora will use to authenticate webhook calls to your app",
        example: "your-secret-webhook-key-here",
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
