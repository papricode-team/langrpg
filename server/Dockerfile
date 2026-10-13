FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --workspace web
COPY web web
# Rebuild the shared release ID for backend changes as well as frontend changes.
COPY server server
# Include Vite plugins, their transitive imports and packaging scripts in this
# build stage only. The runtime image receives only the compiled frontend.
COPY scripts scripts
# The frontend typecheck includes regression tests that import these fixtures.
COPY docs/audits/living-world-area-baseline.json docs/audits/lindenhafen-core-v1.json docs/audits/waldruh-core-v1.json docs/audits/
COPY docs/archive/expedition-scenes.json docs/archive/
RUN npm run build --workspace web && node scripts/precompress-web.mjs web/dist

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/world .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S game && adduser -S game -G game
WORKDIR /app
COPY --from=build /out/world /app/world
COPY --from=frontend /app/web/dist /app/public
ENV PORT=8080 STATIC_DIR=/app/public
RUN mkdir -p /app/.data && chown game:game /app/.data
USER game
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=15s --retries=3 CMD ["/app/world", "healthcheck"]
ENTRYPOINT ["/app/world"]
