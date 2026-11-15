#!/usr/bin/env bash
# Build the Vite editor. For GitHub Pages, set VITE_BASE and VITE_API_BASE first.
# Example:
#   VITE_BASE=/pipes-from-the-grave/ VITE_API_BASE=https://YOUR-API.onrender.com ./scripts/build-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "VITE_BASE=${VITE_BASE:-/}"
echo "VITE_API_BASE=${VITE_API_BASE:-<same origin>}"
npm run build -w @pipes/web
echo "Built apps/web/dist"
