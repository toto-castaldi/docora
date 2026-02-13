import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve dashboard dist directory relative to project root
// In dev: src/routes/admin/static.ts -> ../../../dashboard/dist
// In prod: dist/routes/admin/static.js -> ../../../dashboard/dist
const DASHBOARD_DIST_PATH = join(__dirname, "..", "..", "..", "dashboard", "dist");

export async function staticRoutes(server: FastifyInstance): Promise<void> {
  const dashboardExists = existsSync(DASHBOARD_DIST_PATH);

  if (dashboardExists) {
    // Serve static files from dashboard/dist at /admin/ prefix
    // wildcard: false prevents @fastify/static from creating its own catch-all route
    // We handle SPA routing manually in the /admin/* handler below
    await server.register(fastifyStatic, {
      root: DASHBOARD_DIST_PATH,
      prefix: "/admin/",
      wildcard: false, // We handle wildcard/SPA routing ourselves
    });
  }

  // SPA catch-all for non-API /admin/* routes
  server.get(
    "/admin/*",
    { config: { publicAccess: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const url = request.url;

      // Don't intercept API routes - let them 404 naturally
      if (url.startsWith("/admin/api/")) {
        return reply.callNotFound();
      }

      // Dashboard not built - return 503 with instructions
      if (!dashboardExists) {
        return reply.status(503).send({
          error: "Dashboard not built",
          message: "Run 'pnpm dashboard:build' to build the dashboard",
          path: DASHBOARD_DIST_PATH,
        });
      }

      // SPA routing: serve index.html for all non-file routes
      return reply.sendFile("index.html");
    }
  );

  // Handle exact /admin route (redirect to /admin/)
  server.get(
    "/admin",
    { config: { publicAccess: true } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.redirect("/admin/");
    }
  );
}
