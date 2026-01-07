import { FastifyInstance } from "fastify";
import { BUILD_INFO, getVersionString, getFullVersionString } from "../version.js";

export async function versionRoutes(server: FastifyInstance): Promise<void> {
    server.get("/version", async () => {
        return {
            version: getVersionString(),
            full: getFullVersionString(),
            details: BUILD_INFO,
            fake : "1"
        };
    });
}