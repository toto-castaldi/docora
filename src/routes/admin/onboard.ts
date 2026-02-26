import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  OnboardRequestSchema,
  OnboardResponseSchema,
  type OnboardRequest,
} from "../../schemas/apps.js";
import { createApp } from "../../repositories/apps.js";
import { isUrlSafe } from "../../utils/url-validator.js";

const ErrorResponseSchema = z.object({
  error: z.string(),
});

function isApiRequest(request: { headers: { accept?: string }; url: string }): boolean {
  const accept = request.headers.accept ?? "";
  return accept.includes("application/json") || request.url.includes("/admin/api/");
}

export async function adminOnboardRoute(server: FastifyInstance): Promise<void> {
  // Encapsulated session check with custom 401 message
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      if (isApiRequest(request)) {
        return reply.code(401).send({
          error: "Admin authentication required. Use the admin dashboard to onboard new apps.",
        });
      }
      return reply.redirect("/admin/login");
    }
  });

  server.post(
    "/admin/api/apps/onboard",
    {
      schema: {
        body: OnboardRequestSchema,
        response: {
          201: z.object({ data: OnboardResponseSchema }),
          401: ErrorResponseSchema,
          422: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as OnboardRequest;

      const urlCheck = isUrlSafe(body.base_url);
      if (!urlCheck.safe) {
        return reply.status(422).send({ error: urlCheck.reason });
      }

      const result = await createApp(body);
      return reply.status(201).send({ data: result });
    }
  );
}
