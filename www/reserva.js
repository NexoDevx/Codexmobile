/* reserva.js — modelos reserva: se o provedor principal bater o limite (ou cair), o app troca sozinho
   para o próximo da lista e volta ao principal quando o "castigo" acabar.
   - Cada provedor reserva usa a PRÓPRIA chave e o PRÓPRIO modelo já guardados no app (S.keys / S.model);
     nenhuma chave é copiada para outro lugar.
   - A lista fica em S.res = [{p:'openai'}, {p:'groq'}…] e é editada em Ajustes → "Modelos reserva".
   - Troca "pegajosa": muda S.prov de verdade (assim chamadas em paralelo, como sub-agentes, ficam coerentes)
     e S.rmain guarda o provedor que o usuário escolheu, para voltar a ele depois.                         */
const RES = (() => {
  'use strict';
  // erros em que trocar de provedor ajuda: limite, cota, crédito, sobrecarga, chave inválida, rede
  const LIMITE = /rate.?limit|too many requests|quota|insufficient|credit|billing|balance|overload|capacity|resource.?exhausted|unavailable|temporarily|tokens? per|limit reached|usage limit|out of (credits|tokens)|\b(429|402|500|502|503|504|529)\b|timeout|timed out|failed to fetch|fetch failed|load failed|network/i;
  const CHAVE = /invalid.{0,12}api.?key|incorrect api key|api key (not valid|missing)|unauthori[sz]ed|authentication|permission.?denied|forbidden|\b(401|403)\b/i;
  const COTA = /quota|credit|billing|balance|insufficient|daily|per day|out of (credits|tokens)|usage limit|resource.?exhausted/i;
  // erros que outro provedor NÃO resolve (pedido grande demais, política de conteúdo): deixa o app tratar
  const OUTRO = /context.{0,20}(length|window)|too long|maximum.{0,20}length|prompt is too long|safety|content.?policy|invalid_request|bad request/i;

  const lista = () => (S.res || []).filter(r => r && P[r.p]);
  const temChave = p => !!(S.keys && S.keys[p]) || !!(P[p] && P[p].nk) || (p == 'custom' && !!(S.urls && S.urls.custom));
  const usavel = p => !!P[p] && temChave(p) && !!(S.model && S.model[p]);
  const esfriado = p => ((S.rcool || {})[p] || 0) > Date.now();
  const nome = p => (P[p] && P[p].n) || p;

  function classificar(e) {
    const m = String((e && e.message) || e || '');
    if (e && (e.name == 'AbortError' || /abort/i.test(m))) return 'abortar';
    if (CHAVE.test(m)) return 'chave';
    if (OUTRO.test(m) && !/rate.?limit|quota|credit|overload/i.test(m)) return 'outro';
    return LIMITE.test(m) ? (COTA.test(m) ? 'cota' : 'limite') : 'outro';
  }
  function esfriar(p, tipo) {
    const min = tipo == 'cota' ? 30 : tipo == 'chave' ? 120 : 3;
    (S.rcool = S.rcool || {})[p] = Date.now() + min * 60000;
  }
  function aviso(txt) {
    (S.rlog = S.rlog || []).push(new Date().toTimeString().slice(0, 5) + ' ' + txt); S.rlog = S.rlog.slice(-8);
    if (typeof ST != 'undefined') { ST = '🔁 ' + txt; try { ui(); } catch (_) { /* sem tela */ } }
    save();
  }
  // ordem de tentativa: o principal escolhido pelo usuário e depois as reservas utilizáveis
  function ordem() {
    const main = S.rmain || S.prov, o = [main];
    for (const r of lista()) if (!o.includes(r.p) && usavel(r.p)) o.push(r.p);
    return o;
  }
  function trocar(p) {
    if (!S.rmain) { S.rmain = S.prov; S.rfm = S.fm; S.rdm = S.dm; }   // lembra do principal e dos modelos rápido/profundo dele
    S.fm = ''; S.dm = '';                                              // esses nomes são do provedor principal
    S.prov = p; S.ract = p; save();
  }
  function voltar() {
    if (!S.rmain) return;
    S.prov = S.rmain; S.fm = S.rfm; S.dm = S.rdm;
    S.rmain = S.ract = S.rfm = S.rdm = null; save();
  }
  function sincronizar() {
    if (S.rmain && S.prov !== S.ract) { S.rmain = S.ract = S.rfm = S.rdm = null; }       // o usuário escolheu outro provedor à mão
    if (S.rmain && !esfriado(S.rmain)) { const de = S.prov; voltar(); aviso('voltou para ' + nome(S.prov) + ' (limite de ' + nome(de) + ' liberado)'); }
  }

  let _llm = null;
  async function chamar(h, tl, sy, nt) {
    if (!lista().length && !S.rmain) return _llm(h, tl, sy, nt);          // sem reservas: comportamento original, intacto
    sincronizar();
    const tentados = new Set(); let ultimo = null;
    for (;;) {
      const atual = S.prov; tentados.add(atual);
      try { return await _llm(h, tl, sy, nt); }
      catch (e) {
        const tipo = classificar(e);
        if (tipo == 'abortar' || tipo == 'outro') throw e;
        ultimo = e; esfriar(atual, tipo);
        const prox = ordem().find(p => !tentados.has(p) && !esfriado(p));
        if (!prox) {
          if (tentados.size > 1) e.message += '\n(Todos os provedores da lista falharam: ' + [...tentados].map(nome).join(', ') + ')';
          throw e;
        }
        trocar(prox);
        aviso(nome(atual) + (tipo == 'cota' ? ' sem cota/crédito' : tipo == 'chave' ? ' recusou a chave' : ' no limite/indisponível') + ' → usando ' + nome(prox));
      }
    }
  }

  /* ---------- painel em Ajustes ---------- */
  function mover(i, d) { const L = lista(), j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; S.res = L; save(); cfgR(); }
  const api = {
    add(p) { if (!P[p] || lista().some(r => r.p == p)) return; S.res = [...lista(), { p }]; save(); cfgR(); },
    del(i) { const L = lista(); L.splice(i, 1); S.res = L; save(); cfgR(); },
    up: i => mover(i, -1), down: i => mover(i, 1),
    key(p, v) { (S.keys = S.keys || {})[p] = String(v).trim(); save(); cfgR(); },
    model(p, v) { (S.model = S.model || {})[p] = String(v).trim(); save(); cfgR(); },
    reset() { S.rcool = {}; voltar(); save(); cfgR(); }
  };
  function painel() {
    const L = lista(), main = S.rmain || S.prov;
    const opc = Object.entries(P).filter(([k]) => k != main && !L.some(r => r.p == k)).map(([k, v]) => '<option value="' + k + '">' + esc(v.n) + '</option>').join('');
    const linhas = L.map((r, i) => {
      const ok = usavel(r.p), frio = esfriado(r.p);
      return '<div style="border:1px solid var(--bd,#3333);border-radius:8px;padding:6px;margin:6px 0">' +
        '<div class="r"><b style="flex:1">' + (i + 1) + '. ' + esc(nome(r.p)) + ' ' + (ok ? (frio ? '⏳' : '✅') : '⚠️') + '</b>' +
        '<button class="s" onclick="RES.up(' + i + ')">↑</button><button class="s" onclick="RES.down(' + i + ')">↓</button><button class="s" onclick="RES.del(' + i + ')">✕</button></div>' +
        '<input type="password" placeholder="chave de API de ' + esc(nome(r.p)) + '" value="' + esc((S.keys || {})[r.p] || '') + '" onchange="RES.key(\'' + r.p + '\',this.value)">' +
        '<input placeholder="nome do modelo" value="' + esc((S.model || {})[r.p] || '') + '" onchange="RES.model(\'' + r.p + '\',this.value)">' +
        (ok ? '' : '<small>Preencha chave e modelo para esta reserva valer.</small>') + (frio ? '<small>Em espera até ' + new Date(S.rcool[r.p]).toTimeString().slice(0, 5) + ' (limite recente).</small>' : '') + '</div>';
    }).join('');
    const st = S.rmain ? '<small>▶ Agora usando <b>' + esc(nome(S.prov)) + '</b>; volta para ' + esc(nome(S.rmain)) + ' quando o limite liberar. <a href="#" onclick="RES.reset();return false">voltar agora</a></small>' : '';
    const lg = (S.rlog || []).length ? '<small>' + S.rlog.slice(-3).map(esc).join('<br>') + '</small>' : '';
    return '<label>🔁 Modelos reserva</label><small>Quando o principal (' + esc(nome(main)) + ') bater o limite, ficar sem crédito ou cair, o app troca sozinho para o próximo da lista. Cada reserva usa a própria chave e o próprio modelo.</small>' +
      (linhas || '<small>Nenhuma reserva ainda.</small>') +
      (opc ? '<div class="r"><select id="rs-add" style="flex:1">' + opc + '</select><button class="s" onclick="RES.add(document.getElementById(\'rs-add\').value)">➕ Adicionar</button></div>' : '') + st + lg;
  }

  function instalar() {
    _llm = llm;
    llm = async function (h, tl, sy, nt) { return chamar(h, tl, sy, nt); };
    if (typeof cfgR == 'function') {
      const _cfg = cfgR;
      cfgR = function () { _cfg(); const el = typeof $ == 'function' && $('#cfg'); if (el) el.insertAdjacentHTML('beforeend', painel()); };
    }
  }
  if (typeof llm == 'function' && typeof S == 'object' && typeof P == 'object') instalar();
  return Object.assign(api, { classificar, ordem, usavel, esfriado, sincronizar, chamar, painel, instalar });
})();
