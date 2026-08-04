# Kuber monorepo — single Dockerfile for server and client
# Targets: server-runner, client-runner

# ─── Shared base ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared

# ─── Server: install + build ──────────────────────────────────────────────────
FROM base AS server-builder
COPY server/package.json ./server/
RUN CI=true npm ci --workspace=server
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
WORKDIR /app/server
RUN npx prisma generate && npm run build

FROM node:24-alpine AS server-runner
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/
RUN CI=true npm ci --workspace=server --omit=dev
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=server-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY server/migrate-emoji-to-icon.js ./
WORKDIR /app/server
EXPOSE 9002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

# ─── Client: install + build ──────────────────────────────────────────────────
FROM base AS client-builder
COPY client/package.json ./client/
RUN CI=true npm ci --workspace=client
COPY client/index.html ./client/
COPY client/vite.config.ts ./client/
COPY client/tsconfig.json ./client/
COPY client/public ./client/public
COPY client/src ./client/src
WORKDIR /app/client
RUN npm run build

FROM nginx:alpine AS client-runner
RUN rm /etc/nginx/conf.d/default.conf
COPY client/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY client/nginx/default.conf /etc/nginx/conf.d/client.conf
COPY --from=client-builder /app/client/dist /usr/share/nginx/html
RUN nginx -t
EXPOSE 80
