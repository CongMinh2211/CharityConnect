FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY openapi.json ./openapi.json
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.json ./openapi.json
RUN mkdir -p /app/uploads
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
