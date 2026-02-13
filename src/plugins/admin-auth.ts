import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import { getRedisConnection } from "../queue/connection.js";

// Extend Fastify types with admin session fields and route config
declare module "fastify" {
  interface Session {
    adminId?: string;
    adminUsername?: string;
  }

  interface FastifyContextConfig {
    publicAccess?: boolean;
  }
}

// Custom Redis session store for ioredis
interface SessionStoreCallback {
  (err?: Error | null, data?: unknown): void;
}

class IoRedisSessionStore {
  private prefix: string;
  private ttl: number;

  constructor(options: { prefix?: string; ttl?: number } = {}) {
    this.prefix = options.prefix ?? "admin-session:";
    this.ttl = options.ttl ?? 3600; // 1 hour in seconds
  }

  set(sessionId: string, session: unknown, callback: SessionStoreCallback): void {
    const redis = getRedisConnection();
    const key = this.prefix + sessionId;
    const data = JSON.stringify(session);

    redis.setex(key, this.ttl, data)
      .then(() => callback(null))
      .catch((err) => callback(err as Error));
  }

  get(sessionId: string, callback: SessionStoreCallback): void {
    const redis = getRedisConnection();
    const key = this.prefix + sessionId;

    redis.get(key)
      .then((data) => {
        if (!data) return callback(null, null);
        callback(null, JSON.parse(data));
      })
      .catch((err) => callback(err as Error));
  }

  destroy(sessionId: string, callback: SessionStoreCallback): void {
    const redis = getRedisConnection();
    const key = this.prefix + sessionId;

    redis.del(key)
      .then(() => callback(null))
      .catch((err) => callback(err as Error));
  }
}

// Routes that don't require authentication
const PUBLIC_ADMIN_PATHS = [
  "/admin/api/login",
  "/admin/login",
];

function isPublicAdminPath(path: string): boolean {
  // Remove query string
  const cleanPath = path.split("?")[0];

  // Check exact public paths
  if (PUBLIC_ADMIN_PATHS.includes(cleanPath)) {
    return true;
  }

  // Allow static assets (will be served in Plan 04)
  if (cleanPath.startsWith("/admin/assets/")) {
    return true;
  }

  return false;
}

function isApiRequest(request: FastifyRequest): boolean {
  const accept = request.headers.accept ?? "";
  return accept.includes("application/json") ||
         request.url.includes("/admin/api/");
}

async function adminAuthPlugin(server: FastifyInstance): Promise<void> {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionSecret || sessionSecret.length < 32) {
    server.log.warn(
      "ADMIN_SESSION_SECRET not configured or too short. " +
      "Admin authentication will be unavailable. " +
      "Set ADMIN_SESSION_SECRET environment variable (min 32 chars)."
    );
  }

  // Register cookie plugin (required by session)
  await server.register(fastifyCookie);

  // Only register session if secret is properly configured
  if (sessionSecret && sessionSecret.length >= 32) {
    const sessionStore = new IoRedisSessionStore({
      prefix: "admin-session:",
      ttl: 3600, // 1 hour
    });

    await server.register(fastifySession, {
      secret: sessionSecret,
      store: sessionStore as unknown as import("@fastify/session").SessionStore,
      cookie: {
        path: "/admin",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
      },
      rolling: true, // Sliding expiration
      saveUninitialized: false,
    });
  }

  // Authentication hook for /admin/* routes
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Only check admin routes
    if (!request.url.startsWith("/admin")) {
      return;
    }

    // Skip auth for public paths
    if (isPublicAdminPath(request.url)) {
      return;
    }

    // If session is not configured, return 503
    if (!sessionSecret || sessionSecret.length < 32) {
      return reply.status(503).send({
        error: "Admin authentication not configured",
        message: "Set ADMIN_SESSION_SECRET environment variable (min 32 chars)",
      });
    }

    // Check if authenticated
    if (!request.session?.adminId) {
      if (isApiRequest(request)) {
        return reply.status(401).send({ error: "Not authenticated" });
      }
      // Browser request - redirect to login
      return reply.redirect("/admin/login");
    }
  });
}

export default fp(adminAuthPlugin, {
  name: "admin-auth",
});
