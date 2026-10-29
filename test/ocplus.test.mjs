// OpenCode-inspired CodeMobile tools: project map, bounded reads, reference search,
// concrete diffs, diagnostics, profile enforcement, and project test discovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../www/ocplus.js', import.meta.url), 'utf8');
function harness({files: initial = {}, role = 'build', perm = {}, shell = null} = {}) {
  const files = {...initial};
  const project = {files, cps:[{t:'before task',f:{...initial}}], hist:[], todos:[]};
  const S = {agentProfile:role,mode:'auto',perm,fast:false};
  const T = [
    ['read_file','read',{path:'string'}], ['write_file','write',{path:'string'}],
    ['shell','shell',{cmd:'string'}], ['run_js','execute',{}], ['run_file','execute',{}],
    ['check_preview','preview',{}], ['project_map','map',{}],
  ];
  const RO = ['read_file'], SUB = ['read_file'], W = ['write_file'];
  const GRP = {run:['shell']}, GRPN = {run:'executar código'}, PD = {}, ico = {}, okT = {};
  let shellCalls = [];
  const testState = {files, get shellCalls(){ return shellCalls; }};
  const OC = {
    permRule(_files, kind, path) {
      if (/(^|\/)\.env(?:\..*)?$/.test(path)) return kind==='read' ? 'deny' : null;
      return null;
    },
    glob(f, pattern) {
      const simple = String(pattern).replace(/\*\*/g,'').replace(/\*/g,'');
      return Object.keys(f).filter(p=>!simple || p.includes(simple));
    }
  };
  const originalExec = async (name, args={}) => {
    if (name==='read_file') return files[args.path] ?? 'Erro: arquivo não existe';
    if (name==='shell') { shellCalls.push(args.cmd); return shell ? await shell(args.cmd) : 'ok: '+args.cmd; }
    if (name==='write_file') { files[args.path]=args.content; return 'written'; }
    return 'original:'+name;
  };
  const env = {
    S, pj:()=>project, OC, T, RO, SUB, W, GRP, GRPN, PD, ico,
    schema:()=>({}), toolsNow:()=>T, sys:()=> 'base system',
    llm:async(_h,tools)=>({text:'done',tools}), exec:originalExec,
    cfgR:()=>{}, save:()=>{}, dlg:async()=>0, busy:false, alert:()=>{},
    document:{querySelector:()=>({insertAdjacentHTML:()=>{}})},
    okT, testState, dl:(before,after)=>{
      const a=String(before).split('\n'), b=String(after).split('\n');
      if (before===after) return a.map(x=>[' ',x]);
      return [...a.map(x=>['-',x]), ...b.map(x=>['+',x])];
    }
  };
  const make = new Function(...Object.keys(env), source + `\nreturn {
    exec:(n,a)=>exec(n,a), sys:()=>sys(), llm:(...a)=>llm(...a), setAgentProfile,
    getTools:()=>T, getRO:()=>RO, getSUB:()=>SUB, getS:()=>S, getFiles:()=>testState.files,
    getShellCalls:()=>testState.shellCalls, selectTools:(tl,h)=>ocxSelectTools(tl,h), pruneHistory:h=>ocxPruneHistory(h), setToolMode:v=>{S.ocxToolMode=v}, contextReport:()=>ocxContextReport(project.hist)
  };`);
  return make(...Object.values(env));
}

test('project_map shows stack, tests, package scripts and entry points', async()=>{
  const h=harness({files:{
    'index.html':'<html></html>', 'src/main.js':'', 'test/app.test.mjs':'',
    'README.md':'intro', 'package.json':JSON.stringify({name:'demo',version:'1.2.0',scripts:{test:'node --test'}})
  }});
  const r=await h.exec('project_map',{});
  assert.match(r,/MAPA DO PROJETO/);
  assert.match(r,/JavaScript/);
  assert.match(r,/index\.html/);
  assert.match(r,/test\/app\.test\.mjs/);
  assert.match(r,/test=node --test/);
});

test('read_many is bounded and skips protected files', async()=>{
  const h=harness({files:{'a.js':'A'.repeat(5000),'b.js':'B'.repeat(5000),'.env':'SECRET=bad'}});
  const r=await h.exec('read_many',{paths:'a.js,b.js,.env',max_chars:1500});
  assert.ok(r.length<1900, 'output exceeded configured budget by too much');
  assert.match(r,/a\.js/);
  assert.match(r,/b\.js/);
  assert.match(r,/bloqueado/);
  assert.doesNotMatch(r,/SECRET=bad/);
});

test('find_references prefers whole-word matches and supports contains', async()=>{
  const h=harness({files:{'src/a.js':'init(); initial();\nobj.init();','src/b.js':'// init is used'}});
  const whole=await h.exec('find_references',{symbol:'init'});
  assert.match(whole,/src\/a\.js:1: init\(\); initial\(\);/);
  assert.match(whole,/src\/b\.js:1/);
  const contains=await h.exec('find_references',{symbol:'init',match:'contains'});
  assert.match(contains,/initial/);
});

