#!/bin/bash
# Plugin nativo obrigatório: salva artefatos diretamente em Downloads pelo MediaStore.
set -euo pipefail
PKG=android/app/src/main/java/com/codemobile/app
mkdir -p "$PKG"
cp native/DownloadPlugin.java "$PKG/DownloadPlugin.java"
bash native/mainactivity.sh
