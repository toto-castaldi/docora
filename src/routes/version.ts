import { FastifyInstance } from "fastify";
import {
  BUILD_INFO,
  getVersionString,
  getFullVersionString,
} from "../version.js";

export async function versionRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    "/version",
    {
      config: { publicAccess: true },
    },
    async () => {
      return {
        version: getVersionString(),
        full: getFullVersionString(),
        details: BUILD_INFO,
        fake: "3",
      };
    }
  );
}
