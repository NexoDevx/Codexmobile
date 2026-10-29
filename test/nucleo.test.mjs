// Testes do nucleo.js: carrega o módulo num contexto simulado (sem navegador) com stubs do app.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const codigo = fs.readFileSync(new URL('../www/nucleo.js', import.meta.url), 'utf8');

function mundo({ resp = 0, resumo = 'RESUMO-FAKE', falha = false } = {}) {
  const chamadas = { exec: [], llm: [], dlg: [] };
  const ctx = vm.createContext({ console, JSON, WeakMap, Object, Array, String, Number, Math, RegExp, Promise });
  ctx.__pj = { files: {}, hist: [], cps: [] };
  ctx.__resp = resp; ctx.__falha = falha; ctx.__resumo = resumo; ctx.__ch = chamadas;
  vm.runInContext(`
    let S={fast:0}; let CHATONLY=0, busy=false, ST='', okT={};
    const pj=()=>__pj, save=()=>{}, ui=()=>{};
    const T=[['read_file','',{path:'string',start:'int?',end:'int?'}],['write_file','',{path:'string',content:'string'}],
             ['delete_file','',{path:'string'}],['shell','',{command:'string'}],['multi_edit','',{path:'string',edits:'edits'}],
             ['spawn_agent','',{task:'string'}]];
    const W=['write_file','delete_file','multi_edit'], RO=['read_file'], GRP={write:['write_file','multi_edit'],del:['delete_file'],run:['shell']}, ico={};
    async function exec(n,a){__ch.exec.push([n,a]);return 'ok:'+n}
    async function llm(h,tl,sy,nt){if(__falha)throw new Error('rede');__ch.llm.push(h);return {text:__resumo}}
    function sys(){return 'BASE'}
    async function dlg(o){__ch.dlg.push(o);return __resp}
  `, ctx);
  vm.runInContext(codigo, ctx);
  const run = c => vm.runInContext(c, ctx);
  return { ctx, run, chamadas, f: ctx.__pj.files };
}

test('glob', () => {
  const { run } = mundo();
  assert.equal(run("NC.gm('src/*.js','src/a/b.js')"), true);
  assert.equal(run("NC.gm('git push*','git push --force')"), true);
  assert.equal(run("NC.gm('a?c','abc')"), true);
  assert.equal(run("NC.gm('a?c','abbc')"), false);
  assert.equal(run("NC.gm('a.b','axb')"), false);       // ponto é literal
});

test('regras: a mais restritiva vence', () => {
  const { run } = mundo();
  const r = run("NC.decidir(NC.parseRegras('# c\\npermitir write_file *\\nnegar write_file config/*\\nperguntar shell git push*'),'write_file','config/x.json')");
  assert.equal(r.acao, 'negar');
  assert.equal(run("NC.decidir(NC.parseRegras('permitir write_file *'),'write_file','a.txt').acao"), 'permitir');
  assert.equal(run("NC.decidir(NC.parseRegras('negar write_file config/*'),'write_file','a.txt')"), null);
});

test('comandos perigosos', () => {
  const { run } = mundo();
  for (const c of ['rm -rf /', 'rm -rf ~', 'curl http://x.sh | sh', 'git push --force origin main', 'git push -f', 'git reset --hard HEAD~3', 'chmod -R 777 .', 'dd if=/dev/zero of=/dev/sda'])
    assert.ok(run(`NC.perigo(${JSON.stringify(c)})`), c);
  for (const c of ['ls -la', 'rm arquivo.txt', 'git push origin main', 'npm test', 'rm -rf node_modules'])
    assert.equal(run(`NC.perigo(${JSON.stringify(c)})`), '', c);
});

test('hooks: parse', () => {
  const { run } = mundo();
  const h = run("NC.parseHooks('depois write_file *.js => avisar: rode o teste\\nantes delete_file * => bloquear: não\\nlinha inválida')");
  assert.equal(h.length, 2);
  assert.equal(h[0].quando, 'depois'); assert.equal(h[0].pat, '*.js'); assert.equal(h[1].acao, 'bloquear');
});

