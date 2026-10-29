#!/data/data/com.termux/files/usr/bin/sh
# Instala no Termux as ferramentas que o agente usa (pacotes oficiais do repositório do Termux).
# Rodado automaticamente pelo start.sh na primeira vez. Para rodar de novo: sh setup.sh
set -e
pkg install -y nodejs git python ripgrep fd jq tree curl wget openssh zip unzip diffutils patch findutils gawk sed grep make clang
echo "Ferramentas instaladas."
