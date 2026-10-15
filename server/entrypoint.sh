#!/bin/sh
set -eu

# Deploy the reviewed, generated catalog transactionally before opening reads.
# Existing account progress and learning receipts are outside this import.
# An unchanged bundle (same content and importer format) is skipped, so an
# ordinary restart performs no DDL or bulk writes. IMPORT_CONTENT_FORCE=true
# re-imports regardless.
if [ -n "${DATABASE_URL:-}" ] && [ "${IMPORT_CONTENT_ON_BOOT:-true}" != "false" ]; then
  if [ "${IMPORT_CONTENT_FORCE:-false}" = "true" ]; then
    /app/import-content -content /app/content.json -force
  else
    /app/import-content -content /app/content.json
  fi
fi
exec /app/world "$@"
