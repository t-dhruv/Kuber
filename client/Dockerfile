# ---- Builder stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies
RUN npm ci

# Copy source files
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json tsconfig.tsbuildinfo* ./
COPY public ./public
COPY src ./src

# Build static assets
RUN npm run build

# ---- Runner stage (nginx static server) ----
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Inline SPA-friendly nginx config
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # SPA fallback: try file, then directory, then index.html\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets aggressively\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # Do not cache index.html\n\
    location = /index.html {\n\
        add_header Cache-Control "no-cache, no-store, must-revalidate";\n\
    }\n\
}\n' > /etc/nginx/conf.d/client.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
