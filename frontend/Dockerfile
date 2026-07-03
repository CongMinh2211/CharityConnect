FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_USE_MOCK_API=false
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API
COPY package*.json tsconfig*.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
RUN npm ci --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
