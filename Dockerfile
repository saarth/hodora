# Self-hosted build (Unraid, any Docker host) — plain Node server instead of
# the Cloudflare Worker bundle `npm run build`/`npm run deploy` produce.
# See the "Self-hosting with Docker" section in README.md.

FROM node:22-alpine AS build
WORKDIR /app

# VITE_-prefixed values are inlined into the client bundle at build time by
# Vite, so they have to be build args, not runtime environment variables.
# They're the publishable/anon Supabase values — safe to be visible in the
# built client bundle (that's the point of them), never the service-role key.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_PUBLISHABLE_KEY
# Optional — route planning/map style. Leave unset for the zero-config
# defaults (public BRouter, CARTO raster basemap). See .env.example.
ARG VITE_BROUTER_URL
ARG VITE_MAPTILER_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_BROUTER_URL=$VITE_BROUTER_URL \
    VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:node

# Nitro's node-server output is self-contained under .output/ — no
# node_modules needed at runtime.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
# Run as the non-root `node` user (built into the base image) instead of
# root — this process only needs to listen on a port and read its own
# files, not own the container.
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
