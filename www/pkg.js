/* pkg.js — integração dos pacotes com o app. Substitui os editores separados de APK e EXE:
   QUALQUER arquivo (APK, EXE, ZIP, DEX, SO…) é importado do mesmo jeito (＋ → Adicionar arquivo),
   vira uma pasta em pacotes/<nome>/, é editado pelas ferramentas e pela aba Arquivos de sempre e
   é recompilado com pkg_build ou ＋ → Pacotes. Depende de pkgcore.js, apkcore.js, apksign.js, execore.js. */
const PK = (() => {
  'use strict';
  const mime = 'application/octet-stream';
  const PKFILE = /\.(apk|aab|apks|xapk|jar|aar|war|ear|zip|7z|rar|gz|tgz|tar|xz|bz2|zst|exe|dll|scr|sys|msi|dmg|iso|img|dex|so|dylib|bin|dat|obb|pak|ipa|crx|xpi|pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|epub|sqlite|db|nes|rom|wasm|class|mcpack|mcaddon|mcworld|psd|blend|ttf|otf|woff2?|mp3|m4a|aac|flac|wav|ogg|mp4|mkv|avi|mov|webm|heic|avif|keystore|pyc|pyo|o|a|lib|gguf|onnx|safetensors)$/i;
  const TXTFILE = /\.(txt|md|markdown|rst|adoc|json|jsonc|jsonl|ndjson|ipynb|js|mjs|cjs|ts|mts|cts|tsx|jsx|vue|svelte|astro|css|scss|sass|less|html?|xml|xhtml|csv|tsv|py|pyi|java|kt|kts|kotlin|c|h|hh|hpp|cpp|cc|cxx|cs|go|rs|rb|php|sh|bash|zsh|fish|ps1|bat|cmd|yml|yaml|toml|ini|cfg|conf|config|properties|gradle|graphql|gql|proto|sql|log|env|gitignore|gitattributes|editorconfig|makefile|dockerfile|tf|hcl|lua|swift|dart|ex|exs|erl|hrl|clj|cljs|scala|sc|r|jl|pl|pm|elm|hs|lhs|fs|fsx|vb|vbs|asm|s|vue|lock)$/i;

  /* ---------- armazenamento de binários: reaproveita o IMG do app (IndexedDB), com hash completo ---------- */
  function hashBytes(b) {
    let h1 = 2166136261 >>> 0, h2 = 5381 >>> 0;
    for (let i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619) >>> 0; h2 = (Math.imul(h2, 33) + b[i]) >>> 0; }
    return 'p' + h1.toString(36) + h2.toString(36) + b.length.toString(36);
  }
  const dataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('falha ao guardar o binário')); r.readAsDataURL(new Blob([b], { type: mime })); });
  async function put(bytes) {
    const id = hashBytes(bytes);
    if (!IMG.has(id)) { const d = await dataUrl(bytes); IMG.set(id, d); try { imgDB && imgDB.transaction('i', 'readwrite').objectStore('i').put(d, id); } catch (_) { /* segue só em memória */ } }
    return 'img:' + id;
  }
  let big = null;                                  // cache do último binário grande já decodificado
  async function get(ref) {
    if (big && big[0] === ref) return big[1].slice();
    const d = imgData(ref); if (!d) return null;
    const b = new Uint8Array(await (await fetch(d)).arrayBuffer());
    if (b.length > 4e6) big = [ref, b.slice()];
    return b;
  }

  /* ---------- assinatura de APK: mesma chave guardada pelo editor antigo (IndexedDB cm-apk) ---------- */
  let kdb = null, KEY = null;
  const kOpen = () => kdb ? Promise.resolve(kdb) : new Promise(r => { try { const q = indexedDB.open('cm-apk', 1); q.onupgradeneeded = () => q.result.createObjectStore('a'); q.onsuccess = () => r(kdb = q.result); q.onerror = () => r(null); } catch (_) { r(null); } });
  const kIdb = async (m, k, v) => { const db = await kOpen(); return db ? new Promise(r => { try { const s = db.transaction('a', m == 'get' ? 'readonly' : 'readwrite').objectStore('a'), q = m == 'get' ? s.get(k) : m == 'del' ? s.delete(k) : s.put(v, k); q.onsuccess = () => r(q.result); q.onerror = () => r(); } catch (_) { r(); } }) : undefined; };
  async function chave() { if (KEY) return KEY; let k = await kIdb('get', 'key'); if (!k) { k = await signKeyGen('CodeMobile'); await kIdb('put', 'key', k); } return KEY = k; }

  const env = {
    get zip() { return { zipRead, zipGet, zipWrite, zipDir }; },
    get axml() { return { axmlIs, axmlParse, axmlCompile, apkInfo }; },
    get EXE() { return EXE; },
    validateApk: typeof apkValidate === 'function' ? apkValidate : null,
    put, get, isRef: c => typeof c == 'string' && /^img:[a-z0-9]+$/.test(c),
    sign: async b => apkSign(b, await chave())
  };

  /* ---------- importar ---------- */
  async function ehPacote(f) {
    if (f.type && /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name)) return false;
    if (PKFILE.test(f.name)) return true;
    if (TXTFILE.test(f.name)) return false;
    try {
      const h = new Uint8Array(await f.slice(0, 1024).arrayBuffer());
      if ((h[0] == 0x50 && h[1] == 0x4b) || (h[0] == 0x4d && h[1] == 0x5a) || (h[0] == 0x7f && h[1] == 0x45) || h.includes(0)) return true;
      // Formato textual desconhecido: segue para o importador de texto. Bytes UTF-8 inválidos:
      // guardar como pacote binário em vez de recusá-los por causa da extensão.
      try { new TextDecoder('utf-8', { fatal: true }).decode(h); return false; }
      catch (_) { return true; }
    } catch (_) { return true; }
  }
  async function importar(f) {
    ST = '📦 abrindo ' + f.name + '...'; ui();
    try {
      const b = new Uint8Array(await f.arrayBuffer()), r = await PKGC.open(env, f.name, b, pj());
      save(); ui(); const i = $('#in'); if (i && !i.value) { i.value = 'Veja o pacote que abri em ' + r.meta.root + ' e '; }
      await dlg({ title: '📦 Pacote aberto', text: r.summary, skip: 'OK' });
    } catch (e) { await dlg({ title: 'Não consegui abrir ' + f.name, text: e.message, skip: 'OK' }); }
    finally { ST = ''; ui(); }
  }

  /* ---------- localizar o pacote de uma chamada ---------- */
  const todos = () => Object.values(pj().pkgs || {});
  function achar(a, chaveCaminho) {
    const ps = todos(), c = a && a[chaveCaminho || 'path'];
    if (typeof c == 'string') { const m = ps.filter(p => c.startsWith(p.root) || c + '/' == p.root).sort((x, y) => y.root.length - x.root.length)[0]; if (m) return m; }
    const q = String((a && a.pkg) || '').toLowerCase();
    if (q) { const m = ps.find(p => p.name.toLowerCase() == q) || ps.find(p => p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q)); if (m) return m; throw new Error('pacote "' + a.pkg + '" não encontrado. Abertos: ' + (ps.map(p => p.name).join(', ') || 'nenhum')); }
    if (ps.length == 1) return ps[0];
    throw new Error(ps.length ? 'há ' + ps.length + ' pacotes abertos (' + ps.map(p => p.name).join(', ') + '): informe pkg ou um path dentro de um deles' : 'nenhum pacote aberto. Peça ao usuário para importar o arquivo em ＋ → Adicionar arquivo');
  }

  /* ---------- imagens: trocar mantendo tamanho e formato ---------- */
  function carregarImagem(src) {
    const f = pj().files; let url;
    const c = f[src]; if (c == null) throw new Error('arquivo não existe no projeto: ' + src);
    if (env.isRef(c)) url = imgData(c); else if (/^data:image\//.test(c.trim())) url = c.trim(); else if (/<svg[\s>]/i.test(c)) url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(c); else throw new Error('use como origem uma imagem do projeto, um SVG ou um data URL');
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('não consegui decodificar a imagem de origem')); im.src = url; });
  }
  async function codificar(slot, im) {
    const cv = document.createElement('canvas'); cv.width = slot.w; cv.height = slot.h;
    const c = cv.getContext('2d', { willReadFrequently: true }), lim = slot.size || 0;
    if (slot.kind == 'bmp') {
      c.drawImage(im, 0, 0, slot.w, slot.h);
      const dib = EXE.dibFromRGBA(c.getImageData(0, 0, slot.w, slot.h).data, slot.w, slot.h, slot.bpp, [255, 0, 255]), f = new Uint8Array(14 + dib.length), v = new DataView(f.buffer);
      f[0] = 0x42; f[1] = 0x4d; v.setUint32(2, f.length, true); v.setUint32(10, 54, true); f.set(dib, 14); return f;
    }
    const tipo = slot.kind == 'jpg' ? 'image/jpeg' : slot.kind == 'webp' ? 'image/webp' : 'image/png';
    const obter = async q => new Uint8Array(await (await new Promise(r => cv.toBlob(r, tipo, q))).arrayBuffer());
    if (slot.kind == 'jpg') { c.fillStyle = '#fff'; c.fillRect(0, 0, slot.w, slot.h); }
    c.drawImage(im, 0, 0, slot.w, slot.h);
    if (slot.kind == 'jpg' || slot.kind == 'webp') {
      for (const q of [.92, .8, .7, .6, .5, .4, .3]) { const b = await obter(q); if (!lim || b.length <= lim) return b; }
      throw new Error('a imagem não cabe no espaço original (' + lim + ' bytes)');
    }
    let b = await obter(); if (!lim || b.length <= lim) return b;
    const id = c.getImageData(0, 0, slot.w, slot.h), o = new Uint8ClampedArray(id.data);
    for (const sh of [2, 3, 4, 5]) { for (let i = 0; i < o.length; i++) id.data[i] = (o[i] >> sh) << sh; c.putImageData(id, 0, 0); b = await obter(); if (b.length <= lim) return b; }
    throw new Error('o PNG novo não cabe no espaço original (' + lim + ' bytes) nem reduzindo cores; use uma imagem mais simples');
  }

  /* ---------- download do pacote recompilado ---------- */
  async function recompilar(meta, sign) {
    const r = await PKGC.build(env, meta, pj().files, { sign });
    await out(r.name, new Blob([r.bytes], { type: r.mime }));
    return r;
  }

  /* ---------- ferramentas do agente ---------- */
  const NOME = 'Nome ou parte do nome do pacote (opcional se só há um aberto)';
  const defs = [
    ['pkg_list', 'PACOTES: lista os pacotes abertos (APK, EXE, ZIP…) ou, com pkg, todos os arquivos de um pacote (inclusive os que ficam só dentro dele). filtro opcional (texto no nome)', { pkg: 'string?', filtro: 'string?' }],
    ['pkg_info', 'PACOTES: resumo de um pacote (APK: pacote, versão, SDK, permissões; EXE: arquitetura, empacotador) e as alterações pendentes', { pkg: 'string?' }],
    ['pkg_find', 'PACOTES: procura um texto nos BINÁRIOS do pacote (ASCII e UTF-16): .dex, .so, .arsc, o próprio .exe. Para texto comum use grep', { text: 'string', pkg: 'string?', path: 'string?' }],
    ['pkg_hex', 'PACOTES: mostra bytes em hexadecimal de um arquivo do pacote (path) a partir de offset (padrão 0, até 512 bytes). Para o binário inteiro de um .exe/binário use a pasta do pacote como path', { path: 'string', offset: 'int?', len: 'int?' }],
    ['pkg_strings', 'PACOTES: lista textos legíveis dentro de um binário do pacote', { path: 'string', min: 'int?', filtro: 'string?' }],
    ['pkg_patch', 'PACOTES: altera bytes de um binário. Use find+replace (texto; no .exe precisa caber no mesmo tamanho, ou grow=true para usar o espaço livre) OU offset+hex (ex.: hex "90 90"). Em .exe/binário genérico o path é a pasta do pacote e a troca é aplicada ao recompilar', { path: 'string', find: 'string?', replace: 'string?', grow: 'string?', offset: 'int?', hex: 'string?' }],
    ['pkg_replace', 'PACOTES: substitui um arquivo do pacote pelo conteúdo de outro arquivo do projeto (from)', { path: 'string', from: 'string' }],
    ['pkg_replace_image', 'PACOTES: troca uma imagem do pacote por outra do projeto (from), ajustando ao tamanho e formato originais (PNG, JPEG, WebP, BMP)', { path: 'string', from: 'string' }],
    ['pkg_extract', 'PACOTES: carrega como arquivos do projeto entradas que estão só dentro do pacote (padrão com * e ?, ex.: res/layout/*.xml). XML binário do Android vira texto editável', { pattern: 'string', pkg: 'string?' }],
    ['pkg_remove', 'PACOTES: remove um arquivo de dentro do pacote (vale ao recompilar)', { path: 'string' }],
    ['pkg_build', 'PACOTES: reempacota as alterações no formato original e entrega o arquivo ao usuário. APK é validado e sai assinado (sign=false para não assinar). Isso não recompila código DEX/Java/Kotlin nem recursos binários que não foram modificados pelo editor.', { pkg: 'string?', sign: 'string?' }],
    ['pkg_close', 'PACOTES: fecha o pacote e apaga a pasta dele do projeto (o arquivo original no aparelho não é afetado)', { pkg: 'string' }]
  ];
  const MUDAM = ['pkg_patch', 'pkg_replace', 'pkg_replace_image', 'pkg_extract', 'pkg_remove', 'pkg_close'], LEEM = ['pkg_list', 'pkg_info', 'pkg_find', 'pkg_hex', 'pkg_strings'];
  const sim = v => v === true || /^(true|sim|1)$/i.test(String(v));

  async function ferramenta(n, a) {
    const p = pj(), f = p.files;
    try {
      if (n == 'pkg_list' && !a.pkg && !a.filtro) {
        const ps = todos(); if (!ps.length) return 'Nenhum pacote aberto. O usuário abre qualquer arquivo (APK, EXE, ZIP, DEX…) em ＋ → Adicionar arquivo.';
        return ps.map(m => PKGC.ICON[m.kind] + ' ' + m.name + ' — ' + m.kind.toUpperCase() + ', pasta ' + m.root + ', ' + PKGC.changes(env, m, f).n + ' alteração(ões) pendente(s)').join('\n');
      }
      if (n == 'pkg_list') { const l = await PKGC.list(env, achar(a), f, a.filtro); return l.length ? l.slice(0, 300).join('\n') + (l.length > 300 ? '\n… (+' + (l.length - 300) + ', use filtro)' : '') : '(nada encontrado)'; }
      if (n == 'pkg_info') return PKGC.info(env, achar(a), f);
      if (n == 'pkg_find') { const m = achar(a, 'path'), r = await PKGC.find(env, m, f, a.text, a.path); return r.length ? r.join('\n') : 'Texto não encontrado nos binários.'; }
      if (n == 'pkg_hex') { const m = achar(a), b = await PKGC.entryBytes(env, m, f, a.path), off = Math.max(0, a.offset || 0), len = Math.min(512, a.len || 256); return 'Tamanho: ' + b.length + ' bytes\n' + EXE.hexdump(b, off, len); }
      if (n == 'pkg_strings') { const m = achar(a), b = await PKGC.entryBytes(env, m, f, a.path); let s = EXE.strings(b, a.min || 6, 400); if (a.filtro) s = s.filter(x => x.toLowerCase().includes(String(a.filtro).toLowerCase())); return s.length ? s.slice(0, 200).join('\n') : '(nenhum texto legível)'; }
      if (n == 'pkg_patch') { const m = achar(a), r = await PKGC.patch(env, m, f, a.path, { find: a.find, replace: a.replace, grow: sim(a.grow), offset: a.offset, hex: a.hex }); save(); ui(); return r; }
      if (n == 'pkg_replace') { const m = achar(a); await PKGC.replace(env, m, f, a.path, a.from); save(); ui(); return 'Substituído: ' + a.path; }
      if (n == 'pkg_replace_image') {
        const m = achar(a), slot = await PKGC.imageSlot(env, m, f, a.path), im = await carregarImagem(a.from), nb = await codificar(slot, im);
        await PKGC.setEntry(env, m, f, a.path, nb); save(); ui();
        return '✅ imagem trocada (' + slot.w + '×' + slot.h + ', ' + slot.kind + ', ' + nb.length + (slot.size ? '/' + slot.size : '') + ' bytes)';
      }
      if (n == 'pkg_extract') { const m = achar(a), got = await PKGC.extract(env, m, f, a.pattern); save(); ui(); return got.length ? 'Carregados ' + got.length + ' arquivo(s) em ' + m.root + ':\n' + got.join('\n') : 'Nada novo para carregar com esse padrão (já estavam carregados ou não existem).'; }
      if (n == 'pkg_remove') { const m = achar(a); PKGC.remove(m, f, a.path); save(); ui(); return 'Removido (vale ao recompilar): ' + a.path; }
      if (n == 'pkg_build') {
        const m = achar(a), r = await recompilar(m, a.sign == null ? undefined : sim(a.sign));
        return 'Pacote recompilado e entregue ao usuário: ' + r.name + ' (' + Math.round(r.bytes.length / 1024) + ' KB, ' + r.changes + ' alteração(ões)).' + (m.kind == 'apk' ? ' Se o app original estiver instalado, o usuário precisa desinstalar antes (assinatura diferente).' : '');
      }
      if (n == 'pkg_close') { const m = achar(a); fechar(m); return 'Pacote fechado: ' + m.name; }
    } catch (e) { return 'Erro: ' + e.message; }
    return 'Erro: ferramenta desconhecida';
  }
  function fechar(m) { const p = pj(); for (const k of Object.keys(p.files)) if (k.startsWith(m.root)) delete p.files[k]; delete p.pkgs[m.root]; try { imgGC(); } catch (_) { /* ok */ } save(); ui(); }

  /* ---------- menu único ---------- */
  async function menu() {
    const ps = todos();
    if (!ps.length) { const r = await dlg({ title: '📦 Pacotes', text: 'Nenhum pacote aberto.\n\nImporte qualquer arquivo (APK, EXE, ZIP, DEX, SO…) em ＋ → Adicionar arquivo. Ele vira uma pasta do projeto: edite com a IA ou na aba Arquivos e recompile aqui.', btns: ['📎 Escolher arquivo'], skip: 'Fechar' }); if (r === 0) $('#imp').click(); return; }
    const c = ps.length == 1 ? ps[0].name : await dlg({ title: '📦 Pacotes abertos', opts: ps.map(m => PKGC.ICON[m.kind] + ' ' + m.name), skip: 'Fechar' });
    if (c == null) return;
    const m = ps.length == 1 ? ps[0] : ps.find(x => c.endsWith(x.name));
    const ap = m.kind == 'apk', op = [];
    op.push(ap ? '🔨 Reempacotar, assinar e baixar' : '🔨 Reempacotar e baixar');
    if (ap) op.push('🔨 Reempacotar SEM assinar'); op.push('ℹ️ Ver informações e alterações', '🗑 Fechar pacote');
    if (ap) op.push('🔑 Chave de assinatura');
    const x = await dlg({ title: PKGC.ICON[m.kind] + ' ' + m.name, text: 'Pasta: ' + m.root + '\nAlterações pendentes: ' + PKGC.changes(env, m, pj().files).n + (ap ? '\n\nO APK será reempacotado/assinado e validado. Não há recompilação de DEX/Java/Kotlin nem de recursos arbitrários.' : ''), opts: op, skip: 'Cancelar' });
    if (x == null) return;
    try {
      if (x.startsWith('🔨')) { const r = await recompilar(m, ap ? !/SEM/.test(x) : undefined); await dlg({ title: '✅ Pronto', text: r.name + ' (' + Math.round(r.bytes.length / 1024) + ' KB, ' + r.changes + ' alteração(ões)).' + (ap && !/SEM/.test(x) ? '\n\nSe o app original estiver instalado, desinstale antes: o Android recusa instalar por cima com outra assinatura.' : ''), skip: 'OK' }); }
      else if (x.startsWith('ℹ️')) await dlg({ title: 'Informações', text: await PKGC.info(env, m, pj().files), skip: 'OK' });
      else if (x.startsWith('🗑')) { if (await dlg({ title: 'Fechar ' + m.name + '?', text: 'A pasta ' + m.root + ' e as alterações não recompiladas serão apagadas do projeto. O arquivo original no aparelho não é afetado.', btns: ['Fechar pacote', 'Cancelar'] }) === 0) fechar(m); }
      else if (x.startsWith('🔑')) await menuChave();
    } catch (e) { await dlg({ title: 'Erro', text: e.message, skip: 'OK' }); }
  }
  async function menuChave() {
    const c = await dlg({ title: '🔑 Chave de assinatura', text: 'O APK é assinado com uma chave RSA guardada só neste aparelho. Use sempre a mesma para que seus APKs editados possam atualizar uns aos outros.', opts: ['📤 Exportar backup da chave', '📥 Importar chave', '🔄 Gerar uma chave nova'], skip: 'Fechar' });
    if (c == null) return;
    if (c.startsWith('📤')) await out('codemobile-chave.json', new Blob([JSON.stringify(await chave())], { type: 'application/json' }));
    else if (c.startsWith('📥')) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => { try { const k = JSON.parse(await inp.files[0].text()); await signKeyUse(k); KEY = k; await kIdb('put', 'key', k); await dlg({ title: 'Chave importada', skip: 'OK' }); } catch (e) { await dlg({ title: 'Arquivo de chave inválido', text: e.message, skip: 'OK' }); } };
      inp.click();
    } else if (await dlg({ title: 'Gerar uma chave nova?', text: 'APKs assinados com a chave antiga não poderão ser atualizados pelos assinados com a nova (o Android exige a mesma assinatura).', btns: ['Gerar nova', 'Cancelar'] }) === 0) { KEY = null; await kIdb('del', 'key'); await chave(); await dlg({ title: 'Chave nova criada', skip: 'OK' }); }
  }

  /* ---------- instalar no app ---------- */
  function instalar() {
    for (const [n, d, e] of defs) if (!T.some(t => t[0] == n)) T.push([n, d, e]);
    if (typeof W != 'undefined') MUDAM.forEach(n => W.includes(n) || W.push(n));
    if (typeof RO != 'undefined') LEEM.forEach(n => RO.includes(n) || RO.push(n));
    if (typeof GRP == 'object') { MUDAM.forEach(n => GRP.write.includes(n) || GRP.write.push(n)); GRP.run.includes('pkg_build') || GRP.run.push('pkg_build'); }
    if (typeof ico == 'object') for (const [n] of defs) ico[n] = '📦';

    // ferramentas pkg_* + lista de arquivos compacta (pacotes podem ter milhares de entradas)
    const _exec = exec;
    exec = async function (n, a) {
      if (/^pkg_/.test(n)) {
        if (S.mode == 'ask' && (MUDAM.includes(n) || n == 'pkg_build') && (await dlg({ title: 'Permitir ' + n + '?', text: String((a && (a.path || a.pkg)) || ''), btns: ['✅ Permitir', '🚫 Negar'] })) !== 0) return 'Negado pelo usuário.';
        return ferramenta(n, a || {});
      }
      const r = await _exec(n, a);
      if (n == 'list_files' && typeof r == 'string') {
        const roots = Object.keys(pj().pkgs || {}); if (!roots.length) return r;
        const cont = {}, lin = [];
        for (const l of r.split('\n')) { const rt = roots.find(x => l.startsWith(x)); if (!rt) { lin.push(l); continue; } cont[rt] = (cont[rt] || 0) + 1; if (cont[rt] <= 12) lin.push(l); }
        for (const rt of roots) if (cont[rt] > 12) lin.push('… +' + (cont[rt] - 12) + ' arquivos em ' + rt + ' (pkg_list ' + rt + ' mostra todos, inclusive os que ficam só dentro do pacote)');
        return lin.join('\n');
      }
      return r;
    };
    // prompt: só aparece quando há pacote aberto
    const _sys = sys;
    sys = function () {
      const b = _sys(), ps = todos();
      return ps.length && !(typeof CHATONLY != 'undefined' && CHATONLY)
        ? b + '\nPACOTES abertos (' + ps.map(m => m.name + ' → ' + m.root).join(', ') + '): são pastas do projeto. Edite os arquivos com as ferramentas normais (read_file, edit_file, grep…); XML binário do Android já aparece como texto. O que não está carregado fica dentro do pacote: pkg_list, pkg_extract, pkg_hex, pkg_strings, pkg_find, pkg_patch, pkg_replace_image. Para entregar o arquivo final use pkg_build. Texto no .exe só troca por texto do mesmo tamanho (ou grow=true).'
        : b;
    };
    // importador único: depois dos tratadores de imagem e texto, pega qualquer outro arquivo
    const im = $('#imp'), _oc = im.onchange;
    im.onchange = async e => {
      const all = [...e.target.files], pk = [], rest = [];
      for (const f of all) (await ehPacote(f) ? pk : rest).push(f);
      e.target.value = '';
      for (const f of pk) await importar(f);
      if (rest.length && _oc) return _oc({ target: { files: rest, value: '' } });
    };
    // um só item no menu ＋ (nada de menu por tipo de arquivo)
    if (typeof cmMenu == 'function') { const _m = cmMenu; cmMenu = function () { return [..._m(), ['📦', 'Pacotes', 'Recompilar e baixar o que você abriu (APK, EXE, ZIP…)', menu]]; }; }
    im.setAttribute('accept', '*/*');
  }

  if (typeof exec == 'function' && typeof sys == 'function' && typeof T != 'undefined' && typeof $ == 'function' && $('#imp')) instalar();
  return { env, importar, menu, ferramenta, defs, ehPacote, hashBytes };
})();
