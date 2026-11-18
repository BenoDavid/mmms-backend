FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci
FROM dependencies AS init
COPY --chown=node:node config ./config
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node src ./src
COPY --chown=node:node .sequelizerc ./

USER node
ENV NODE_ENV=production
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node config ./config
USER node
ENV NODE_ENV=production
EXPOSE 7010
CMD ["node", "src/server.js"]
