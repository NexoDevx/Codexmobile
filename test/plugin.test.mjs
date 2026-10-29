// node test/plugin.test.mjs — instalação de plugin/MCP por link do GitHub (fetch simulado)
import fs from 'node:fs';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const W=fileURLToPath(new URL('../www/',import.meta.url));
const mk=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>'':k=='length'?0:mk(),apply:()=>mk(),set:()=>true});
const store={};const REPOS={
 'o/rea':{'README.md':'# REA\nnpx -y rea-agents setup\nMCP server','package.json':'{"name":"rea-agents","bin":{"rea":"x.js"}}','skills/rea/SKILL.md':'---\nname: rea\ndescription: engenharia reversa\n---\nUse rea.','skills/rea/ref.md':'ref'},
 'o/srv':{'.mcp.json':'{"mcpServers":{"x":{"command":"npx","args":["-y","x-mcp"]},"web":{"url":"https://h.example/mcp"}}}','README.md':'oi'},
 'o/lib':{'README.md':'# lib','src/a.js':'let a=1','logo.png':'bin'},
 'o/cat':{'.claude-plugin/marketplace.json':'{"plugins":[{"name":"um","source":"./plugins/um"}]}','plugins/um/SKILL.md':'---\nname: um\ndescription: d\n---\ncorpo'}};
let calls=[],llm=0;
const ctx={console,document:mk(),window:mk(),navigator:mk(),location:mk(),alert:()=>{},confirm:()=>true,prompt:()=>'',setTimeout,clearTimeout,TextEncoder,TextDecoder,atob,btoa,Blob:function(){},URL:{},AbortController,Promise,JSON,Math,Object,Array,Set,String,Number,Date,RegExp,Error,Uint8Array,
 localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},addEventListener(){},removeEventListener(){}};
ctx.window=ctx;ctx.globalThis=ctx;
ctx.fetch=async u=>{u=String(u);calls.push(u);let m;const J=o=>({ok:true,status:200,json:async()=>o,text:async()=>typeof o=='string'?o:JSON.stringify(o)});
 if(m=/api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(u))return REPOS[m[1]]?J({default_branch:'main'}):{ok:false,status:404};
 if(m=/repos\/([^/]+\/[^/]+)\/git\/trees/.exec(u))return J({tree:Object.entries(REPOS[m[1]]).map(([p,c])=>({type:'blob',path:p,size:c.length}))});
 if(m=/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/(.+)$/.exec(u)){const c=REPOS[m[1]]&&REPOS[m[1]][decodeURIComponent(m[2])];return c==null?{ok:false,status:404}:{ok:true,status:200,text:async()=>c}}
 if(/api\.anthropic|openai|groq|googleapis/.test(u)){llm++;return{ok:true,status:200,json:async()=>({content:[{type:'text',text:'ok'}],choices:[{message:{content:'ok'}}],usage:{}})}}
 return{ok:false,status:404,json:async()=>({}),text:async()=>''}};
