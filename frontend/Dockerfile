FROM node:20-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --registry=${NPM_REGISTRY} --prefer-offline --no-audit --fund=false

COPY . .
RUN npm run build

# --- serve with nginx ---
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback + API reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
