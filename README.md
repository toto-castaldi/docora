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

database 

```bash
mkdir docora_dev_data
docker run --rm --name docora-postgres \
  -e POSTGRES_USER=docora \
  -e POSTGRES_PASSWORD=docora \
  -e POSTGRES_DB=docora \
  -p 5432:5432 \
  -v docora_dev_data:/var/lib/postgresql/data \
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

launch main service

```bash
pnpm dev
```

sql query

```bash
docker exec -it docora-postgres psql -U docora -d docora -c "SELECT app_id, app_name, email FROM apps;"
```

# PROD

/opt/docora/.env from .env.example

# GITHUB ACTIONS

| Secret         | Description                    | Example                                    |
|----------------|--------------------------------|--------------------------------------------|
| DEPLOY_HOST    | Server IP or hostname          | 164.90.xxx.xxx or docora.toto-castaldi.com |
| DEPLOY_USER    | SSH username                   | root or deploy                             |
| DEPLOY_SSH_KEY | Private SSH key (full content) | -----BEGIN OPENSSH PRIVATE KEY-----...     |


# UTILS

# Generate a key 

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```