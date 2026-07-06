# WhatsApp mirror daemon — long-lived Baileys process for Cloud Run.
# DEPLOY CONSTRAINT: this service must run as a SINGLE always-on instance
# (min-instances=1, max-instances=1, --no-cpu-throttling). Two instances holding
# the same auth => WhatsApp logs both out. See docs/whatsapp-mirror.md.

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
# Cloud Run injects $PORT; the HTTP health/control server listens on it.
EXPOSE 8080
CMD ["node", "lib/index.js"]
