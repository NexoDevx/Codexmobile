#!/bin/bash
PKG=android/app/src/main/java/com/codemobile/app
rm -f "$PKG/FolderPlugin.java"
bash native/mainactivity.sh
