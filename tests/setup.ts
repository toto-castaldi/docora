import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let server: FastifyInstance;

export async function getTestServer(): Promise<FastifyInstance> {
    if (!server) {
        server = await buildServer();
        await server.ready();
    }
    return server;
}

export async function closeTestServer(): Promise<void> {
    if (server) {
        await server.close();
    }
}