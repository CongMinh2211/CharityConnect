# Render-friendly frontend image for CharityConnect.
# Backend microservices still deploy separately with Docker/Render/Railway when needed.

FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend

ARG VITE_USE_MOCK_API=true
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_ASSISTANT_URL=/api/v1
ARG VITE_REMOTE_ASSISTANT_ENABLED=false
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ASSISTANT_URL=$VITE_ASSISTANT_URL
ENV VITE_REMOTE_ASSISTANT_ENABLED=$VITE_REMOTE_ASSISTANT_ENABLED
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN cd frontend && npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

RUN npm install -g serve@14.2.4

COPY --from=builder --chown=node:node /app/frontend/dist ./dist

USER node
EXPOSE 10000

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
