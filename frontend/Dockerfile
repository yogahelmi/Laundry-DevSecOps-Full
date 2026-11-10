FROM nginxinc/nginx-unprivileged:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

# Explicitly declare the unprivileged runtime user for Dockerfile security scanners.
USER 101:101

EXPOSE 8080
