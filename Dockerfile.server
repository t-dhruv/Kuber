# Build context: monorepo root (docker-compose sets context: .)
# ---- Builder stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifest + shared package
COPY package.json ./
COPY shared ./shared

# Copy server package manifest
COPY server/package.json ./server/

# Install all workspace dependencies from root
RUN npm install --workspace=server

# Copy server source
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Generate Prisma client and compile
WORKDIR /app/server
RUN npx prisma generate
RUN npm run build

# ---- Runner stage ----
FROM node:20-alpine AS runner

WORKDIR /app

COPY package.json ./
COPY shared ./shared
COPY server/package.json ./server/

RUN npm install --workspace=server --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=builder /app/server/node_modules/@prisma/client ./server/node_modules/@prisma/client

WORKDIR /app/server
EXPOSE 9002

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
