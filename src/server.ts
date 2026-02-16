import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
//in ES modules with TypeScript, imports need .js even though the source is .ts. TypeScript compiles ./routes/index.ts → ./routes/index.js.
import { registerRoutes } from "./routes/index.js";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerSwagger, PUBLIC_DOCS_ROUTE } from "./plugins/swagger.js";
import authPlugin from "./plugins/auth.js";
import adminAuthPlugin from "./plugins/admin-auth.js";
import { adminRoutes } from "./routes/admin/index.js";

export async function buildServer(): Promise<FastifyInstance> {
  //server with built-in logging
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    trustProxy: true,
  });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  //security headers (CSP, XSS, clickjacking protection)
  //Swagger UI needs 'unsafe-inline' scripts to initialize — relax CSP for /docs paths
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });

  // Relax CSP for Swagger UI — needs inline scripts to render
  server.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith(PUBLIC_DOCS_ROUTE)) {
      reply.header("Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://validator.swagger.io; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
      );
    }
  });
  //allows cross-origin requests
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || "*",
  });

  await registerSwagger(server);

  // Rate limiting
  await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
  });

  await server.register(authPlugin);

  // Admin authentication (session-based, isolated from client Bearer token auth)
  await server.register(adminAuthPlugin);
  await server.register(adminRoutes);

  await registerRoutes(server);

  // Global error handler: hide internals for 5xx, forward 4xx messages
  server.setErrorHandler(function (error: Error & { statusCode?: number; validation?: unknown }, request, reply) {
    request.log.error(error);

    // Validation errors (from fastify-type-provider-zod)
    if (error.validation) {
      return reply.code(400).send({ error: error.message });
    }

    // Client errors (4xx) - safe to forward message
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // Server errors (5xx) - hide internals
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  return server;
}
