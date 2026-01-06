import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
//in ES modules with TypeScript, imports need .js even though the source is .ts. TypeScript compiles ./routes/index.ts → ./routes/index.js.
import { registerRoutes } from "./routes/index.js";

export async function buildServer(): Promise<FastifyInstance> {
    //server with built-in logging
    const server = Fastify({
        logger: {
        level: process.env.LOG_LEVEL || "info",
        },
    });

    //security headers (XSS, clickjacking protection)
    await server.register(helmet);
    //allows cross-origin requests
    await server.register(cors, {
        origin: process.env.CORS_ORIGIN || "*",
    });

    await registerRoutes(server);

    return server;
}