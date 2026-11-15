# Local/demo image: Vite build + Fastify API on PORT (default 8787).
# Do not push or deploy this image without approval.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci && npm run build -w @pipes/web

ENV NODE_ENV=production
ENV PORT=8787
ENV GHOST_MODE=demo

EXPOSE 8787

CMD ["npx", "tsx", "apps/server/src/index.ts"]
