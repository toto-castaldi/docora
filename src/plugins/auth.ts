import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { getDatabase } from "../db/index.js";
import { verifyToken } from "../utils/token.js";
import { PUBLIC_DOCS_ROUTE } from "../plugins/swagger.js"


// Extend FastifyRequest to include appId
declare module "fastify" {
  interface FastifyRequest {
    appId?: string;
  }
}

async function authPlugin(server: FastifyInstance): Promise<void> {
  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      
      const routeConfig = request.routeOptions?.config as { publicAccess?: boolean } | undefined;

      const path = request.url.split("?")[0];

      //needed for plugins...
      if (path.startsWith(PUBLIC_DOCS_ROUTE)) {
        return;
      }

      // Skip /admin routes - handled by admin-auth plugin
      if (path.startsWith("/admin")) {
        return;
      }

      if (routeConfig?.publicAccess) {
        return;  
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply
          .status(401)
          .send({ error: "Missing or invalid Authorization header" });
      }

      const token = authHeader.slice(7); // Remove "Bearer " prefix

      console.debug(`[AUTH] Token received: length=${token.length}, prefix=${token.slice(0, 12)}...`);

      const db = getDatabase();
      const apps = await db.selectFrom("apps").selectAll().execute();

      console.debug(`[AUTH] Found ${apps.length} apps in database`);

      for (const app of apps) {
        const isValid = await verifyToken(token, app.token_hash);
        console.log(`[AUTH] Checking app=${app.app_id}: valid=${isValid}`);
        if (isValid) {
          request.appId = app.app_id;
          console.debug(`[AUTH] Authenticated as ${app.app_id}`);
          return; // Authenticated!
        }
      }

      console.debug(`[AUTH] No matching token found, returning 401`);
      return reply.status(401).send({ error: "Invalid token" });
    }
  );
}

export default fp(authPlugin, {
  name: "auth",
});
