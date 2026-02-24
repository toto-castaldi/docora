import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { BUILD_INFO } from "../version.js";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export const PUBLIC_DOCS_ROUTE: string = "/docs";
export const PUBLIC_OPENAPI_ROUTE: string = "/openapi.json";

export async function registerSwagger(server: FastifyInstance): Promise<void> {
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Docora API",
        description: "Repository monitoring and notification service",
        version: BUILD_INFO.version,
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Enter the app token received during admin onboarding",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: PUBLIC_DOCS_ROUTE,
  });

  // Expose OpenAPI spec at /openapi.json (public route)
  server.get(PUBLIC_OPENAPI_ROUTE, {
    config: { publicAccess: true },
    schema: { hide: true },
  }, async (_request, reply) => {
    return reply.send(server.swagger());
  });
}
