// Testes do núcleo dos modelos locais (localcore.js): catálogo, prompt com ferramentas, leitura de chamadas, corte de contexto
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {fileURLToPath} from 'node:url';const W=fileURLToPath(new URL('../www/',import.meta.url));
const ctx={console,JSON,Math,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(W+'localcore.js','utf8')+';this.X={LL_CATALOG,LL_TIERS,llById,llEst,llCut,llToolsText,llMessages,llParse,llResponse,llErr,llMB};',ctx);const X=ctx.X,J=x=>JSON.parse(JSON.stringify(x));
const TOOLS=[{type:'function',function:{name:'read_file',description:'Lê um arquivo do projeto',parameters:{type:'object',properties:{path:{type:'string'},start:{type:'integer'}},required:['path']}}},{type:'function',function:{name:'write_file',description:'Cria um arquivo',parameters:{type:'object',properties:{path:{},content:{}},required:['path','content']}}}];
test('catálogo: só modelos pequenos, ids únicos, URLs .gguf do Hugging Face',()=>{const c=J(X.LL_CATALOG);assert.ok(c.length>=8);assert.equal(new Set(c.map(m=>m.id)).size,c.length);
  for(const m of c){assert.match(m.url,/^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/main\/[\w.\-]+\.gguf$/,m.id);assert.ok([1,2,3].includes(m.tier),m.id);assert.ok(m.mb>=100&&m.mb<=2100,m.id+' tamanho fora do limite de 2 GB do wllama');assert.ok(m.ctx<=4096)}
  assert.deepEqual([...new Set(c.map(m=>m.tier))].sort(),[1,2,3]);assert.ok(c.filter(m=>m.tier==1).every(m=>m.mb<=500));assert.equal(X.llById('qwen2.5-0.5b').tier,1);assert.equal(X.llById('x',[{id:'x',n:'Meu'}]).n,'Meu')});
test('llMB formata tamanhos',()=>{assert.equal(X.llMB(145),'145 MB');assert.equal(X.llMB(1930),'1,9 GB')});
test('lista de ferramentas compacta, com opcionais marcados',()=>{const t=X.llToolsText(TOOLS);assert.match(t,/- read_file\(path, start\?\): Lê um arquivo/);assert.match(t,/<tool_call>/);assert.equal(X.llToolsText([]),'')});
test('mensagens: system + tool_calls/tool viram texto, alternando user/assistant',()=>{
  const m=J(X.llMessages([{role:'system',content:'Você é um agente.'},{role:'user',content:'leia a.js'},{role:'assistant',content:'',tool_calls:[{id:'1',type:'function',function:{name:'read_file',arguments:'{"path":"a.js"}'}}]},{role:'tool',tool_call_id:'1',content:'let a=1'}],TOOLS,{ctx:4096,max:256}));
  assert.equal(m[0].role,'system');assert.match(m[0].content,/Você é um agente\.[\s\S]*Tools you can call/);
  assert.deepEqual(m.slice(1).map(x=>x.role),['user','assistant','user']);assert.match(m[2].content,/<tool_call>\{"name":"read_file","arguments":\{"path":"a.js"\}\}<\/tool_call>/);assert.match(m[3].content,/<tool_response>\nlet a=1\n<\/tool_response>/)});
test('mensagens seguidas do mesmo papel são unidas e a conversa começa em user',()=>{const m=J(X.llMessages([{role:'assistant',content:'oi'},{role:'user',content:'a'},{role:'user',content:'b'}],null,{}));assert.deepEqual(m.map(x=>x.role),['system','user']);assert.match(m[1].content,/a\n\nb/)});
test('corte de contexto: mantém o fim, corta mensagens enormes e o system',()=>{const big='x'.repeat(50000),h=[{role:'system',content:'s'.repeat(9000)}];for(let i=0;i<40;i++){h.push({role:'user',content:'pergunta '+i+' '+'y'.repeat(600)});h.push({role:'assistant',content:'resposta '+i+' '+'z'.repeat(600)})}h.push({role:'user',content:'ÚLTIMA '+big});
  const m=J(X.llMessages(h,TOOLS,{ctx:2048,max:256})),tot=m.reduce((a,x)=>a+X.llEst(x.content),0);assert.ok(tot<2048-256,'estourou: '+tot);assert.match(m[m.length-1].content,/ÚLTIMA/);assert.ok(m[m.length-1].content.length<3000);assert.ok(m[0].content.length<2900);assert.equal(m[1].role,'user')});
test('lê <tool_call> (uma e várias), ignora nomes inexistentes',()=>{
  let r=J(X.llParse('Vou ler.\n<tool_call>{"name":"read_file","arguments":{"path":"a.js"}}</tool_call>',TOOLS));assert.equal(r.calls.length,1);assert.equal(r.calls[0].function.name,'read_file');assert.deepEqual(JSON.parse(r.calls[0].function.arguments),{path:'a.js'});assert.equal(r.text,'Vou ler.');
  r=J(X.llParse('<tool_call>{"name":"read_file","arguments":{"path":"a"}}</tool_call><tool_call>{"name":"write_file","parameters":{"path":"b","content":"c"}}</tool_call>',TOOLS));assert.deepEqual(r.calls.map(c=>c.function.name),['read_file','write_file']);
  r=J(X.llParse('<tool_call>{"name":"rm_rf","arguments":{}}</tool_call>',TOOLS));assert.equal(r.calls.length,0);assert.match(r.text,/rm_rf/)});
test('tolera JSON solto, cerca de código e <tool_call> sem fechar',()=>{
  assert.equal(J(X.llParse('{"name":"read_file","arguments":{"path":"x"}}',TOOLS)).calls.length,1);
  assert.equal(J(X.llParse('<tool_call>\n```json\n{"name":"read_file","arguments":{"path":"x"}}\n```\n</tool_call>',TOOLS)).calls.length,1);
  assert.equal(J(X.llParse('<tool_call>{"name":"read_file","arguments":{"path":"x"}}',TOOLS)).calls.length,1);
  assert.equal(J(X.llParse('Olá! Tudo bem?',TOOLS)).calls.length,0);assert.equal(J(X.llParse('{"a":1}',TOOLS)).calls.length,0)});
test('resposta no formato OpenAI',()=>{let r=J(X.llResponse('m','Olá!',[],10,3));assert.equal(r.choices[0].message.content,'Olá!');assert.equal(r.choices[0].finish_reason,'stop');assert.equal(r.usage.total_tokens,13);
  r=J(X.llResponse('m','<tool_call>{"name":"read_file","arguments":{"path":"q"}}</tool_call>',TOOLS,5,5));assert.equal(r.choices[0].finish_reason,'tool_calls');assert.equal(r.choices[0].message.tool_calls[0].type,'function');assert.equal(r.choices[0].message.content,null);
  r=J(X.llResponse('m','texto <tool_call>lixo</tool_call>',TOOLS,1,1));assert.equal(r.choices[0].message.tool_calls,undefined);assert.match(r.choices[0].message.content,/lixo/)});
test('erro no formato OpenAI',()=>{const e=J(X.llErr(400,'x'));assert.equal(e.status,400);assert.equal(e.body.error.message,'x')});