test('project_diagnostics detects missing local refs, duplicate IDs and invalid JSON', async()=>{
  const h=harness({files:{
    'index.html':'<link href="missing.css"><div id="x"></div><span id="x"></span>',
    'broken.json':'{ bad json }'
  }});
  const r=await h.exec('project_diagnostics',{});
  assert.match(r,/JSON inválido/);
  assert.match(r,/referência local não encontrada/);
  assert.match(r,/id HTML duplicado/);
});

test('diff_file presents removed/added lines from the task checkpoint', async()=>{
  const h=harness({files:{'app.js':'const value = 2;\n'} });
  // Replace the harness checkpoint to reflect the pre-task version.
  const s=h.getS();
  const projectFiles=h.getFiles();
  // The returned project is intentionally only exposed by behavior, so provide old text through a fresh harness.
  const h2=harness({files:{'app.js':'const value = 1;\n'}});
  // The harness's checkpoint already contains the old version; changing current state simulates an edit.
  h2.getFiles()['app.js']='const value = 2;\n';
  const r=await h2.exec('diff_file',{path:'app.js'});
  assert.match(r,/app\.js \(editado\)/);
  assert.match(r,/-\s+1 \| const value = 1/);
  assert.match(r,/\+\s+1 \| const value = 2/);
});

test('Explore profile blocks writes and removes execution tools from model-visible tool list', async()=>{
  const h=harness({role:'explore',files:{'a.js':'x'}});
  assert.match(await h.exec('write_file',{path:'b.js',content:'no'}),/Bloqueado pelo perfil explore/);
  const response=await h.llm([],h.getTools(),'base');
  assert.equal(response.tools.some(t=>t[0]==='write_file'),false);
  assert.equal(response.tools.some(t=>t[0]==='shell'),false);
});

test('run_project_checks executes only declared, allowlisted scripts', async()=>{
  const h=harness({files:{'package.json':JSON.stringify({scripts:{test:'node --test',lint:'eslint .',build:'vite build'}})}});
  const r=await h.exec('run_project_checks',{checks:'test,lint'});
  assert.match(r,/VERIFICAÇÕES DO PROJETO/);
  assert.deepEqual(h.getShellCalls(),['npm test','npm run lint']);
  assert.equal(h.getShellCalls().includes('node --test'),false);
});

test('plan profile cannot run shell, sandbox code, or project scripts', async()=>{
  const h=harness({role:'plan',files:{'package.json':JSON.stringify({scripts:{test:'node --test'}})}});
  assert.match(await h.exec('run_project_checks',{}),/bloqueada|Bloqueado/);
  assert.match(await h.exec('shell',{cmd:'echo no'}),/bloqueado.*perfil plan/i);
  assert.match(await h.exec('run_js',{}),/bloqueado.*perfil plan/i);
  const response=await h.llm([],h.getTools(),'base');
  for (const name of ['shell','run_js','run_file','check_preview','run_project_checks']) assert.equal(response.tools.some(t=>t[0]===name),false,name+' should be unavailable');
  assert.deepEqual(h.getShellCalls(),[]);
});

test('review profile permits declared project checks but blocks arbitrary execution', async()=>{
  const h=harness({role:'review',files:{'package.json':JSON.stringify({scripts:{test:'node --test'}})}});
  assert.match(await h.exec('shell',{cmd:'echo no'}),/bloqueado.*perfil review/i);
  assert.match(await h.exec('run_js',{}),/bloqueado.*perfil review/i);
  const response=await h.llm([],h.getTools(),'base');
  assert.equal(response.tools.some(t=>t[0]==='shell'),false);
  assert.equal(response.tools.some(t=>t[0]==='run_project_checks'),true);
  assert.match(await h.exec('run_project_checks',{checks:'test'}),/VERIFICAÇÕES DO PROJETO/);
  assert.deepEqual(h.getShellCalls(),['npm test']);
});


test('smart_search is bounded, supports context, and does not read secrets', async()=>{
  const h=harness({files:{'src/a.js':'one\nconst target = 42;\nthree','src/b.js':'target();','.env':'API_KEY=super-secret-value'}});
  const out=await h.exec('smart_search',{pattern:'target',context_lines:1,max_hits:10});
  assert.match(out,/src\/a\.js:2/);
  assert.match(out,/src\/b\.js:1/);
  assert.doesNotMatch(out,/super-secret-value/);
  assert.match(await h.exec('smart_search',{pattern:'[',match:'regex'}),/inválido/);
});

test('symbol_index, test_discovery and instruction_report map the workspace compactly', async()=>{
  const h=harness({files:{
    'src/app.js':'export function startApp() {}\nexport class PlayerController {}',
    'tests/app.test.js':'test("works", () => {});',
    'AGENTS.md':'Use patches and run tests.',
    'package.json':JSON.stringify({scripts:{test:'node --test'}})
  }});
  assert.match(await h.exec('symbol_index',{}),/startApp/);
  assert.match(await h.exec('symbol_index',{}),/PlayerController/);
  assert.match(await h.exec('test_discovery',{}),/tests\/app\.test\.js/);
  assert.match(await h.exec('test_discovery',{}),/test=node --test/);
  assert.match(await h.exec('instruction_report',{}),/Use patches and run tests/);
});

