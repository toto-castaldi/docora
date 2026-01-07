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

export async function onboardRoute(server: FastifyInstance): Promise<void> {
  server.post(
    "/api/apps/onboard",
    {
      schema: {
        body: OnboardRequestSchema,
        response: {
          201: OnboardResponseSchema,
          422: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as OnboardRequest;

      // SSRF check
      const urlCheck = isUrlSafe(body.base_url);
      if (!urlCheck.safe) {
        return reply.status(422).send({ error: urlCheck.reason });
      }

      const result = await createApp(body);
      return reply.status(201).send(result);
    }
  );
}
