/* localcore.js — núcleo dos modelos locais (sem DOM): catálogo, montagem do prompt com ferramentas,
   leitura das chamadas de ferramenta e corte do contexto. Testável em Node. */
const LL_HF = (repo, file) => 'https://huggingface.co/' + repo + '/resolve/main/' + file;
const LL_TIERS = { 1: 'Muito fraco', 2: 'Fraco', 3: 'Médio' };
/* Catálogo: só modelos pequenos (rodam na CPU do celular via WebAssembly). mb = tamanho aproximado do download. */
const LL_CATALOG = [
  { id: 'smollm2-135m', n: 'SmolLM2 135M', tier: 1, mb: 145, ctx: 2048, ram: '≈0,4 GB', url: LL_HF('HuggingFaceTB/SmolLM2-135M-Instruct-GGUF', 'smollm2-135m-instruct-q8_0.gguf'), d: 'Minúsculo: bate-papo básico e testes. Erra muito; não use para código.' },
  { id: 'smollm2-360m', n: 'SmolLM2 360M', tier: 1, mb: 386, ctx: 2048, ram: '≈0,8 GB', url: LL_HF('HuggingFaceTB/SmolLM2-360M-Instruct-GGUF', 'smollm2-360m-instruct-q8_0.gguf'), d: 'Muito leve. Respostas curtas e resumos simples.' },
  { id: 'qwen2.5-0.5b', n: 'Qwen2.5 0.5B Instruct', tier: 1, mb: 400, ctx: 4096, ram: '≈1 GB', url: LL_HF('Qwen/Qwen2.5-0.5B-Instruct-GGUF', 'qwen2.5-0.5b-instruct-q4_k_m.gguf'), d: 'O melhor dos muito leves; entende português razoavelmente.' },
  { id: 'llama3.2-1b', n: 'Llama 3.2 1B Instruct', tier: 2, mb: 810, ctx: 4096, ram: '≈1,5 GB', url: LL_HF('bartowski/Llama-3.2-1B-Instruct-GGUF', 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'), d: 'Conversa e explicações simples, em vários idiomas.' },
  { id: 'gemma3-1b', n: 'Gemma 3 1B', tier: 2, mb: 810, ctx: 4096, ram: '≈1,5 GB', url: LL_HF('ggml-org/gemma-3-1b-it-GGUF', 'gemma-3-1b-it-Q4_K_M.gguf'), d: 'Boa escrita para o tamanho; bom em português.' },
  { id: 'qwen2.5-1.5b', n: 'Qwen2.5 1.5B Instruct', tier: 2, mb: 1100, ctx: 4096, ram: '≈2 GB', url: LL_HF('Qwen/Qwen2.5-1.5B-Instruct-GGUF', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'), d: 'Equilibrado: conversa, resumos e alguma lógica.' },
  { id: 'qwen2.5-coder-1.5b', n: 'Qwen2.5 Coder 1.5B', tier: 3, mb: 1100, ctx: 4096, ram: '≈2 GB', url: LL_HF('Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF', 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'), d: 'Focado em código: trechos, explicações e correções pequenas.' },
  { id: 'gemma2-2b', n: 'Gemma 2 2B Instruct', tier: 3, mb: 1700, ctx: 4096, ram: '≈2,5 GB', url: LL_HF('bartowski/gemma-2-2b-it-GGUF', 'gemma-2-2b-it-Q4_K_M.gguf'), d: 'Médio: respostas melhores, mas lento no celular.' },
  { id: 'qwen2.5-3b', n: 'Qwen2.5 3B Instruct', tier: 3, mb: 1930, ctx: 4096, ram: '≈3,5 GB', url: LL_HF('Qwen/Qwen2.5-3B-Instruct-GGUF', 'qwen2.5-3b-instruct-q4_k_m.gguf'), d: 'O maior do catálogo. Só em celular com 8 GB de RAM ou mais; pode travar.' }
];
const llById = (id, custom) => LL_CATALOG.concat(custom || []).find(m => m.id == id);
const llEst = s => Math.ceil(String(s || '').length / 3.2);          // tokens ≈ caracteres / 3,2
const llCut = (s, n) => { s = String(s == null ? '' : s); return s.length <= n ? s : s.slice(0, Math.floor(n * 0.6)) + '\n[…cortado…]\n' + s.slice(-Math.floor(n * 0.4)); };

/* lista compacta de ferramentas para o prompt (modelos pequenos não aguentam o JSON schema inteiro) */
function llToolsText(tools) {
  if (!tools || !tools.length) return '';
  const L = tools.map(t => {
    const f = t.function || t, pr = (f.parameters && f.parameters.properties) || {}, rq = (f.parameters && f.parameters.required) || [];
    const a = Object.keys(pr).map(k => k + (rq.includes(k) ? '' : '?')).join(', ');
    return '- ' + f.name + '(' + a + '): ' + String(f.description || '').replace(/\s+/g, ' ').slice(0, 110);
  }).join('\n');
  return '\n\nTools you can call:\n' + L + '\nTo use a tool, reply ONLY with <tool_call>{"name":"TOOL","arguments":{...}}</tool_call> (one call per reply) and wait for the <tool_response>. If no tool is needed, answer normally in the user\'s language.';
}
/* mensagens do app (formato OpenAI, com tool_calls/tool) → só system/user/assistant, que qualquer template aceita */
function llMessages(msgs, tools, o) {
  o = o || {};
  const sysMax = o.sysMax || 2400, msgMax = o.msgMax || 2500;
  let sys = '', out = [];
  for (const m of msgs) {
    if (m.role == 'system') { sys += (sys ? '\n' : '') + (typeof m.content == 'string' ? m.content : (m.content || []).map(c => c.text || '').join('')); continue; }
    let c = typeof m.content == 'string' ? m.content : Array.isArray(m.content) ? m.content.map(x => x.text || '').join('') : String(m.content || '');
    if (m.role == 'assistant' && m.tool_calls && m.tool_calls.length)
      c = (c ? c + '\n' : '') + m.tool_calls.map(t => '<tool_call>' + JSON.stringify({ name: t.function.name, arguments: safeJson(t.function.arguments) }) + '</tool_call>').join('\n');
    if (m.role == 'tool') { out.push({ role: 'user', content: '<tool_response>\n' + llCut(c, msgMax) + '\n</tool_response>' }); continue; }
    out.push({ role: m.role == 'assistant' ? 'assistant' : 'user', content: llCut(c, msgMax) });
  }
  const sysText = llCut(sys, sysMax) + llToolsText(tools);
  /* o corte: mantém o system e as últimas mensagens que cabem no orçamento */
  const budget = (o.ctx || 4096) - (o.max || 512) - 120 - llEst(sysText);
  let used = 0, keep = [];
  for (let i = out.length - 1; i >= 0; i--) { const t = llEst(out[i].content) + 6; if (used + t > budget && keep.length) break; used += t; keep.unshift(out[i]); }
  /* junta mensagens consecutivas do mesmo papel (alguns templates exigem alternância) e garante que começa em "user" */
  const merged = [];
  for (const m of keep) { const l = merged[merged.length - 1]; if (l && l.role == m.role) l.content += '\n\n' + m.content; else merged.push({ ...m }); }
  while (merged.length && merged[0].role != 'user') merged.shift();
  if (!merged.length) merged.push({ role: 'user', content: '(vazio)' });
  return [{ role: 'system', content: sysText }, ...merged];
}
function safeJson(s) { if (s && typeof s == 'object') return s; try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
/* acha chamadas de ferramenta no texto gerado; só aceita nomes que existem em tools */
function llParse(text, tools) {
  const names = new Set((tools || []).map(t => (t.function || t).name)), calls = [];
  let rest = String(text || '');
  const take = (raw) => {
    let j; raw = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { j = JSON.parse(raw); } catch (e) { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); if (a >= 0 && b > a) { try { j = JSON.parse(raw.slice(a, b + 1)); } catch (e2) { } } }
    if (!j || typeof j != 'object') return false;
    const nm = j.name || (j.function && j.function.name), ar = j.arguments || j.parameters || j.args || (j.function && j.function.arguments) || {};
    if (!nm || !names.has(nm)) return false;
    calls.push({ id: 'call_' + Math.random().toString(36).slice(2, 10), type: 'function', function: { name: nm, arguments: typeof ar == 'string' ? ar : JSON.stringify(ar) } });
    return true;
  };
  rest = rest.replace(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g, (m, raw) => take(raw) ? '' : m);
  if (!calls.length) { const t = rest.trim(); if (/^\{[\s\S]*\}$/.test(t) && take(t)) rest = ''; }
  return { text: rest.replace(/<\/?tool_call>/g, '').trim(), calls };
}
/* resposta no formato da API da OpenAI */
function llResponse(model, text, tools, pt, ct, stop) {
  const p = tools && tools.length ? llParse(text, tools) : { text: String(text || '').trim(), calls: [] };
  const msg = { role: 'assistant', content: p.text || (p.calls.length ? null : '') };
  if (p.calls.length) msg.tool_calls = p.calls;
  return { id: 'chatcmpl-local', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: msg, finish_reason: p.calls.length ? 'tool_calls' : (stop || 'stop') }], usage: { prompt_tokens: pt || 0, completion_tokens: ct || 0, total_tokens: (pt || 0) + (ct || 0) } };
}
const llErr = (status, message) => ({ status, body: { error: { message, type: 'local_model_error' } } });
const llMB = mb => mb >= 1000 ? (mb / 1000).toFixed(1).replace('.', ',') + ' GB' : Math.round(mb) + ' MB';
if (typeof module != 'undefined') module.exports = { LL_CATALOG, LL_TIERS, llById, llEst, llCut, llToolsText, llMessages, llParse, llResponse, llErr, llMB };
