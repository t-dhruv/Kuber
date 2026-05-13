# Kuber monorepo — single Dockerfile for server and client
# Targets: server-runner, client-runner

# ─── Shared base ──────────────────────────────────────────────────────────────
FROM node:25-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared

# ─── Server: install + build ──────────────────────────────────────────────────
FROM base AS server-builder
COPY server/package.json ./server/
RUN npm ci --workspace=server
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
WORKDIR /app/server
RUN npx prisma generate && npm run build

FROM node:25-alpine AS server-runner
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev
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
RUN npm ci --workspace=client
COPY client/index.html ./client/
COPY client/vite.config.ts ./client/
COPY client/tsconfig.json ./client/
COPY client/public ./client/public
COPY client/src ./client/src
WORKDIR /app/client
RUN npm run build

FROM nginx:alpine AS client-runner
RUN rm /etc/nginx/conf.d/default.conf
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location /api/ {\n\
        proxy_pass         http://server:9002/api/;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header   Host              $host;\n\
        proxy_set_header   X-Real-IP         $remote_addr;\n\
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;\n\
        proxy_set_header   Connection        "";\n\
        proxy_read_timeout 120s;\n\
        proxy_send_timeout 120s;\n\
    }\n\
    location ~* ^/api/v1/.*/stream$ {\n\
        proxy_pass         http://server:9002;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header   Host              $host;\n\
        proxy_set_header   X-Real-IP         $remote_addr;\n\
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;\n\
        proxy_set_header   Connection        "";\n\
        proxy_buffering    off;\n\
        proxy_cache        off;\n\
        add_header         X-Accel-Buffering no;\n\
        proxy_read_timeout 180s;\n\
        proxy_send_timeout 180s;\n\
    }\n\
    location / { try_files $uri $uri/ /index.html; }\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
    location = /index.html {\n\
        add_header Cache-Control "no-cache, no-store, must-revalidate";\n\
    }\n\
}\n' > /etc/nginx/conf.d/client.conf
COPY --from=client-builder /app/client/dist /usr/share/nginx/html
EXPOSE 80
