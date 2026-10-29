/* pkgcore.js — "pacotes": qualquer arquivo importado (APK, ZIP/JAR/DOCX, EXE/DLL, DEX, SO…) vira uma
   pasta do projeto (pacotes/<nome>/…), editada com as MESMAS ferramentas e a MESMA aba de arquivos
   de qualquer outro arquivo, e recompilada de volta para o formato original.
   Sem DOM: recebe tudo por `env` (bibliotecas de zip/axml/exe, armazenamento de binários, assinatura),
   por isso roda igual no app e nos testes.
   env = { zip:{zipRead,zipGet,zipWrite,zipDir}, axml:{axmlIs,axmlParse,axmlCompile,apkInfo}, EXE,
           put(bytes)->ref, get(ref)->bytes, isRef(c), sign(bytes)->bytes }
   Estado por pacote (meta), guardado em projeto.pkgs[raiz]:
     { name, kind:'apk'|'zip'|'exe'|'bin', root, orig:<ref do arquivo original>, size,
       mat:{ caminho:{k,fp,…} }  ← só o que foi carregado como arquivo do projeto,
       rm:[nomes removidos], ops:[trocas/patches de bytes do binário inteiro] }               */
const PKGC = (() => {
  const te = new TextEncoder(), tdU = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const L = { textTotal: 1.2e6, textEach: 4e5, imgEach: 5.12e5, imgMax: 150, maxPkg: Infinity, extractText: Infinity }; // sem teto para o pacote; pré-carregamento de conteúdo é limitado só para proteger a RAM
  const BIN_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|dex|so|arsc|jar|zip|apk|aab|ttf|otf|woff2?|mp[34]|m4a|ogg|wav|flac|pdf|class|bin|dat|obb|pak|xz|gz|bz2|7z|rar|db|sqlite|dll|exe|node|wasm|webm|mkv|avi|mov)$/i;
  const IMG_EXT = /\.(png|jpe?g|webp|bmp)$/i, SIG = /^META-INF\/[^/]+\.(RSA|DSA|EC|SF|MF)$/i;

  /* ---------- utilidades ---------- */
  const fp = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + '.' + s.length; };
  const cleanName = n => { n = String(n).replace(/\\/g, '/').replace(/^\/+/, ''); return !n || n.includes('\0') || n.split('/').some(p => p == '..' || p == '.') ? '' : n; };
  const asText = d => { if (d.subarray(0, 4096).includes(0)) return null; try { return tdU.decode(d); } catch (_) { return null; } };
  const gm = (pat, s) => new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(s);
  const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const extOf = n => (/\.([^./]+)$/.exec(n) || [, ''])[1].toLowerCase();
  const baseOf = n => String(n).replace(/\.[^.]+$/, '');
  const uniq = (set, p) => { if (!set.has(p)) return p; const m = /^(.*?)(\.[^./]*)?$/.exec(p); let i = 2; while (set.has(m[1] + '-' + i + (m[2] || ''))) i++; return m[1] + '-' + i + (m[2] || ''); };
  const own = (files, root) => Object.keys(files).filter(k => k.startsWith(root));

  /* ---------- tipo do arquivo ---------- */
  function sniff(env, name, b) {
    if (b[0] == 0x50 && b[1] == 0x4b && (b[2] == 3 || b[2] == 5)) {
      let ents; try { ents = env.zip.zipRead(b); } catch (_) { return 'bin'; }
      const has = n => ents.some(e => e.name == n);
      return /\.(apk|aab)$/i.test(name) || (has('AndroidManifest.xml') && ents.some(e => /^classes\d*\.dex$/.test(e.name))) ? 'apk' : 'zip';
    }
    if (b[0] == 0x4d && b[1] == 0x5a) { try { env.EXE.parse(b); return 'exe'; } catch (_) { return 'bin'; } }
    return 'bin';
  }
  const ICON = { apk: '📱', zip: '🗜️', exe: '🪟', bin: '🧱' };

  /* ---------- abrir ---------- */
  async function open(env, name, bytes, p) {
    if (bytes.length > L.maxPkg) throw new Error('Arquivo grande demais (' + Math.round(bytes.length / 1e6) + ' MB; máximo ' + L.maxPkg / 1e6 + ' MB).');
    p.pkgs = p.pkgs || {};
    const safe = String(name).replace(/[\/\\]/g, '_').trim() || 'pacote';
    let root = 'pacotes/' + safe + '/', i = 2; while (p.pkgs[root]) root = 'pacotes/' + safe + '-' + (i++) + '/';
    const kind = sniff(env, name, bytes);
    const meta = { name, kind, root, size: bytes.length, orig: await env.put(bytes), mat: {}, rm: [], ops: [], at: Date.now() };
    const files = p.files, st = { text: 0, img: 0, skipped: 0 };
    if (kind == 'apk' || kind == 'zip') await openZip(env, bytes, meta, files, st);
    else if (kind == 'exe') await openExe(env, bytes, meta, files, st);
    else { const path = root + safe; files[path] = meta.orig; meta.mat[path] = { k: 'whole', fp: meta.orig }; }
    p.pkgs[root] = meta;
    const total = kind == 'apk' || kind == 'zip' ? env.zip.zipRead(bytes).filter(e => !env.zip.zipDir(e.name)).length : null;
    return { meta, summary: ICON[kind] + ' ' + name + ' aberto como pasta ' + root + ' (' + kind.toUpperCase() + ', ' + Math.round(bytes.length / 1024) + ' KB)'
      + (total != null ? '\n' + total + ' arquivos no pacote; ' + st.text + ' de texto e ' + st.img + ' imagens carregados como arquivos do projeto. Os demais ficam no pacote: veja com pkg_list, carregue com pkg_extract.' : '')
      + (kind == 'exe' ? '\nRecursos de imagem e arquivos do ZIP embutido (se houver) viraram arquivos. Texto e bytes do .exe: pkg_find, pkg_patch, pkg_hex.' : '')
      + (kind == 'bin' ? '\nBinário genérico: use pkg_hex, pkg_strings, pkg_find e pkg_patch no caminho ' + root + '.' : '')
      + '\nQuando terminar, recompile com pkg_build (ou /pacotes).' };
  }

  async function openZip(env, bytes, meta, files, st) {
    const { zipRead, zipGet, zipDir } = env.zip, root = meta.root;
    const rows = []; for (const e of zipRead(bytes)) { if (zipDir(e.name)) continue; const n = cleanName(e.name); if (!n) { st.skipped++; continue; } rows.push({ e, n }); }
    rows.sort((a, b) => ((a.n == 'AndroidManifest.xml' ? 0 : 1) - (b.n == 'AndroidManifest.xml' ? 0 : 1)) || a.e.usize - b.e.usize);
    let tt = 0;
    for (const { e, n } of rows) {
      const path = root + n;
      if (IMG_EXT.test(n)) { if (st.img >= L.imgMax || e.usize > L.imgEach) continue; const ref = await env.put(await zipGet(bytes, e)); files[path] = ref; meta.mat[path] = { n, k: 'bin', fp: ref }; st.img++; continue; }
      if (BIN_EXT.test(n) || SIG.test(n) || e.usize > L.textEach || tt >= L.textTotal) continue;   // assinaturas são refeitas pelo zipWrite/apkSign
      const d = await zipGet(bytes, e); let text, k = 'text';
      if (env.axml.axmlIs(d)) { try { text = env.axml.axmlParse(d).text; k = 'axml'; } catch (_) { continue; } } else { text = asText(d); if (text == null) continue; }
      if (tt + text.length > L.textTotal) continue;
      tt += text.length; files[path] = text; meta.mat[path] = { n, k, fp: fp(text) }; st.text++;
    }
  }

  async function openExe(env, bytes, meta, files, st) {
    const E = env.EXE, root = meta.root, used = new Set(), info = E.parse(bytes);
    const take = p => { p = uniq(used, p); used.add(p); return p; };
    let n = 0;
    info.res.forEach((r, idx) => {
      if (n >= L.imgMax || r.size > L.imgEach) return;
      let f; try { f = E.resFile(bytes, r); } catch (_) { return; }
      if (!/\.(bmp|png|jpe?g|ico|gif)$/i.test(f.name)) return;
      meta.mat[root + 'recursos/' + take(f.name)] = { k: 'res', idx, pend: f.data }; n++;
    });
    for (const [path, m] of Object.entries(meta.mat)) { files[path] = m.fp = await env.put(m.pend); delete m.pend; st.img++; }
    const resEnd = info.res.map(r => [r.off, r.off + r.size]);
    for (const m of E.findImages(bytes)) {
      if (st.img >= L.imgMax || m.size > L.imgEach || resEnd.some(([a, b]) => m.off >= a && m.off < b)) continue;
      const ref = await env.put(bytes.slice(m.off, m.off + m.size)), path = root + 'imagens/img_' + m.off.toString(16) + '.' + m.kind;
      files[path] = ref; meta.mat[path] = { k: 'loose', off: m.off, size: m.size, fp: ref }; st.img++;
    }
    const z = E.zipFind(bytes);
    if (z) {
      meta.zip = true; let tt = 0;
      for (const e of E.zipList(bytes, z)) {
        const nm = cleanName(e.name); if (!nm || e.dir || e.name.endsWith('/') || BIN_EXT.test(nm) || e.us > L.textEach || tt >= L.textTotal) continue;
        const text = asText(await E.zipRead(bytes, e)); if (text == null || tt + text.length > L.textTotal) continue;
        tt += text.length; files[root + 'zip/' + nm] = text; meta.mat[root + 'zip/' + nm] = { n: nm, k: 'ztext', fp: fp(text) }; st.text++;
      }
    }
  }

  /* ---------- bytes de uma entrada (para hex, strings, find, patch) ---------- */
  const isRoot = (meta, path) => path == meta.root || path + '/' == meta.root;
  async function origBytes(env, meta) { const b = await env.get(meta.orig); if (!b) throw new Error('O arquivo original do pacote não está mais guardado no app.'); return b; }
  async function rootBytes(env, meta) { let b = (await origBytes(env, meta)).slice(); if (meta.kind == 'exe' || meta.kind == 'bin') b = applyOps(env, b, meta.ops); return b; }
  function applyOps(env, b, ops) {
    for (const o of ops) {
      if (o.t == 'swap') env.EXE.replaceText(b, o.from, o.to, !!o.grow);
      else if (o.t == 'bytes') env.EXE.patch(b, o.off, env.EXE.hexBytes(o.hex));
    }
    return b;
  }
  async function entryBytes(env, meta, files, path) {
    if (isRoot(meta, path)) return rootBytes(env, meta);
    if (!path.startsWith(meta.root)) throw new Error('Caminho fora do pacote ' + meta.root);
    const cur = files[path];
    if (cur !== undefined) return env.isRef(cur) ? await env.get(cur) : te.encode(cur);
    const name = path.slice(meta.root.length), b = await origBytes(env, meta);
    if (meta.kind == 'apk' || meta.kind == 'zip') { const e = env.zip.zipRead(b).find(x => cleanName(x.name) == name); if (!e) throw new Error('Não existe no pacote: ' + name); return env.zip.zipGet(b, e); }
    if (meta.kind == 'exe' && name.startsWith('zip/')) { const z = env.EXE.zipFind(b), e = z && env.EXE.zipList(b, z).find(x => cleanName(x.name) == name.slice(4)); if (e) return env.EXE.zipRead(b, e); }
    throw new Error('Não existe no pacote: ' + name);
  }

  /* ---------- listar / informar ---------- */
  async function list(env, meta, files, filter) {
    const out = [], re = filter ? (s => gm('*' + filter + '*', s)) : () => true;
    const add = (name, size, extra) => { if (re(name)) out.push(name + '  ' + (size >= 0 ? size + ' B' : '') + (extra ? '  ' + extra : '')); };
    const b = await origBytes(env, meta), st = e => meta.root + e;
    const tag = path => files[path] === undefined ? 'no pacote (virtual)' : meta.mat[path] && same(env, files[path], meta.mat[path]) ? 'carregado' : 'carregado, ALTERADO';
    if (meta.kind == 'apk' || meta.kind == 'zip') for (const e of env.zip.zipRead(b)) { if (env.zip.zipDir(e.name)) continue; const n = cleanName(e.name); if (n) add(n, e.usize, meta.rm.includes(n) ? 'REMOVIDO' : tag(st(n))); }
    else if (meta.kind == 'exe') {
      for (const p of own(files, meta.root)) add(p.slice(meta.root.length), -1, tag(p));
      const z = env.EXE.zipFind(b); if (z) for (const e of env.EXE.zipList(b, z)) if (!e.dir && !e.name.endsWith('/') && files[st('zip/' + e.name)] === undefined) add('zip/' + e.name, e.us, 'no pacote (virtual)');
    } else for (const p of own(files, meta.root)) add(p.slice(meta.root.length), -1, tag(p));
    for (const p of own(files, meta.root)) if (!meta.mat[p] && (meta.kind == 'apk' || meta.kind == 'zip')) add(p.slice(meta.root.length), -1, 'NOVO/SUBSTITUÍDO');
    return out;
  }
  const same = (env, cur, m) => env.isRef(cur) ? cur === m.fp : fp(cur) === m.fp;
  async function info(env, meta, files) {
    const b = await origBytes(env, meta); let t = ICON[meta.kind] + ' ' + meta.name + ' — ' + meta.kind.toUpperCase() + ', ' + Math.round(meta.size / 1024) + ' KB, pasta ' + meta.root;
    if (meta.kind == 'apk') {
      try { const d = await env.zip.zipGet(b, env.zip.zipRead(b).find(e => e.name == 'AndroidManifest.xml')), a = env.axml.apkInfo(env.axml.axmlIs(d) ? env.axml.axmlParse(d).text : tdU.decode(d));
        t += '\nPacote: ' + a.pkg + ' · versão ' + a.vn + ' (' + a.vc + ') · SDK min ' + a.min + ' alvo ' + a.tgt + '\nPermissões: ' + ((a.perms || []).join(', ') || '(nenhuma)'); } catch (_) { t += '\n(não consegui ler o AndroidManifest)'; }
    } else if (meta.kind == 'exe') {
      const i = env.EXE.parse(b); t += '\nArquitetura: ' + i.machine + ' · ' + i.res.length + ' recursos' + (meta.zip ? ' · ZIP embutido' : '');
      const h = env.EXE.hints(b); if (h.length) t += '\nAvisos: ' + h.join('; ');
    }
    const ch = changes(env, meta, files); t += '\nAlterações pendentes: ' + (ch.n ? ch.n + ' (' + ch.list.slice(0, 8).join(', ') + (ch.n > 8 ? '…' : '') + ')' : 'nenhuma');
    return t;
  }
  function changes(env, meta, files) {
    const list = [];
    for (const [p, m] of Object.entries(meta.mat)) { const c = files[p]; if (c === undefined) list.push('removido ' + p.slice(meta.root.length)); else if (!same(env, c, m)) list.push(p.slice(meta.root.length)); }
    for (const p of own(files, meta.root)) if (!meta.mat[p]) list.push(p.slice(meta.root.length) + ' (novo/substituído)');
    for (const r of meta.rm) list.push('removido ' + r);
    for (const o of meta.ops) list.push(o.t == 'swap' ? 'troca "' + o.from + '"' : 'bytes @' + o.off);
    const u = [...new Set(list)]; return { n: u.length, list: u };
  }

  /* ---------- buscar, hex, strings ---------- */
  async function find(env, meta, files, text, path) {
    const E = env.EXE, out = [];
    const scan = async (label, b) => { for (const h of E.findText(b, text)) { out.push(label + ' @0x' + h.off.toString(16) + ' (' + h.kind + ')'); if (out.length >= 60) return; } };
    if (path) { await scan(path.slice(meta.root.length) || '(arquivo)', await entryBytes(env, meta, files, path)); return out; }
    if (meta.kind == 'exe' || meta.kind == 'bin') { await scan('(arquivo)', await rootBytes(env, meta)); return out; }
    const b = await origBytes(env, meta); let budget = 3e7;
    for (const e of env.zip.zipRead(b)) {
      if (env.zip.zipDir(e.name) || out.length >= 60 || budget <= 0) continue;
      const n = cleanName(e.name), p = meta.root + n; if (!n || files[p] !== undefined && !env.isRef(files[p])) continue;
      budget -= e.usize; await scan(n, files[p] !== undefined ? await env.get(files[p]) : await env.zip.zipGet(b, e));
    }
    return out;
  }

  /* ---------- patch / troca / extração / remoção ---------- */
  async function patch(env, meta, files, path, spec) {
    const E = env.EXE;
    if (spec.hex != null && spec.offset == null) throw new Error('informe offset junto com hex');
    if (isRoot(meta, path) && meta.kind != 'apk' && meta.kind != 'zip') {
      const b = await rootBytes(env, meta);
      if (spec.hex != null) { const nb = E.hexBytes(spec.hex), off = E.num ? E.num(spec.offset) : Number(spec.offset); E.patch(b, off, nb); meta.ops.push({ t: 'bytes', off, hex: spec.hex }); return nb.length + ' bytes gravados em 0x' + off.toString(16) + ' (aplicado ao recompilar).'; }
      if (spec.find == null) throw new Error('informe find/replace ou offset/hex');
      const r = E.replaceText(b, String(spec.find), String(spec.replace ?? ''), !!spec.grow);
      if (!r.found) return 'Texto não encontrado.';
      if (r.done) meta.ops.push({ t: 'swap', from: String(spec.find), to: String(spec.replace ?? ''), grow: !!spec.grow });
      return 'Trocadas ' + r.done + ' de ' + r.found + ' ocorrências' + (r.skipped ? '. ' + r.skipped + ' não couberam (máx. ' + r.maxLen + ' bytes; tente grow=true).' : '.');
    }
    const b = (await entryBytes(env, meta, files, path)).slice(); let msg;
    if (spec.hex != null) { const nb = E.hexBytes(spec.hex), off = Number(spec.offset); E.patch(b, off, nb); msg = nb.length + ' bytes gravados em 0x' + off.toString(16); }
    else if (spec.find != null) { const r = E.replaceText(b, String(spec.find), String(spec.replace ?? ''), !!spec.grow); if (!r.found) return 'Texto não encontrado.'; if (!r.done) return 'Nenhuma troca coube (máx. ' + r.maxLen + ' bytes; tente grow=true).'; msg = 'Trocadas ' + r.done + ' de ' + r.found + ' ocorrências'; }
    else throw new Error('informe find/replace ou offset/hex');
    await setEntry(env, meta, files, path, b); return msg + '.';
  }
  async function setEntry(env, meta, files, path, bytes) { files[path] = await env.put(bytes); meta.rm = meta.rm.filter(n => meta.root + n != path); }
  async function replace(env, meta, files, path, srcPath) {
    if (!path.startsWith(meta.root) || isRoot(meta, path)) throw new Error('path deve ser um arquivo dentro de ' + meta.root);
    const c = files[srcPath]; if (c === undefined) throw new Error('arquivo de origem não existe no projeto: ' + srcPath);
    files[path] = c; meta.rm = meta.rm.filter(n => meta.root + n != path);
  }
  async function extract(env, meta, files, pattern) {
    const b = await origBytes(env, meta), got = [], pat = pattern || '*';
    const put = async (name, d) => {
      const path = meta.root + name; if (files[path] !== undefined) return;
      const t = !BIN_EXT.test(name) && !env.axml.axmlIs(d) ? asText(d) : null;
      if (t != null) { files[path] = t; meta.mat[path] = { n: name, k: meta.kind == 'exe' ? 'ztext' : 'text', fp: fp(t) }; }
      else if (env.axml.axmlIs(d) && meta.kind != 'exe') { files[path] = env.axml.axmlParse(d).text; meta.mat[path] = { n: name, k: 'axml', fp: fp(files[path]) }; }
      else { const r = await env.put(d); files[path] = r; meta.mat[path] = { n: name, k: meta.kind == 'exe' ? 'zbin' : 'bin', fp: r }; }
      got.push(name);
    };
    if (meta.kind == 'apk' || meta.kind == 'zip') { for (const e of env.zip.zipRead(b)) { const n = cleanName(e.name); if (n && !env.zip.zipDir(e.name) && gm(pat, n)) await put(n, await env.zip.zipGet(b, e)); } }
    else if (meta.kind == 'exe') { const z = env.EXE.zipFind(b); if (z) for (const e of env.EXE.zipList(b, z)) { const n = cleanName(e.name); if (n && !e.dir && !e.name.endsWith('/') && gm(pat.replace(/^zip\//, ''), n)) await put('zip/' + n, await env.EXE.zipRead(b, e)); } }
    return got;
  }
  function remove(meta, files, path) {
    if (!path.startsWith(meta.root) || isRoot(meta, path)) throw new Error('path deve ser um arquivo dentro de ' + meta.root);
    const name = path.slice(meta.root.length); delete files[path]; if (!meta.rm.includes(name)) meta.rm.push(name);
  }

  /* ---------- imagens: tamanho/formato do original ---------- */
  function webpDims(d) {
    const s = o => String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]); if (d.length < 30 || s(0) != 'RIFF' || s(8) != 'WEBP') return null;
    const c = s(12);
    if (c == 'VP8 ') return { w: (d[26] | d[27] << 8) & 0x3fff, h: (d[28] | d[29] << 8) & 0x3fff };
    if (c == 'VP8L') return { w: 1 + (((d[22] & 0x3f) << 8) | d[21]), h: 1 + (((d[24] & 0x0f) << 10) | (d[23] << 2) | ((d[22] & 0xc0) >> 6)) };
    if (c == 'VP8X') return { w: 1 + (d[24] | d[25] << 8 | d[26] << 16), h: 1 + (d[27] | d[28] << 8 | d[29] << 16) };
    return null;
  }
  function slotOf(env, d) {
    const E = env.EXE;
    if (d[0] == 0x89 && d[1] == 0x50) { const m = E.imgDims(d); if (m) return { kind: 'png', w: m.w, h: m.h }; }
    if (d[0] == 0xff && d[1] == 0xd8) { const m = E.imgDims(d); if (m) return { kind: 'jpg', w: m.w, h: m.h }; }
    if (d[0] == 0x42 && d[1] == 0x4d) { const i = E.bmpInfo(d.subarray(14)); if (i) return { kind: 'bmp', w: i.w, h: Math.abs(i.h), bpp: i.bpp }; }
    const w = webpDims(d); if (w) return { kind: 'webp', w: w.w, h: w.h };
    return null;
  }
  async function imageSlot(env, meta, files, path) {
    const d = await entryBytes(env, meta, files, path), s = slotOf(env, d);
    if (!s) throw new Error('não reconheço esse formato de imagem (suporto PNG, JPEG, WebP e BMP): ' + path.slice(meta.root.length));
    const m = meta.mat[path]; s.size = m && (m.k == 'loose') ? m.size : m && m.k == 'res' ? (env.EXE.parse(await origBytes(env, meta)).res[m.idx] || {}).size : 0;
    return s;
  }

  /* ---------- recompilar ---------- */
  async function build(env, meta, files, opts = {}) {
    const E = env.EXE, errs = [], b0 = await origBytes(env, meta), root = meta.root;
    let bytes, name, mime = 'application/octet-stream';
    if (meta.kind == 'apk' || meta.kind == 'zip') {
      const ents = env.zip.zipRead(b0), byName = new Map(ents.map(e => [cleanName(e.name), e])), over = new Map(), raw = n => (byName.get(n) || {}).name || n;
      for (const n of meta.rm) over.set(raw(n), null);
      for (const [path, m] of Object.entries(meta.mat)) {
        const cur = files[path];
        if (cur === undefined) { over.set(raw(m.n), null); continue; }
        if (same(env, cur, m)) continue;
        try {
          if (env.isRef(cur)) over.set(raw(m.n), await env.get(cur));
          else if (m.k == 'axml') over.set(raw(m.n), env.axml.axmlCompile(cur, await env.zip.zipGet(b0, byName.get(m.n))));
          else over.set(raw(m.n), te.encode(cur));
        } catch (e) { errs.push(m.n + ': ' + e.message); }
      }
      for (const path of own(files, root)) if (!meta.mat[path]) {
        const n = path.slice(root.length), c = files[path]; if (!n || n.endsWith('/')) continue;
        try {
          if (env.isRef(c)) over.set(raw(n), await env.get(c));
          else { const o = byName.get(n); over.set(raw(n), o && env.axml.axmlIs(await env.zip.zipGet(b0, o)) ? env.axml.axmlCompile(c, await env.zip.zipGet(b0, o)) : te.encode(c)); }
        } catch (e) { errs.push(n + ': ' + e.message); }
      }
      if (errs.length) throw new Error('Não deu para recompilar:\n' + errs.join('\n'));
      bytes = new Uint8Array(await (await env.zip.zipWrite(b0, ents, over)).arrayBuffer());
      const ext = meta.kind == 'apk' ? 'apk' : extOf(meta.name) || 'zip';
      if (meta.kind == 'apk') {
        mime = 'application/vnd.android.package-archive';
        if (typeof env.validateApk === 'function') await env.validateApk(bytes, false);
        if (opts.sign !== false) {
          bytes = await env.sign(bytes);
          if (typeof env.validateApk === 'function') await env.validateApk(bytes, true);
          name = baseOf(meta.name) + '-editado-assinado.apk';
        } else name = baseOf(meta.name) + '-editado.' + ext;
      } else name = baseOf(meta.name) + '-editado.' + ext;
    } else {
      let b = (await origBytes(env, meta)).slice(); b = applyOps(env, b, meta.ops);
      if (meta.kind == 'exe') {
        const info = E.parse(b0);
        for (const [path, m] of Object.entries(meta.mat)) {
          const cur = files[path]; if (cur === undefined || m.k == 'ztext' || m.k == 'zbin' || same(env, cur, m)) continue;
          try {
            const nb = await env.get(cur); if (!nb) continue;
            if (m.k == 'res') E.resReplace(b, info.res[m.idx], nb);
            else if (m.k == 'loose') { if (nb.length > m.size) throw new Error('não cabe: ' + nb.length + ' > ' + m.size + ' bytes'); b.set(nb, m.off); b.fill(0, m.off + nb.length, m.off + m.size); }
          } catch (e) { errs.push(path.slice(root.length) + ': ' + e.message); }
        }
        const z = meta.zip && E.zipFind(b);
        if (z) {
          const zl = E.zipList(b, z), nz = []; let dirty = false;
          for (const e of zl) {
            const p = root + 'zip/' + cleanName(e.name), m = meta.mat[p];
            if (m && files[p] === undefined || meta.rm.includes('zip/' + e.name)) { dirty = true; continue; }
            if (files[p] !== undefined && (!m || !same(env, files[p], m))) { dirty = true; nz.push({ name: e.name, data: env.isRef(files[p]) ? await env.get(files[p]) : te.encode(files[p]) }); continue; }
            nz.push({ name: e.name, data: e.dir || e.name.endsWith('/') ? new Uint8Array(0) : await E.zipRead(b, e) });
          }
          for (const p of own(files, root + 'zip/')) if (!meta.mat[p] && !zl.some(e => root + 'zip/' + cleanName(e.name) == p)) { dirty = true; nz.push({ name: p.slice((root + 'zip/').length), data: env.isRef(files[p]) ? await env.get(files[p]) : te.encode(files[p]) }); }
          if (dirty) b = concat(b.subarray(0, z.start), await E.zipBuild(nz));
        }
        if (errs.length) throw new Error('Não deu para recompilar:\n' + errs.join('\n'));
        bytes = b; name = baseOf(meta.name) + '-editado.' + (extOf(meta.name) || 'exe');
      } else {
        const w = Object.entries(meta.mat).find(([, m]) => m.k == 'whole');
        if (w && files[w[0]] !== undefined && files[w[0]] !== w[1].fp) { bytes = applyOps(env, (await env.get(files[w[0]])).slice(), meta.ops); } else bytes = b;
        name = baseOf(meta.name) + '-editado' + (extOf(meta.name) ? '.' + extOf(meta.name) : '');
      }
    }
    return { name, bytes, mime, changes: changes(env, meta, files).n };
  }

  return { open, list, info, changes, find, patch, replace, extract, remove, build, entryBytes, imageSlot, slotOf, setEntry, sniff, cleanName, fp, L, ICON, isRoot };
})();
if (typeof module != 'undefined') module.exports = PKGC;
