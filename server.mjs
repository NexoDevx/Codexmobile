// CodeMobile server — sem dependências. Uso: node server.mjs  (PORT=8787 por padrão)
// Serve o app, repassa o login do GitHub (CORS), roda comandos reais, busca páginas e guarda o estado em disco.
import http from 'node:http';import crypto from 'node:crypto';import dns from 'node:dns/promises';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn,spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=path.join(root,'www'),DATA=process.env.CM_DATA||path.join(root,'data'),WS=path.join(DATA,'ws'),PORT=+process.env.PORT||8787;
fs.mkdirSync(WS,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const GH=new Set(['/login/device/code','/login/oauth/access_token']),IGN=new Set(['node_modules','.git','.cache','.npm','__pycache__','.venv']);
const PRIV=/^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i;
const safe=(b,r)=>{const f=path.resolve(b,String(r));return f.startsWith(b+path.sep)?f:null};
/* nome de workspace: nunca vazio, nunca '.'/'..', e nomes diferentes nunca colidem (sufixo hash quando foi alterado) */
const wsName=n=>{const s=String(n??''),c=s.replace(/[^\w.-]+/g,'_').replace(/^\.+/,'_').slice(0,48)||'projeto';return c===s?c:c+'-'+crypto.createHash('sha1').update(s,'utf8').digest('hex').slice(0,8)};
const MAN=path.join(DATA,'manifest');fs.mkdirSync(MAN,{recursive:true});
const manRead=n=>{try{return new Set(JSON.parse(fs.readFileSync(path.join(MAN,n+'.json'),'utf8')))}catch{return new Set()}};
const manWrite=(n,s)=>fs.writeFileSync(path.join(MAN,n+'.json'),JSON.stringify([...s]));
// O espelho LSP tem manifesto separado para nunca confundir arquivos sincronizados
// pelo editor com arquivos gerados/gerenciados pelo endpoint de shell.
const LSPMAN=path.join(DATA,'lsp-manifest');fs.mkdirSync(LSPMAN,{recursive:true});
const lspManRead=n=>{try{return new Set(JSON.parse(fs.readFileSync(path.join(LSPMAN,n+'.json'),'utf8')))}catch{return new Set()}};
const lspManWrite=(n,s)=>fs.writeFileSync(path.join(LSPMAN,n+'.json'),JSON.stringify([...s]));
/* caminho de escrita: dentro do workspace e sem seguir link simbólico para fora */
const safeW=(b,r)=>{const f=safe(b,r);if(!f)return null;try{let d=path.dirname(f);while(!fs.existsSync(d))d=path.dirname(d);const rb=fs.realpathSync(b),rd=fs.realpathSync(d);if(rd!==rb&&!rd.startsWith(rb+path.sep))return null;const st=fs.lstatSync(f,{throwIfNoEntry:false});if(st&&st.isSymbolicLink())return null}catch{return null}return f};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
async function body(req,max=30e6){const c=[];let n=0;for await(const d of req){n+=d.length;if(n>max)throw new Error('corpo grande demais');c.push(d)}return Buffer.concat(c)}
function walk(base,rel='',out={}){let es;try{es=fs.readdirSync(path.join(base,rel),{withFileTypes:true})}catch{return out}
 for(const e of es){if(IGN.has(e.name))continue;const r=rel?rel+'/'+e.name:e.name;
  if(e.isDirectory())walk(base,r,out);else if(e.isFile()){try{const f=path.join(base,r);const b=fs.readFileSync(f);if(b.includes(0))continue;out[r]=b.toString('utf8')}catch{}}}
 return out}
/* pastas do aparelho (modo Termux/navegador): só dentro do HOME, /storage e /sdcard */
import os from 'node:os';
import { LspManager, safeRelativePath as lspSafePath } from './lsp.mjs';
const FROOTS=[os.homedir(),'/storage','/sdcard'].map(p=>{try{return fs.realpathSync(p)}catch{return null}}).filter(Boolean);
const fdir=r=>{const f=path.resolve(String(r||os.homedir()));let x;try{x=fs.realpathSync(f)}catch{return null}return FROOTS.some(b=>x===b||x.startsWith(b+path.sep))?x:null};
const BINX=/\.(png|jpe?g|gif|webp|ico|zip|apk|exe|dll|so|jar|class|pdf|mp[34]|ogg|wav|ttf|otf|woff2?|gguf|bin)$/i;
function dirRead(base){const files={},sk=[];let n=0;const w=(rel)=>{let es;try{es=fs.readdirSync(path.join(base,rel),{withFileTypes:true})}catch{return}
 for(const e of es){if(IGN.has(e.name)||e.name=='build'||e.name=='.gradle')continue;const r=rel?rel+'/'+e.name:e.name;
  if(e.isDirectory())w(r);else if(e.isFile()){try{const f=path.join(base,r),st=fs.statSync(f);if(BINX.test(e.name)){sk.push(r);continue}const b=fs.readFileSync(f);if(b.includes(0)){sk.push(r);continue}files[r]=b.toString('utf8');n++}catch{}}}};w('');return{files,skipped:sk.length,skippedText:sk.join('\n')}}
let RUN=0;
async function exec(b){
 if(!b||typeof b!='object'||Array.isArray(b))throw new Error('corpo inválido');
 if(typeof b.cmd!='string'||!b.cmd.trim()||b.cmd.length>20000)throw new Error('cmd inválido (vazio ou maior que 20000 caracteres)');
 const files=b.files&&typeof b.files=='object'&&!Array.isArray(b.files)?b.files:{};if(Object.keys(files).length>5000)throw new Error('arquivos demais (máx. 5000)');
 if(RUN>=2)throw new Error('já há 2 comandos em execução; aguarde');
 const name=wsName(b.project),base=path.join(WS,name);fs.mkdirSync(base,{recursive:true});const man=manRead(name);
 for(const[k,v]of Object.entries(files)){const f=safeW(base,k);if(!f||typeof v!='string')continue;let cur=null;try{cur=fs.readFileSync(f,'utf8')}catch{}if(cur!==v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v)}}
 /* só apaga do disco o que o app gerenciava e removeu (nunca arquivos desconhecidos/externos) */
 for(const k of man)if(!(k in files)){const f=safeW(base,k);if(f)try{fs.unlinkSync(f)}catch{}}
 const before=walk(base),t=Math.min(Math.max(+b.timeout||60,1),600)*1000;RUN++;
 let r;try{r=await new Promise(res=>{let out='',to=false;const c=spawn(SH,['-c',b.cmd],{cwd:base,env:ENV,detached:true,stdio:['ignore','pipe','pipe']});
  const add=d=>{out+=d;if(out.length>60000)out=out.slice(-30000)};c.stdout.on('data',add);c.stderr.on('data',add);
  const k=setTimeout(()=>{to=true;try{process.kill(-c.pid,'SIGKILL')}catch{}},t);
  c.on('close',code=>{clearTimeout(k);try{process.kill(-c.pid,'SIGKILL')}catch{}res({code,out,to})});c.on('error',e=>{clearTimeout(k);res({code:-1,out:String(e),to})})})}finally{RUN--}
 const after=walk(base),changed={},deleted=[];
 for(const k in after)if(before[k]!==after[k])changed[k]=after[k];
 for(const k in before)if(!(k in after))deleted.push(k);
 const known=new Set([...Object.keys(files),...Object.keys(changed)]);for(const k of deleted)known.delete(k);manWrite(name,known);
 return{code:r.code,out:r.out.slice(-12000),timedOut:r.to,changed,deleted}}
