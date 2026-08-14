# ================================================================
# Rahaal ERP — Production Dockerfile
# Multi-stage build for a slim, self-contained Next.js 15 image.
#
# Architecture:
#   Host Nginx  →  127.0.0.1:8002  →  container :3000 (this image)
#
# The application uses the standalone Next.js output and reads MongoDB
# configuration exclusively from environment variables at runtime.
#
# NO Emergent runtime host, NO hardcoded database name, NO auto-seed.
# ================================================================

# ---------- Stage 1: dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app

# Install libc6-compat (required by some node modules on Alpine)
RUN apk add --no-cache libc6-compat

# Copy only the manifest files first for optimal layer caching
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

# ---------- Stage 2: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Bring in installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application sources (see .dockerignore for exclusions)
COPY . .

# Ensure production build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js in standalone mode (next.config.js already sets output: 'standalone')
RUN yarn build

# ---------- Stage 3: runner (final image) ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user for runtime security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server, static assets, and public files.
# Next.js standalone bundle contains: server.js + minimal node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

# Basic healthcheck: hit /api/health inside the container
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null 2>&1 || exit 1

USER nextjs
EXPOSE 3000

# Standalone entry point (created by next build with output: 'standalone')
CMD ["node", "server.js"]
