// Carrega TODOS os scripts do index.html, na ordem real, num único escopo global (como o navegador faz).
// Pega o erro que derruba o app inteiro: o mesmo nome declarado (const/let/class) em dois arquivos.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const www = new URL('../www/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', www), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

// objeto "coringa": aceita qualquer leitura, chamada ou construção (simula DOM/APIs do navegador)
const coringa = () => new Proxy(function () {}, {
  get: (_, k) => k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : coringa(),
  apply: () => coringa(), construct: () => coringa(), set: () => true
});

function ambiente() {
  const ctx = vm.createContext({
    console, JSON, Math, Date, Promise, Map, Set, WeakMap, Symbol, Object, Array, String, Number, RegExp, Error,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, DataView, Uint8ClampedArray, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, escape, unescape, TextEncoder, TextDecoder, URL, Blob, Response, atob, btoa,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, queueMicrotask() {},
    document: coringa(), navigator: coringa(), indexedDB: coringa(), crypto: coringa(), CompressionStream: coringa(),
    DecompressionStream: coringa(), Image: coringa(), FileReader: coringa(), AbortController, matchMedia: () => coringa(),
    fetch: () => Promise.reject(new Error('sem rede nos testes')), alert() {}, confirm: () => true, prompt: () => null,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { origin: 'http://localhost', href: 'http://localhost/', search: '', hash: '', protocol: 'http:', host: 'localhost', hostname: 'localhost' },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, getComputedStyle: () => coringa()
  });
  vm.runInContext('var window=globalThis,self=globalThis;', ctx);
  return ctx;
}

test('todos os scripts do index.html carregam juntos, sem nome repetido', () => {
  const ctx = ambiente(), falhas = [], avisos = [];
  for (const s of scripts) {
    if (s.startsWith('/')) continue;                     // /cm-*.js vêm do servidor
    const cod = fs.readFileSync(new URL(s, www), 'utf8');
    try { vm.runInContext(cod, ctx, { filename: s, timeout: 3000 }); }
    catch (e) {
      if (e instanceof SyntaxError || /already been declared/.test(e.message)) falhas.push(s + ': ' + e.message);
      else avisos.push(s + ': ' + e.message);            // erro de execução por causa dos stubs: só informativo
    }
  }
  if (avisos.length) console.log('(avisos de execução simulada)\n' + avisos.join('\n'));
  assert.deepEqual(falhas, []);
});

test('nenhum script do index.html está faltando na pasta nem fora do cache offline', () => {
  const sw = fs.readFileSync(new URL('sw.js', www), 'utf8');
  for (const s of scripts.filter(x => !x.startsWith('/'))) {
    assert.ok(fs.existsSync(new URL(s, www)), s + ' não existe');
    assert.ok(sw.includes("'" + s + "'"), s + ' não está na lista do sw.js (não funcionaria offline)');
  }
});

test('o index.html não carrega mais os editores separados de APK e EXE', () => {
  for (const velho of ['apk.js', 'apkplug.js', 'exe.js', 'exe2.js']) assert.ok(!scripts.includes(velho), velho + ' ainda é carregado');
  for (const novo of ['pkgcore.js', 'pkg.js', 'reserva.js', 'nucleo.js']) assert.ok(scripts.includes(novo), novo + ' deveria ser carregado');
  assert.ok(scripts.indexOf('pkg.js') < scripts.indexOf('reserva.js') && scripts.indexOf('reserva.js') < scripts.indexOf('nucleo.js'));
});

test('cadeia real de ferramentas: pkg_* respondem e as regras do nucleo valem para elas', async () => {
  const ctx = ambiente();
  for (const sc of scripts.filter(x => !x.startsWith('/'))) { try { vm.runInContext(fs.readFileSync(new URL(sc, www), 'utf8'), ctx, { filename: sc, timeout: 3000 }); } catch (_) { /* stubs */ } }
  const run = c => vm.runInContext(c, ctx);
  assert.equal(run("typeof PK"), 'object'); assert.equal(run("typeof NC"), 'object'); assert.equal(run("typeof RES"), 'object');
  for (const t of ['pkg_list', 'pkg_info', 'pkg_patch', 'pkg_replace_image', 'pkg_build', 'memory_add'])
    assert.equal(run(`T.some(t=>t[0]=='${t}')`), true, t + ' não registrada');
  assert.match(await run("exec('pkg_list',{})"), /Nenhum pacote aberto/);
  run("pj().files['.codemobile/regras.txt']='negar pkg_build *'");
  assert.match(await run("exec('pkg_build',{})"), /Bloqueado pelas regras/);
  run("pj().files['.codemobile/regras.txt']=''");
  assert.match(await run("exec('pkg_build',{})"), /nenhum pacote aberto/i);     // sem regra, chega ao pkg.js
});

test('pasta nativa: importa o texto, lista o ignorado em _ignorados.txt e isso não vira "alteração" a salvar', async () => {
  const ctx = ambiente(), avisos = [];
  const pasta = {
    status: async () => ({ ok: true }), pick: async () => ({ uri: 'content://jogo', name: 'Meu Jogo' }),
    read: async () => ({ files: { 'config/a.txt': 'oi', 'main.lua': 'print(1)' }, skipped: 2, skippedText: 'game.exe (5000 KB)\ndata/x.png (12 KB)\n' }),
    write: async ({ files }) => ({ count: Object.keys(files).length })
  };
  ctx.Capacitor = { isNativePlatform: () => true, registerPlugin: n => n == 'Folder' ? pasta : coringa() };
  ctx.alert = m => avisos.push(String(m));
  for (const sc of scripts.filter(x => !x.startsWith('/'))) { try { vm.runInContext(fs.readFileSync(new URL(sc, www), 'utf8'), ctx, { filename: sc, timeout: 3000 }); } catch (_) { /* stubs */ } }
  const run = c => vm.runInContext(c, ctx);
  await run('lnkAdd()');
  assert.match(avisos.at(-1), /Pasta "Meu Jogo" conectada: 2 arquivos/);
  assert.match(avisos.at(-1), /2 ignorados.*_ignorados\.txt/);
  assert.equal(run("pj().files['importados/Meu_Jogo/main.lua']"), 'print(1)');
  const lista = run("pj().files['importados/Meu_Jogo/_ignorados.txt']");
  assert.match(lista, /game\.exe \(5000 KB\)/); assert.match(lista, /continuam na pasta real/);
  assert.equal(run('Object.keys(lnkChanges(S.links[0])).length'), 0);          // nada a salvar logo após importar
  run("pj().files['importados/Meu_Jogo/main.lua']='print(2)'");
  assert.deepEqual(JSON.parse(JSON.stringify(run('Object.keys(lnkChanges(S.links[0]))'))), ['main.lua']);   // só o que o usuário mexeu
});

test('APK sem o plugin de pasta explica o motivo em vez de uma mensagem genérica', async () => {
  const ctx = ambiente(), avisos = [];
  ctx.Capacitor = { isNativePlatform: () => true, registerPlugin: n => n == 'Folder' ? { status: async () => { throw new Error('"Folder" plugin is not implemented on android'); } } : coringa() };
  ctx.alert = m => avisos.push(String(m));
  for (const sc of scripts.filter(x => !x.startsWith('/'))) { try { vm.runInContext(fs.readFileSync(new URL(sc, www), 'utf8'), ctx, { filename: sc, timeout: 3000 }); } catch (_) { /* stubs */ } }
  await vm.runInContext('lnkAdd()', ctx);
  assert.match(avisos.at(-1), /gerado SEM o plugin de pasta/);
  assert.match(avisos.at(-1), /O que entrou no APK/);
});
