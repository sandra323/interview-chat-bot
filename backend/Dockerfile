FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

RUN npm install --workspace=backend --workspace=shared

COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY backend/ ./backend/

RUN npm run build --workspace=backend

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

RUN npm install --workspace=backend --workspace=shared --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/shared ./shared

WORKDIR /app/backend

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
