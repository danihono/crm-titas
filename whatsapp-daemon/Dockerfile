# WhatsApp mirror daemon — long-lived Baileys process, self-hosted.
# DEPLOY CONSTRAINT: this process must be always-on, and only ONE copy may hold a
# given session — two instances on the same auth => WhatsApp logs both out. That is
# enforced by the per-session lease in whatsappSessions/{uid}.lock (src/lease.ts).
# It talks to the CRM through a Firestore queue, so it needs NO inbound port.
# See docs/whatsapp-selfhost.md.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/lib ./lib
# No EXPOSE: the daemon opens no port by default (set WA_HTTP_PORT for a local /healthz).
CMD ["node", "lib/index.js"]
