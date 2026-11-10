FROM nginxinc/nginx-unprivileged:stable-alpine

# Upgrade Alpine OS packages to pick up security fixes available in the
# configured repositories. Temporarily switch to root only during build.
USER root
RUN apk update \
    && apk upgrade --no-cache \
    && rm -rf /var/cache/apk/*

# Run the application as the unprivileged Nginx user at runtime.
USER 101:101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 8080
