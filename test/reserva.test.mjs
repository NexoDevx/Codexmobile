// Testes do reserva.js: troca automática de provedor, castigo, volta ao principal e painel.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const codigo = fs.readFileSync(new URL('../www/reserva.js', import.meta.url), 'utf8');

// plano: { provedor: [resultado|Error, ...] } — cada chamada ao "llm" consome o próximo item daquele provedor
function mundo({ plano = {}, res = [], extra = '' } = {}) {
  const ctx = vm.createContext({ console, JSON, Date, Promise, Set, Object, Array, String, Error, RegExp, Math });
  ctx.__plano = plano; ctx.__usos = [];
  vm.runInContext(`
    const P={a:{n:'Alfa'},b:{n:'Beta'},c:{n:'Gama'},d:{n:'Delta'}};
    let S={prov:'a',keys:{a:'ka',b:'kb',c:'kc'},model:{a:'ma',b:'mb',c:'mc'},urls:{},res:${JSON.stringify(res)},fm:'rapido-a',dm:'fundo-a'};
    let ST=''; const ui=()=>{}, save=()=>{}, esc=s=>String(s);
    const $=s=>__el; const __el={html:'',insertAdjacentHTML(_,h){this.html+=h}};
    function cfgR(){__el.html='BASE'}
    async function llm(h,tl,sy,nt){ __usos.push(S.prov+'|'+S.fm); const f=__plano[S.prov]||[]; const x=f.length?f.shift():{text:'ok-'+S.prov}; if(x instanceof Error)throw x; return x }
  `, ctx);
  vm.runInContext(codigo + extra, ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), usos: ctx.__usos };
}
const E = m => new Error(m);

test('sem reservas: comportamento original (erro passa direto, nada muda)', async () => {
  const w = mundo({ plano: { a: [E('429 rate limit')] } });
  await assert.rejects(w.run('llm()'), /429/);
  assert.equal(w.run('S.prov'), 'a');
  assert.equal(w.run('S.rmain'), undefined);
});

test('limite no principal → usa a reserva, lembra do principal e põe o principal de castigo', async () => {
  const w = mundo({ res: [{ p: 'b' }, { p: 'c' }], plano: { a: [E('Rate limit reached: 429 too many requests')] } });
  const r = await w.run('llm()');
  assert.equal(r.text, 'ok-b');
  assert.equal(w.run('S.prov'), 'b');
  assert.equal(w.run('S.rmain'), 'a');
  assert.equal(w.run('S.fm'), '');                         // modelo rápido do principal não vaza para a reserva
  assert.ok(w.run('S.rcool.a') > Date.now());
  assert.match(w.run('ST'), /Alfa.*→ usando Beta/);
  assert.deepEqual(w.usos, ['a|rapido-a', 'b|']);
});

test('segue na reserva enquanto o principal está de castigo e volta quando liberar', async () => {
  const w = mundo({ res: [{ p: 'b' }], plano: { a: [E('429')] } });
  await w.run('llm()');
  assert.equal((await w.run('llm()')).text, 'ok-b');      // castigo ativo: nem tenta o principal
  assert.equal(w.usos.filter(u => u.startsWith('a')).length, 1);
  w.run('S.rcool.a = Date.now() - 1');                     // castigo acabou
  assert.equal((await w.run('llm()')).text, 'ok-a');
  assert.equal(w.run('S.prov'), 'a'); assert.equal(w.run('S.fm'), 'rapido-a'); assert.equal(w.run('S.dm'), 'fundo-a');
  assert.equal(w.run('S.rmain'), null);
});

test('cota/crédito acaba: castigo longo; erro de pedido (contexto) não troca de provedor', async () => {
  const w = mundo({ res: [{ p: 'b' }], plano: { a: [E('Your credit balance is too low')] } });
  await w.run('llm()');
  const min = (w.run('S.rcool.a') - Date.now()) / 60000;
  assert.ok(min > 25 && min <= 30, 'castigo de ~30 min, deu ' + min);
  const w2 = mundo({ res: [{ p: 'b' }], plano: { a: [E("This model's maximum context length is 8192 tokens")] } });
  await assert.rejects(w2.run('llm()'), /maximum context/);
  assert.equal(w2.run('S.prov'), 'a');
  const w3 = mundo({ res: [{ p: 'b' }], plano: { a: [E('400 bad request: invalid_request_error')] } });
  await assert.rejects(w3.run('llm()'), /bad request/);
});

