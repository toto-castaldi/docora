FROM node:22-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Build metadata args (set by CI, defaults for local builds)
ARG BUILD_NUMBER=dev
ARG COMMIT_SHA=local
ARG BUILD_DATE

# Copy workspace config and all package.json files for dependency install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json dashboard/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY packages ./packages
COPY dashboard ./dashboard
COPY scripts ./scripts
COPY .planning/STATE.md .planning/STATE.md

# Generate version.ts from STATE.md, then build backend and dashboard
RUN BUILD_NUMBER=${BUILD_NUMBER} COMMIT_SHA=${COMMIT_SHA} node scripts/extract-version.cjs && \
    pnpm build && pnpm dashboard:build

# Production stage
FROM node:22-alpine AS production

# Install git for repository cloning
RUN apk add --no-cache git

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built backend
COPY --from=builder /app/dist ./dist
# Copy built dashboard
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Create repos directory with correct permissions before switching user
RUN mkdir -p /data/repos && chown -R node:node /data

# Non-root user for security
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
