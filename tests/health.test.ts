import { describe, it, expect, afterAll } from 'vitest';
import { getTestServer, closeTestServer } from './setup.js';

describe('GET /health', () => {
    afterAll(async () => {
        await closeTestServer();
    });

    it('should return 200 status', async () => {
        const server = await getTestServer();
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });

        expect(response.statusCode).toBe(200);
    });

    it('should return timestamp and uptime', async () => {
        const server = await getTestServer();
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });

        const body = JSON.parse(response.body);

        expect(body).toHaveProperty('timestamp');
        expect(body).toHaveProperty('uptime');
        expect(typeof body.timestamp).toBe('string');
        expect(typeof body.uptime).toBe('number');
    });

    it('should return valid ISO timestamp', async () => {
        const server = await getTestServer();
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });

        const body = JSON.parse(response.body);
        const date = new Date(body.timestamp);

        expect(date.toISOString()).toBe(body.timestamp);
    });
});