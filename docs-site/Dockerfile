# Stage 1: Build with Hugo
FROM hugomods/hugo:latest AS builder

WORKDIR /src

# Copy Hugo site files
COPY . .

# Build the site
RUN hugo --minify

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built site from builder
COPY --from=builder /src/public /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
