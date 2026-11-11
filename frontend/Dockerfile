# ==========================================
# STAGE 1: Build Vue 3 + Vite Application
# ==========================================
FROM node:24-alpine AS build

WORKDIR /app

# Install dependencies using the lockfile
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Generate production assets
RUN npm run build


# ==========================================
# STAGE 2: Nginx Production Runtime
# ==========================================
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

# Upgrade operating system packages
USER root
RUN apk update \
    && apk upgrade --no-cache \
    && rm -rf /var/cache/apk/*

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled frontend assets
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/

# Run as unprivileged user
USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