test('security_audit reports risky patterns without leaking a possible credential', async()=>{
  const h=harness({files:{'src/app.js':'const api_key = "abcDEFghiJKLmnop123456";\neval(userInput);','src/safe.js':'export const ok = true;'}});
  const out=await h.exec('security_audit',{});
  assert.match(out,/possivelmente embutido/);
  assert.match(out,/Execução dinâmica de código/);
  assert.doesNotMatch(out,/abcDEFghiJKLmnop123456/);
});

test('impact_analysis and change_report expose cross-file references and checkpoint changes', async()=>{
  const h=harness({files:{'src/Player.js':'export class PlayerController {}','src/main.js':'import { PlayerController } from "./Player";\nnew PlayerController();'}});
  const impact=await h.exec('impact_analysis',{path:'src/Player.js'});
  assert.match(impact,/src\/main\.js/);
  h.getFiles()['src/Player.js']='export class PlayerController { update() {} }';
  assert.match(await h.exec('change_report',{}),/EDITADO src\/Player\.js/);
  assert.match(await h.exec('verify_workspace',{}),/VERIFICAÇÃO ESTÁTICA DO WORKSPACE/);
});

test('context report states that token counts are estimates', async()=>{
  const h=harness({files:{'a.js':'const value = 1;'}});
  const out=await h.exec('context_report',{});
  assert.match(out,/tokens estimados/);
  assert.match(out,/não medição do provedor/);
});

test('tool diet preserves core tools, filters unrelated specialist tools, and full mode restores all', async()=>{
  const h=harness({files:{'main.js':'ok'}});
  const tools=[['read_file','read',{path:'string'}],['apply_patch','edit',{patch:'string'}],['gh_push','push',{}],['apk_sign','sign',{}],['web_search','search',{}],['spawn_agent','agent',{}]];
  const normal=h.selectTools(tools,[{role:'user',text:'Fix a JavaScript bug in main.js'}]).map(t=>t[0]);
  assert.ok(normal.includes('read_file'));
  assert.ok(normal.includes('apply_patch'));
  assert.ok(!normal.includes('gh_push'));
  assert.ok(!normal.includes('apk_sign'));
  const github=h.selectTools(tools,[{role:'user',text:'Push the fix to GitHub repository and open pull request'}]).map(t=>t[0]);
  assert.ok(github.includes('gh_push'));
  h.setToolMode('full');
  assert.equal(h.selectTools(tools,[{role:'user',text:'Fix a JavaScript bug'}]).length,tools.length);
});

test('economy mode prunes only old tool outputs and leaves visible history untouched', async()=>{
  const h=harness({files:{}});h.setToolMode('economy');
  const history=Array.from({length:18},(_,i)=>({role:'tool',name:'read_file',result:String(i)+'X'.repeat(2200)}));
  const pruned=h.pruneHistory(history);
  assert.ok(pruned[0].result.length<history[0].result.length);
  assert.equal(pruned[17].result,history[17].result);
  assert.equal(history[0].result.length,2201);
});


test('LSP fica disponível nos perfis de leitura e no modo de economia; fallback não edita arquivos', async()=>{
  const h=harness({role:'explore',files:{'src/a.js':'function foo() { return 1; }\nfoo();'}});
  h.setToolMode('economy');
  assert.ok(h.getTools().some(t=>t[0]==='lsp'));
  const chosen=h.selectTools(h.getTools(),[{role:'user',text:'Investigue o código e encontre referências'}]);
  assert.ok(chosen.some(t=>t[0]==='lsp'));
  const before=h.getFiles()['src/a.js'];
  const result=await h.exec('lsp',{operation:'references',path:'src/a.js',line:1,character:10,symbol:'foo'});
  assert.match(result,/FALLBACK TEXTUAL/);
  assert.equal(h.getFiles()['src/a.js'],before);
});

test('instruction_report follows only ancestor instructions for the target path', async()=>{
  const h=harness({files:{
    'AGENTS.md':'Root conventions apply.',
    'src/AGENTS.md':'Source-specific rules apply.',
    'docs/AGENTS.md':'Do not include unrelated docs rules.',
    '.github/copilot-instructions.md':'Repository-wide Copilot notes.'
  }});
  const out=await h.exec('instruction_report',{path:'src/components/Button.js'});
  assert.match(out,/Root conventions apply/);assert.match(out,/Source-specific rules apply/);assert.match(out,/Repository-wide Copilot notes/);assert.doesNotMatch(out,/unrelated docs rules/);
});

test('run_project_checks can discover a Go test command without package.json', async()=>{
  const h=harness({files:{'go.mod':'module example.com/app\ngo 1.23','main.go':'package main\nfunc main() {}'}});
  const out=await h.exec('run_project_checks',{checks:'test'});
  assert.match(out,/VERIFICAÇÕES DO PROJETO/);assert.deepEqual(h.getShellCalls(),['go test ./...']);
});
