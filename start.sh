#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Chon Node rieng cho du an, khong doi phien ban mac dinh cua may.
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" --no-use
  nvm use --silent
fi

if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo 'Cần Node.js 24 trở lên. Với nvm, chạy: nvm install 24' >&2
  exit 1
fi

exec node --env-file-if-exists=.env server.js
