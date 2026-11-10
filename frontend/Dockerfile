# Run Nginx as an unprivileged user (UID 101), not root.
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

# nginx-unprivileged listens on 8080 by default.
EXPOSE 8080
