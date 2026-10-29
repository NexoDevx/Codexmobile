#!/usr/bin/env bash
# Empacota proroot (binários ARM64 não modificados) + Ubuntu Base ARM64.
# O workflow valida SHA-256 de cada componente e falha sem publicar APK incompleto.
set -euo pipefail

APP=android/app/src/main
PKG="$APP/java/com/codemobile/app"
JNI="$APP/jniLibs/arm64-v8a"
ASSETS="$APP/assets"
W="$(mktemp -d)"
cleanup() { rm -rf "$W"; }
trap cleanup EXIT
mkdir -p "$JNI" "$ASSETS" "$PKG"

PROROOT_VERSION="${PROROOT_VERSION:-v1.2.8}"
BASE_VERSION="${UBUNTU_BASE_VERSION:-24.04.5}"
PROROOT_BASE="https://raw.githubusercontent.com/coderredlab/proroot/${PROROOT_VERSION}/arm64-v8a"

# Binários publicados pelo upstream. Eles são baixados sem modificação e fixados por hash.
declare -A SHA=(
  [libproroot.so]=a4e74d75b66cdc02b080adfe863dbf9951c3b30610d77beddc95488d5fe5de01
  [libproroot-runtime.so]=8c47a0a7db32d84c179ebb5bf3640f655a3181860ece5886ae44d92858730c34
  [libproroot-bridge.so]=1c5bc9537a270e8bf8b1c70222813f57b60b828bfb5503ddf8fe37685092de2f
  [libproroot-linker.so]=51a0ec5bfed00e572a0de09e22d9057e2befc386b78e426613d3e0ab03f4ecee
  [libproroot-stub-loader.so]=06c6624db3bdc45b9ced151cd781df439a37b47731d244b93e9d6a58cd48cde0
)

# Remova artefatos do engine anterior para impedir uma mistura entre motores.
rm -f "$JNI/libproot.so" "$JNI/libproot-loader.so" "$ASSETS/proot-build-info.txt" \
      "$ASSETS/linux-engine-info.txt" "$ASSETS/proroot-LICENSE.txt" "$ASSETS/rootfs.bin"
for f in "${!SHA[@]}"; do
  echo "Baixando proroot ${PROROOT_VERSION}: $f"
  curl --retry 3 --retry-all-errors -fsSL "$PROROOT_BASE/$f" -o "$W/$f"
  [ -s "$W/$f" ] || { echo "ERRO: $f está vazio" >&2; exit 1; }
  actual="$(sha256sum "$W/$f" | awk '{print $1}')"
  [ "$actual" = "${SHA[$f]}" ] || { echo "ERRO: SHA-256 inválido para $f: $actual" >&2; exit 1; }
  cp "$W/$f" "$JNI/$f"
  chmod 0755 "$JNI/$f"
done

# Ubuntu Base oficial (gliba/glibc userspace), validado com a lista SHA256SUMS oficial.
BASE_NAME="ubuntu-base-${BASE_VERSION}-base-arm64.tar.gz"
BASE_URL="https://cdimages.ubuntu.com/cdimage/ubuntu-base/releases/noble/release"
echo "Baixando Ubuntu Base ${BASE_VERSION} ARM64"
curl --retry 3 --retry-all-errors -fsSL "$BASE_URL/$BASE_NAME" -o "$W/$BASE_NAME"
curl --retry 3 --retry-all-errors -fsSL "$BASE_URL/SHA256SUMS" -o "$W/SHA256SUMS"
expected="$(awk -v f="$BASE_NAME" '$2==f || $2=="*"f {print $1; exit}' "$W/SHA256SUMS")"
[ "${#expected}" -eq 64 ] || { echo "ERRO: não encontrei SHA-256 oficial de $BASE_NAME" >&2; exit 1; }
actual="$(sha256sum "$W/$BASE_NAME" | awk '{print $1}')"
[ "$actual" = "$expected" ] || { echo "ERRO: SHA-256 inválido do rootfs Ubuntu: $actual" >&2; exit 1; }
cp "$W/$BASE_NAME" "$ASSETS/rootfs.bin"

cat > "$ASSETS/linux-engine-info.txt" <<INFO
engine=proroot
version=$PROROOT_VERSION
binary_source=https://github.com/coderredlab/proroot/tree/$PROROOT_VERSION/arm64-v8a
binary_sha256_verified=true
rootfs=Ubuntu Base $BASE_VERSION ARM64
rootfs_source=$BASE_URL/$BASE_NAME
rootfs_sha256=$expected
architecture=arm64-v8a
INFO
cp native/ShellPlugin.java "$PKG/ShellPlugin.java"
cp native/PROROOT-LICENSE.txt "$ASSETS/proroot-LICENSE.txt"
bash native/mainactivity.sh

echo "Proroot ${PROROOT_VERSION} validado e empacotado com Ubuntu Base ${BASE_VERSION} ARM64."