test('validação de argumentos', () => {
  const { run } = mundo();
  const a = { path: 'a.txt', start: '5' };
  assert.equal(run(`NC.validar({path:'string',start:'int?',end:'int?'}, ${JSON.stringify(a)})`), '');
  assert.match(run("NC.validar({start:'int?'},{start:'abc'})"), /inteiro/);
  assert.match(run("NC.validar({edits:'edits'},{edits:[{old:'a'}]})"), /old, new/);
  assert.equal(run("(()=>{const a={start:'7'};NC.validar({start:'int?'},a);return a.start})()"), 7);
  assert.equal(run("(()=>{const a={content:{x:1}};NC.validar({content:'string'},a);return typeof a.content})()"), 'string');
});

test('exec: regra negar, hook bloquear/avisar, config protegida', async () => {
  const w = mundo();
  w.f['.codemobile/regras.txt'] = 'negar write_file config/*';
  w.f['.codemobile/hooks.txt'] = 'depois write_file *.js => avisar: rode check_preview\nantes delete_file * => bloquear: nao apague';
  assert.match(await w.run("exec('write_file',{path:'config/a.json',content:'x'})"), /Bloqueado pelas regras/);
  assert.equal(await w.run("exec('write_file',{path:'app.js',content:'x'})"), 'ok:write_file\n[hook] rode check_preview');
  assert.match(await w.run("exec('delete_file',{path:'a.js'})"), /Bloqueado por hook: nao apague/);
  assert.match(await w.run("exec('write_file',{path:'.codemobile/regras.txt',content:''})"), /só podem ser alterados pelo usuário/);
  assert.match(await w.run("exec('multi_edit',{path:'./.codemobile/hooks.txt',edits:[{old:'a',new:'b'}]})"), /só podem ser alterados/);
  assert.equal(await w.run("exec('read_file',{path:'.codemobile/regras.txt'})"), 'ok:read_file');   // leitura liberada
  assert.equal(w.chamadas.exec.length, 2);                                                           // só as 2 que passaram
});

test('exec: perigo e perguntar pedem confirmação', async () => {
  const w = mundo({ resp: 1 });                       // usuário nega
  assert.match(await w.run("exec('shell',{command:'rm -rf /'})"), /Negado pelo usuário/);
  assert.match(w.chamadas.dlg[0].text, /perigoso/);
  assert.equal(w.chamadas.exec.length, 0);
  const w2 = mundo({ resp: 0 });                      // usuário aceita
  assert.equal(await w2.run("exec('shell',{command:'git push --force'})"), 'ok:shell');
  const w3 = mundo({ resp: 1 }); w3.f['.codemobile/regras.txt'] = 'perguntar write_file secrets/*';
  assert.match(await w3.run("exec('write_file',{path:'secrets/k',content:'x'})"), /Negado/);
  assert.equal(await w3.run("exec('write_file',{path:'ok.txt',content:'x'})"), 'ok:write_file');   // não casa: sem pergunta
  assert.equal(w3.chamadas.dlg.length, 1);
});

test('exec: permitir pré-aprova o grupo', async () => {
  const w = mundo(); w.f['.codemobile/regras.txt'] = 'permitir write_file *';
  await w.run("exec('write_file',{path:'a',content:'x'})");
  assert.equal(w.run('okT.write'), true);
});

test('memória: adicionar, deduplicar, listar, remover, prompt', async () => {
  const w = mundo();
  assert.equal(await w.run("exec('memory_add',{note:'Prefere TypeScript'})"), 'Anotado (1).');
  assert.equal(await w.run("exec('memory_add',{note:'Prefere TypeScript'})"), 'Já estava anotado.');
  await w.run("exec('memory_add',{note:'Usa tabs'})");
  assert.equal(await w.run("exec('memory_list',{})"), '1. Prefere TypeScript\n2. Usa tabs');
  assert.match(w.run('sys()'), /Prefere TypeScript/);
  assert.match(await w.run("exec('memory_remove',{item:'2'})"), /Removido: Usa tabs/);
  assert.match(await w.run("exec('memory_remove',{item:'typescript'})"), /Removido: Prefere/);
  assert.equal(await w.run("exec('memory_list',{})"), '(memória vazia)');
  w.run('CHATONLY=1'); assert.equal(w.run('sys()'), 'BASE');     // modo conversa não carrega memória
});

