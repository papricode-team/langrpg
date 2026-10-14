FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --workspace web
COPY web web
# Rebuild the shared release ID for backend changes as well as frontend changes.
COPY server server
# Include Vite plugins, their transitive imports and packaging scripts.
COPY scripts scripts
COPY content content
COPY content_ids.json content_ids.json
RUN node scripts/build-content.mjs
# The frontend typecheck includes regression tests that import these fixtures.
COPY docs/audits/living-world-area-baseline.json docs/audits/lindenhafen-core-v1.json docs/audits/waldruh-core-v1.json docs/audits/
COPY docs/archive/expedition-scenes.json docs/archive/
RUN npm run build --workspace web && node scripts/precompress-web.mjs web/dist
# Keep the validator's dependency closure without bundling the build toolchain.
# @img contains sharp's platform-specific native libraries selected by npm ci.
RUN mkdir -p /runtime/node_modules && cp -a node_modules/sharp node_modules/typescript node_modules/@img node_modules/detect-libc node_modules/semver /runtime/node_modules/

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/world .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/import-content ./cmd/import-content

FROM node:24-alpine
RUN apk add --no-cache ca-certificates && addgroup -S game && adduser -S game -G game
WORKDIR /app
COPY --from=build /out/world /app/world
COPY --from=build /out/import-content /app/import-content
COPY --from=frontend /app/server/content.json /app/content.json
COPY server/entrypoint.sh /app/entrypoint.sh
COPY --from=frontend /app/web/dist /app/public
COPY --from=frontend /runtime/node_modules /app/node_modules
# Canonical source and validation rules are private runtime inputs. The Go
# static handler serves only /app/public, never this compiler/source directory.
COPY --from=frontend /app/scripts/scene-compiler.mjs /app/scripts/admin-world-compiler.mjs /app/scripts/register-content-loader.mjs /app/scripts/scene-quality.mjs /app/scripts/scenery-geometry.mjs /app/scripts/
COPY --from=frontend /app/web/src /app/web/src
COPY --from=frontend /app/web/package.json /app/web/package.json
COPY --from=frontend /app/server/story_rules.json /app/server/expeditions.json /app/server/
COPY --from=frontend /app/docs/audits /app/docs/audits
COPY --from=frontend /app/docs/archive /app/docs/archive
ENV PORT=8080 STATIC_DIR=/app/public SCENE_COMPILER_PATH=/app/scripts/admin-world-compiler.mjs SCENE_SOURCE_PATH=/app/web/src/data/world-scenes.json
RUN ln -s /app/public /app/web/public && mkdir -p /app/.data && chown game:game /app/.data
USER game
# Exercise the packaged validator against production assets during image builds.
RUN node /app/scripts/admin-world-compiler.mjs --root /app < /app/web/src/data/world-scenes.json > /dev/null
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=15s --retries=3 CMD ["/app/world", "healthcheck"]
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
