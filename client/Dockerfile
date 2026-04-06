# Build context: monorepo root (docker-compose sets context: .)
# ---- Builder stage ----
FROM node:25-alpine AS builder

WORKDIR /app

# Copy root workspace manifest + shared package
COPY package.json ./
COPY shared ./shared

# Copy client package manifest
COPY client/package.json ./client/

# Install all workspace dependencies from root
RUN npm install --workspace=client

# Copy client source
COPY client/index.html ./client/
COPY client/vite.config.ts ./client/
COPY client/tsconfig.json ./client/
COPY client/public ./client/public
COPY client/src ./client/src

# Build static assets
WORKDIR /app/client
RUN npm run build

# ---- Runner stage (nginx) ----
FROM nginx:alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf

RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    location = /index.html {\n\
        add_header Cache-Control "no-cache, no-store, must-revalidate";\n\
    }\n\
}\n' > /etc/nginx/conf.d/client.conf

COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80