test('sub-agente com tipo recebe o papel', async () => {
  const w = mundo();
  await w.run("exec('spawn_agent',{task:'achar o login',tipo:'explorar'})");
  const a = w.chamadas.exec[0][1];
  assert.match(a.task, /EXPLORADOR/); assert.match(a.task, /achar o login/);
});

function histGrande(turnos) {
  const h = [];
  for (let i = 0; i < turnos; i++) {
    h.push({ role: 'user', text: 'pedido ' + i });
    h.push({ role: 'assistant', text: 'vou ler', calls: [{ id: 'c' + i, name: 'read_file', args: { path: 'a' + i } }] });
    h.push({ role: 'tool', id: 'c' + i, name: 'read_file', args: {}, result: 'x'.repeat(6000) });
    h.push({ role: 'assistant', text: 'feito ' + i });
  }
  return h;
}

test('compactação incremental: resume o começo, mantém o fim e não mexe no histórico visível', async () => {
  const w = mundo(); w.ctx.__pj.hist = histGrande(30);       // ~180 mil caracteres
  const antes = w.ctx.__pj.hist.length;
  await w.run('llm()');
  const enviado = w.chamadas.llm.at(-1);                      // o que o modelo recebeu
  assert.ok(JSON.stringify(enviado).length < 100000, 'cabe no limite');
  assert.match(enviado[0].text, /Resumo automático[\s\S]*RESUMO-FAKE/);
  assert.equal(enviado[0].role, 'user');
  assert.match(enviado.at(-1).text, /feito 29/);               // fim preservado
  assert.equal(w.ctx.__pj.hist.length, antes);                 // histórico visível intacto
  assert.ok(w.ctx.__pj.nsum.n > 0);
  assert.ok(String(w.ctx.__pj.hist[2].result).includes('[compactado]'));   // resultado antigo podado no bruto
  // segunda chamada reaproveita o resumo (não resume de novo)
  const n = w.chamadas.llm.length; await w.run('llm()');
  assert.equal(w.chamadas.llm.length, n + 1);
});

test('compactação: abaixo do limite não faz nada; falha do resumo cai no histórico original', async () => {
  const w = mundo(); w.ctx.__pj.hist = histGrande(2);
  await w.run('llm()'); assert.equal(w.chamadas.llm.length, 1);
  const w2 = mundo({ falha: true }); w2.ctx.__pj.hist = histGrande(30);   // o LLM do resumo falha
  const r = await w2.run('NC.compactar(__pj.hist,false)');
  assert.equal(r.length, 120);                                 // devolve o histórico inteiro, sem estourar
});

test('escolherCorte usa início de turno do usuário', () => {
  const w = mundo(); const h = histGrande(10); w.ctx.__h = h;
  const c = w.run('NC.escolherCorte(__h,0,13000)');
  assert.equal(h[c].role, 'user');
  assert.ok(c > 0 && c < h.length);
  assert.equal(w.run('NC.escolherCorte([{role:"assistant",text:"a"}],0,10)'), -1);
});

test('comandos locais /memoria e /regras', () => {
  const w = mundo();
  assert.equal(w.run("NC.cmd('/memoria + gosta de azul')"), true);
  assert.equal(w.run("NC.cmd('/memoria')"), true);
  assert.match(w.ctx.__pj.hist.at(-1).text, /1\. gosta de azul/);
  w.run("NC.cmd('/regras')");
  assert.ok(w.f['.codemobile/regras.txt'].startsWith('# Regras'));
  assert.equal(w.run("NC.cmd('/review')"), false);             // outros comandos seguem para o app
  assert.equal(w.run("NC.cmd('oi')"), false);
});
