Third‑Party App Onboarding & Token Issuance
===========================================

# Summary

This milestone introduces the onboarding flow that allows third‑party applications to register with Docora and receive repository updates. It defines the onboarding API, required metadata, token issuance, and validation rules.

# Goals

- Provide a public onboarding endpoint for third‑party apps.
- Issue a unique token per app for all future API communications.
- Store app metadata used for update delivery (base URL + contact details).
- Define validation and error handling for onboarding inputs.

# User Story

As a third‑party app, I want to register with Docora so I can receive repository updates using a unique token tied to my app.

# Scope

## Included

- App registration endpoint.ù
- Token creation and return in response.
- Metadata capture: base_url, app_name, email, optional website and description.
- Validation rules and error responses.

## Not Included

- Token expiration/rotation (tokens do not expire in this milestone).
- Ownership or account linking (no user/org model).
- Base URL verification/handshake.

# API Contract

## Endpoint

POST /api/apps/onboard

```code
Request Body
{
  "base_url": "https://example-app.com/webhooks",
  "app_name": "Example App",
  "email": "team@example-app.com",
  "website": "https://example-app.com",
  "description": "Short description (optional)"
}
```

```code
Response (201 Created)
{
  "app_id": "app_123456",
  "token": "docora_token_abcdef",
  "created_at": "2025-01-01T12:00:00Z"
}
```

# Validation Rules

- base_url
    - Required
    - Must be HTTPS
    - Must be a valid absolute URL

- app_name
    - Required
    - Min/max length (e.g., 3–100 chars)

- email
    - Required
    - Valid email format

- website
    - Optional
    - Must be valid URL if provided

- description
    - Optional
    - Max length (e.g., 500 chars)

# Token Behavior

- Unique per app
- No expiration (for now)
- Used for all subsequent API calls
- Sent via Authorization: Bearer <token> header

# Duplicate & Ownership Policy

- Duplicate base_url allowed (for now)
- No ownership model (no user/org binding)

# Error Handling (Examples)

- 400 Bad Request — missing or invalid fields
- 422 Unprocessable Entity — invalid URL or email format
- 500 Internal Server Error — unexpected server issue

# Security Considerations

- Require HTTPS for base_url.
- Prevent SSRF by blocking private/internal IPs or redirects.
- Rate‑limit onboarding endpoint.

# Acceptance Criteria

- Onboarding endpoint registers apps and returns a unique token.
- Validation rules are enforced with clear error responses.
- App metadata is stored for future update delivery.
- No token expiration or ownership requirement is enforced.

---

# Implementation Plan

## Technology Stack

| Component | Choice |
|-----------|--------|
| Database | PostgreSQL 16 |
| Migrations | Liquibase |
| Query Builder | Kysely |
| Validation | Zod |
| API Docs | zod-openapi + @fastify/swagger |
| Rate Limiting | @fastify/rate-limit |

---

## Implementation Phases

### Phase 1: Dependencies

```bash
pnpm add pg kysely zod @fastify/rate-limit @fastify/swagger @fastify/swagger-ui
pnpm add @asteasolutions/zod-to-openapi fastify-type-provider-zod bcrypt
pnpm add -D @types/pg @types/bcrypt
```

---

### Phase 2: Docker & Database Setup

**Local Development:** Standalone Docker containers (no docker-compose)

```bash
# Dev database (port 5432)
docker run -d --name docora-postgres \
  -e POSTGRES_USER=docora \
  -e POSTGRES_PASSWORD=docora \
  -e POSTGRES_DB=docora \
  -p 5432:5432 \
  -v docora_dev_data:/var/lib/postgresql/data \
  postgres:16-alpine

```

**Production:** PostgreSQL in docker-compose stack

| File | Action |
|------|--------|
| `deploy/docker-compose.yml` | MODIFY - Add PostgreSQL service |
| `.env.example` | CREATE - Environment template |

**Environment variables to add:**
```
DATABASE_URL=postgres://docora:docora@localhost:5432/docora
```

---

### Phase 3: Liquibase Schema

**Files to create:**

| File | Purpose |
|------|---------|
| `liquibase/liquibase.properties` | Liquibase config |
| `liquibase/changelog/db.changelog-master.xml` | Master changelog |
| `liquibase/changelog/001-create-apps-table.xml` | Apps table migration |

