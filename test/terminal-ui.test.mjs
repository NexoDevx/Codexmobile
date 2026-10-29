import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const extras = fs.readFileSync(new URL('../www/extras.js', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../native/ShellPlugin.java', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../www/sw.js', import.meta.url), 'utf8');

test('Terminal always renders all Linux/Proot controls', () => {
  for (const id of ['tinst', 'trefresh', 'treset', 'tdelete']) {
    assert.match(extras, new RegExp('id="' + id + '"'));
  }
  assert.match(extras, /function linuxPanel\(\)/);
  assert.match(extras, /function natInstall\(\)/);
  assert.match(extras, /function natReset\(\)/);
  assert.match(extras, /function natDelete\(\)/);
});

test('Linux delete/reset are native methods and preserve project storage', () => {
  assert.match(shell, /public void remove\(final PluginCall call\)/);
  assert.match(shell, /public void reset\(final PluginCall call\)/);
  assert.match(shell, /new File\(getContext\(\)\.getFilesDir\(\), "ws\/" \+ project\)/);
  assert.match(extras, /Os projetos do CodeMobile não serão apagados/);
  assert.match(extras, /não pode ser removido separadamente/);
});

test('terminal maintains directory and command status across Proot executions', () => {
  assert.match(extras, /TM\.cwd/);
  assert.match(extras, /__cm_code=\$\?/);
  assert.match(extras, /indexOf\(marker\)/);
  assert.match(extras, /ArrowUp/);
  assert.match(extras, /ArrowDown/);
});


test('Terminal usa o runtime proroot e o rootfs Ubuntu, sem o launcher PRoot legado', () => {
  assert.match(shell, /libproroot\.so/);
  assert.match(shell, /PROROOT_TMP_DIR/);
  assert.match(shell, /ubuntu-rootfs/);
  assert.match(extras, /apt-get install/);
  assert.match(extras, /natPackageAdvice/);
  assert.doesNotMatch(shell, /libproot-loader\.so|PROOT_LOADER/);
});

test('terminal script has valid JavaScript syntax and offline cache version was bumped', () => {
  execFileSync(process.execPath, ['--check', 'www/extras.js'], { stdio: 'pipe' });
  assert.match(sw, /cm-v28/);
});
