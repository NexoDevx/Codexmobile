// node --test test/   — testes do servidor: auth, nomes de projeto, travessia, symlink, manifesto
import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const PORT=8900+Math.floor(Math.random()*90),DATA=fs.mkdtempSync(path.join(os.tmpdir(),'cm-'));let srv,TOK;
const call=(p,o={},tok=TOK)=>fetch(`http://127.0.0.1:${PORT}/api/${p}`,{...o,headers:{...(tok?{authorization:'Bearer '+tok}:{}),'content-type':'application/json'}});
const ex=(project,files,cmd)=>call('exec',{method:'POST',body:JSON.stringify({project,files,cmd,timeout:20})}).then(r=>r.json());
test.before(async()=>{srv=spawn('node',['server.mjs'],{env:{...process.env,PORT,CM_DATA:DATA},stdio:['ignore','pipe','pipe']});
 await new Promise(r=>srv.stdout.on('data',d=>{const m=/Token de acesso[^:]*: (\w+)/.exec(String(d));if(m){TOK=m[1];r()}}))});
test.after(()=>srv.kill());
test('sem token ou com token inválido → 401',async()=>{assert.equal((await call('caps',{},'')).status,401);assert.equal((await call('exec',{method:'POST',body:'{}'},'errado')).status,401);assert.equal((await call('fetch?url=http://x',{},'x')).status,401)});
test('ping é público mas não revela nada sensível',async()=>{const j=await(await call('ping',{},'')).json();assert.deepEqual(j,{ok:1,auth:false})});
test('métodos errados → 405 e JSON ruim → 400',async()=>{assert.equal((await call('exec')).status,405);const r=await call('exec',{method:'POST',body:'{x'});assert.equal(r.status,400)});
test('projeto ".." não escapa do workspace',async()=>{const j=await ex('..',{'a.txt':'x'},'pwd && ls');assert.match(j.out,/ws\/_-\w{8}/);assert.ok(fs.existsSync(path.join(DATA,'token')),'token continua existindo')});
test('nomes diferentes que viram o mesmo caminho não colidem',async()=>{await ex('a b',{'um.txt':'1'},'true');await ex('a_b',{'dois.txt':'2'},'true');const j=await ex('a b',{'um.txt':'1'},'ls');assert.match(j.out,/um\.txt/);assert.doesNotMatch(j.out,/dois\.txt/)});
test('travessia em caminhos de arquivo é ignorada',async()=>{await ex('trav',{'../fora.txt':'x','/abs.txt':'y','ok.txt':'z'},'true');assert.ok(!fs.existsSync(path.join(DATA,'ws','fora.txt')));assert.ok(!fs.existsSync('/abs.txt'))});
test('symlink dentro do workspace não permite escrever fora',async()=>{const alvo=fs.mkdtempSync(path.join(os.tmpdir(),'alvo-'));await ex('sym',{'a.txt':'1'},`ln -s ${alvo} link`);await ex('sym',{'a.txt':'1','link/x.txt':'PWNED'},'true');assert.ok(!fs.existsSync(path.join(alvo,'x.txt')))});
test('arquivos externos no disco não são apagados; os removidos pelo app são',async()=>{await ex('man',{'a.txt':'1','b.txt':'2'},'true');fs.writeFileSync(path.join(DATA,'ws','man','externo.txt'),'x');let j=await ex('man',{'a.txt':'1','b.txt':'2'},'ls');assert.match(j.out,/externo\.txt/);j=await ex('man',{'a.txt':'1'},'ls');assert.doesNotMatch(j.out,/b\.txt/);assert.match(j.out,/externo\.txt/)});
test('cmd inválido é rejeitado',async()=>{const r=await call('exec',{method:'POST',body:JSON.stringify({project:'x',cmd:'x'.repeat(30000)})});assert.equal(r.status,500)});
test('auditoria registra sem segredos',async()=>{await ex('aud',{},'echo ghp_abcdefghijklmnopqrstuvwx');const l=fs.readFileSync(path.join(DATA,'audit.log'),'utf8');assert.match(l,/redigido/);assert.doesNotMatch(l,/ghp_abcdefghijklmnop/)});
test('rotacionar o token invalida o antigo',async()=>{const old=TOK,j=await(await call('rotate',{method:'POST'})).json();TOK=j.token;assert.notEqual(old,TOK);assert.equal((await call('caps',{},old)).status,401);assert.equal((await call('caps')).status,200)});


test('API LSP exige token e expõe catálogo com a sessão explicitamente configurável',async()=>{
 const unauthorized=await call('lsp',{method:'POST',body:JSON.stringify({operation:'status',project:'lsp-auth'})},'wrong-token');
 assert.equal(unauthorized.status,401);
 const response=await call('lsp',{method:'POST',body:JSON.stringify({operation:'status',project:'lsp-auth'})});
 assert.equal(response.status,200);const j=await response.json();
 assert.equal(j.mode,'LSP');assert.ok(Array.isArray(j.servers));assert.ok(j.servers.some(x=>x.id==='typescript'));assert.ok(j.servers.some(x=>x.id==='vue'));
});

test('manifesto LSP separado não sobrescreve o manifesto do endpoint de shell',async()=>{
 const project='manifest-separated'; await ex(project,{'main.js':'function main() {}'},'echo generated > generated.txt');
 const regular=path.join(DATA,'manifest',project+'.json');const before=fs.readFileSync(regular,'utf8');
 const r=await call('lsp',{method:'POST',body:JSON.stringify({project,files:{'main.js':'function main() {}','other.unknown':'text'},operation:'definition',path:'other.unknown'})});
 assert.equal(r.status,200);assert.equal(fs.readFileSync(regular,'utf8'),before);
 assert.ok(fs.existsSync(path.join(DATA,'lsp-manifest',project+'.json')));
});
