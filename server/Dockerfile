# ---- Builder stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency install
COPY package.json package-lock.json ./

# Install all dependencies (including devDeps for build)
RUN npm ci

# Copy source files
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ---- Runner stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma schema and migrations (needed at runtime for migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy generated Prisma client from builder node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
