FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/prover/package.json apps/prover/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @coven/prover --include-workspace-root
COPY apps/prover apps/prover
RUN npm run build --workspace @coven/prover

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/prover/node_modules ./apps/prover/node_modules
COPY --from=build /app/apps/prover/package.json ./apps/prover/package.json
COPY --from=build /app/apps/prover/dist ./apps/prover/dist
USER node
EXPOSE 8080
CMD ["node", "apps/prover/dist/index.js"]
