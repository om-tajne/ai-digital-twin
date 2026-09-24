# Multi-stage Dockerfile for React (Vite) Production Build
# Stage 1: Build static assets
FROM node:20-alpine AS build

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install

# Build environment variables
ARG VITE_NODE_API_URL
ARG VITE_FASTAPI_URL
ARG VITE_FASTAPI_API_URL
ARG VITE_FASTAPI_WS_URL
ARG VITE_API_URL

ENV VITE_NODE_API_URL=$VITE_NODE_API_URL
ENV VITE_FASTAPI_URL=$VITE_FASTAPI_URL
ENV VITE_FASTAPI_API_URL=$VITE_FASTAPI_API_URL
ENV VITE_FASTAPI_WS_URL=$VITE_FASTAPI_WS_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy source code and build project
COPY . .
RUN npm run build

# Stage 2: Serve static production assets with Nginx
FROM nginx:alpine

# Copy static bundle to Nginx web root
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
