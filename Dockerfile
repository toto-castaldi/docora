FROM node:22-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

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

# Build backend and dashboard
RUN pnpm build && pnpm dashboard:build

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
