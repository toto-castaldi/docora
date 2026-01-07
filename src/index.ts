import "dotenv/config";
import { buildServer } from "./server.js";
import { closeDatabase } from "./db/index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Docora server running at http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    server.log.info("Shutting down...");
    await server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
