# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Serve stage ────────────────────────────────────────────────────────────────
FROM nginx:1.30-alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
