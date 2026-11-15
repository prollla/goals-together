FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY server/*.cjs ./server/
RUN mkdir -p /data /backups && chown node:node /data /backups

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/goals.db

USER node
EXPOSE 3001

CMD ["node", "server/index.cjs"]
