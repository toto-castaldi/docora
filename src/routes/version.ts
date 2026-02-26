import { FastifyInstance } from "fastify";
import { BUILD_INFO } from "../version.js";

export async function versionRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    "/version",
    {
      config: { publicAccess: true },
    },
    async () => {
      return {
        version: BUILD_INFO.version,
        buildNumber: BUILD_INFO.buildNumber,
        gitSha: BUILD_INFO.gitSha,
        buildDate: BUILD_INFO.buildDate,
      };
    }
  );
}