**Apps table schema:**
```sql
CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id VARCHAR(50) UNIQUE NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    app_name VARCHAR(100) NOT NULL,
    base_url VARCHAR(2048) NOT NULL,
    email VARCHAR(255) NOT NULL,
    website VARCHAR(2048),
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apps_app_id ON apps(app_id);
CREATE INDEX idx_apps_token_hash ON apps(token_hash);
```

---

### Phase 4: Database Layer (Kysely)

**Files to create:**

| File | Purpose |
|------|---------|
| `src/db/index.ts` | Connection pool, getDatabase(), closeDatabase() |
| `src/db/types.ts` | Kysely Database interface & AppsTable type |

---

### Phase 5: Utilities

**Files to create:**

| File | Purpose |
|------|---------|
| `src/utils/token.ts` | generateAppId(), generateToken(), hashToken(), verifyToken() |
| `src/utils/url-validator.ts` | isUrlSafe() - SSRF protection (block private IPs) |

---

### Phase 6: Zod Schemas + OpenAPI

**Files to create:**

| File | Purpose |
|------|---------|
| `src/schemas/apps.ts` | OnboardRequestSchema, OnboardResponseSchema with OpenAPI metadata |
| `src/plugins/swagger.ts` | Swagger/OpenAPI configuration, serves `/docs` |

---

### Phase 7: Repository Layer

**File to create:**

| File | Purpose |
|------|---------|
| `src/repositories/apps.ts` | createApp() - inserts app, returns app_id + plain token |

---

### Phase 8: Route Implementation

**Files to create:**

| File | Purpose |
|------|---------|
| `src/routes/apps/index.ts` | Apps route aggregator |
| `src/routes/apps/onboard.ts` | POST /api/apps/onboard handler |

**File to modify:**

| File | Change |
|------|--------|
| `src/routes/index.ts` | Import and register appsRoutes |

---

### Phase 9: Server Integration

**File to modify:** `src/server.ts`

- Add Zod type provider (validatorCompiler, serializerCompiler)
- Register @fastify/swagger + @fastify/swagger-ui
- Register @fastify/rate-limit
- Initialize database connection

**File to modify:** `src/index.ts`

- Add graceful shutdown (closeDatabase on SIGINT/SIGTERM)

---

### Phase 10: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/helpers/test-db.ts` | Test database utilities |
| `tests/utils/token.test.ts` | Token generation tests |
| `tests/utils/url-validator.test.ts` | SSRF protection tests |
| `tests/routes/apps/onboard.test.ts` | Endpoint integration tests |

---

## File Structure

```
src/
├── db/
│   ├── index.ts          (NEW)
│   └── types.ts          (NEW)
├── plugins/
│   └── swagger.ts        (NEW)
├── repositories/
│   └── apps.ts           (NEW)
├── routes/
│   ├── apps/
│   │   ├── index.ts      (NEW)
│   │   └── onboard.ts    (NEW)
│   └── index.ts          (MODIFY)
├── schemas/
│   └── apps.ts           (NEW)
├── utils/
│   ├── token.ts          (NEW)
│   └── url-validator.ts  (NEW)
├── index.ts              (MODIFY)
└── server.ts             (MODIFY)

tests/
├── helpers/
│   └── test-db.ts        (NEW)
├── routes/apps/
│   └── onboard.test.ts   (NEW)
└── utils/
    ├── token.test.ts     (NEW)
    └── url-validator.test.ts (NEW)

liquibase/
├── liquibase.properties  (NEW)
└── changelog/
    ├── db.changelog-master.xml   (NEW)
    └── 001-create-apps-table.xml (NEW)

deploy/docker-compose.yml (MODIFY)
.env.example              (NEW)
package.json              (MODIFY)
```

---

## Security Implementation

- Tokens stored as bcrypt hashes (plain token returned only once)
- HTTPS required for base_url
- SSRF protection blocks private/internal IPs (10.x, 172.16.x, 192.168.x, 127.x, localhost)
- Rate limiting: 10 requests/minute per IP on onboard endpoint

---

## Swagger UI

Available at: `GET /docs`