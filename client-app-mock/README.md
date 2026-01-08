# Docora Client Mock

A mock client application that receives updates from Docora. Use this to test Docora's snapshot delivery.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Run in development mode
pnpm dev
```

The server starts on `http://localhost:4000` by default.

## Usage with Docora

1. Start the mock client:
   ```bash
   pnpm dev
   ```

2. Register with Docora using this as your `base_url`:
   ```bash
   curl -X POST http://localhost:3000/api/apps/onboard \
     -H "Content-Type: application/json" \
     -d '{
       "base_url": "http://localhost:4000",
       "app_name": "My Test App",
       "email": "test@example.com"
     }'
   ```

3. Register a repository (use the token from step 2):
   ```bash
   curl -X POST http://localhost:3000/api/repositories \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "github_url": "https://github.com/owner/repo"
     }'
   ```

4. Watch the mock client logs for incoming snapshots.

## Docker

Build and run with Docker:

```bash
docker build -t docora-client-mock .
docker run -p 4000:4000 docora-client-mock
```

Or add to your docker-compose.yml:

```yaml
client-mock:
  build: ./client-app-mock
  ports:
    - "4000:4000"
  networks:
    - docora-network
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/` | Receive Docora snapshots |
| POST | `/webhooks` | Alternative webhook path |

## Payload Format

Docora sends payloads in this format:

```json
{
  "event": "initial_snapshot",
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "snapshot": {
    "commit_sha": "a1b2c3d4...",
    "branch": "main",
    "scanned_at": "2025-01-08T12:00:00Z",
    "files": [
      {
        "path": "src/index.ts",
        "sha": "abc123...",
        "size": 1234,
        "content": "..."
      }
    ]
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
