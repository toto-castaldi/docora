Public Documentation Site
=========================

> **STATUS: COMPLETED**

Summary
-------

This milestone introduces a public documentation website for Docora, documenting the webhook API that Docora sends to client applications.

Goals
-----

- Public documentation site at `docora.toto-castaldi.com`
- API at `api.docora.toto-castaldi.com`
- Document webhook endpoints (POST /create, /update, /delete)
- Document payload structure, authentication, binary files, chunking
- Minimal design using Docora brand colors
- Separate service in docker-compose

Technology
----------

- **Static Site Generator**: Hugo
- **Web Server**: nginx (Alpine)
- **Build**: Multi-stage Dockerfile
- **Routing**: Caddy reverse proxy with subdomain

Design
------

**Brand Colors (from logo.svg):**

| Element | Color | Usage |
|---------|-------|-------|
| Violet | `#9C68D4` | Primary, headers |
| Coral | `#FF7061` | Accents, links |
| Amber | `#FFA726` | Highlights, badges |
| Dark | `#282828` | Text |

**Style**: Minimal, clean, developer-focused

Architecture
------------

```
                    ┌─────────────────────────────────┐
                    │            Caddy                │
                    │         (reverse proxy)         │
                    └───────────────┬─────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            │                                               │
            ▼                                               ▼
┌───────────────────────┐                     ┌───────────────────────┐
│ docora.toto-          │                     │ api.docora.toto-      │
│ castaldi.com          │                     │ castaldi.com          │
│                       │                     │                       │
│   docora-docs:80      │                     │   docora-api:3000     │
│   (nginx + Hugo)      │                     │   (Fastify)           │
└───────────────────────┘                     └───────────────────────┘
```

File Structure
--------------

```
docs-site/
├── config.toml                 # Hugo configuration
├── content/
│   └── _index.md              # Main documentation content
├── layouts/
│   ├── _default/
│   │   └── baseof.html        # Base template
│   └── index.html             # Homepage template
├── static/
│   ├── css/
│   │   └── style.css          # Minimal custom styles
│   └── images/
│       └── logo.svg           # Docora logo
├── Dockerfile                  # Multi-stage build
└── .dockerignore
```

Documentation Content
---------------------

### Sections

1. **Introduction** - What is Docora, how webhooks work
2. **Authentication** - HMAC signature verification
3. **Endpoints**
   - POST /create
   - POST /update
   - POST /delete
4. **Payload Structure** - Repository info, file info
5. **Binary Files** - Base64 encoding, chunking
6. **Error Handling** - Expected client behavior

Implementation Phases
---------------------

### Phase 1: Hugo Site Structure

Create base Hugo site with minimal theme.

### Phase 2: Documentation Content

Write comprehensive webhook documentation in Markdown.

### Phase 3: Dockerfile

Multi-stage build:
1. Stage 1: Hugo build (generates static HTML)
2. Stage 2: nginx:alpine serves the files

### Phase 4: Docker Compose

Add `docora-docs` service.

### Phase 5: Caddy Configuration

Add subdomain routing for `docs.docora.toto-castaldi.com`.

---

Acceptance Criteria
-------------------

- [x] Hugo site builds successfully
- [x] Documentation covers all webhook endpoints
- [x] Authentication section with code examples
- [x] Binary file handling documented
- [x] Dockerfile produces working image
- [x] Docker compose includes docs service
- [x] Caddy routes subdomain correctly
- [ ] Site accessible at docora.toto-castaldi.com (pending deployment)
