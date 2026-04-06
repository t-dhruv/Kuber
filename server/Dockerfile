# Build context: monorepo root
# ---- Builder stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifest + shared package
COPY package.json package-lock.json ./
COPY shared ./shared

# Copy server package manifest
COPY server/package.json ./server/

# Install all workspace dependencies (hoisted to /app/node_modules)
RUN npm ci --workspace=server

# Copy server source
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Generate Prisma client (output: /app/node_modules/.prisma/client)
WORKDIR /app/server
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ---- Runner stage ----
FROM node:20-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/

# Install production deps only (prisma CLI included — needed for migrate deploy)
RUN npm ci --workspace=server --omit=dev

# Copy compiled output and schema
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma

# Copy generated Prisma client from builder (hoisted location)
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma

WORKDIR /app/server
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
