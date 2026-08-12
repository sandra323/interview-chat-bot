FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

RUN npm install --workspace=frontend --workspace=shared

COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY frontend/ ./frontend/

RUN npm run build --workspace=shared && npm run build --workspace=frontend

FROM nginx:alpine AS runner

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
