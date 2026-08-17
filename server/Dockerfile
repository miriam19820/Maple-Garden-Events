# Build context must be the project ROOT (not server/)
# docker build -f server/Dockerfile -t maple-server .

# ─── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache curl ca-certificates && \
    curl -o /usr/local/share/ca-certificates/netfree-ca.crt https://netfree.link/cacert/united/x2/root_ca_x2_bundle.crt && \
    update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV npm_config_strict_ssl=false

# npm workspaces: install from the single root lockfile (per-package lock files were dropped)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --workspace=server --workspace=@maple/shared --include-workspace-root=false --ignore-scripts

# ─── Stage 2: build (compile TypeScript + generate Prisma client) ─────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache curl ca-certificates && \
    curl -o /usr/local/share/ca-certificates/netfree-ca.crt https://netfree.link/cacert/united/x2/root_ca_x2_bundle.crt && \
    update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV npm_config_strict_ssl=false

COPY --from=deps /app/node_modules ./node_modules

# Build the shared workspace package first — server imports it as @maple/shared
COPY shared ./shared
RUN cd shared && npm run build

# Copy server source
COPY server/ ./server/

WORKDIR /app/server
RUN DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy npx prisma generate && npx tsc

# ─── Stage 3: production ──────────────────────────────────────────────────────
# Use Alpine to match the builder so the same Prisma musl binary works at runtime
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache bash curl ca-certificates chromium nss freetype harfbuzz ttf-freefont fontconfig && \
    curl -k -o /usr/local/share/ca-certificates/netfree-ca.crt \
        https://netfree.link/cacert/united/x2/root_ca_x2_bundle.crt && \
    update-ca-certificates

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV npm_config_strict_ssl=false

# Layout mirrors the builder (/app/shared + /app/server) so the npm workspaces
# symlink node_modules/@maple/shared -> ../shared still resolves at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY server/package.json server/prisma.config.ts ./server/
COPY server/scripts/db-migrate-deploy.sh server/scripts/docker-entrypoint.sh ./server/scripts/
RUN chmod +x ./server/scripts/db-migrate-deploy.sh ./server/scripts/docker-entrypoint.sh

WORKDIR /app/server

EXPOSE 5000

ENTRYPOINT ["bash", "./scripts/docker-entrypoint.sh"]
