import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
//in ES modules with TypeScript, imports need .js even though the source is .ts. TypeScript compiles ./routes/index.ts → ./routes/index.js.
import { registerRoutes } from "./routes/index.js";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerSwagger } from "./plugins/swagger.js";
  import authPlugin from "./plugins/auth.js";

export async function buildServer(): Promise<FastifyInstance> {
  //server with built-in logging
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  //security headers (XSS, clickjacking protection)
  await server.register(helmet);
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

  await registerRoutes(server);

  return server;
}
