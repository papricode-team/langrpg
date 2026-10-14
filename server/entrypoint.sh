#!/bin/sh
set -eu

# Deploy the reviewed, generated catalog transactionally before opening reads.
# Existing account progress and learning receipts are outside this import.
if [ -n "${DATABASE_URL:-}" ] && [ "${IMPORT_CONTENT_ON_BOOT:-true}" != "false" ]; then
  /app/import-content -content /app/content.json
fi
exec /app/world "$@"
