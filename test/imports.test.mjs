import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const pkgSource = rd('../www/pkg.js');
const PK = new Function(pkgSource + ';return PK')();
const fileLike = (name, bytes, type = '') => {
  const blob = new Blob([bytes]);
  return { name, type, size: blob.size, slice: (start, end) => blob.slice(start, end) };
};

test('importador reconhece APK, EXE, PDF, instaladores e formatos comuns adicionais', async () => {
  for (const name of ['app.apk', 'programa.exe', 'documento.pdf', 'setup.msi', 'jogo.mcpack', 'modelo.safetensors']) {
    assert.equal(await PK.ehPacote(fileLike(name, new Uint8Array([1, 2, 3]))), true, name);
  }
});

test('importador encaminha formatos de código textuais e desconhecidos para texto', async () => {
  assert.equal(await PK.ehPacote(fileLike('schema.graphql', new TextEncoder().encode('type Query { hello: String }'))), false);
  assert.equal(await PK.ehPacote(fileLike('notas.unknown', new TextEncoder().encode('texto UTF-8'))), false);
});

test('importador preserva como pacote um binário desconhecido sem exigir extensão conhecida', async () => {
  assert.equal(await PK.ehPacote(fileLike('blob.unknown', new Uint8Array([0, 255, 0, 65]))), true);
  assert.equal(await PK.ehPacote(fileLike('bytes.custom', new Uint8Array([0xff, 0xfe, 0xfd]))), true);
});

test('não há teto de 400 arquivos no importador ZIP e o seletor aceita todos os tipos', () => {
  assert.doesNotMatch(rd('../www/ext.js'), /add\s*>=\s*400/);
  assert.match(pkgSource, /im\.setAttribute\('accept', '\*\/\*'\)/);
  execFileSync(process.execPath, ['--check', 'www/app.js'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', 'www/pkg.js'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', 'www/ext.js'], { stdio: 'pipe' });
});
