/* provedores.js — provedores de IA extras (quase todos compatíveis com a API da OpenAI) e metadados de todos.
   É carregado ANTES do app.js, que junta tudo na tabela P.
   Campos: n nome · u URL base · g grupo (free|trial|paid|local) · l página para criar a chave · h dica
           m modelos sugeridos (usados até você tocar em "Buscar modelos") · nk chave opcional · id precisa do Account ID
           ml função que devolve a URL que lista os modelos (quando não é <base>/models)
   Os limites grátis mudam com frequência: confira na página de cada provedor. */
const PROV_GROUPS = {
  free:  '🆓 Grátis (plano gratuito permanente)',
  trial: '🎁 Créditos de teste / grátis com limites',
  paid:  '💳 Pagos',
  local: '🏠 Local e personalizado'
};
/* metadados dos provedores que já existiam */
const PROV_META = {
  anthropic:  { g: 'paid', l: 'https://console.anthropic.com/settings/keys', m: ['claude-sonnet-4-5', 'claude-opus-4-1'] },
  openai:     { g: 'paid', l: 'https://platform.openai.com/api-keys', m: ['gpt-4.1', 'gpt-4.1-mini'] },
  gemini:     { n: 'Gemini (Google AI Studio)', g: 'free', l: 'https://aistudio.google.com/apikey', h: 'Plano grátis sem cartão (limites por minuto/dia por modelo). No plano grátis o Google pode usar os prompts para melhorar produtos.', m: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  groq:       { g: 'free', l: 'https://console.groq.com/keys', h: 'Grátis sem cartão, muito rápido (≈30 req/min, ~1.000/dia nos modelos de chat).', m: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] },
  openrouter: { g: 'free', l: 'https://openrouter.ai/keys', h: 'Modelos com final ":free" não gastam crédito (≈20 req/min e 50/dia; 1.000/dia depois de comprar US$10 uma vez). "Buscar modelos" lista os grátis primeiro. "openrouter/free" escolhe um grátis sozinho.', m: ['openrouter/free', 'qwen/qwen3-coder:free', 'openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free'] },
  deepseek:   { g: 'paid', l: 'https://platform.deepseek.com/api_keys', h: 'Muito barato; costuma dar crédito inicial.', m: ['deepseek-chat'] },
  mistral:    { g: 'free', l: 'https://console.mistral.ai/api-keys', h: 'Plano "Experiment" grátis (exige aceitar que os dados possam treinar modelos; dá para desligar).', m: ['mistral-small-latest', 'codestral-latest'] },
  xai:        { g: 'paid', l: 'https://console.x.ai', m: ['grok-4'] },
  together:   { g: 'paid', l: 'https://api.together.xyz/settings/api-keys', m: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'] },
  custom:     { g: 'local', h: 'Qualquer servidor compatível com a API da OpenAI (/chat/completions): Ollama, LM Studio, vLLM, LiteLLM, seu próprio proxy… Preencha a URL base. A chave só é necessária se o servidor pedir.' }
};
/* provedores novos */
const PROV_EXTRA = {
  nvidia:      { n: 'NVIDIA NIM (build.nvidia.com)', u: 'https://integrate.api.nvidia.com/v1', g: 'free', l: 'https://build.nvidia.com/settings/api-keys',
                 h: 'Grátis com conta de desenvolvedor NVIDIA (sem cartão): ~40 req/min. A chave começa com nvapi-. Nem todo modelo faz chamadas de ferramenta; os de código/instruct grandes funcionam melhor.',
                 m: ['meta/llama-3.3-70b-instruct', 'openai/gpt-oss-120b', 'qwen/qwen3-coder-480b-a35b-instruct', 'moonshotai/kimi-k2-instruct', 'meta/llama-3.1-8b-instruct'] },
  cloudflare:  { n: 'Cloudflare Workers AI', u: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1', g: 'free', id: 1, l: 'https://dash.cloudflare.com/profile/api-tokens',
                 h: 'Grátis: 10.000 "neurons" por dia (sem cartão). Crie um token de API com o modelo "Workers AI" e copie o Account ID (painel da Cloudflare → Workers AI). Preencha o Account ID abaixo.',
                 m: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/openai/gpt-oss-120b', '@cf/openai/gpt-oss-20b', '@cf/qwen/qwen2.5-coder-32b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
                 ml: base => base.replace(/\/ai\/v1\/?$/, '/ai/models/search?task=Text%20Generation&per_page=100') },
  cerebras:    { n: 'Cerebras', u: 'https://api.cerebras.ai/v1', g: 'free', l: 'https://cloud.cerebras.ai',
                 h: 'Grátis, extremamente rápido (~30 req/min e cerca de 1M tokens/dia, conforme o modelo).', m: ['gpt-oss-120b', 'llama-3.3-70b'] },
  github:      { n: 'GitHub Models', u: 'https://models.github.ai/inference', g: 'free', l: 'https://github.com/settings/personal-access-tokens/new',
                 h: 'Grátis com sua conta GitHub (limites diários baixos). Crie um token (fine-grained) com a permissão "Models: read" e cole como chave. Os modelos usam o formato publicador/nome.',
                 m: ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'meta/Llama-3.3-70B-Instruct', 'deepseek/DeepSeek-V3-0324'],
                 ml: () => 'https://models.github.ai/catalog/models' },
  huggingface: { n: 'Hugging Face (Inference Providers)', u: 'https://router.huggingface.co/v1', g: 'free', l: 'https://huggingface.co/settings/tokens',
                 h: 'Crédito mensal grátis pequeno; depois é pago por uso. Crie um token com permissão "Make calls to Inference Providers". Dá para escolher o provedor com sufixo no modelo (ex.: :cerebras).',
                 m: ['openai/gpt-oss-120b', 'Qwen/Qwen3-Coder-480B-A35B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3.1'] },
  zhipu:       { n: 'Zhipu GLM (open.bigmodel.cn)', u: 'https://open.bigmodel.cn/api/paas/v4', g: 'free', l: 'https://open.bigmodel.cn/usercenter/apikeys',
                 h: 'Modelos "-flash" são grátis (1 requisição simultânea). Painel em chinês.', m: ['glm-4.5-flash', 'glm-4.7-flash'] },
  zai:         { n: 'Z.ai GLM (internacional)', u: 'https://api.z.ai/api/paas/v4', g: 'free', l: 'https://z.ai/manage-apikey/apikey-list',
                 h: 'Mesmos modelos GLM grátis (-flash) com painel em inglês.', m: ['glm-4.5-flash', 'glm-4.7-flash'] },
  codestral:   { n: 'Mistral Codestral (grátis p/ código)', u: 'https://codestral.mistral.ai/v1', g: 'free', l: 'https://console.mistral.ai/codestral',
                 h: 'Endpoint próprio do Codestral, com chave própria (grátis enquanto em beta, exige telefone).', m: ['codestral-latest'] },
  siliconflow: { n: 'SiliconFlow', u: 'https://api.siliconflow.cn/v1', g: 'free', l: 'https://cloud.siliconflow.cn/account/ak',
                 h: 'Alguns modelos pequenos (ex.: Qwen3-8B) são grátis. Pede verificação de identidade. Conta internacional: troque a URL por https://api.siliconflow.com/v1.', m: ['Qwen/Qwen3-8B'] },
  llm7:        { n: 'LLM7.io (sem cadastro)', u: 'https://api.llm7.io/v1', g: 'free', nk: 1, l: 'https://token.llm7.io',
                 h: 'Funciona sem chave (modelos "turbo"). Com um token grátis o limite sobe (~60 req/min).', m: ['gpt-oss:20b'] },
  ovh:         { n: 'OVHcloud AI Endpoints (sem cadastro)', u: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', g: 'free', nk: 1, l: 'https://endpoints.ai.cloud.ovh.net',
                 h: 'Anônimo: sem chave, mas só 2 req/min por modelo. Com conta e chave o limite é maior.', m: ['gpt-oss-120b', 'Meta-Llama-3_3-70B-Instruct'] },
  kilo:        { n: 'Kilo Gateway (modelos grátis, sem chave)', u: 'https://api.kilo.ai/api/gateway', g: 'free', nk: 1, l: 'https://kilo.ai',
                 h: 'Sem chave: ~200 req/hora por IP em modelos marcados ":free".', m: ['kilo-auto/free'] },
  pollinations:{ n: 'Pollinations (texto, sem chave)', u: 'https://text.pollinations.ai/openai', g: 'free', nk: 1, l: 'https://auth.pollinations.ai',
                 h: 'Sem chave nem cadastro; qualidade e velocidade variam e as chamadas de ferramenta são menos confiáveis.', m: ['openai'] },
  modelscope:  { n: 'ModelScope (Alibaba)', u: 'https://api-inference.modelscope.cn/v1', g: 'free', l: 'https://modelscope.cn/my/myaccesstoken',
                 h: '~2.000 req/dia grátis, mas exige conta Alibaba Cloud vinculada e verificação.', m: ['Qwen/Qwen3.5-27B'] },
  ollamacloud: { n: 'Ollama Cloud', u: 'https://ollama.com/v1', g: 'free', l: 'https://ollama.com/settings/keys',
                 h: 'Plano grátis com limite por sessão (renova a cada 5 horas) e por semana.', m: ['gpt-oss:120b', 'gpt-oss:20b'] },
  sambanova:   { n: 'SambaNova', u: 'https://api.sambanova.ai/v1', g: 'trial', l: 'https://cloud.sambanova.ai/apis',
                 h: 'Rápido. Dá créditos de teste (e plano grátis com limites baixos).', m: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-V3.1', 'gpt-oss-120b'] },
  cohere:      { n: 'Cohere (chave trial grátis)', u: 'https://api.cohere.ai/compatibility/v1', g: 'trial', l: 'https://dashboard.cohere.com/api-keys',
                 h: 'Chave "trial" grátis: ~20 req/min e ~1.000 chamadas por mês, só uso não comercial.', m: ['command-a-03-2025', 'command-r-plus-08-2024'] },
  dashscope:   { n: 'Alibaba Qwen (DashScope, internacional)', u: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', g: 'trial', l: 'https://modelstudio.console.alibabacloud.com',
                 h: 'Cota grátis para contas novas (por modelo, por tempo limitado).', m: ['qwen-plus', 'qwen3-coder-plus', 'qwen-flash'] },
  fireworks:   { n: 'Fireworks AI', u: 'https://api.fireworks.ai/inference/v1', g: 'trial', l: 'https://fireworks.ai/account/api-keys',
                 h: 'Crédito inicial pequeno; depois pago por uso.', m: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct'] },
  hyperbolic:  { n: 'Hyperbolic', u: 'https://api.hyperbolic.xyz/v1', g: 'trial', l: 'https://app.hyperbolic.xyz/settings',
                 h: 'Crédito de teste ao criar a conta; depois pago por uso.', m: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-Coder-480B-A35B-Instruct'] },
  deepinfra:   { n: 'DeepInfra', u: 'https://api.deepinfra.com/v1/openai', g: 'trial', l: 'https://deepinfra.com/dash/api_keys',
                 h: 'Muito barato; costuma ter um pequeno crédito/limite gratuito.', m: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-Coder-480B-A35B-Instruct'] },
  novita:      { n: 'Novita AI', u: 'https://api.novita.ai/v3/openai', g: 'trial', l: 'https://novita.ai/settings/key-management',
                 h: 'Crédito de boas-vindas; depois pago por uso.', m: ['meta-llama/llama-3.3-70b-instruct', 'qwen/qwen3-coder-480b-a35b-instruct'] },
  scaleway:    { n: 'Scaleway Generative APIs', u: 'https://api.scaleway.ai/v1', g: 'trial', l: 'https://console.scaleway.com/iam/api-keys',
                 h: 'Cerca de 1 milhão de tokens grátis para contas novas (servidores na Europa).', m: ['llama-3.3-70b-instruct', 'qwen3-coder-30b-a3b-instruct', 'gpt-oss-120b'] },
  chutes:      { n: 'Chutes', u: 'https://llm.chutes.ai/v1', g: 'trial', l: 'https://chutes.ai',
                 h: 'Rede comunitária de modelos abertos; planos baratos/por crédito.', m: ['deepseek-ai/DeepSeek-V3-0324'] },
  local:       { n: 'Modelo local (roda neste aparelho)', u: 'http://cm-local.invalid/v1', g: 'local', nk: 1,
                 h: 'Roda dentro do app, sem internet e sem custo, depois de baixar um modelo pequeno (veja "Modelos locais" logo abaixo). Lento e menos esperto que os da nuvem: bom para conversa, resumos e tarefas simples.', m: [] },
  ollama:      { n: 'Ollama (neste aparelho / rede)', u: 'http://localhost:11434/v1', g: 'local', nk: 1,
                 h: 'Rode `ollama serve` no Termux ou no seu PC (use o IP do PC na URL, ex.: http://192.168.0.10:11434/v1). Sem chave. Baixe um modelo com `ollama pull qwen2.5-coder:7b` e toque em "Buscar modelos".', m: [] },
  lmstudio:    { n: 'LM Studio (no PC, rede local)', u: 'http://localhost:1234/v1', g: 'local', nk: 1,
                 h: 'No LM Studio, ligue o servidor local e "Serve on Local Network"; use o IP do PC na URL. Sem chave.', m: [] }
};
/* junta metadados + extras numa tabela única, na ordem: o que já existia e depois os novos */
function provBuild(base) {
  const P = {};
  for (const k in base) P[k] = Object.assign({}, base[k], PROV_META[k] || {});
  for (const k in PROV_EXTRA) if (!P[k]) P[k] = Object.assign({}, PROV_EXTRA[k]);
  for (const k in P) if (!P[k].g) P[k].g = 'paid';
  return P;
}
/* <option> agrupados por tipo (grátis, créditos, pagos, local) */
function provOptions(P, sel, skip) {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return Object.keys(PROV_GROUPS).map(g => {
    const it = Object.entries(P).filter(([k, v]) => v.g == g && k != skip);
    return it.length ? '<optgroup label="' + esc(PROV_GROUPS[g]) + '">' + it.map(([k, v]) => '<option value="' + k + '"' + (k == sel ? ' selected' : '') + '>' + esc(v.n) + '</option>').join('') + '</optgroup>' : '';
  }).join('');
}
/* substitui {ACCOUNT_ID} (Cloudflare) pela id guardada */
const provFill = (u, id) => String(u || '').replace('{ACCOUNT_ID}', (id || '').trim() || '{ACCOUNT_ID}');
/* normaliza a resposta de "listar modelos" de formatos diferentes (OpenAI, array puro, Cloudflare {result:[{name}]}) */
function provModels(j) {
  const a = Array.isArray(j) ? j : j && (j.data || j.models || j.result) || [];
  return a.map(m => typeof m == 'string' ? m : (m.id || m.name || '')).filter(Boolean).map(s => s.replace(/^models\//, ''));
}
if (typeof module != 'undefined') module.exports = { PROV_GROUPS, PROV_META, PROV_EXTRA, provBuild, provOptions, provFill, provModels };
