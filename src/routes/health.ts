import { FastifyInstance } from "fastify";

interface HealthResponse {
    timestamp: string;
    uptime: number;
}

export async function healthRoutes(server: FastifyInstance): Promise<void> {
    server.get("/health", async (): Promise<HealthResponse> => {
        return {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    });

}