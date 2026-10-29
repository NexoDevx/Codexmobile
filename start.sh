#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock 2>/dev/null
cd "$(dirname "$0")" || exit 1
if [ ! -f data/.setup-ok ]; then sh ./setup.sh && mkdir -p data && touch data/.setup-ok; fi
exec node server.mjs
