/* vsh — terminal embutido: roda dentro do app, sem servidor, sobre os arquivos do projeto.
   Comandos: ls cat head tail wc grep rg find tree sed sort uniq echo mkdir touch rm mv cp pwd cd which help python node.
   Suporta pipes (|), && ; || e redirecionamento (> >>). git/npm/pip reais só com o Termux ligado. */
const VSH={cwd:'',dirs:new Set(),dirty:false,hooks:{}};
const vNorm=p=>{p=String(p||'');const o=p.startsWith('/')?[]:VSH.cwd.split('/').filter(Boolean);for(const s of p.split('/'))if(s&&s!='.')s=='..'?o.pop():o.push(s);return o.join('/')};
const vIsDir=(f,p)=>p==''||VSH.dirs.has(p)||Object.keys(f).some(k=>k.startsWith(p+'/'));
const vGlob=g=>new RegExp('^'+g.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$');
function vTok(s){const o=[];let c='',q=null,h=false,qf=false;const push=()=>{if(h||c){o.push({v:c,q:qf});c='';h=false;qf=false}};
 for(let i=0;i<s.length;i++){const x=s[i];
  if(q){if(x==q)q=null;else if(x=='\\'&&q=='"'&&i+1<s.length)c+=s[++i];else c+=x;continue}
  if(x=='"'||x=="'"){q=x;h=true;qf=true;continue}
  if(x=='\\'&&i+1<s.length){c+=s[++i];h=true;qf=true;continue}
  if(/\s/.test(x)){push();continue}
  if('|&;><'.includes(x)){push();let op=x;if('&|>'.includes(x)&&s[i+1]==x){op=x+x;i++}o.push({op});continue}
  c+=x}
 if(q)throw new Error('aspas não fechadas');push();return o}
function vFiles(f,paths,rec){const out=[];for(const a of paths){const p=vNorm(a);if(p in f)out.push(p);else if(vIsDir(f,p)){if(!rec)out.push({dir:a});else for(const k of Object.keys(f).sort())if(p==''||k.startsWith(p+'/'))out.push(k)}else out.push({miss:a})}return out}
const vLines=t=>t==''?[]:t.replace(/\n$/,'').split('\n');
async function vCmd(f,argv,inp){
 const [c,...a]=argv,fl=[],ar=[];for(const x of a)(/^-[a-zA-Z0-9]/.test(x)&&!ar.length||x=='--'?fl:ar).push(x);
 const has=k=>fl.some(x=>x.startsWith('-')&&!x.startsWith('--')&&x.slice(1).includes(k)),R=(o,code=0)=>({out:o,code});
 const num=(d)=>{const i=a.findIndex(x=>x=='-n');if(i>=0&&a[i+1])return[+a[i+1],a.filter((_,j)=>j!=i&&j!=i+1&&!/^-\d+$/.test(a[j]))];const m=a.find(x=>/^-\d+$/.test(x));return[m?-m:d,a.filter(x=>!/^-\d+$/.test(x))]};
 switch(c){
 case'pwd':return R('/'+VSH.cwd+'\n');
 case'cd':{const p=vNorm(ar[0]||'/');if(!vIsDir(f,p))return R('cd: '+ar[0]+': No such file or directory\n',1);VSH.cwd=p;return R('')}
 case'echo':return R((has('n')?ar.join(' '):ar.join(' ')+'\n'));
 case'true':case'clear':return R('');case'false':return R('',1);
 case'whoami':return R('codemobile\n');case'date':return R(new Date().toString()+'\n');
 case'ls':{const ps=ar.length?ar:['.'],o=[];for(const a0 of ps){const p=vNorm(a0);if(p in f){o.push(has('l')?f[p].length+' '+a0:a0);continue}if(!vIsDir(f,p)){o.push('ls: cannot access \''+a0+'\': No such file or directory');continue}
   const m=new Map();for(const k of Object.keys(f).sort())if(p==''||k.startsWith(p+'/')){const r=k.slice(p?p.length+1:0),n=r.split('/')[0];m.set(n,r.includes('/')?'d':f[k].length)}
   for(const d of VSH.dirs)if(p==''||d.startsWith(p+'/')){const n=d.slice(p?p.length+1:0).split('/')[0];if(n)m.set(n,'d')}
   if(ps.length>1)o.push(a0+':');for(const[n,v]of[...m].sort())if(has('a')||n[0]!='.')o.push(has('l')?(v=='d'?'dir  ':String(v).padStart(6)+' ')+n+(v=='d'?'/':''):n+(v=='d'?'/':''));}
  return R(o.join('\n')+'\n',o.some(x=>/^ls:/.test(x))?1:0)}
 case'cat':{if(!ar.length)return R(inp);let o='',code=0;for(const x of vFiles(f,ar)){if(typeof x=='string')o+=f[x]+(f[x].endsWith('\n')||!f[x]?'':'\n');else{o+='cat: '+(x.miss||x.dir)+': '+(x.miss?'No such file or directory':'Is a directory')+'\n';code=1}}return R(o,code)}
 case'head':case'tail':{const[n,rest]=num(10),fs_=rest.filter(x=>!x.startsWith('-')),src=fs_.length?fs_.map(x=>f[vNorm(x)]).filter(x=>x!=null).join('\n'):inp,L=vLines(src);return R((c=='head'?L.slice(0,n):L.slice(-n)).join('\n')+(L.length?'\n':''))}
 case'wc':{const t=ar.length?ar.map(x=>f[vNorm(x)]).filter(x=>x!=null).join(''):inp,l=vLines(t).length,w=(t.match(/\S+/g)||[]).length;return R((has('l')?l:has('w')?w:has('c')?t.length:l+' '+w+' '+t.length)+'\n')}
 case'sort':{let L=vLines(ar.length?ar.map(x=>f[vNorm(x)]||'').join(''):inp);L=has('n')?L.sort((x,y)=>parseFloat(x)-parseFloat(y)):L.sort();if(has('r'))L.reverse();if(has('u'))L=[...new Set(L)];return R(L.join('\n')+(L.length?'\n':''))}
 case'uniq':{const L=vLines(ar.length?f[vNorm(ar[0])]||'':inp),o=[];for(const x of L)if(o[o.length-1]!==x)o.push(x);return R(o.join('\n')+(o.length?'\n':''))}
 case'mkdir':for(const x of ar){const p=vNorm(x);if(p in f)return R('mkdir: '+x+': File exists\n',1);VSH.dirs.add(p)}return R('');
 case'touch':for(const x of ar){const p=vNorm(x);if(!(p in f)){f[p]='';VSH.dirty=true}}return R('');
 case'rm':{let code=0,o='';for(const x of ar){const p=vNorm(x),ks=Object.keys(f).filter(k=>k==p||k.startsWith(p+'/'));if(!ks.length&&!VSH.dirs.has(p)){if(!has('f')){o+='rm: cannot remove \''+x+'\': No such file or directory\n';code=1}continue}
   if(!(p in f)&&!has('r')&&!has('R')){o+='rm: cannot remove \''+x+'\': Is a directory\n';code=1;continue}ks.forEach(k=>delete f[k]);VSH.dirs.delete(p);VSH.dirty=true}return R(o,code)}
 case'mv':case'cp':{if(ar.length<2)return R(c+': faltam operandos\n',1);const dst=vNorm(ar[ar.length-1]),dd=vIsDir(f,dst)&&!(dst in f);let o='',code=0;
  for(const x of ar.slice(0,-1)){const p=vNorm(x),ks=Object.keys(f).filter(k=>k==p||k.startsWith(p+'/'));if(!ks.length){o+=c+': cannot stat \''+x+'\': No such file or directory\n';code=1;continue}
   if(!(p in f)&&!has('r')&&c=='cp'){o+='cp: -r not specified; omitting directory \''+x+'\'\n';code=1;continue}
   const base=p.split('/').pop();for(const k of ks){const t=(dd?dst+'/'+base:dst)+k.slice(p.length);f[t]=f[k];if(c=='mv')delete f[k]}VSH.dirty=true}return R(o,code)}
 case'grep':case'rg':{const rg=c=='rg',a2=[...a];let pat=null,files=[];const fo=[];for(let i=0;i<a2.length;i++){const x=a2[i];if(x=='-e'&&a2[i+1]!=null){pat=a2[++i];continue}if(/^-[a-zA-Z]/.test(x)&&pat===null&&!files.length){fo.push(x);continue}if(pat===null)pat=x;else files.push(x)}
  if(pat===null)return R(c+': faltou o padrão\n',2);const H=k=>fo.some(x=>x.slice(1).includes(k)),rec=H('r')||H('R')||rg||(!files.length&&!inp);
  let ic=H('i')||(rg&&pat==pat.toLowerCase()),re;try{re=new RegExp(H('F')?pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):pat,ic?'i':'')}catch(e){return R(c+': regex inválida: '+e.message+'\n',2)}
  if(H('w'))re=new RegExp('\\b(?:'+re.source+')\\b',re.flags);const src=[];
  if(files.length||rec||!inp){for(const x of vFiles(f,files.length?files:['.'],rec))if(typeof x=='string')src.push([x,f[x]]);else if(x.miss)return R(c+': '+x.miss+': No such file or directory\n',2)}else src.push([null,inp]);
  const multi=src.length>1||rec&&src[0]&&src[0][0]!=null&&files.length!=1||rg,o=[];let n=0;
  for(const[k,t]of src){let cn=0;vLines(t).forEach((l,i)=>{if(re.test(l)!=H('v')){cn++;n++;if(!H('l')&&!H('c'))o.push((k&&(multi||rec)?k+':':'')+(H('n')||rg?(i+1)+':':'')+l)}});if(H('l')&&cn)o.push(k);if(H('c'))o.push((k&&multi?k+':':'')+cn)}
  return R(o.slice(0,300).join('\n')+(o.length?'\n':'')+(o.length>300?'…[+'+(o.length-300)+' linhas]\n':''),n?0:1)}
 case'find':{let root='.',nm=null,ty=null,md=99;const t=[...a];if(t[0]&&!t[0].startsWith('-'))root=t.shift();for(let i=0;i<t.length;i++){if(t[i]=='-name'||t[i]=='-iname')nm=vGlob(t[++i]);else if(t[i]=='-type')ty=t[++i];else if(t[i]=='-maxdepth')md=+t[++i]}
  const p=vNorm(root);if(!vIsDir(f,p)&&!(p in f))return R('find: \''+root+'\': No such file or directory\n',1);const ds=new Set(VSH.dirs),all=Object.keys(f).filter(k=>p==''||k==p||k.startsWith(p+'/')).sort();
  for(const k of all){const s=k.split('/');for(let i=1;i<s.length;i++)ds.add(s.slice(0,i).join('/'))}const o=[];const pre=root.replace(/\/$/,'');
  const out=(k,d)=>{const rel=p?k.slice(p.length).replace(/^\//,''):k,dep=rel?rel.split('/').length:0;if(dep>md)return;if(nm&&!nm.test(k.split('/').pop()))return;if(ty&&ty!=(d?'d':'f'))return;o.push(rel?(pre||'.')+'/'+rel:pre||'.')};
  if(!ty||ty=='d')[...ds].filter(d=>p==''||d==p||d.startsWith(p+'/')).sort().forEach(d=>out(d,1));all.forEach(k=>{if(!ty||ty=='f')out(k,0)});return R(o.sort().join('\n')+(o.length?'\n':''))}
 case'tree':{const p=vNorm(ar[0]||'.'),ks=Object.keys(f).filter(k=>p==''||k.startsWith(p+'/')).map(k=>k.slice(p?p.length+1:0)).sort();const o=[ar[0]||'.'];
  const rec=(L,pre)=>{const g=new Map();for(const k of L){const i=k.indexOf('/'),h=i<0?k:k.slice(0,i);if(!g.has(h))g.set(h,[]);if(i>=0)g.get(h).push(k.slice(i+1))}const e=[...g];e.forEach(([n,ch],i)=>{const last=i==e.length-1;o.push(pre+(last?'└── ':'├── ')+n+(ch.length?'/':''));if(ch.length)rec(ch,pre+(last?'    ':'│   '))})};
  rec(ks,'');return R(o.join('\n')+'\n')}
 case'sed':{const sc=ar.find(x=>!x.startsWith('-'))||'',fl2=ar.filter(x=>x!=sc),fp=fl2[0]?vNorm(fl2[0]):null;if(fp&&!(fp in f))return R('sed: '+fl2[0]+': No such file or directory\n',2);let t=fp?f[fp]:inp,m;
  if(m=/^(\d+)(?:,(\d+|\$))?p$/.exec(sc)){const L=vLines(t),s=+m[1],e=m[2]=='$'?L.length:+(m[2]||m[1]);return R(L.slice(s-1,e).join('\n')+'\n')}
  if(m=/^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(sc)){let re;try{re=new RegExp(m[2],m[4])}catch(e){return R('sed: regex inválida\n',1)}t=t.replace(re,m[3].replace(/\\n/g,'\n'));if(has('i')&&fp){f[fp]=t;VSH.dirty=true;return R('')}return R(t)}
  return R('sed: só suporto \'N,Mp\' e \'s/a/b/[g]\' (use -i para editar o arquivo)\n',1)}
 case'which':return R(ar.map(x=>VSH.names.includes(x)?x+': embutido\n':'').join(''),ar.every(x=>VSH.names.includes(x))?0:1);
 case'python':case'python3':{if(a[0]=='-V'||a[0]=='--version')return R('Python 3 (Pyodide, embutido)\n');let main,files=f,i0=null;
  if(a[0]=='-c'){main='__cm_c__.py';files={...f,[main]:a[1]||''}}else{main=vNorm(a[0]||'');if(!a[0])return R('python: informe um arquivo ou -c "código"\n',2);if(!(main in f))return R('python: can\'t open file \''+a[0]+'\': No such file\n',2)}
  const r=await VSH.hooks.py(files,main,inp||'');return R(r.out||'',r.ok?0:1)}
 case'node':{let code;if(a[0]=='-v'||a[0]=='--version')return R('node (JS do navegador, embutido)\n');if(a[0]=='-e'||a[0]=='-p')code=a[1]||'';else{const p=vNorm(a[0]||'');if(!(p in f))return R('node: arquivo não encontrado: '+(a[0]||'')+'\n',1);code=f[p]}
  const lg=await VSH.hooks.js(code);const bad=/\[error\]/.test(lg),o=lg==='(sem erros, sem saída no console)'?'':lg.replace(/^\[(log|info|warn)\] /gm,'').replace(/^\[error\] /gm,'Erro: ');return R(o+(o?'\n':''),bad?1:0)}
 case'help':case'commands':return R('Terminal embutido do CodeMobile — comandos: '+VSH.names.join(' ')+'\nPipes (|), &&, ;, || e redirecionamento (> >>) funcionam. Para git/npm/pip/curl reais ligue o Termux (./start.sh).\n');
 default:{const x=VSH.x[c];if(x)return await x(f,a,inp);return R('sh: '+c+': comando não encontrado (digite help)\n',127)}}}
VSH.names='pwd cd echo ls cat head tail wc sort uniq mkdir touch rm mv cp grep rg find tree sed which python python3 node true false clear whoami date help'.split(' ');
/* ---- expansão de $VAR, $(...), `...` e globs (*, ?) ---- */
VSH.env={HOME:'/',USER:'codemobile',SHELL:'/bin/sh',PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};VSH.x={};VSH.last=0;
const vEsc=t=>t.replace(/[\\'"|&;<>$`()*?]/g,'\\$&');
async function vPre(s,f,depth){let o='',q=null;
 for(let i=0;i<s.length;i++){const c=s[i];
  if(c=="'"&&q!='"'){q=q?null:"'";o+=c;continue}if(c=='"'&&q!="'"){q=q?null:'"';o+=c;continue}if(q=="'"){o+=c;continue}
  if(c=='\\'){o+=c+(s[++i]||'');continue}
  if(c=='$'&&s[i+1]=='('){let d=1,j=i+2;while(j<s.length&&d){if(s[j]=='(')d++;else if(s[j]==')')d--;j++}const r=await vsh(s.slice(i+2,j-1),f,depth+1);o+=vEsc(r.out.replace(/\n+$/,''));i=j-1;continue}
  if(c=='`'){const j=s.indexOf('`',i+1);if(j>0){const r=await vsh(s.slice(i+1,j),f,depth+1);o+=vEsc(r.out.replace(/\n+$/,''));i=j;continue}}
  if(c=='$'){const m=/^\$(?:\{(\w+)\}|(\w+)|(\?))/.exec(s.slice(i));if(m){const k=m[1]||m[2]||m[3];o+=vEsc(String(k=='?'?VSH.last:(VSH.env[k]??'')));i+=m[0].length-1;continue}}
  o+=c}
 return o}
function vGlobX(f,pat){const abs=pat[0]=='/',pre=abs?'':(VSH.cwd?VSH.cwd+'/':''),dot=pat.startsWith('./')?'./':abs?'/':'',pp=pat.replace(/^\.\//,'').replace(/^\//,''),E=x=>x.replace(/[.+^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp('^'+E(pre)+pp.split('/').map(g=>(/^[*?]/.test(g)?'(?!\\.)':'')+E(g).replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]')).join('/')+'$');
 const all=new Set(Object.keys(f));for(const k of Object.keys(f)){const s=k.split('/');for(let i=1;i<s.length;i++)all.add(s.slice(0,i).join('/'))}for(const d of VSH.dirs)all.add(d);
 const m=[...all].filter(k=>re.test(k)).sort().map(k=>dot+(pre&&k.startsWith(pre)?k.slice(pre.length):k));return m.length?m:[pat]}
async function vWords(s,f){const o=[];for(const t of vTok(s))if(t.v!=null)o.push(...(!t.q&&/[*?]/.test(t.v)?vGlobX(f,t.v):[t.v]));return o}
/* separa a linha em comandos por ; && || (fora de aspas, $(...) e crases) */
function vSplit(s){const o=[];let c='',q=null,d=0,bt=false;
 for(let i=0;i<s.length;i++){const x=s[i];
  if(q){c+=x;if(x==q)q=null;else if(x=='\\'&&q=='"')c+=s[++i]||'';continue}
  if(x=="'"||x=='"'){q=x;c+=x;continue}
  if(x=='\\'){c+=x+(s[++i]||'');continue}
  if(x=='`'){bt=!bt;c+=x;continue}
  if(x=='('&&s[i-1]=='$'){d++;c+=x;continue}if(x==')'&&d>0){d--;c+=x;continue}
  if(!d&&!bt&&(x==';'||(x=='&'&&s[i+1]=='&')||(x=='|'&&s[i+1]=='|'))){const op=x==';'?';':x+x;if(op!=';')i++;o.push({s:c,sep:op});c='';continue}
  c+=x}
 o.push({s:c,sep:';'});return o}
/* executa uma linha completa: retorna {out,code} (modifica f direto). Suporta for/if de uma linha, ; && || | > >> */
async function vsh(line,f,depth=0){
 if(!depth)VSH.dirty=false;if(depth>6)return{out:'sh: aninhamento profundo demais\n',code:1};
 line=String(line).trim();let m;
 try{
 if(m=/^for\s+(\w+)\s+in\s+(.+?)\s*;\s*do\s+(.+?)\s*;\s*done\s*(?:;\s*(.*))?$/s.exec(line)){
  const items=await vWords(await vPre(m[2],f,depth),f);let out='',code=0;
  for(const it of items.slice(0,500)){VSH.env[m[1]]=it;const r=await vsh(m[3],f,depth+1);out+=r.out;code=r.code}
  if(m[4]){const r=await vsh(m[4],f,depth+1);return{out:out+r.out,code:r.code}}return{out,code}}
 if(m=/^if\s+(.+?)\s*;\s*then\s+(.+?)\s*(?:;\s*else\s+(.+?)\s*)?;\s*fi\s*(?:;\s*(.*))?$/s.exec(line)){
  const c=await vsh(m[1],f,depth+1),b=c.code==0?m[2]:m[3],r=b?await vsh(b,f,depth+1):{out:'',code:0};let out=c.out+r.out,code=r.code;
  if(m[4]){const r2=await vsh(m[4],f,depth+1);out+=r2.out;code=r2.code}return{out,code}}
 line=line.replace(/\s2>&1/g,'').replace(/\s\d?>\s*\/dev\/null/g,'')}catch(e){return{out:'sh: '+e.message+'\n',code:2}}
 let out='',code=0,prev=';';
 for(const{s:seg,sep}of vSplit(line)){if(!seg.trim()){prev=sep;continue}
  const skip=(prev=='&&'&&code!=0)||(prev=='||'&&code==0);
  if(!skip){let toks;try{toks=vTok(await vPre(seg,f,depth))}catch(e){return{out:out+'sh: '+e.message+'\n',code:2}}
   const stages=[[]];for(const t of toks)t.op=='|'?stages.push([]):stages[stages.length-1].push(t);let data='',rc=0;
   for(let si=0;si<stages.length;si++){const st=stages[si],words=[];let rd=null;for(let i=0;i<st.length;i++){if(st[i].op=='>'||st[i].op=='>>'){rd={op:st[i].op,p:st[i+1]&&st[i+1].v};i++}else if(st[i].v!=null)words.push(st[i])}
    const argv=[];for(const w of words)argv.push(...(!w.q&&/[*?]/.test(w.v)?vGlobX(f,w.v):[w.v]));
    while(argv.length&&/^[A-Za-z_]\w*=/.test(argv[0])){const k=argv.shift(),i=k.indexOf('=');VSH.env[k.slice(0,i)]=k.slice(i+1)}
    if(!argv.length)continue;let r;try{r=await vCmd(f,argv,data)}catch(e){r={out:argv[0]+': erro: '+e.message+'\n',code:1}}data=r.out;rc=r.code;VSH.last=rc;if(rd&&rd.p){const p=vNorm(rd.p);f[p]=(rd.op=='>>'&&p in f?f[p]:'')+data;VSH.dirty=true;data=''}}
   out+=data;code=rc}
  prev=sep}
 return{out,code}}
