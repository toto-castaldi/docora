docora
======

![logo](logo.svg)

# AI

```
read CLAUDE.md, README.md, CHANGELOG.md and all the files in docs folder. Now you are ready.
```


# DEV

test the code base

```bash
pnpm test -- --coverage
//view the test coverage
google-chrome coverage/index.html
```

```bash
mkdir -p docora_dev_data/postgresql
mkdir -p docora_dev_data/repo
```

database 

```bash
docker run --rm --name docora-postgres \
  -e POSTGRES_USER=docora \
  -e POSTGRES_PASSWORD=docora \
  -e POSTGRES_DB=docora \
  -p 5432:5432 \
  -v $(pwd)/docora_dev_data/postgresql:/var/lib/postgresql/data \
  postgres:16-alpine
```

liquibase UPDATE

```bash
docker run --rm \
  --network host \
  -v $(pwd)/deploy/liquibase:/liquibase/workspace \
  -w /liquibase/workspace \
  liquibase/liquibase:4.25 \
  --defaults-file=liquibase.properties \
  update
```

redis

```bash
docker run --rm --name docora-redis \
    -p 6379:6379 \
    redis:7-alpine
```

API

```bash
RUN_MODE=api pnpm dev
```

worker

```bash
RUN_MODE=worker pnpm dev
```

sql query

```bash
docker exec -it docora-postgres psql -U docora -d docora -c "SELECT app_id, app_name, email FROM apps;"
```

truncate all tables 

```bash
docker exec -it docora-postgres psql -U docora -d docora -c "
    TRUNCATE snapshot_files CASCADE;
    TRUNCATE repository_snapshots CASCADE;
    TRUNCATE app_repositories CASCADE;
    TRUNCATE repositories CASCADE;
    TRUNCATE apps CASCADE;
  "
```

# PROD

## Setup

1. Copy `.env.example` to `/opt/docora/.env`
2. **IMPORTANT:** Set `REPOS_BASE_PATH=/data/repos` (must be absolute path)

## Troubleshooting

### Reset circuit breaker and retry failed jobs

```bash
docker exec -it docora-postgres-1 psql -U docora -d docora -c "
UPDATE repositories SET consecutive_failures = 0, circuit_open_until = NULL;
UPDATE app_repositories SET status = 'pending_snapshot', retry_count = 0, last_error = NULL;
"
```

### Fix volume permissions (if worker fails with EACCES)

```bash
docker exec -u root docora-worker chown -R node:node /data
```

### Check worker status

```bash
docker logs -f --tail 50 docora-worker
```

### Update app base_url

```bash
docker exec -it docora-postgres-1 psql -U docora -d docora -c "
UPDATE apps SET base_url = 'https://your-url.com/webhook' WHERE app_id = 'app_xxx';
"
```

# GITHUB ACTIONS

| Secret         | Description                    | Example                                    |
|----------------|--------------------------------|--------------------------------------------|
| DEPLOY_HOST    | Server IP or hostname          | 164.90.xxx.xxx or docora.toto-castaldi.com |
| DEPLOY_USER    | SSH username                   | root or deploy                             |
| DEPLOY_SSH_KEY | Private SSH key (full content) | -----BEGIN OPENSSH PRIVATE KEY-----...     |

# DB

```bash
docker exec -it docora-postgres-1 psql -U docora -d docora -c "SELECT * FROM apps;"
```

# UTILS

# Generate a key 

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```