vm.createContext(ctx);
for(const f of['app.js','vsh.js','vsh2.js','extras.js','ext.js','ext2.js'])vm.runInContext(fs.readFileSync(W+f,'utf8'),ctx,{filename:f});
vm.runInContext('this.__x={S,pj,GHU,plugIntent,plugInstall,plugChat,exec,run,T}',ctx);const X=ctx.__x;
let fails=0;const ok=(c,l,d)=>{if(!c)fails++;console.log((c?'✓ ':'✗ ')+l+(c?'':'  → '+JSON.stringify(d)))};
const files=()=>X.pj().files;
// URLs
for(const u of['https://github.com/morluto/rea.git','git@github.com:morluto/rea.git','git+https://github.com/morluto/rea.git','github.com/morluto/rea','https://github.com/morluto/rea/tree/main/plugins/x#readme'])ok(X.GHU(u)&&X.GHU(u).o=='morluto'&&X.GHU(u).r=='rea','GHU '+u,X.GHU(u));
ok(X.GHU('https://github.com/morluto/rea/tree/main/plugins/x').p=='plugins/x','GHU subpasta');
// intenção
const I=t=>X.plugIntent(t);
ok(I('https://github.com/morluto/rea.git').url.includes('morluto/rea'),'só o link');
ok(I('instala esse plugin https://github.com/morluto/rea.git'),'instala + link');
ok(I('conecta esse mcp git@github.com:morluto/rea.git por favor'),'git@ + conecta');
ok(!I('explique o que faz https://github.com/morluto/rea'),'pergunta não instala');
ok(!I('oi tudo bem'),'sem link');ok(!I('[Sistema] https://github.com/o/r'),'mensagem interna ignorada');
ok(I('instale https://github.com/o/rea e analise o app notas do mac').follow.includes('analise'),'follow-up',I('instale https://github.com/o/rea e analise o app notas do mac'));
// instalação
let r=await X.plugInstall('https://github.com/o/rea.git');
ok(r.ok&&files()['skills/rea/SKILL.md']&&files()['skills/rea/ref.md'],'skill ativada em skills/rea',Object.keys(files()));
ok(/stdio/.test(r.summary)&&/supergateway/.test(r.summary)&&/rea-agents/.test(r.summary),'dica stdio pelo package.json',r.summary);
r=await X.plugInstall('o/srv');ok(/x-mcp/.test(r.summary)&&/MCP/.test(r.summary),'stdio do .mcp.json + http detectado',r.summary);
ok(X.S.mcp.some(x=>x.n=='web'),'servidor MCP http registrado',X.S.mcp.map(x=>x.n));
r=await X.plugInstall('https://github.com/o/lib');ok(r.ok&&files()['importados/lib/src/a.js']&&!files()['importados/lib/logo.png'],'sem plugin → baixa como referência (texto, sem binário)',Object.keys(files()));
r=await X.plugInstall('https://github.com/o/cat');ok(r.ok&&files()['skills/um/SKILL.md'],'catálogo com 1 plugin',r.summary);
r=await X.plugInstall('https://github.com/o/naoexiste').catch(e=>({err:e.message}));ok(r.err&&/404/.test(r.err),'repo inexistente dá erro claro',r);
// conversa: instala sem chamar o modelo
const p=X.pj();p.hist=[];llm=0;ctx.__x2=null;
await ctx.run('https://github.com/morluto/rea.git').catch(()=>{});
ok(p.hist.length==2&&p.hist[0].role=='user'&&/Não consegui instalar/.test(p.hist[1].text)&&llm==0,'link na conversa: tenta instalar sem chamar o modelo (repo fora do mock → erro tratado)',p.hist.map(m=>m.text&&m.text.slice(0,60)));
p.hist=[];llm=0;await ctx.run('instala https://github.com/o/rea.git');
ok(p.hist.length==2&&/Ativado/.test(p.hist[1].text)&&llm==0,'link na conversa: instala e responde sem gastar tokens',p.hist.map(m=>m.text&&m.text.slice(0,40)));
// ferramenta da IA
ctx.dlg=async o=>1;p.hist=[{role:'user',text:'faz algo'}];
let t=await X.exec('install_plugin',{url:'https://github.com/o/rea'});ok(/Negado/.test(t),'IA tenta instalar sem o usuário ter pedido → confirma e respeita o "não"',t);
p.hist=[{role:'user',text:'instala o plugin github.com/o/rea pra mim'}];t=await X.exec('install_plugin',{url:'https://github.com/o/rea'});ok(/Ativado|skill/.test(t),'IA instala quando o usuário citou o repositório',t.slice(0,80));
X.S.mode='plan';t=await X.exec('install_plugin',{url:'https://github.com/o/rea'});ok(/Modo plano/.test(t),'modo plano bloqueia');X.S.mode='auto';
ok(await X.exec('install_plugin',{url:'xx'})==='Erro: link do GitHub inválido','link inválido');
ok(X.T.some(x=>x[0]=='install_plugin'),'ferramenta registrada');
if(fails){console.log(fails+' falha(s)');process.exit(1)}console.log('TODOS OK');
