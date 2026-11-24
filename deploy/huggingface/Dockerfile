# Hugging Face Docker Space: builds the public repo at a pinned commit.
# No API key is baked in; visitors may optionally bring their own (browser-only).
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/datvanu/pipes-from-the-grave.git . && git checkout 80c454b
RUN npm ci && npm run build -w @pipes/web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/package.json /src/package-lock.json /src/tsconfig.json ./
COPY --from=build /src/apps ./apps
COPY --from=build /src/packages ./packages
RUN npm ci --omit=dev && chown -R node:node /app
USER node
ENV PORT=7860
ENV GHOST_MODE=demo
ENV GHOST_ACCEPT_VISITOR_KEYS=true
ENV TRUST_PROXY=1
EXPOSE 7860
CMD ["./node_modules/.bin/tsx", "apps/server/src/index.ts"]
