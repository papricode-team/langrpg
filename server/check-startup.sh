#!/bin/sh
set -eu

# Boot the final image with disposable state and the packaged content catalog.
# Source-tree tests cannot catch missing files in the runtime image.
check_dir=$(mktemp -d)
check_pid=
cleanup() {
  if [ -n "$check_pid" ]; then
    kill "$check_pid" 2>/dev/null || true
    wait "$check_pid" 2>/dev/null || true
  fi
  rm -rf "$check_dir"
}
trap cleanup EXIT
DATABASE_URL= DATA_PATH="$check_dir/state.json" CONTENT_PATH=/app/content.json \
  /bin/sh /app/entrypoint.sh > "$check_dir/server.log" 2>&1 &
check_pid=$!
attempt=0
while [ "$attempt" -lt 30 ]; do
  if /app/world healthcheck; then
    exit 0
  fi
  if ! kill -0 "$check_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
cat "$check_dir/server.log" >&2
exit 1
