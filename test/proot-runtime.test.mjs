import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const setup = read('native/setup-linux.sh');
const shell = read('native/ShellPlugin.java');
const extras = read('www/extras.js');
const workflow = read('.github/workflows/apk.yml');
const notices = read('THIRD_PARTY_NOTICES.md');

const hashes = [
  'a4e74d75b66cdc02b080adfe863dbf9951c3b30610d77beddc95488d5fe5de01',
  '8c47a0a7db32d84c179ebb5bf3640f655a3181860ece5886ae44d92858730c34',
  '1c5bc9537a270e8bf8b1c70222813f57b60b828bfb5503ddf8fe37685092de2f',
  '51a0ec5bfed00e572a0de09e22d9057e2befc386b78e426613d3e0ab03f4ecee',
  '06c6624db3bdc45b9ced151cd781df439a37b47731d244b93e9d6a58cd48cde0'
];

test('Linux usa proroot v1.2.8 e cinco binários ARM64 não modificados com hashes fixos', () => {
  assert.match(setup, /PROROOT_VERSION="\$\{PROROOT_VERSION:-v1\.2\.8\}"/);
  for (const lib of ['libproroot.so','libproroot-runtime.so','libproroot-bridge.so','libproroot-linker.so','libproroot-stub-loader.so']) assert.ok(setup.includes(lib), `missing ${lib}`);
  for (const hash of hashes) { assert.ok(setup.includes(hash), `missing sha ${hash}`); assert.equal(hash.length, 64); }
  assert.match(setup, /sha256sum/);
  assert.match(setup, /chmod 0755/);
  assert.match(setup, /ubuntu-base-\$\{BASE_VERSION\}-base-arm64\.tar\.gz/);
  assert.match(setup, /SHA256SUMS/);
  assert.match(setup, /engine=proroot/);
  assert.match(setup, /rootfs=Ubuntu Base/);
  assert.match(setup, /PROROOT-LICENSE\.txt/);
  assert.doesNotMatch(setup, /github\.com\/oonid\/pr\.git/);
  assert.doesNotMatch(setup, /scripts\/build\.sh|talloc/);
  execFileSync('bash', ['-n', 'native/setup-linux.sh']);
});

test('workflow exige os cinco binários por hash, Ubuntu rootfs e classes nativas', () => {
  assert.match(workflow, /Linux via proroot \+ Ubuntu Base \(obrigatório\)/);
  assert.doesNotMatch(workflow, /sdkmanager --install .*ndk;/);
  assert.match(workflow, /PROROOT_VERSION: v1\.2\.8/);
  assert.match(workflow, /UBUNTU_BASE_VERSION: 24\.04\.5/);
  for (const lib of ['libproroot.so','libproroot-runtime.so','libproroot-bridge.so','libproroot-linker.so','libproroot-stub-loader.so']) assert.ok(workflow.includes(lib), `workflow missing ${lib}`);
  assert.match(workflow, /assets\/linux-engine-info\.txt/);
  assert.match(workflow, /engine=proroot/);
  assert.match(workflow, /assets\/rootfs\.bin/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /keepDebugSymbols/);
  assert.match(workflow, /assets\/proroot-LICENSE\.txt/);
  assert.match(workflow, /ShellPlugin/);
  assert.match(workflow, /FolderPlugin DownloadPlugin ShellPlugin/);
  assert.doesNotMatch(workflow, /assets\/proot-build-info\.txt|libproot-loader\.so/);
});

test('plugin valida runtime completo, arquitetura, glibc, rename e saída do shell antes de marcar instalado', () => {
  assert.match(shell, /new File\(getContext\(\)\.getFilesDir\(\), "ubuntu-rootfs"\)/);
  assert.match(shell, /new File\(getContext\(\)\.getFilesDir\(\), "alpine"\)/);
  for (const lib of ['libproroot.so','libproroot-runtime.so','libproroot-bridge.so','libproroot-linker.so','libproroot-stub-loader.so']) assert.ok(shell.includes(lib), `plugin missing ${lib}`);
  assert.match(shell, /private boolean hasEngine\(\)/);
  assert.match(shell, /assets.*linux-engine-info\.txt|open\("linux-engine-info\.txt"\)/);
  assert.match(shell, /PROROOT_TMP_DIR/);
  assert.match(shell, /PROROOT_STUB_LOADER/);
  assert.match(shell, /CM_RENAME_OK/);
  assert.match(shell, /CM_GLIBC_OK/);
  assert.match(shell, /CM_LINUX_EXIT:0/);
  assert.match(shell, /test -e \/lib\/ld-linux-aarch64\.so\.1/);
  assert.match(shell, /getMethod\(\"destroyForcibly\"\)/);
  assert.match(shell, /private boolean hasBuildMarker\(\)/);
  assert.match(shell, /\.codemobile-engine/);
  assert.match(shell, /deleteRec\(legacyRoot\(\)\)/);
  assert.doesNotMatch(shell, /libproot-loader\.so|PROOT_LOADER|PROOT_NO_SECCOMP/);
});

test('Terminal usa apt-get e o diagnóstico não depende de comandos Alpine', () => {
  assert.match(extras, /const NAT_PKGS=.*python3-pip.*nodejs.*ripgrep.*fd-find/);
  assert.match(extras, /apt-get update/);
  assert.match(extras, /apt-get install -y --no-install-recommends/);
  assert.match(extras, /APT_INSTALL_EXIT/);
  assert.match(extras, /APT_UPDATE_EXIT/);
  assert.match(extras, /Diagnosticar Linux/);
  assert.match(extras, /id="tdiagnose"/);
  assert.match(extras, /apt-get install <pacote>/);
  assert.doesNotMatch(extras, /apk add|apk update|apk upgrade|\/etc\/alpine-release/);
  execFileSync(process.execPath, ['--check', 'www/extras.js']);
});

test('aviso de licença reconhece proroot fechado e distribuição somente de binários originais', () => {
  assert.match(notices, /coderredlab\/proroot/);
  assert.match(notices, /proprietária/i);
  assert.match(notices, /binários originais/i);
  assert.match(notices, /redistribuição/i);
});
