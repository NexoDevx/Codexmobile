// node --test test/pkg.test.mjs — pacotes: abrir APK/ZIP/EXE/binário como pasta, editar e recompilar
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const W = new URL('../www/', import.meta.url);
const rd = f => fs.readFileSync(new URL(f, W), 'utf8');
const ctx = { crypto: globalThis.crypto, btoa, atob, console, TextEncoder, TextDecoder, DataView, Uint8Array, Uint32Array, Float32Array, Blob, Response, DecompressionStream, CompressionStream, Math, String, Set, Map, WeakMap, Object, Array, Number, JSON, Promise, RegExp, Error };
vm.createContext(ctx);
vm.runInContext(rd('apkcore.js') + rd('apksign.js') + ';this.C={apkSign,apkValidate,signKeyGen,crc32,zipRead,zipGet,zipWrite,zipDir,axmlIs,axmlParse,axmlCompile,apkInfo};', ctx);
const C = ctx.C;
const EXE = new Function(rd('execore.js') + ';return EXE')();
const PKGC = new Function(rd('pkgcore.js') + ';return PKGC')();

/* geradores sintéticos reaproveitados dos testes existentes */
const apkSrc = fs.readFileSync(new URL('./apk.test.mjs', import.meta.url), 'utf8');
const mkAxml = new Function(apkSrc.slice(apkSrc.indexOf('function mkAxml'), apkSrc.indexOf('const ax=mkAxml()')) + ';return mkAxml')();
const exeSrc = fs.readFileSync(new URL('./exe.test.mjs', import.meta.url), 'utf8');
const { buildPE, u32 } = new Function(exeSrc.slice(exeSrc.indexOf('const u16='), exeSrc.indexOf("test('lê o PE")) + ';return {buildPE,u32}')();
const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, w >> 8, w & 255, 0, 0, h >> 8, h & 255, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function mundo() {
  const store = new Map(); let n = 0;
  const env = {
    zip: { zipRead: C.zipRead, zipGet: C.zipGet, zipWrite: C.zipWrite, zipDir: C.zipDir },
    axml: { axmlIs: C.axmlIs, axmlParse: C.axmlParse, axmlCompile: C.axmlCompile, apkInfo: C.apkInfo }, EXE,
    put: async b => { const id = 'x' + (n++).toString(36) + b.length.toString(36); store.set(id, b.slice()); return 'img:' + id; },
    get: async r => { const b = store.get(r.slice(4)); return b && b.slice(); },
    isRef: c => typeof c == 'string' && /^img:[a-z0-9]+$/.test(c),
    sign: async b => C.apkSign(b, await C.signKeyGen('Teste')), validateApk: C.apkValidate
  };
  return { env, p: { files: {}, pkgs: {} } };
}
async function zipDe(entries) { return EXE.zipBuild(entries.map(([name, data]) => ({ name, data: typeof data == 'string' ? enc(data) : data }))); }
async function umApk() {
  return zipDe([['AndroidManifest.xml', mkAxml()], ['classes.dex', Uint8Array.from([0x64, 0x65, 0x78, 0x0a, 0, 1, 2, 3, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0])],
    ['res/drawable/icon.png', png(4, 3)], ['assets/dados.json', '{"animal":"vaca"}'], ['assets/velho.txt', 'apagar isto'], ['META-INF/CERT.RSA', Uint8Array.from([1, 2, 3])]]);
}

test('APK: abre como pasta, XML binário vira texto, binário fica no pacote', async () => {
  const { env, p } = mundo(), r = await PKGC.open(env, 'jogo.apk', await umApk(), p), root = r.meta.root;
  assert.equal(r.meta.kind, 'apk'); assert.equal(root, 'pacotes/jogo.apk/');
  assert.match(p.files[root + 'AndroidManifest.xml'], /<manifest[\s\S]*package="com.exemplo.app"/);
  assert.equal(p.files[root + 'assets/dados.json'], '{"animal":"vaca"}');
  assert.match(p.files[root + 'res/drawable/icon.png'], /^img:/);
  assert.equal(p.files[root + 'classes.dex'], undefined);                  // binário não-imagem: só no pacote
  const l = await PKGC.list(env, r.meta, p.files);
  assert.ok(l.some(x => x.startsWith('classes.dex') && /virtual/.test(x)));
  assert.match(await PKGC.info(env, r.meta, p.files), /com\.exemplo\.app · versão 1\.0 \(7\)/);
});

