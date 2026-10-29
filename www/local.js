/* local.js — modelos de IA que rodam NESTE aparelho (GGUF via wllama = llama.cpp em WebAssembly).
   - Baixa o modelo do Hugging Face uma vez (fica guardado no app) e depois funciona sem internet.
   - Aparece como o provedor "Modelo local": o app fala com ele por um fetch interno (http://cm-local.invalid/v1),
     então o resto do app (agente, reserva, custo) não precisa saber a diferença.
   - A biblioteca é carregada de ./llm/esm/ (se o build do APK a incluiu) ou da CDN jsDelivr.
   Depende de localcore.js, provedores.js e app.js. */
const LL_HOST = 'cm-local.invalid';
const LL_LIB_CDN = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js';
const _llFetch = window.fetch.bind(window);
const LLS = () => (S.llm = S.llm || { dl: {}, custom: [], lib: '' });
const LL = { cur: null, loading: null, prog: {}, q: Promise.resolve(), engine: null };

/* ---------- motor: wllama (substituível nos testes por window.__LL_ENGINE) ---------- */
const LLE = {
  w: null,
  async lib() {
    const s = LLS(); if (s.lib) return s.lib;
    try { const r = await _llFetch('llm/esm/index.js', { method: 'HEAD' }); if (r.ok && /javascript|ecmascript/.test(r.headers.get('content-type') || '')) return new URL('llm/esm/index.js', document.baseURI).href; } catch (e) { }
    return LL_LIB_CDN;
  },
  async init() {
    if (this.w) return this.w;
    const lib = await this.lib();
    let mod; try { mod = await import(/* webpackIgnore: true */ lib); } catch (e) { throw new Error('não consegui carregar a biblioteca de IA local (' + lib + '). Precisa de internet na 1ª vez. ' + (e && e.message || '')); }
    const W = mod.Wllama || mod.default; if (!W) throw new Error('biblioteca wllama inválida em ' + lib);
    const base = lib.replace(/\/[^/]*$/, '');
    this.w = new W({ 'single-thread/wllama.wasm': base + '/single-thread/wllama.wasm', 'multi-thread/wllama.wasm': base + '/multi-thread/wllama.wasm' }, { parallelDownloads: 3 });
    return this.w;
  },
  async load(url, ctx, onp) { const w = await this.init(); await w.loadModelFromUrl(url, { n_ctx: ctx, progressCallback: p => onp && onp(p.loaded, p.total) }); },
  async chat(messages, o) { const w = await this.init(); return await w.createChatCompletion(messages, { nPredict: o.max, sampling: { temp: o.temp, top_k: 40, top_p: 0.9 }, abortSignal: o.signal }); },
  async unload() { if (this.w) { try { await this.w.exit(); } catch (e) { } this.w = null; } },
  async remove(url) {
    const w = await this.init(), cm = w.cacheManager; if (!cm) return false;
    try { if (typeof cm.delete == 'function') { await cm.delete(url); return true; } } catch (e) { }
    try { const l = await cm.list(); let n = 0; for (const e of l) { const nm = e.name || ''; if ((e.metadata && e.metadata.originalURL == url) || (nm && url.indexOf(nm) >= 0)) { await cm.delete(nm); n++; } } return n > 0; } catch (e) { }
    return false;
  }
};
const llEng = () => window.__LL_ENGINE || LL.engine || LLE;

