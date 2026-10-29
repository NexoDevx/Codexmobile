import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LspManager, LSP_SERVERS, safeRelativePath, formatDiagnostics } from '../lsp.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cm-lsp-'));
const fakeServer = String.raw`
let buffer=Buffer.alloc(0), currentUri='file:///workspace/a.js';
function send(msg){const b=Buffer.from(JSON.stringify(msg));process.stdout.write(Buffer.concat([Buffer.from('Content-Length: '+b.length+'\r\n\r\n'),b]));}
function receive(m){
 if(m.method==='initialize') return send({jsonrpc:'2.0',id:m.id,result:{capabilities:{textDocumentSync:2,definitionProvider:true,referencesProvider:true,hoverProvider:true,documentSymbolProvider:true,renameProvider:true}}});
 if(m.method==='textDocument/didOpen'){currentUri=m.params.textDocument.uri;send({jsonrpc:'2.0',method:'textDocument/publishDiagnostics',params:{uri:currentUri,diagnostics:[{range:{start:{line:0,character:0},end:{line:0,character:3}},severity:1,source:'fake-lsp',message:'diagnóstico de teste'}]}});return;}
 if(m.id==null)return;
 let result=null;
 if(m.method==='textDocument/definition')result=[{uri:currentUri,range:{start:{line:0,character:0},end:{line:0,character:3}}}];
 else if(m.method==='textDocument/references')result=[{uri:currentUri,range:{start:{line:0,character:0},end:{line:0,character:3}}},{uri:currentUri,range:{start:{line:2,character:4},end:{line:2,character:7}}}];
 else if(m.method==='textDocument/hover')result={contents:{kind:'markdown',value:'**foo** — tipo de teste'}};
 else if(m.method==='textDocument/documentSymbol')result=[{name:'foo',kind:12,range:{start:{line:0,character:0},end:{line:0,character:12}}}];
 else if(m.method==='workspace/symbol')result=[{name:'foo',kind:12,location:{uri:currentUri,range:{start:{line:0,character:0},end:{line:0,character:12}}}}];
 else if(m.method==='textDocument/rename')result={changes:{[currentUri]:[{range:{start:{line:0,character:0},end:{line:0,character:3}},newText:'bar'}]}};
 else if(m.method==='textDocument/formatting')result=[{range:{start:{line:0,character:0},end:{line:0,character:17}},newText:'function foo() {\n}'}];
 else if(m.method==='textDocument/diagnostic')return send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'method not found'}});
 else if(m.method==='shutdown')result=null;
 else return send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'method not found'}});
 send({jsonrpc:'2.0',id:m.id,result});
}
process.stdin.on('data',d=>{buffer=Buffer.concat([buffer,d]);while(true){const i=buffer.indexOf('\r\n\r\n');if(i<0)break;const h=buffer.subarray(0,i).toString();const n=Number((/Content-Length:\s*(\d+)/i.exec(h)||[])[1]);if(!Number.isFinite(n)||buffer.length<i+4+n)break;const p=buffer.subarray(i+4,i+4+n);buffer=buffer.subarray(i+4+n);try{receive(JSON.parse(p.toString()))}catch(e){process.stderr.write(String(e))}}});
`;

test('safeRelativePath rejects traversal and absolute paths', () => {
  assert.equal(safeRelativePath('../secret.txt'), '');
  assert.equal(safeRelativePath('/etc/passwd'), '');
  assert.equal(safeRelativePath('C:\\Windows\\win.ini'), '');
  assert.equal(safeRelativePath('src\\main.js'), 'src/main.js');
});