test('APK: edita manifesto, apaga, cria, troca binário e recompila (assinado)', async () => {
  const { env, p } = mundo(), { meta } = await PKGC.open(env, 'jogo.apk', await umApk(), p), root = meta.root;
  p.files[root + 'AndroidManifest.xml'] = p.files[root + 'AndroidManifest.xml'].replace('android:versionCode="7"', 'android:versionCode="42"');
  p.files[root + 'assets/dados.json'] = '{"animal":"dino"}';
  delete p.files[root + 'assets/velho.txt'];                                // apagar = delete_file normal
  p.files[root + 'assets/novo.txt'] = 'olá';
  await PKGC.remove(meta, p.files, root + 'META-INF/CERT.RSA');
  assert.equal(PKGC.changes(env, meta, p.files).n, 5);
  const out = await PKGC.build(env, meta, p.files, { sign: true });
  assert.equal(out.name, 'jogo-editado-assinado.apk');
  const ents = C.zipRead(out.bytes), get = async n => C.zipGet(out.bytes, ents.find(e => e.name == n));
  assert.match(C.axmlParse(await get('AndroidManifest.xml')).text, /versionCode="42"/);
  assert.equal(dec(await get('assets/dados.json')), '{"animal":"dino"}');
  assert.equal(dec(await get('assets/novo.txt')), 'olá');
  assert.ok(!ents.some(e => e.name == 'assets/velho.txt'));
  assert.deepEqual([...(await get('classes.dex'))].slice(0, 4), [0x64, 0x65, 0x78, 0x0a]);   // intocado
  assert.ok(ents.some(e => e.name == 'META-INF/CERT.RSA' || /^META-INF\/.*\.(RSA|SF)$/.test(e.name)));  // assinatura nova
  // reabrir o resultado mostra as edições
  const r2 = await PKGC.open(env, out.name, out.bytes, p);
  assert.match(p.files[r2.meta.root + 'AndroidManifest.xml'], /versionCode="42"/);
});

test('APK: sem mudanças o conteúdo das entradas é idêntico', async () => {
  const { env, p } = mundo(), orig = await umApk(), { meta } = await PKGC.open(env, 'a.apk', orig, p);
  const out = await PKGC.build(env, meta, p.files, { sign: false });
  assert.equal(out.name, 'a-editado.apk');
  const a = C.zipRead(orig).filter(e => !/^META-INF/.test(e.name)), b = C.zipRead(out.bytes);
  for (const e of a) assert.equal(b.find(x => x.name == e.name).crc, e.crc, e.name);
});

test('APK: XML inválido dá erro claro, não gera arquivo quebrado', async () => {
  const { env, p } = mundo(), { meta } = await PKGC.open(env, 'a.apk', await umApk(), p);
  p.files[meta.root + 'AndroidManifest.xml'] = '<manifest><quebrado';
  await assert.rejects(PKGC.build(env, meta, p.files), /AndroidManifest\.xml/);
});

test('APK: não exporta se o manifesto for removido durante a edição', async () => {
  const { env, p } = mundo(), { meta } = await PKGC.open(env, 'a.apk', await umApk(), p);
  await PKGC.remove(meta, p.files, meta.root + 'AndroidManifest.xml');
  await assert.rejects(PKGC.build(env, meta, p.files), /AndroidManifest\.xml/);
});

