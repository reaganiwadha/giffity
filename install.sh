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
bun run build-bun

DEST="${GIFFITY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$DEST"
install -m 0755 dist-bin/giffity "$DEST/giffity"

echo
echo "Installed giffity -> $DEST/giffity"
case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "Add $DEST to your PATH to use \`giffity\` directly." ;;
esac
