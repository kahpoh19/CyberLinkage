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
RUN printf 'server {\n  listen 3000;\n  root /usr/share/nginx/html;\n  index index.html;\n\n  location /api/ {\n    proxy_pass http://backend:8000;\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n  }\n\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