test('pkg_patch/pkg_replace/pkg_extract em entradas virtuais', async () => {
  const { env, p } = mundo(), { meta } = await PKGC.open(env, 'a.apk', await umApk(), p), root = meta.root;
  assert.deepEqual(await PKGC.find(env, meta, p.files, 'ABCDEFGH'), ['classes.dex @0x8 (ascii)']);
  assert.match(await PKGC.patch(env, meta, p.files, root + 'classes.dex', { hex: '90 90', offset: 8 }), /2 bytes/);
  assert.match(await PKGC.patch(env, meta, p.files, root + 'classes.dex', { find: 'FGH', replace: 'xyz' }), /Trocadas 1/);
  const got = await PKGC.extract(env, meta, p.files, 'classes.*');
  assert.deepEqual(got, []);                                               // já virou arquivo ao patchar
  const out = await PKGC.build(env, meta, p.files, { sign: false });
  const dex = await C.zipGet(out.bytes, C.zipRead(out.bytes).find(e => e.name == 'classes.dex'));
  assert.deepEqual([...dex.slice(8, 14)], [0x90, 0x90, 0x43, 0x44, 0x45, 0x78 /* 'x' */].slice(0, 5).concat([0x79]).slice(0, 6).map((x, i) => i == 5 ? 0x79 : x).slice(0, 6) && [0x90, 0x90, 0x43, 0x44, 0x45, 0x78]);
});

test('limites: texto grande fica virtual e pkg_extract carrega; nomes perigosos são ignorados', async () => {
  const { env, p } = mundo(), zip = await zipDe([['a.txt', 'pequeno'], ['grande.txt', 'x'.repeat(300)], ['../fora.txt', 'não'], ['/abs.txt', 'abs']]);
  const antes = PKGC.L.textEach; PKGC.L.textEach = 100;
  const { meta } = await PKGC.open(env, 'z.zip', zip, p); PKGC.L.textEach = antes;
  assert.equal(meta.kind, 'zip');
  assert.equal(p.files[meta.root + 'a.txt'], 'pequeno'); assert.equal(p.files[meta.root + 'grande.txt'], undefined);
  assert.ok(!Object.keys(p.files).some(k => k.includes('fora.txt')));
  assert.equal(p.files[meta.root + 'abs.txt'], 'abs');                      // "/" inicial removido
  assert.deepEqual(await PKGC.extract(env, meta, p.files, 'grande*'), ['grande.txt']);
  assert.equal(p.files[meta.root + 'grande.txt'].length, 300);
  const out = await PKGC.build(env, meta, p.files);                         // zip comum: sem assinatura, mesma extensão
  assert.equal(out.name, 'z-editado.zip');
});

test('duas aberturas do mesmo nome não colidem', async () => {
  const { env, p } = mundo(), z = await zipDe([['a.txt', 'um']]);
  const a = await PKGC.open(env, 'x.zip', z, p), b = await PKGC.open(env, 'x.zip', z, p);
  assert.notEqual(a.meta.root, b.meta.root);
});

test('EXE: recursos, imagens e ZIP embutido viram arquivos; edita e recompila', async () => {
  const { env, p } = mundo(), pe = buildPE(), zip = await zipDe([['data/', new Uint8Array(0)], ['data/config.json', '{"animal":"vaca"}']]);
  const exe = new Uint8Array(pe.length + zip.length); exe.set(pe); exe.set(zip, pe.length);
  const { meta } = await PKGC.open(env, 'prog.exe', exe, p), root = meta.root;
  assert.equal(meta.kind, 'exe');
  assert.match(p.files[root + 'recursos/BITMAP_101.bmp'], /^img:/);
  assert.equal(p.files[root + 'zip/data/config.json'], '{"animal":"vaca"}');
  // editar texto do zip, trocar o bitmap por outro do mesmo tamanho, trocar texto do binário
  p.files[root + 'zip/data/config.json'] = '{"animal":"dino"}';
  const bm = await env.get(p.files[root + 'recursos/BITMAP_101.bmp']); bm.fill(0x11, 54);
  p.files[root + 'recursos/BITMAP_101.bmp'] = await env.put(bm);
  assert.match(await PKGC.patch(env, meta, p.files, root, { find: 'feliz', replace: 'alegr' }), /Trocadas 1 de 1/);
  assert.match((await PKGC.find(env, meta, p.files, 'alegr')).join(), /\(arquivo\) @0x20f/);   // a visão já inclui a troca
  const out = await PKGC.build(env, meta, p.files);
  assert.equal(out.name, 'prog-editado.exe');
  const info = EXE.parse(out.bytes), res = EXE.resFile(out.bytes, info.res[0]);
  assert.equal(res.data[res.data.length - 1], 0x11);
  assert.ok(dec(out.bytes.subarray(0x200, 0x220)).includes('alegr'));
  const z = EXE.zipFind(out.bytes), l = EXE.zipList(out.bytes, z), c = l.find(e => e.name == 'data/config.json');
  assert.equal(dec(await EXE.zipRead(out.bytes, c)), '{"animal":"dino"}');
  assert.equal(z.start, pe.length);                                          // o ZIP continua depois do exe
  // recurso grande demais é recusado com a mensagem do motor
  p.files[root + 'recursos/BITMAP_101.bmp'] = await env.put(new Uint8Array(500));
  await assert.rejects(PKGC.build(env, meta, p.files), /Não cabe/);
});

