FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force
COPY index.js ./
USER node
EXPOSE 3000
CMD ["node", "index.js"]
