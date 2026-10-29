#!/bin/bash
# Plugin nativo obrigatório para o seletor de pastas do Android (SAF).
set -euo pipefail
PKG=android/app/src/main/java/com/codemobile/app
mkdir -p "$PKG"
cp native/FolderPlugin.java "$PKG/FolderPlugin.java"
bash native/mainactivity.sh