/* ---------- carregar / baixar ---------- */
const llModel = id => llById(id, LLS().custom);
function llProg(id, loaded, total) {
  LL.prog[id] = { loaded, total };
  const e = document.getElementById('llp-' + id), pct = total ? Math.min(100, Math.round(loaded / total * 100)) : 0;
  if (e) { e.querySelector('i').style.width = pct + '%'; e.querySelector('span').textContent = total ? pct + '% · ' + llMB(loaded / 1048576) + ' de ' + llMB(total / 1048576) : 'preparando…'; }
}
async function llEnsure(m, fresh) {
  if (LL.cur == m.id && !fresh) return;
  if (LL.loading) return LL.loading;
  LL.loading = (async () => {
    try {
      if (LL.cur && LL.cur != m.id) { await llEng().unload(); LL.cur = null; }
      await llEng().load(m.url, m.ctx, (a, b) => llProg(m.id, a, b));
      LL.cur = m.id;
    } finally { LL.loading = null; delete LL.prog[m.id]; }
  })();
  return LL.loading;
}
async function llDownload(id) {
  const m = llModel(id); if (!m) return;
  if (LL.prog[id] || LL.loading) return alert('Já há um download/carregamento em andamento. Aguarde terminar.');
  if (!confirm('Baixar "' + m.n + '" (' + llMB(m.mb) + ')?\n\nUse Wi-Fi. O arquivo fica guardado no app e depois roda sem internet. Não feche o app durante o download.')) return;
  LL.prog[id] = { loaded: 0, total: 0 }; cfgR();
  try {
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    await llEnsure(m, true);
    LLS().dl[id] = { t: Date.now(), mb: m.mb }; llSync(); save();
    alert('✅ "' + m.n + '" baixado e carregado. Toque em "Usar este modelo".');
  } catch (e) { alert('❌ Falha no download/carregamento: ' + (e && e.message || e) + '\n\nSe for erro de memória, escolha um modelo menor. Se for 404, confira a URL do modelo.'); }
  delete LL.prog[id]; cfgR();
}
const llSync = () => { S.models.local = Object.keys(LLS().dl).filter(k => llModel(k)); };
function llUse(id) { const m = llModel(id); if (!m) return; llSync(); S.prov = 'local'; S.model.local = id; save(); cfgR(); }
async function llTest(id) {
  const m = llModel(id); if (!m) return;
  const t0 = Date.now(); let r;
  try { r = await (await fetch('http://' + LL_HOST + '/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'Responda só com: ok, funcionando.' }], max_tokens: 24, temperature: 0.1 }) })).json(); }
  catch (e) { return alert('Teste falhou: ' + e.message); }
  if (r.error) return alert('Teste falhou: ' + r.error.message);
  const s = Math.max(0.1, (Date.now() - t0) / 1000), ct = r.usage.completion_tokens;
  alert('Resposta: ' + ((r.choices[0].message.content || '').slice(0, 120) || '(vazia)') + '\n\n' + s.toFixed(1) + ' s · ≈' + (ct / s).toFixed(1) + ' tokens/s (inclui o carregamento).');
}
async function llRemove(id) {
  const m = llModel(id); if (!m || !confirm('Apagar "' + m.n + '" do aparelho? Para usar de novo, será preciso baixar outra vez.')) return;
  try { if (LL.cur == id) { await llEng().unload(); LL.cur = null; } } catch (e) { }
  let ok = false; try { ok = await llEng().remove(m.url); } catch (e) { }
  delete LLS().dl[id]; llSync(); if (S.model.local == id) S.model.local = ''; save();
  alert(ok ? 'Modelo apagado.' : 'Marquei como não baixado, mas não consegui apagar o arquivo guardado. Para liberar o espaço: Configurações do Android → Apps → este app → Armazenamento → Limpar dados (isso apaga também seus projetos locais: exporte antes).');
  cfgR();
}
function llAddCustom() {
  const n = (prompt('Nome do modelo (ex.: Meu Qwen 1.5B)') || '').trim(); if (!n) return;
  const u = (prompt('URL direta do arquivo .gguf (Hugging Face: .../resolve/main/arquivo.gguf)') || '').trim();
  if (!/^https:\/\/.+\.gguf(\?.*)?$/i.test(u)) return alert('URL inválida: precisa ser https e terminar em .gguf');
  const mb = +prompt('Tamanho aproximado em MB (ajuda a avisar sobre memória)', '800') || 800;
  const id = 'x' + Date.now().toString(36);
  LLS().custom.push({ id, n, tier: mb > 1400 ? 3 : mb > 500 ? 2 : 1, mb, ctx: 4096, ram: '≈' + (mb * 1.4 / 1000).toFixed(1).replace('.', ',') + ' GB', url: u, d: 'Modelo que você adicionou.', custom: 1 }); save(); cfgR();
}
function llDelCustom(id) { const s = LLS(); if (s.dl[id]) return alert('Apague o download antes.'); s.custom = s.custom.filter(x => x.id != id); save(); cfgR(); }

/* ---------- fetch interno: faz o "modelo local" parecer um servidor OpenAI ---------- */
const llJson = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function llChat(b, signal) {
  const m = llModel(b.model);
  if (!m) return llErr(404, 'Modelo local desconhecido: "' + b.model + '". Escolha um em Ajustes → Modelos locais.');
  if (!LLS().dl[m.id]) return llErr(400, 'O modelo "' + m.n + '" ainda não foi baixado. Vá em Ajustes → Modelos locais → Baixar.');
  try { await llEnsure(m); } catch (e) { return llErr(500, 'Não consegui carregar "' + m.n + '": ' + (e && e.message || e)); }
  const max = Math.min(+b.max_tokens || +b.max_completion_tokens || 512, m.tier >= 3 ? 1024 : 512), msgs = llMessages(b.messages || [], b.tools, { ctx: m.ctx, max }),
    pt = msgs.reduce((a, x) => a + llEst(x.content), 0);
  let text;
  try { text = await llEng().chat(msgs, { max, temp: b.temperature == null ? 0.2 : b.temperature, signal }); }
  catch (e) { if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError'); return llErr(500, 'Erro ao gerar a resposta: ' + (e && e.message || e)); }
  return { status: 200, body: llResponse(m.id, text, b.tools, pt, llEst(text), 'stop') };
}
window.fetch = function (u, o) {
  const s = typeof u == 'string' ? u : (u && u.url) || '';
  if (s.indexOf(LL_HOST) < 0) return _llFetch(u, o);
  const sig = o && o.signal;
  if (sig && sig.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (/\/models\b/.test(s)) { const d = LLS().dl; return Promise.resolve(llJson(200, { data: Object.keys(d).filter(k => llModel(k)).map(k => ({ id: k })) })); }
  if (/\/chat\/completions/.test(s)) {
    let b; try { b = JSON.parse(o.body); } catch (e) { return Promise.resolve(llJson(400, llErr(400, 'pedido inválido').body)); }
    /* uma geração por vez (sub-agentes em paralelo esperam a vez) */
    const run = LL.q.then(() => llChat(b, sig)); LL.q = run.catch(() => { });
    return run.then(r => llJson(r.status, r.body));
  }
  return Promise.resolve(llJson(404, llErr(404, 'rota desconhecida').body));
};

/* ---------- Ajustes ---------- */
function llCardH(m) {
  const S_ = LLS(), dl = !!S_.dl[m.id], pr = LL.prog[m.id], use = S.prov == 'local' && S.model.local == m.id, warn = m.mb > 1500;
  const tier = ['', '🟢', '🟡', '🟠'][m.tier] + ' ' + LL_TIERS[m.tier];
  let act;
  if (pr) act = '<div id="llp-' + m.id + '" style="background:var(--b,#ccc4);border-radius:8px;overflow:hidden;position:relative;height:22px"><i style="display:block;height:100%;width:' + (pr.total ? Math.round(pr.loaded / pr.total * 100) : 0) + '%;background:var(--a,#d9663b)"></i><span style="position:absolute;inset:0;text-align:center;font-size:12px;line-height:22px">' + (dl ? 'carregando…' : 'baixando…') + '</span></div>';
  else if (!dl) act = '<button class="p" onclick="llDownload(\'' + m.id + '\')">⬇ Baixar (' + llMB(m.mb) + ')</button>' + (m.custom ? '<button class="s" onclick="llDelCustom(\'' + m.id + '\')">🗑 Tirar da lista</button>' : '');
  else act = (use ? '<button class="s" disabled>✅ Em uso</button>' : '<button class="p" onclick="llUse(\'' + m.id + '\')">▶ Usar este modelo</button>') + '<button class="s" onclick="llTest(\'' + m.id + '\')">🧪 Testar</button><button class="s" onclick="llRemove(\'' + m.id + '\')">🗑 Apagar</button>';
  return '<div class="f" style="font-size:13px"><b>' + esc(m.n) + '</b> · ' + tier + (dl ? ' · ✅ baixado' : '') + '<br><span style="color:var(--m)">' + esc(m.d) + ' ' + llMB(m.mb) + ' de download · memória ' + esc(m.ram) + (warn ? ' · ⚠️ pode travar em celulares com pouca RAM' : '') + '</span><div class="r" style="margin-top:6px">' + act + '</div></div>';
}
function llCfgH() {
  const all = LL_CATALOG.concat(LLS().custom);
  return '<label>🧠 Modelos locais (rodam neste aparelho, sem internet depois de baixar)</label>'
    + '<div class="f" style="font-size:13px;color:var(--m)">Só modelos pequenos, que cabem num celular. Rodam na CPU: espere de ~2 a ~10 palavras por segundo nos menores e bem menos nos "médios". Erram bastante e usam ferramentas pior que os modelos da nuvem; use para conversa, resumos e tarefas simples. Precisa de internet só para baixar.</div>'
    + all.map(llCardH).join('')
    + '<div class="r"><button class="s" onclick="llAddCustom()">＋ Adicionar outro .gguf por URL</button></div><div id="llst" style="font-size:12px;color:var(--m)"></div>';
}
async function llStorage() { try { const e = await navigator.storage.estimate(), x = document.getElementById('llst'); if (x) x.textContent = 'Armazenamento do app: ' + llMB(e.usage / 1048576) + ' usados de ~' + llMB(e.quota / 1048576) + ' disponíveis.'; } catch (e) { } }
{ const _c = cfgR; cfgR = function () { _c(); const f = $('#cfg .f'); if (f) f.insertAdjacentHTML('afterend', llCfgH()); else $('#cfg').insertAdjacentHTML('beforeend', llCfgH()); llStorage(); }; }
