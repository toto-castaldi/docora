import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { BUILD_INFO } from "../version.js";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export const PUBLIC_DOCS_ROUTE : string = "/docs";

export async function registerSwagger(server: FastifyInstance): Promise<void> {
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Docora API",
        description: "Repository monitoring and notification service",
        version: BUILD_INFO.version,
      },
      servers: [{ url: "/" }],
    },
    transform: jsonSchemaTransform,
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: PUBLIC_DOCS_ROUTE,
  });
}
