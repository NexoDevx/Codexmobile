import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const downloader = read('www/downloads.js');

function makeContext(capacitor) {
  const links = [], created = [], notices = [];
  const body = { appendChild(el) { el.parentNode = body; links.push(el); }, removeChild(el) { const i=links.indexOf(el); if(i>=0) links.splice(i,1); } };
  const document = {
    body,
    getElementById(id) { return links.find(el => el.id === id) || null; },
    createElement(tag) { const el = { tagName: tag, style: {}, attrs: {}, setAttribute(k,v){this.attrs[k]=v;}, click(){this.clicked=true;}, remove(){if(this.parentNode)this.parentNode.removeChild(this);} }; created.push(el); return el; }
  };
  const ctx = vm.createContext({
    console, Blob, Uint8Array, ArrayBuffer, String, Math, Error, Promise, setTimeout: () => 1, clearTimeout() {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document, window: { Capacitor: capacitor, document }, navigator: {},
  });
  vm.runInContext(downloader, ctx, { filename: 'downloads.js' });
  return { ctx, links, created, notices, save: ctx.window.cmSaveOutput };
}

test('Downloads nativos usam blocos e confirmam caminho persistente', async () => {
  const saved = [], calls = [];
  const plugin = {
    async beginDownload(o) { calls.push(['begin', o]); return { id: 'session-1', name: o.name }; },
    async writeChunk(o) { const b = Buffer.from(o.data, 'base64'); saved.push(b); calls.push(['chunk', b.length]); return { written: b.length }; },
    async finishDownload(o) { calls.push(['finish', o]); return { saved: true, name: 'app (2).apk', path: 'Downloads/app (2).apk', bytes: Buffer.concat(saved).length, uri: 'content://downloads/test' }; },
    async abortDownload(o) { calls.push(['abort', o]); return { aborted: true }; }
  };
  const cap = { isNativePlatform: () => true, Plugins: { Download: plugin } };
  const { save } = makeContext(cap);
  const input = Buffer.alloc(500000); for (let i=0;i<input.length;i++) input[i]=i%251;
  const result = await save('../build/app.apk', new Blob([input], { type: 'application/vnd.android.package-archive' }));
  assert.equal(result.saved, true);
  assert.equal(result.path, 'Downloads/app (2).apk');
  assert.equal(Buffer.concat(saved).length, input.length);
  assert.deepEqual(Buffer.concat(saved), input);
  assert.equal(calls[0][0], 'begin'); assert.equal(calls.at(-1)[0], 'finish');
  assert.ok(calls.filter(x => x[0] === 'chunk').length >= 3, 'arquivo foi dividido em blocos pequenos');
  assert.equal(calls[0][1].name, '_build_app.apk');
});

test('download nativo aborta e apaga sessão se uma escrita falhar', async () => {
  const calls=[];
  const plugin={
    async beginDownload(){return{id:'broken'}},
    async writeChunk(){throw new Error('sem espaço')},
    async finishDownload(){throw new Error('não deveria finalizar')},
    async abortDownload(o){calls.push(o.id);return{aborted:true}}
  };
  const { save }=makeContext({isNativePlatform:()=>true,Plugins:{Download:plugin}});
  await assert.rejects(()=>save('erro.zip',new Blob(['x'])),/sem espaço/);
  assert.deepEqual(calls,['broken']);
});

test('APK nativo sem DownloadPlugin falha claramente, sem fingir que salvou', async () => {
  const { save }=makeContext({isNativePlatform:()=>true,Plugins:{}});
  await assert.rejects(()=>save('a.exe',new Blob(['x'])),/não expõe o DownloadPlugin/);
});

test('nome do arquivo é saneado, mas a extensão é preservada', () => {
  const { ctx }=makeContext(null);
  assert.equal(vm.runInContext("window.cmSafeDownloadName('../foo/bar.apk')",ctx),'_foo_bar.apk');
  assert.equal(vm.runInContext("window.cmSafeDownloadName('\\u0000evil.exe')",ctx),'_evil.exe');
});

test('navegador aciona um link de download real e revoga a URL depois', async () => {
  const { save, created }=makeContext(null);
  const r=await save('programa.exe',new Blob(['MZ'],{type:'application/octet-stream'}));
  assert.equal(r.browserDownload,true);
  assert.ok(created.some(x=>x.tagName==='a'&&x.clicked===true&&x.download==='programa.exe'));
});

test('plugins nativos de pasta/download são registrados e nunca removidos por fallback de build', () => {
  const main = read('native/mainactivity.sh'), flow = read('.github/workflows/apk.yml'), setup = read('native/setup-download.sh');
  assert.match(main,/registerPlugin\(FolderPlugin\.class\)/);
  assert.match(main,/registerPlugin\(DownloadPlugin\.class\)/);
  assert.match(flow,/bash native\/setup-folder\.sh/);
  assert.match(flow,/bash native\/setup-download\.sh/);
  assert.doesNotMatch(flow,/bash native\/remove-folder\.sh/);
  assert.match(flow,/for c in FolderPlugin DownloadPlugin/);
  assert.match(setup,/DownloadPlugin\.java/);
});

test('Conectar pasta consulta Capacitor.Plugins antes do registerPlugin opcional', () => {
  const ext = read('www/ext2.js');
  assert.match(ext,/C\.Plugins&&C\.Plugins\.Folder/);
  assert.match(ext,/typeof C\.registerPlugin==='function'/);
  execFileSync(process.execPath,['--check','www/ext2.js']);
  execFileSync(process.execPath,['--check','www/downloads.js']);
  execFileSync(process.execPath,['--check','www/app.js']);
});




test('DownloadPlugin presente é detectado mesmo se a consulta isNativePlatform não existir', async () => {
  const saved = [];
  const plugin = {
    async beginDownload() { return { id: 'legacy-bridge' }; },
    async writeChunk(o) { saved.push(Buffer.from(o.data, 'base64')); return { written: saved.at(-1).length }; },
    async finishDownload() { return { saved: true, name: 'arquivo.exe', path: 'Downloads/arquivo.exe', bytes: Buffer.concat(saved).length }; },
    async abortDownload() { return { aborted: true }; }
  };
  const { save } = makeContext({ Plugins: { Download: plugin } });
  const r = await save('arquivo.exe', new Blob(['MZ'])) ;
  assert.equal(r.saved, true);
  assert.equal(r.path, 'Downloads/arquivo.exe');
});

test('Android salva na raiz pública Downloads, sem subpasta oculta', () => {
  const java = read('native/DownloadPlugin.java');
  assert.match(java, /private static final String RELATIVE_DIR = Environment\.DIRECTORY_DOWNLOADS;/);
  assert.match(java, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(java, /"Downloads\/" \+ s\.name/);
  assert.doesNotMatch(java, /Environment\.DIRECTORY_DOWNLOADS \+ "\/CodeMobile"/);
});

test('Conectar pasta resolve o plugin depois da injeção do Capacitor e mostra falha real do seletor', () => {
  const ext = read('www/ext2.js');
  assert.match(ext, /function getFolderPlugin\(\)/);
  assert.ok(ext.includes('if(!(await folderOk()))throw new Error'));
  assert.match(ext, /FLP=getFolderPlugin\(\)\|\|FLP/);
  assert.match(ext, /O seletor de pastas do Android falhou/); // erro visível, não fallback silencioso
  assert.match(read('native/FolderPlugin.java'), /Intent\.ACTION_OPEN_DOCUMENT_TREE/);
  assert.match(read('native/FolderPlugin.java'), /startActivityForResult\(call, i, "pickResult"\)/);
  assert.match(read('native/FolderPlugin.java'), /takePersistableUriPermission/);
});

test('cache offline foi invalidado após mudanças no fluxo de pasta e download', () => {
  const sw = read('www/sw.js');
  assert.match(sw, /cm-v28/);
  assert.match(sw, /downloads\.js/);
  assert.match(read('test/terminal-ui.test.mjs'), /cm-v28/);
});


test('APK/EXE usam file picker anexado ao DOM, limpam cancelamentos e não impõem teto arbitrário de 150 MB', () => {
  const apk = read('www/apk.js'), exe = read('www/exe.js');
  assert.match(apk, /document\.body\.appendChild\(i\)/);
  assert.match(apk, /i\.oncancel=clean/);
  assert.match(exe, /document\.body\.appendChild\(i\)/);
  assert.match(exe, /i\.oncancel=\(\)=>finish\(null\)/);
  assert.doesNotMatch(exe, /150e6|máx\. 150 MB/);
  execFileSync(process.execPath, ['--check', 'www/apk.js']);
  execFileSync(process.execPath, ['--check', 'www/exe.js']);
});

test('workflow falha se a suíte completa ou os plugins essenciais falharem', () => {
  const flow = read('.github/workflows/apk.yml');
  assert.match(flow, /name: Suíte completa obrigatória\n\s+run: npm test/);
  assert.doesNotMatch(flow, /name: Suíte completa obrigatória\n\s+continue-on-error: true/);
  assert.match(flow, /bash native\/setup-folder\.sh/);
  assert.match(flow, /bash native\/setup-download\.sh/);
  assert.match(flow, /O APK não foi gerado/);
});