test('chave inválida também cai para a reserva; cancelar pelo usuário não', async () => {
  const w = mundo({ res: [{ p: 'b' }], plano: { a: [E('Incorrect API key provided')] } });
  assert.equal((await w.run('llm()')).text, 'ok-b');
  const ab = new Error('The operation was aborted'); ab.name = 'AbortError';
  const w2 = mundo({ res: [{ p: 'b' }], plano: { a: [ab] } });
  await assert.rejects(w2.run('llm()'), /aborted/);
  assert.equal(w2.run('S.prov'), 'a');
});

test('reserva sem chave ou sem modelo é pulada; se todas falham, o erro cita todas', async () => {
  const w = mundo({ res: [{ p: 'd' }, { p: 'b' }], plano: { a: [E('503 overloaded')] } });    // d não tem chave nem modelo
  assert.equal((await w.run('llm()')).text, 'ok-b');
  const w2 = mundo({ res: [{ p: 'b' }, { p: 'c' }], plano: { a: [E('429')], b: [E('quota exceeded')], c: [E('overloaded')] } });
  await assert.rejects(w2.run('llm()'), e => /Todos os provedores/.test(e.message) && /Alfa/.test(e.message) && /Gama/.test(e.message));
});

test('cai em cadeia: principal → 1ª reserva → 2ª reserva', async () => {
  const w = mundo({ res: [{ p: 'b' }, { p: 'c' }], plano: { a: [E('429')], b: [E('quota')] } });
  assert.equal((await w.run('llm()')).text, 'ok-c');
  assert.equal(w.run('S.rmain'), 'a');
});

test('se o usuário muda o provedor à mão, a troca automática é esquecida', async () => {
  const w = mundo({ res: [{ p: 'b' }], plano: { a: [E('429')] } });
  await w.run('llm()');
  w.run("S.prov='c'");                                   // escolheu outro nos Ajustes
  assert.equal((await w.run('llm()')).text, 'ok-c');
  assert.equal(w.run('S.rmain'), null);
});

test('painel: adicionar, reordenar, remover e editar chave/modelo', () => {
  const w = mundo();
  w.run("RES.add('b'); RES.add('c'); RES.add('b')");     // duplicado ignorado
  assert.deepEqual(JSON.parse(JSON.stringify(w.run('S.res'))), [{ p: 'b' }, { p: 'c' }]);
  w.run('RES.down(0)'); assert.equal(w.run('S.res[0].p'), 'c');
  w.run("RES.model('c','novo-modelo'); RES.key('c','  seg  ')");
  assert.equal(w.run('S.model.c'), 'novo-modelo'); assert.equal(w.run('S.keys.c'), 'seg');
  w.run('RES.del(0)'); assert.deepEqual(JSON.parse(JSON.stringify(w.run('S.res'))), [{ p: 'b' }]);
  w.run('cfgR()');                                       // o painel entra no fim dos Ajustes existentes
  const html = w.run('__el.html');
  assert.match(html, /^BASE/); assert.match(html, /Modelos reserva/); assert.match(html, /1\. Beta/);
  assert.doesNotMatch(html, /<option value="b">/);       // já está na lista
});

test('classificação dos erros mais comuns dos provedores', () => {
  const w = mundo();
  const c = m => w.run(`RES.classificar(new Error(${JSON.stringify(m)}))`);
  assert.equal(c('You exceeded your current quota, please check your plan and billing'), 'cota');
  assert.equal(c('Rate limit reached for model in organization on tokens per minute (TPM)'), 'limite');
  assert.equal(c('Overloaded'), 'limite');
  assert.equal(c('Failed to fetch'), 'limite');
  assert.equal(c('prompt is too long: 250000 tokens > 200000 maximum'), 'outro');
  assert.equal(c('unauthorized'), 'chave');
});
