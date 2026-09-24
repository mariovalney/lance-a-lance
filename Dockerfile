# One image: the built PWA and the API that serves it, on one origin.
# Deployed on Easypanel as a single app service, with TLS handled in front.
#
#   docker build -t lance-a-lance .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://... lance-a-lance
#
# Environment:
#   DATABASE_URL     required, the Postgres connection string
#   PORT             defaults to 3000
#   SIGNUP_ENABLED   defaults to false; signup is allowed anyway while the
#                    users table is empty, so the first account can be created
#   COOKIE_SECURE    defaults to true, which is right behind Easypanel's TLS

FROM node:22-alpine AS build
WORKDIR /app
ENV CI=1

# corepack picks the pnpm pinned in package.json (packageManager), so the
# image resolves the lockfile with the same version that wrote it.
RUN corepack enable

# Install with the lockfile first, so that editing source does not refetch.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build:pwa && pnpm build:server

# Drop the dev dependencies from the tree that ships.
RUN pnpm prune --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dist ./dist

# Never as root.
USER node

EXPOSE 3000

# Easypanel restarts the container when this fails; it also covers Postgres
# being unreachable, which is the failure worth noticing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
