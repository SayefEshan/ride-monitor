# Production image for the Next.js server. Supabase hosts the database, so
# this container is the only thing that runs on the VPS.
#
# Built in CI and pushed to GHCR; the server only ever pulls it.

FROM node:22-alpine AS base

# ---------------------------------------------------------------------------
# Dependencies. Cached independently of the source, so a code-only change does
# not reinstall the tree.
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Build.
#
# NEXT_PUBLIC_* values are inlined into the browser bundle by `next build`, so
# they have to be present here rather than at run time. Both are safe to bake
# in: the anon key is published to every browser that loads the app, and RLS
# is what actually protects the data. The service-role key is deliberately
# absent — it is injected at run time and must never enter an image layer.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime. Only the standalone output, run as a non-root user.
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone excludes these two by design; server.js serves them once copied.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