async function fetchTxt(u){let x;try{x=new URL(u)}catch{throw new Error('URL inválida')}
 if(!/^https?:$/.test(x.protocol)||PRIV.test(x.hostname))throw new Error('URL não permitida');
 try{if((await dns.lookup(x.hostname,{all:true})).some(a=>PRIV.test(a.address)))throw new Error('URL não permitida')}catch(e){if(/não permitida/.test(e.message))throw e}
 const r=await fetch(x,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 CodeMobile'}});
 return{status:r.status,text:Buffer.from(await r.arrayBuffer()).subarray(0,1500000).toString('utf8')}}
/* shell do agente: bash se existir (Termux tem), ambiente sem pager/prompt para nada travar */
const SH=['/data/data/com.termux/files/usr/bin/bash','/usr/bin/bash','/bin/bash'].find(p=>fs.existsSync(p))||'sh';
const KEEP=['PATH','HOME','LANG','PREFIX','TMPDIR','SHELL','USER','LD_PRELOAD','LD_LIBRARY_PATH','ANDROID_ROOT','ANDROID_DATA','TERMUX_VERSION'];
const ENV={...Object.fromEntries(KEEP.filter(k=>process.env[k]!=null).map(k=>[k,process.env[k]])),CI:'1',FORCE_COLOR:'0',TERM:'dumb',PAGER:'cat',GIT_PAGER:'cat',GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',npm_config_update_notifier:'false',npm_config_fund:'false'};
const LSP=new LspManager({env:ENV,maxSessions:3,idleMs:5*60*1000});
function syncLspWorkspace(name,incoming){
 const base=path.join(WS,name);fs.mkdirSync(base,{recursive:true});
 if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw new Error('arquivos do projeto inválidos');
 const keys=Object.keys(incoming);if(keys.length>5000)throw new Error('arquivos demais para LSP (máx. 5000)');
 let total=0;const files={};
 for(const raw of keys){const rel=lspSafePath(raw),v=incoming[raw];if(!rel||typeof v!=='string')continue;if(/(^|\/)(?:node_modules|\.git|dist|build|coverage|\.cache)\//.test(rel))continue;total+=Buffer.byteLength(v,'utf8');if(total>20*1024*1024)throw new Error('workspace excede 20 MB de texto para uma sessão LSP');files[rel]=v;}
 const managed=lspManRead(name);
 for(const [rel,v] of Object.entries(files)){const f=safeW(base,rel);if(!f)continue;let old=null;try{old=fs.readFileSync(f,'utf8')}catch{}if(old!==v){fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.cm-lsp-tmp';fs.writeFileSync(tmp,v);fs.renameSync(tmp,f);}}
 for(const k of managed)if(!(k in files)){const f=safeW(base,k);if(f)try{fs.unlinkSync(f)}catch{}}
 lspManWrite(name,new Set(Object.keys(files)));return{base,files};
}
/* identidade do git só se o usuário ainda não tiver configurado */
try{for(const[k,v]of[['user.name','CodeMobile'],['user.email','codemobile@localhost'],['init.defaultBranch','main']])if(!(spawnSync('git',['config','--global',k]).stdout||'').toString().trim())spawnSync('git',['config','--global',k,v])}catch{}
const TOOLS='git python3 python node npm npx pip rg fd jq tree curl wget sed awk find grep zip unzip make clang ssh gh'.split(' ');
function caps(){const r=spawnSync(SH,['-c','for c in '+TOOLS.join(' ')+'; do command -v $c >/dev/null 2>&1 && echo $c; done'],{env:ENV});return{shell:path.basename(SH),tools:(r.stdout||'').toString().split('\n').filter(Boolean),termux:fs.existsSync('/data/data/com.termux')}}
const SF=path.join(DATA,'state.json');
/* autenticação: token aleatório por instalação, expira em 30 dias, rotacionável (POST /api/rotate) */
const TOKF=path.join(DATA,'token');let TOK='';
const newTok=()=>{TOK=crypto.randomBytes(24).toString('hex');fs.writeFileSync(TOKF,JSON.stringify({t:TOK,ts:Date.now()}),{mode:0o600})};
try{const j=JSON.parse(fs.readFileSync(TOKF,'utf8'));if(j.t&&Date.now()-j.ts<30*864e5)TOK=j.t}catch{}if(!TOK)newTok();
const okTok=req=>{const a=String(req.headers.authorization||''),t=a.startsWith('Bearer ')?a.slice(7):'',A=Buffer.from(t),B=Buffer.from(TOK);return A.length==B.length&&crypto.timingSafeEqual(A,B)};
const RL=new Map(),rate=(k,max)=>{const m=Math.floor(Date.now()/6e4),e=RL.get(k);if(!e||e[0]!=m){RL.set(k,[m,1]);return true}return++e[1]<=max};
const RED=/(gh[pousr]_\w{20,}|sk-[\w-]{16,}|AIza[\w-]{30,}|Bearer\s+\S+|(?:token|key|secret|password)=\S+)/gi;
const audit=(m,p,c,x)=>{try{fs.appendFileSync(path.join(DATA,'audit.log'),new Date().toISOString()+' '+m+' '+p+' '+c+(x?' '+String(x).replace(RED,'[redigido]').replace(/\s+/g,' ').slice(0,200):'')+'\n')}catch{}};
const sameSite=req=>{const s=req.headers['sec-fetch-site'];return !s||s=='same-origin'||s=='none'};
http.createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://x'),h=req.headers.host||'';
  if(h!=='localhost:'+PORT&&h!=='127.0.0.1:'+PORT){res.writeHead(403);return res.end('host inválido')}
  const P=u.pathname;
  if((P=='/cm-config.js'||P=='/cm-state.js')&&!sameSite(req)){res.writeHead(403);return res.end('bloqueado')}
  if(P=='/cm-config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end("window.CM_PX=location.origin+'/gh';window.CM_TOK="+JSON.stringify(TOK)+";")}
  if(P=='/cm-state.js'){let sv=null;try{sv=JSON.parse(fs.readFileSync(SF,'utf8'))}catch{}
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
   return res.end("try{const sv="+JSON.stringify(sv)+";if(sv&&sv.ts){const lt=+localStorage.getItem('cm2ts')||0;if(sv.ts>lt+1000){const lo=JSON.parse(localStorage.getItem('cm2')||'null')||{};localStorage.setItem('cm2',JSON.stringify({...sv.state,keys:lo.keys||{},gh:lo.gh,mcp:lo.mcp}));localStorage.setItem('cm2ts',sv.ts)}}}catch(e){}")}
  if(P.startsWith('/gh/')){const p=P.slice(3);if(req.method!='POST'||!GH.has(p)){res.writeHead(404);return res.end('no')}
   const g=await fetch('https://github.com'+p,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:await body(req,1e5)});
   res.writeHead(g.status,{'Content-Type':'application/json'});return res.end(Buffer.from(await g.arrayBuffer()))}
  if(P.startsWith('/api/')){
   if(req.headers.origin&&req.headers.origin!=='http://'+h){audit(req.method,P,403);return send(res,403,{error:'origem bloqueada'})}
   if(P=='/api/ping')return send(res,200,{ok:1,auth:okTok(req)});
   if(!okTok(req)){audit(req.method,P,401);return send(res,401,{error:'não autorizado: token ausente ou inválido'})}
   if(!rate('all',600)||(P=='/api/exec'&&!rate('exec',60))||(P=='/api/lsp'&&!rate('lsp',120)))return send(res,429,{error:'muitas requisições, aguarde um minuto'});
   const M={'/api/caps':'GET','/api/exec':'POST','/api/fetch':'GET','/api/state':'PUT','/api/rotate':'POST','/api/ls':'GET','/api/dirread':'GET','/api/dirwrite':'POST','/api/lsp':'POST'};
   if(!M[P])return send(res,404,{error:'rota desconhecida'});if(req.method!=M[P])return send(res,405,{error:'método não permitido (use '+M[P]+')'});
   try{
    if(P=='/api/caps')return send(res,200,{...caps(),lsp:true});
    if(P=='/api/lsp'){
     let b;try{b=JSON.parse((await body(req,25*1024*1024)).toString())}catch(e){return send(res,400,{error:'JSON inválido ou pedido LSP grande demais'})}
     if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'pedido LSP inválido'});
     const operation=String(b.operation||'status');let base=path.join(WS,wsName(b.project));fs.mkdirSync(base,{recursive:true});
     let safeFiles={};if(operation!=='status'&&operation!=='close'){const synced=syncLspWorkspace(wsName(b.project),b.files||{});base=synced.base;safeFiles=synced.files;}
     const result=await LSP.handle({...b,files:safeFiles},base);audit('POST',P,200,`${operation} ${wsName(b.project)}${b.path?' '+String(b.path).slice(0,100):''}`);return send(res,200,result);
    }
    if(P=='/api/ls'){const d=fdir(u.searchParams.get('path'));if(!d)return send(res,403,{error:'pasta fora da área permitida (HOME, /storage, /sdcard)'});
     let es=[];try{es=fs.readdirSync(d,{withFileTypes:true})}catch(e){return send(res,500,{error:e.message})}
     const par=fdir(path.dirname(d));return send(res,200,{path:d,parent:par&&par!==d?par:null,dirs:es.filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name).sort(),nfiles:es.filter(e=>e.isFile()).length})}
    if(P=='/api/dirread'){const d=fdir(u.searchParams.get('path'));if(!d)return send(res,403,{error:'pasta fora da área permitida'});audit('GET',P,200,d);return send(res,200,dirRead(d))}
    if(P=='/api/dirwrite'){let b;try{b=JSON.parse((await body(req)).toString())}catch{return send(res,400,{error:'JSON inválido'})}
     const d=fdir(b.path);if(!d)return send(res,403,{error:'pasta fora da área permitida'});let c=0;
     for(const[k,v]of Object.entries(b.files||{})){if(typeof v!='string')continue;const f=safeW(d,k);if(!f)continue;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v);c++}
     audit('POST',P,200,d+' '+c+' arquivos');return send(res,200,{count:c})}
    if(P=='/api/rotate'){newTok();audit('POST',P,200);return send(res,200,{token:TOK})}
    if(P=='/api/exec'){let b;try{b=JSON.parse((await body(req)).toString())}catch{return send(res,400,{error:'JSON inválido'})}const r=await exec(b);audit('POST',P,200,'['+wsName(b.project)+'] '+b.cmd+' → exit '+r.code);return send(res,200,r)}
    if(P=='/api/fetch'){const r=await fetchTxt(u.searchParams.get('url'));audit('GET',P,200,u.searchParams.get('url'));return send(res,200,r)}
    if(P=='/api/state'){const d=await body(req,50e6);try{JSON.parse(d.toString())}catch{return send(res,400,{error:'JSON inválido'})}const t=SF+'.tmp';fs.writeFileSync(t,d);fs.renameSync(t,SF);return send(res,200,{ok:1})}
   }catch(e){audit(req.method,P,500,e.message);return send(res,500,{error:e.message})}}
  const f=path.normalize(path.join(dir,P=='/'?'index.html':decodeURIComponent(P)));
  if(!f.startsWith(dir+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('404')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res)
 }catch(e){res.writeHead(502);res.end('erro: '+e.message)}
}).listen(PORT,'127.0.0.1',()=>{console.log('CodeMobile em http://localhost:'+PORT+' · shell: '+SH+' · ferramentas: '+caps().tools.join(' '));console.log('Token de acesso (cole no app se pedido; gire com POST /api/rotate): '+TOK)});
process.on('exit',()=>{try{for(const s of LSP.sessions.values())s.rpc.proc?.kill('SIGTERM')}catch{}});
