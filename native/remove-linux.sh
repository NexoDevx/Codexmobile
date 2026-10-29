#!/bin/bash
# Usado pelo workflow se o build COM o Linux embutido falhar: tira o Linux e mantém o resto.
APP=android/app/src/main
rm -f "$APP/java/com/codemobile/app/ShellPlugin.java" "$APP/assets/rootfs.bin"; rm -rf "$APP/jniLibs"
bash native/mainactivity.sh
