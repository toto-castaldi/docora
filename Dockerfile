FROM node:22-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

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

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create repos directory with correct permissions before switching user
RUN mkdir -p /data/repos && chown -R node:node /data

# Non-root user for security
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]