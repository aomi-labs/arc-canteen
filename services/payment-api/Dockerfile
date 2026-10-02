# syntax=docker/dockerfile:1
FROM node:20.18.2-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/payment-core/package.json packages/payment-core/package.json
COPY services/payment-api/package.json services/payment-api/package.json
RUN pnpm install --frozen-lockfile --filter @arc-canteen/payment-core --filter @arc-canteen/payment-api
COPY packages/payment-core packages/payment-core
COPY services/payment-api services/payment-api
RUN pnpm --filter @arc-canteen/payment-api deploy --prod /out

FROM node:20.18.2-bookworm-slim AS runner
WORKDIR /app
RUN mkdir -p /var/circle
COPY --from=builder /out ./
ENV NODE_ENV=production
ENV CIRCLE_CLI_HOME=/var/circle
ENV HOME=/var/circle
ENV CIRCLE_VERSION_CHECK=off
ENV HOST=0.0.0.0
EXPOSE 10000
CMD ["node", "--import", "tsx", "src/index.ts"]
