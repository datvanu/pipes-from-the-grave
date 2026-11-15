# Local/demo image: Vite build + Fastify API on PORT (default 8787).
# Production start uses the `tsx` runtime dependency (not a devDependency).
# Do not push or deploy this image without approval.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci && npm run build -w @pipes/web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN npm ci --omit=dev && chown -R node:node /app
USER node
ENV PORT=8787
ENV GHOST_MODE=demo
ENV TRUST_PROXY=1
EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "apps/server/src/index.ts"]