test('binário genérico: hex, patch por bytes e recompilar', async () => {
  const { env, p } = mundo(), b = new Uint8Array(64); b.set(enc('SEGREDO'), 10); b[0] = 1;
  const { meta } = await PKGC.open(env, 'dados.bin', b, p);
  assert.equal(meta.kind, 'bin');
  assert.match(await PKGC.patch(env, meta, p.files, meta.root, { find: 'SEGREDO', replace: 'OUTRO' }), /Trocadas 1/);
  assert.match(await PKGC.patch(env, meta, p.files, meta.root, { hex: 'ff ff', offset: 0 }), /2 bytes/);
  const out = await PKGC.build(env, meta, p.files);
  assert.equal(out.name, 'dados-editado.bin');
  assert.deepEqual([...out.bytes.slice(0, 2)], [255, 255]); assert.ok(dec(out.bytes).includes('OUTRO'));
});

test('imagem: tamanho e formato do original', async () => {
  const { env, p } = mundo(), { meta } = await PKGC.open(env, 'a.apk', await umApk(), p);
  const s = await PKGC.imageSlot(env, meta, p.files, meta.root + 'res/drawable/icon.png');
  assert.deepEqual([s.kind, s.w, s.h], ['png', 4, 3]);
  await assert.rejects(PKGC.imageSlot(env, meta, p.files, meta.root + 'assets/dados.json'), /formato de imagem/);
});

test('limite de tamanho só existe quando configurado explicitamente', async () => {
  const { env, p } = mundo(), antes = PKGC.L.maxPkg; PKGC.L.maxPkg = 10;
  await assert.rejects(PKGC.open(env, 'x.bin', new Uint8Array(20), p), /grande demais/); PKGC.L.maxPkg = antes;
});


test('importação de pacote não impõe limite artificial de tamanho por padrão', () => {
  assert.equal(PKGC.L.maxPkg, Infinity);
});

test('pkg_extract carrega mais de 40 arquivos e binários acima de 4 MB', async () => {
  const { env, p } = mundo();
  const entries = [];
  for (let i = 0; i < 100; i++) entries.push([`file-${String(i).padStart(3, '0')}.txt`, 'x'.repeat(50000)]);
  entries.push(['payload.dex', new Uint8Array(4_200_000)]);
  const zip = await zipDe(entries);
  const { meta } = await PKGC.open(env, 'grande.zip', zip, p);
  const got = await PKGC.extract(env, meta, p.files, 'file-*.txt');
  assert.ok(got.length > 40, `só carregou ${got.length} arquivos`);
  const bin = await PKGC.extract(env, meta, p.files, 'payload.dex');
  assert.deepEqual(bin, ['payload.dex']);
  const ref = p.files[meta.root + 'payload.dex'];
  assert.match(ref, /^img:/);
  assert.equal((await env.get(ref)).length, 4_200_000);
});


test('binário genérico maior que 2 MB continua visível e editável no projeto', async () => {
  const { env, p } = mundo(), bytes = new Uint8Array(4_500_000); bytes.set(enc('BINARIO-GRANDE'), 128);
  const { meta } = await PKGC.open(env, 'modelo.desconhecido', bytes, p);
  const path = meta.root + 'modelo.desconhecido';
  assert.equal(meta.kind, 'bin');
  assert.match(p.files[path], /^img:/);
  assert.equal((await env.get(p.files[path])).length, bytes.length);
  const out = await PKGC.build(env, meta, p.files);
  assert.equal(out.bytes.length, bytes.length);
  assert.ok(dec(out.bytes.subarray(128, 150)).includes('BINARIO-GRANDE'));
});
