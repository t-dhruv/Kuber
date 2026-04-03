# Kuber monorepo — single Containerfile for both server and client
# Use: podman build --target server-runner .
#      podman build --target client-runner .

# ─── Shared base ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
COPY shared ./shared

# ─── Server: install + build ──────────────────────────────────────────────────
FROM base AS server-builder
RUN apk add --no-cache openssl
COPY server/package.json ./server/
RUN npm install --workspace=server
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
WORKDIR /app/server
RUN npx prisma generate && npm run build

FROM node:20-alpine AS server-runner
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server/package.json ./server/
RUN npm install --workspace=server --omit=dev
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/prisma ./server/prisma
# Prisma client is hoisted to root node_modules by npm workspaces
COPY --from=server-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=server-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
WORKDIR /app/server
EXPOSE 9002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]

# ─── Client: install + build ──────────────────────────────────────────────────
FROM base AS client-builder
COPY client/package.json ./client/
RUN npm install --workspace=client
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
