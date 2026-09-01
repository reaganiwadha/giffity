#!/usr/bin/env sh
# Build the giffity single binary and install it onto your PATH.
#   curl -fsSL https://raw.githubusercontent.com/reaganiwadha/giffity/giffity-dev/install.sh | sh
# or, from a clone:  ./install.sh
set -e

if ! command -v bun >/dev/null 2>&1; then
  echo "Installing bun…"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

npm install
bun run install-local
