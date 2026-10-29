// Testes da tabela de provedores (provedores.js): integridade, grupos, Cloudflare (Account ID e listagem), formatos de listagem de modelos
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {fileURLToPath} from 'node:url';const W=fileURLToPath(new URL('../www/',import.meta.url));
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(W+'provedores.js','utf8')+';this.X={PROV_GROUPS,PROV_META,PROV_EXTRA,provBuild,provOptions,provFill,provModels};',ctx);const X=ctx.X;
const BASE={anthropic:{n:'Claude',u:'https://api.anthropic.com/v1',a:1},openai:{n:'ChatGPT',u:'https://api.openai.com/v1'},gemini:{n:'Gemini',u:'https://generativelanguage.googleapis.com/v1beta/openai'},groq:{n:'Groq',u:'https://api.groq.com/openai/v1'},openrouter:{n:'OpenRouter',u:'https://openrouter.ai/api/v1'},deepseek:{n:'DeepSeek',u:'https://api.deepseek.com/v1'},mistral:{n:'Mistral',u:'https://api.mistral.ai/v1'},xai:{n:'xAI',u:'https://api.x.ai/v1'},together:{n:'Together',u:'https://api.together.xyz/v1'},custom:{n:'Personalizado',u:''}};
const P=X.provBuild(BASE),J=x=>JSON.parse(JSON.stringify(x));
test('mantém os provedores antigos e acrescenta os novos',()=>{for(const k in BASE)assert.ok(P[k],k);assert.ok(Object.keys(P).length>=35,'esperava ≥35 provedores, tem '+Object.keys(P).length);for(const k of ['nvidia','cloudflare','cerebras','sambanova','github','huggingface','llm7','ollama'])assert.ok(P[k],k)});
test('URLs válidas, nomes únicos e grupos conhecidos',()=>{const nomes=new Set();for(const [k,v] of Object.entries(P)){assert.ok(v.n,k+' sem nome');assert.ok(!nomes.has(v.n),'nome repetido: '+v.n);nomes.add(v.n);assert.ok(X.PROV_GROUPS[v.g],k+' grupo '+v.g);
  if(k!='custom'){assert.match(v.u,/^https?:\/\/[^\s]+[^/]$/,k+' URL base inválida: '+v.u)}if(v.l)assert.match(v.l,/^https:\/\//,k+' link da chave');assert.ok(!v.m||v.m.every(x=>typeof x=='string'&&x),k+' modelos');
  if(v.nk)assert.ok(['free','local'].includes(v.g),k+' sem chave só em grátis/local')}});
test('o Claude (a:1) continua o único com API própria',()=>{assert.deepEqual(J(Object.entries(P).filter(([,v])=>v.a).map(([k])=>k)),['anthropic'])});
test('Cloudflare: Account ID entra na URL e a listagem usa o endpoint certo',()=>{const c=P.cloudflare;assert.ok(c.id&&/\{ACCOUNT_ID\}/.test(c.u));
  assert.equal(X.provFill(c.u,'abc123'),'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1');assert.match(X.provFill(c.u,''),/\{ACCOUNT_ID\}/);assert.match(X.provFill(c.u,'  '),/\{ACCOUNT_ID\}/);
  assert.equal(c.ml('https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1'),'https://api.cloudflare.com/client/v4/accounts/abc123/ai/models/search?task=Text%20Generation&per_page=100');
  assert.ok(c.m.every(x=>x.startsWith('@cf/')))});
test('NVIDIA e GitHub Models',()=>{assert.equal(P.nvidia.u,'https://integrate.api.nvidia.com/v1');assert.equal(P.github.u,'https://models.github.ai/inference');assert.equal(P.github.ml(),'https://models.github.ai/catalog/models')});
test('listagem de modelos: formato OpenAI, array puro (GitHub) e Cloudflare',()=>{
  assert.deepEqual(J(X.provModels({data:[{id:'a'},{id:'models/b'}]})),['a','b']);assert.deepEqual(J(X.provModels([{id:'openai/gpt-4.1',name:'x'},{name:'n2'}])),['openai/gpt-4.1','n2']);
  assert.deepEqual(J(X.provModels({result:[{name:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'},{name:'@cf/openai/gpt-oss-120b'}]})),['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/openai/gpt-oss-120b']);
  assert.deepEqual(J(X.provModels({})),[]);assert.deepEqual(J(X.provModels(null)),[]);assert.deepEqual(J(X.provModels(['x','y'])),['x','y'])});
test('select agrupado: optgroups, seleção e exclusão',()=>{const h=X.provOptions(P,'nvidia');assert.equal((h.match(/<optgroup/g)||[]).length,4);assert.match(h,/<option value="nvidia" selected>/);assert.ok(!/value="anthropic" selected/.test(h));
  assert.ok(!X.provOptions(P,'','groq').includes('value="groq"'));const n=(h.match(/<option /g)||[]).length;assert.equal(n,Object.keys(P).length)});
test('provedores sem chave existem e são marcados',()=>{const nk=Object.entries(P).filter(([,v])=>v.nk).map(([k])=>k);for(const k of ['llm7','ovh','kilo','pollinations','ollama','lmstudio'])assert.ok(nk.includes(k),k);assert.ok(!P.openai.nk)});
