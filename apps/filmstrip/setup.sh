#!/usr/bin/env bash
# One-shot local setup for Filmstrip.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { printf "${GREEN}==>${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}==>${NC} %s\n" "$1"; }
die() { printf "${RED}==>${NC} %s\n" "$1"; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null 2>&1 || die "Node.js 20+ is required. Install Node, then rerun setup."
command -v npm >/dev/null 2>&1 || die "npm is required. Install npm, then rerun setup."

if ! command -v ffmpeg >/dev/null 2>&1; then
  warn "ffmpeg was not found. MP4/GIF rendering and video trimming require ffmpeg."
  warn "Install it with your system package manager, for example: brew install ffmpeg, apt install ffmpeg, or winget install Gyan.FFmpeg."
else
  say "ffmpeg found"
fi

say "Installing Remotion dependencies"
cd "$HERE/remotion-poster"
npm install --silent --no-audit --no-fund

mkdir -p "$HERE/remotion-poster/downloads" "$HERE/remotion-poster/out"

printf "\n${GREEN}Setup complete.${NC}\n\n"
cat <<EOF
Try it:
  cd $HERE
  ./bin/make-poster --manifest manifests/example.json --still --out remotion-poster/out/example.png
  ./bin/editor

Open http://localhost:5959 after starting the editor.
EOF