test('LSP manager uses a real JSON-RPC stdio server for definitions, references and hover', async t => {
  const root=tmp(), script=path.join(root,'fake-lsp.mjs');
  fs.writeFileSync(script,fakeServer); fs.writeFileSync(path.join(root,'a.js'),'function foo() { return 1; }\nfoo();\n');
  const manager=new LspManager({specs:[{id:'fake',label:'Fake test LSP',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,idleMs:60000,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const files={'a.js':'function foo() { return 1; }\nfoo();\n'};
  const def=await manager.handle({operation:'definition',path:'a.js',line:1,character:10,files},root);
  assert.equal(def.ok,true); assert.equal(def.server,'fake'); assert.match(def.output,/DEFINIÇÕES LSP/); assert.match(def.output,/a\.js:1:1/);
  const refs=await manager.handle({operation:'references',path:'a.js',line:2,character:2,files},root);
  assert.match(refs.output,/REFERÊNCIAS LSP \(2\)/); assert.match(refs.output,/a\.js:3:5/);
  const hover=await manager.handle({operation:'hover',path:'a.js',line:1,character:10,files},root);
  assert.match(hover.output,/tipo de teste/);
});

test('LSP diagnostics are reported and rename is only a preview', async t => {
  const root=tmp(), script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);fs.writeFileSync(path.join(root,'a.js'),'function foo() {}');
  const manager=new LspManager({specs:[{id:'fake',label:'Fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const files={'a.js':'function foo() {}'};
  const diagnostics=await manager.handle({operation:'diagnostics',path:'a.js',files},root);
  assert.match(diagnostics.output,/DIAGNÓSTICOS LSP REAIS/); assert.match(diagnostics.output,/diagnóstico de teste/);
  const rename=await manager.handle({operation:'rename',path:'a.js',line:1,character:10,newName:'bar',files},root);
  assert.match(rename.output,/PRÉVIA DE RENOMEAÇÃO LSP/); assert.match(rename.output,/NÃO foi aplicado/);
  assert.equal(fs.readFileSync(path.join(root,'a.js'),'utf8'),'function foo() {}');
});

test('server catalog distinguishes installed language servers', () => {
  const root=tmp();
  const manager=new LspManager({specs:[{id:'fake',label:'Fake',commands:[[process.execPath,[]]],exts:['.js'],hint:'test'}]});
  const c=manager.catalog(root);assert.equal(c.mode,'LSP');assert.equal(c.servers[0].available,true);
  fs.rmSync(root,{recursive:true,force:true});
});

test('diagnostic formatter preserves path, one-based location and severity', () => {
  const root=tmp();
  const out=formatDiagnostics(root,[{uri:new URL('file://'+path.join(root,'x.js')).href,range:{start:{line:1,character:3}},severity:1,message:'bad value'}]);
  assert.match(out,/x\.js:2:4: ERRO: bad value/);fs.rmSync(root,{recursive:true,force:true});
});


test('sessão LSP sincroniza alterações de documentos já abertos e fecha documentos removidos', async t => {
  const root=tmp(), script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);
  const manager=new LspManager({specs:[{id:'fake',label:'Fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  await manager.handle({operation:'definition',path:'a.js',line:1,character:10,files:{'a.js':'function foo() {}'}},root);
  let session=[...manager.sessions.values()][0];
  await manager.handle({operation:'definition',path:'a.js',line:1,character:10,files:{'a.js':'function foo() { return 2; }'}},root);
  assert.equal([...session.opened.values()][0],'function foo() { return 2; }');
  await manager.handle({operation:'definition',path:'b.js',line:1,character:1,files:{'b.js':'foo();'}},root);
  assert.equal(session.opened.size,1);
  assert.ok([...session.opened.keys()][0].endsWith('/b.js'));
});

test('catálogo inclui linguagens extras e deixa os fallbacks identificáveis', () => {
  const extras=new Set(LSP_SERVERS.map(s=>s.id));
  for(const id of ['typescript','deno','pyright','gopls','rust-analyzer','vue','svelte','astro','markdown','toml','terraform','zig','swift','dockerfile','prisma']) assert.ok(extras.has(id),id);
  assert.equal(safeRelativePath('../outside.js'),'');
});


test('LSP formatting mostra um diff de prévia sem alterar o arquivo físico', async t => {
  const root=tmp(), script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);fs.writeFileSync(path.join(root,'a.js'),'function foo() {}');
  const manager=new LspManager({specs:[{id:'fake',label:'Fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const before='function foo() {}';
  const result=await manager.handle({operation:'format',path:'a.js',files:{'a.js':before}},root);
  assert.match(result.output,/PRÉVIA DE FORMATAÇÃO LSP/);assert.match(result.output,/DIFF DE PRÉVIA/);assert.match(result.output,/\+ function foo\(\) \{/);
  assert.equal(fs.readFileSync(path.join(root,'a.js'),'utf8'),before);
});


test('diagnostics sem path varre o workspace com limites de servidores e arquivos', async t => {
  const root=tmp(), script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);
  const manager=new LspManager({specs:[{id:'fake',label:'Fake test LSP',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const result=await manager.handle({operation:'diagnostics',files:{'a.js':'function a() {}','b.js':'function b() {}'}},root);
  assert.equal(result.ok,true);assert.equal(result.filesChecked,2);assert.match(result.output,/DIAGNÓSTICOS LSP DO WORKSPACE/);assert.match(result.output,/a\.js/);assert.match(result.output,/b\.js/);
});


test('workspaceSymbol inicia a sessão LSP mesmo antes de qualquer arquivo ser aberto', async t => {
  const root=tmp(),script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);fs.writeFileSync(path.join(root,'a.js'),'function foo() {}');
  const manager=new LspManager({specs:[{id:'fake',label:'Fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'}],maxSessions:1,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const result=await manager.handle({operation:'workspaceSymbol',query:'foo',files:{}},root);
  assert.equal(result.ok,true);assert.match(result.output,/SÍMBOLOS LSP/);assert.match(result.output,/foo/);
});

test('o chamador pode escolher um servidor e o catálogo reconhece o nome Dockerfile', async t => {
  const root=tmp(),script=path.join(root,'fake-lsp.mjs');fs.writeFileSync(script,fakeServer);fs.writeFileSync(path.join(root,'a.js'),'function foo() {}');fs.writeFileSync(path.join(root,'Dockerfile'),'FROM scratch');
  const manager=new LspManager({specs:[
    {id:'typescript',label:'TS fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'},
    {id:'other-js',label:'Other fake',commands:[[process.execPath,[script]]],exts:['.js'],hint:'test'},
    {id:'dockerfile',label:'Docker fake',commands:[[process.execPath,[script]]],exts:['.dockerfile'],hint:'test'}
  ],maxSessions:2,startTimeout:3000});
  t.after(async()=>{await manager.closeAll();fs.rmSync(root,{recursive:true,force:true});});
  const picked=await manager.handle({operation:'definition',server:'other-js',path:'a.js',line:1,character:10,files:{'a.js':'function foo() {}'}},root);
  assert.equal(picked.server,'other-js');
  const docker=await manager.handle({operation:'definition',path:'Dockerfile',line:1,character:1,files:{Dockerfile:'FROM scratch'}},root);
  assert.equal(docker.server,'dockerfile');
  assert.deepEqual(manager.catalog(root).servers.find(x=>x.id==='dockerfile').extensions,['Dockerfile','.dockerfile']);
});
