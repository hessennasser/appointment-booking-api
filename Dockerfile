# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate \
  && npm run build \
  && ./node_modules/.bin/tsc prisma/seed.ts \
    --outDir dist/prisma \
    --esModuleInterop \
    --module CommonJS \
    --moduleResolution Node \
    --target ES2022 \
    --skipLibCheck

FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
# Install runtime + prisma CLI (devDependency) for migrate/generate.
RUN npm ci --include=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
