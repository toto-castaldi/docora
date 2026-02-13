import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod/v4";
import bcrypt from "bcrypt";
import { ZodTypeProvider } from "fastify-type-provider-zod";

// Zod schemas for request/response validation
const loginBodySchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const successResponseSchema = z.object({
  success: z.literal(true),
});

const sessionResponseSchema = z.object({
  authenticated: z.literal(true),
  username: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

// Cache hashed password to avoid hashing on every request
let cachedPasswordHash: string | null = null;

function getAdminCredentials(): { username: string | null; password: string | null } {
  return {
    username: process.env.ADMIN_USERNAME ?? null,
    password: process.env.ADMIN_PASSWORD ?? null,
  };
}

async function getPasswordHash(): Promise<string | null> {
  const { password } = getAdminCredentials();
  if (!password) return null;

  if (!cachedPasswordHash) {
    cachedPasswordHash = await bcrypt.hash(password, 10);
  }
  return cachedPasswordHash;
}

// Constant-time string comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to maintain constant time
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  // POST /admin/api/login
  fastify.post(
    "/admin/api/login",
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: successResponseSchema,
          401: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
      config: {
        publicAccess: true,
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof loginBodySchema> }>, reply: FastifyReply) => {
      const { username, password } = request.body;
      const { username: adminUsername, password: adminPassword } = getAdminCredentials();

      // Check if admin credentials are configured
      if (!adminUsername || !adminPassword) {
        return reply.status(503).send({
          error: "Admin authentication not configured",
          message: "Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables",
        });
      }

      // Get cached password hash
      const passwordHash = await getPasswordHash();
      if (!passwordHash) {
        return reply.status(503).send({
          error: "Admin authentication not configured",
          message: "Set ADMIN_PASSWORD environment variable",
        });
      }

      // Verify credentials
      const usernameValid = constantTimeCompare(username, adminUsername);
      const passwordValid = await bcrypt.compare(password, passwordHash);

      if (!usernameValid || !passwordValid) {
        return reply.status(401).send({
          error: "Invalid credentials",
        });
      }

      // Set session
      request.session.set("adminId", "admin");
      request.session.set("adminUsername", username);

      return { success: true as const };
    }
  );

  // POST /admin/api/logout
  fastify.post(
    "/admin/api/logout",
    {
      schema: {
        response: {
          200: successResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      await request.session.destroy();
      return { success: true as const };
    }
  );

  // GET /admin/api/session
  fastify.get(
    "/admin/api/session",
    {
      schema: {
        response: {
          200: sessionResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const adminId = request.session.get("adminId");
      const adminUsername = request.session.get("adminUsername");

      if (!adminId) {
        return reply.status(401).send({
          error: "Not authenticated",
        });
      }

      return {
        authenticated: true as const,
        username: adminUsername ?? "admin",
      };
    }
  );
}
