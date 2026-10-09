FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --workspace web
COPY web web
COPY server/curriculum.json server/curriculum.json
COPY server/course.json server/course.json
RUN npm run build --workspace web

FROM nginx:stable-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/ || exit 1
