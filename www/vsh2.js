/* vsh2 — mais comandos para o mini-terminal: git local, diff, awk, jq, cut, tr, xargs, printf, tee, curl, npm run, test/[ ... */
(()=>{
const X=VSH.x,R=(o,code=0)=>({out:o,code}),L=vLines,rd=(f,a,inp)=>a.length?a.map(x=>f[vNorm(x)]).filter(x=>x!=null).join(''):inp,sq=x=>"'"+x.replace(/'/g,"'\\''")+"'";
X.export=async(f,a)=>{for(const x of a){const i=x.indexOf('=');if(i>0)VSH.env[x.slice(0,i)]=x.slice(i+1)}return R('')};
X.env=async()=>R(Object.entries(VSH.env).map(([k,v])=>k+'='+v).join('\n')+'\n');
X.unset=async(f,a)=>{a.forEach(k=>delete VSH.env[k]);return R('')};
X.printf=async(f,a)=>{const[fm,...rest]=a;let i=0;return R((fm||'').replace(/%([sd%])|\\([nt\\])/g,(m,t,e)=>t=='%'?'%':t=='s'?(rest[i++]??''):t=='d'?(parseInt(rest[i++])||0):e=='n'?'\n':e=='t'?'\t':'\\'))};
X.tee=async(f,a,inp)=>{const p=a.filter(x=>x[0]!='-')[0];if(p){const n=vNorm(p);f[n]=(a.includes('-a')&&n in f?f[n]:'')+inp;VSH.dirty=true}return R(inp)};
X.seq=async(f,a)=>{const n=a.map(Number),[s,st,e]=n.length==1?[1,1,n[0]]:n.length==2?[n[0],1,n[1]]:n;const o=[];for(let i=s;st>0?i<=e:i>=e;i+=st){o.push(i);if(o.length>10000)break}return R(o.join('\n')+'\n')};
X.sleep=async(f,a)=>{await new Promise(r=>setTimeout(r,Math.min(+a[0]||0,5)*1000));return R('')};
X.basename=async(f,a)=>{let b=(a[0]||'').replace(/\/+$/,'').split('/').pop();if(a[1]&&b.endsWith(a[1]))b=b.slice(0,-a[1].length);return R(b+'\n')};
X.dirname=async(f,a)=>{const p=(a[0]||'').replace(/\/+$/,''),i=p.lastIndexOf('/');return R((i<0?'.':i==0?'/':p.slice(0,i))+'\n')};
X.rev=async(f,a,i)=>R(L(rd(f,a,i)).map(l=>[...l].reverse().join('')).join('\n')+'\n');
X.tac=async(f,a,i)=>R(L(rd(f,a,i)).reverse().join('\n')+'\n');
X.nl=async(f,a,i)=>R(L(rd(f,a,i)).map((l,k)=>String(k+1).padStart(6)+'\t'+l).join('\n')+'\n');
X.less=X.more=async(f,a,i)=>R(rd(f,a,i));X.chmod=async()=>R('');
X.stat=async(f,a)=>{const p=vNorm(a[0]||'');return p in f?R('  File: '+a[0]+'\n  Size: '+f[p].length+'\t'+f[p].split('\n').length+' linhas\n'):R('stat: cannot stat \''+a[0]+'\': No such file or directory\n',1)};
X.du=async(f,a)=>{const p=vNorm(a.filter(x=>x[0]!='-')[0]||'.'),n=Object.keys(f).filter(k=>p==''||k==p||k.startsWith(p+'/')).reduce((s,k)=>s+f[k].length,0),h=a.some(x=>/h/.test(x)&&x[0]=='-');return R((h?(n>1048576?(n/1048576).toFixed(1)+'M':n>1024?(n/1024).toFixed(1)+'K':n+'B'):Math.ceil(n/1024))+'\t'+(a.filter(x=>x[0]!='-')[0]||'.')+'\n')};
X.base64=async(f,a,inp)=>{const t=rd(f,a.filter(x=>x[0]!='-'),inp);if(a.includes('-d')){try{return R(decodeURIComponent(escape(atob(t.trim()))))}catch(e){return R('base64: entrada inválida\n',1)}}return R(btoa(unescape(encodeURIComponent(t)))+'\n')};
const hs=alg=>async(f,a,inp)=>{const t=rd(f,a,inp),b=await crypto.subtle.digest(alg,new TextEncoder().encode(t));return R([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')+'  '+(a[0]||'-')+'\n')};
X.sha256sum=hs('SHA-256');X.sha1sum=hs('SHA-1');
const rg_=s=>s.split(',').map(p=>{const[m,n]=p.split('-');return n===undefined?[+m,+m]:[+m||1,n===''?1e9:+n]}),sel=(i,R_)=>R_.some(([x,y])=>i>=x&&i<=y);
X.cut=async(f,a,inp)=>{let d='\t',fl=null,ch=null;const fs_=[];for(let i=0;i<a.length;i++){const x=a[i];if(x=='-d')d=a[++i];else if(x.startsWith('-d'))d=x.slice(2);else if(x=='-f')fl=a[++i];else if(x.startsWith('-f'))fl=x.slice(2);else if(x=='-c')ch=a[++i];else if(x.startsWith('-c'))ch=x.slice(2);else fs_.push(x)}
 return R(L(rd(f,fs_,inp)).map(l=>ch?[...l].filter((_,i)=>sel(i+1,rg_(ch))).join(''):l.split(d).filter((_,i)=>sel(i+1,rg_(fl||'1'))).join(d)).join('\n')+'\n')};
const trS=s=>s.replace(/a-z/g,'abcdefghijklmnopqrstuvwxyz').replace(/A-Z/g,'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replace(/0-9/g,'0123456789').replace(/\\n/g,'\n');
X.tr=async(f,a,inp)=>{const d=a[0]=='-d',p=a.filter(x=>x!='-d'),s1=trS(p[0]||''),s2=trS(p[1]||'');let o='';for(const c of inp){const i=s1.indexOf(c);o+=i<0?c:d?'':(s2?s2[Math.min(i,s2.length-1)]:c)}return R(o)};
X.xargs=async(f,a,inp)=>{let n=0,I=null;while(a[0]&&a[0][0]=='-'){const x=a.shift();if(x=='-n')n=+a.shift();else if(/^-n\d+$/.test(x))n=+x.slice(2);else if(x=='-I')I=a.shift()}const it=inp.split(/\s+/).filter(Boolean),cmd=a.length?a:['echo'],q=x=>/^[\w./=:@%+-]+$/.test(x)?x:sq(x);let out='',code=0;
 const runs=I?it.map(x=>cmd.map(c=>q(c.split(I).join(x))).join(' ')):(n?Array.from({length:Math.ceil(it.length/n)},(_,i)=>cmd.map(q).concat(it.slice(i*n,i*n+n).map(q)).join(' ')):[cmd.map(q).concat(it.map(q)).join(' ')]);
 for(const r of runs){const x=await vsh(r,f,1);out+=x.out;code=x.code}return R(out,code)};
/* diff unificado (LCS) */
function vDiff(A,B,na,nb){const a=A==''?[]:A.replace(/\n$/,'').split('\n'),b=B==''?[]:B.replace(/\n$/,'').split('\n');if(A===B)return'';const n=a.length,m=b.length;let ops=[];
 if(n*m>4e6)ops=[...a.map(x=>['-',x]),...b.map(x=>['+',x])];else{const t=Array.from({length:n+1},()=>new Int32Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i][j]=a[i]==b[j]?t[i+1][j+1]+1:Math.max(t[i+1][j],t[i][j+1]);let i=0,j=0;while(i<n&&j<m){if(a[i]==b[j]){ops.push([' ',a[i]]);i++;j++}else if(t[i+1][j]>=t[i][j+1])ops.push(['-',a[i++]]);else ops.push(['+',b[j++]])}while(i<n)ops.push(['-',a[i++]]);while(j<m)ops.push(['+',b[j++]])}
 const keep=new Array(ops.length).fill(false);ops.forEach((o,k)=>{if(o[0]!=' ')for(let d=-3;d<=3;d++)if(ops[k+d])keep[k+d]=true});let out='--- '+na+'\n+++ '+nb+'\n',last=-2;ops.forEach((o,k)=>{if(!keep[k])return;if(k!=last+1)out+='@@\n';out+=o[0]+o[1]+'\n';last=k});return out}
X.diff=async(f,a)=>{const p=a.filter(x=>x[0]!='-');if(p.length<2)return R('diff: faltam arquivos\n',2);const A=f[vNorm(p[0])],B=f[vNorm(p[1])];if(A==null||B==null)return R('diff: arquivo não encontrado\n',2);const d=vDiff(A,B,p[0],p[1]);return R(d,d?1:0)};
/* awk (subconjunto): '/re/ {print $1}', 'NR>1 {print $2,$NF}', '{s+=$2} END{print s}', -F: */
X.awk=async(f,a,inp)=>{let sep=null,i=0;if(a[0]&&a[0].startsWith('-F')){sep=a[0].length>2?a[0].slice(2):a[1];i=a[0].length>2?1:2}const prog=a[i]||'',src=L(rd(f,a.slice(i+1),inp)),sp=sep?new RegExp(sep.length==1?sep.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):sep):null,parts=[];
 prog.replace(/(BEGIN|END)?\s*(\/[^\/]+\/|NR\s*(?:==|!=|<=|>=|<|>)\s*\d+)?\s*\{([^}]*)\}/g,(m,w,pat,act)=>{parts.push({w,pat,act})});
 if(!parts.length&&/^NR\s*==\s*\d+$/.test(prog.trim()))parts.push({pat:prog.trim(),act:'print'});
 if(!parts.length)return R("awk: só suporto programas como '/re/ {print $1}', 'NR>1 {print $2}', '{s+=$2} END{print s}'\n",2);
 const V={};let o='';const ev=(e,fl,nr)=>{e=e.trim();if(/^"(.*)"$/.test(e))return e.slice(1,-1);if(e=='NR')return nr;if(e=='NF')return fl.length-1;if(e=='$NF')return fl[fl.length-1]??'';if(/^\$\d+$/.test(e))return fl[+e.slice(1)]??'';if(/^-?\d+(\.\d+)?$/.test(e))return +e;return e in V?V[e]:''};
 const run=(act,fl,nr)=>{for(const st of act.split(';')){const s=st.trim();let m;if(m=/^print(?:\s+(.*))?$/.exec(s))o+=(m[1]?m[1].split(/\s*,\s*/).map(x=>ev(x,fl,nr)).join(' '):fl[0])+'\n';else if(m=/^(\w+)\s*\+=\s*(.+)$/.exec(s))V[m[1]]=(+V[m[1]]||0)+(+ev(m[2],fl,nr)||0)}};
 const OP={'==':(x,y)=>x==y,'!=':(x,y)=>x!=y,'<=':(x,y)=>x<=y,'>=':(x,y)=>x>=y,'<':(x,y)=>x<y,'>':(x,y)=>x>y};
 parts.filter(p=>p.w=='BEGIN').forEach(p=>run(p.act,[''],0));let nr=0;
 for(const l of src){nr++;const fl=[l,...(sp?l.split(sp):l.trim().split(/\s+/).filter(Boolean))];for(const p of parts){if(p.w)continue;let ok=true,m;if(p.pat){if(p.pat[0]=='/')ok=new RegExp(p.pat.slice(1,-1)).test(l);else if(m=/^NR\s*(==|!=|<=|>=|<|>)\s*(\d+)$/.exec(p.pat))ok=OP[m[1]](nr,+m[2])}if(ok)run(p.act,fl,nr)}}
 parts.filter(p=>p.w=='END').forEach(p=>run(p.act,[''],nr));return R(o)};
/* jq (subconjunto): . .a.b .[0] .a[] .[] keys length type, com pipes e -r */
X.jq=async(f,a,inp)=>{const raw=a.includes('-r'),p=a.filter(x=>x[0]!='-'),flt=p[0]||'.',src=p.length>1?f[vNorm(p[1])]:inp;let d;try{d=JSON.parse(src)}catch(e){return R('jq: JSON inválido: '+e.message+'\n',2)}
 const step=(vals,tok)=>{const o=[];for(const v of vals){if(tok=='.'){o.push(v);continue}if(tok=='keys'){o.push(Object.keys(v||{}).sort());continue}if(tok=='length'){o.push(v==null?0:typeof v=='object'?Object.keys(v).length:v.length);continue}if(tok=='type'){o.push(v===null?'null':Array.isArray(v)?'array':typeof v);continue}
  let c=[v];const re=/\.([\w-]+)|\[(\d+)\]|\["([^"]+)"\]|\[\]/g;let m;while((m=re.exec(tok))){const nx=[];for(const x of c){if(m[1]!==undefined)nx.push(x==null?null:x[m[1]]);else if(m[2]!==undefined)nx.push(x==null?null:x[+m[2]]);else if(m[3]!==undefined)nx.push(x==null?null:x[m[3]]);else if(x&&typeof x=='object')nx.push(...Object.values(x))}c=nx}o.push(...c)}return o};
 let vals=[d];for(const t of flt.split('|').map(x=>x.trim()))vals=step(vals,t||'.');return R(vals.map(v=>raw&&typeof v=='string'?v:JSON.stringify(v,null,2)).join('\n')+'\n')};
/* rede e npm */
X.curl=async(f,a)=>{let o=null,u=null;for(let i=0;i<a.length;i++){if(a[i]=='-o')o=a[++i];else if(a[i][0]!='-')u=a[i]}if(!u)return R('curl: informe a URL\n',2);let t;try{t=await VSH.hooks.get(u)}catch(e){return R('curl: falhou: '+e.message+'\n',6)}if(o){f[vNorm(o)]=t;VSH.dirty=true;return R('')}return R(t+(t.endsWith('\n')?'':'\n'))};
X.wget=async(f,a)=>{const i=a.indexOf('-O'),u=a.filter((x,k)=>x[0]!='-'&&(i<0||k!=i+1))[0]||'';return X.curl(f,['-o',i>=0?a[i+1]:u.split('/').filter(Boolean).pop()||'index.html',u])};
X.npm=async(f,a)=>{if(a[0]=='-v'||a[0]=='--version')return R('npm (mini-terminal: só scripts do package.json)\n');let j={};try{j=JSON.parse(f['package.json']||'{}')}catch(e){return R('npm: package.json inválido\n',1)}const sc=j.scripts||{};
 if(a[0]=='run'&&!a[1])return R('Scripts:\n'+Object.entries(sc).map(([k,v])=>'  '+k+': '+v).join('\n')+'\n');
 const n=a[0]=='run'||a[0]=='run-script'?a[1]:['test','start','build','lint'].includes(a[0])?a[0]:null;
 if(!n)return R('npm '+(a[0]||'')+': indisponível no mini-terminal (sem registro de pacotes). Funciona: npm run <script>, npm test/start/build/lint. Para npm install use o Linux completo.\n',1);
 if(!sc[n])return R('npm: script "'+n+'" não existe no package.json\n',1);const r=await vsh(sc[n],f,1);return R('> '+(j.name||'projeto')+'@'+(j.version||'0.0.0')+' '+n+'\n> '+sc[n]+'\n\n'+r.out,r.code)};
X.npx=async()=>R('npx: indisponível no mini-terminal (precisa baixar pacotes). Use o Linux completo.\n',127);
X.pip=X.pip3=X.pkg=X.apt=async(f,a,i)=>R((a[0]?'':'')+'comando indisponível no mini-terminal (precisa de rede de pacotes). Instale o Linux completo: aba Terminal → Instalar Linux completo.\n',127);
/* test / [ ] */
X.test=async(f,a)=>{if(a[a.length-1]==']')a=a.slice(0,-1);let neg=false;if(a[0]=='!'){neg=true;a=a.slice(1)}let r=false;const[x,y,z]=a,P=vNorm;
 if(a.length==2)r=x=='-f'?(P(y) in f):x=='-d'?vIsDir(f,P(y))&&!(P(y) in f):x=='-e'?(P(y) in f||vIsDir(f,P(y))):x=='-z'?!y:x=='-n'?!!y:x=='-s'?!!f[P(y)]:false;
 else if(a.length==3)r=y=='='||y=='=='?x==z:y=='!='?x!=z:y=='-eq'?+x==+z:y=='-ne'?+x!=+z:y=='-lt'?+x<+z:y=='-gt'?+x>+z:y=='-le'?+x<=+z:y=='-ge'?+x>=+z:false;else if(a.length==1)r=!!x;
 return R('',(neg?!r:r)?0:1)};X['[']=X.test;
/* ---- git local (git-lite): repositório de verdade dentro do projeto — init, add, commit, status, diff, log, branch, checkout, reset, restore, rm ---- */
const H=s=>{let a=0xdeadbeef^s.length,b=0x41c6ce57^s.length;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677)}a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return(4294967296*(2097151&b)+(a>>>0)).toString(16).padStart(14,'0')};
const work=f=>{const w={};for(const k in f)if(!/^(node_modules|\.git)(\/|$)/.test(k))w[k]=H(f[k]);return w};
const hT=g=>(g.commits[g.br[g.head]]||{tree:{}}).tree;
function gst(f,g){const W=work(f),I=g.idx,Hd=hT(g),s={st:[],un:[],ut:[]};for(const k of new Set([...Object.keys(I),...Object.keys(Hd)])){if(!(k in I))s.st.push(['deleted',k,'D']);else if(!(k in Hd))s.st.push(['new file',k,'A']);else if(I[k]!==Hd[k])s.st.push(['modified',k,'M'])}
 for(const k in I){if(!(k in W))s.un.push(['deleted',k,'D']);else if(W[k]!==I[k])s.un.push(['modified',k,'M'])}for(const k in W)if(!(k in I))s.ut.push(k);return s}
function resolveRev(g,r){if(!r||r=='HEAD')return g.br[g.head];let m=/^HEAD~(\d+)$/.exec(r);if(m){let c=g.br[g.head];for(let i=0;i<+m[1]&&c;i++)c=g.commits[c].parent;return c}if(g.br[r])return g.br[r];return Object.keys(g.commits).find(k=>k.startsWith(r))}
function restoreTree(f,g,T,old){for(const k in old)if(!(k in T))delete f[k];for(const k in T)f[k]=g.blobs[T[k]];g.idx={...T}}
X.git=async(f,a)=>{const sub=a[0],args=a.slice(1),pr=VSH.hooks.proj();let g=pr.git;const N=s=>R(s,1);
 if(sub=='--version'||sub=='version')return R('git version (git-lite embutido no CodeMobile)\n');
 if(sub=='init'){if(g)return R('Repositório git já inicializado.\n');pr.git={br:{},head:'main',commits:{},blobs:{},idx:{},cfg:{}};VSH.dirty=true;return R('Repositório git local inicializado (branch main).\n')}
 if(!g)return R('fatal: não é um repositório git (rode: git init)\n',128);
 if(['clone','push','pull','fetch','remote','merge','rebase','stash','cherry-pick','tag','submodule'].includes(sub))return N('git '+sub+': não existe no git local embutido. Para GitHub use as ferramentas gh_pull/gh_push do agente; para git completo (remote, merge, rebase...) instale o Linux completo ou ligue o Termux.\n');
 const W=work(f),G=g.blobs;
 if(sub=='config'){const k=args.filter(x=>x[0]!='-')[0],v=args.filter(x=>x[0]!='-')[1];if(v!=null){g.cfg[k]=v;VSH.dirty=true;return R('')}return k in g.cfg?R(g.cfg[k]+'\n'):R('',1)}
 if(sub=='status'){const s=gst(f,g);if(args.includes('-s')||args.includes('--short'))return R(s.st.map(x=>x[2]+' '+x[1]).concat(s.un.map(x=>' '+x[2]+' '+x[1])).concat(s.ut.map(x=>'?? '+x)).join('\n')+(s.st.length+s.un.length+s.ut.length?'\n':''));
  let o='On branch '+g.head+'\n'+(g.br[g.head]?'':'\nNo commits yet\n');if(s.st.length)o+='\nChanges to be committed:\n'+s.st.map(x=>'\t'+x[0]+':   '+x[1]).join('\n')+'\n';if(s.un.length)o+='\nChanges not staged for commit:\n'+s.un.map(x=>'\t'+x[0]+':   '+x[1]).join('\n')+'\n';if(s.ut.length)o+='\nUntracked files:\n'+s.ut.map(x=>'\t'+x).join('\n')+'\n';if(!s.st.length&&!s.un.length&&!s.ut.length)o+='\nnothing to commit, working tree clean\n';return R(o)}
 if(sub=='add'){const all=args.includes('-A')||args.includes('--all')||args.includes('.'),ps=args.filter(x=>x[0]!='-'&&x!='.').map(vNorm),hit=k=>all||ps.some(p=>k==p||k.startsWith(p+'/'));let n=0;
  for(const k in W)if(hit(k)&&g.idx[k]!==W[k]){g.idx[k]=W[k];G[W[k]]=f[k];n++}for(const k in g.idx)if(!(k in W)&&hit(k)){delete g.idx[k];n++}
  if(!n&&!all&&ps.length&&!ps.some(p=>p in W))return R('fatal: pathspec \''+args[0]+'\' did not match any files\n',128);VSH.dirty=true;return R('')}
 if(sub=='rm'){for(const x of args.filter(y=>y[0]!='-')){const p=vNorm(x);if(!(p in f))return R('fatal: pathspec \''+x+'\' did not match any files\n',128);delete f[p];delete g.idx[p]}VSH.dirty=true;return R('')}
 if(sub=='commit'){let msg=null;for(let i=0;i<args.length;i++)if(args[i]=='-m')msg=args[++i];else if(/^-\w*m$/.test(args[i]))msg=args[++i];else if(args[i].startsWith('-m'))msg=args[i].slice(2);
  if(args.some(x=>/^-\w*a/.test(x)&&x[1]!='-'&&!x.startsWith('-m'))||args.includes('-am')){for(const k in g.idx){if(k in W){if(g.idx[k]!==W[k]){g.idx[k]=W[k];G[W[k]]=f[k]}}else delete g.idx[k]}}
  if(!msg)return N('Aborting commit: informe a mensagem com -m "texto"\n');const s=gst(f,g);if(!s.st.length)return R((s.un.length||s.ut.length?'no changes added to commit (use "git add" ou "git commit -a")':'nothing to commit, working tree clean')+'\n',1);
  if(Object.values(G).reduce((n,x)=>n+x.length,0)>3e6)return N('git local: histórico grande demais (limite ~3 MB). Use o Linux completo para repositórios grandes.\n');
  const parent=g.br[g.head]||null,ts=Date.now(),id=H(JSON.stringify(g.idx)+parent+msg+ts);g.commits[id]={id,msg,ts,parent,tree:{...g.idx},author:(g.cfg['user.name']||'CodeMobile')+' <'+(g.cfg['user.email']||'codemobile@localhost')+'>'};g.br[g.head]=id;VSH.dirty=true;
  return R('['+g.head+(parent?'':' (root-commit)')+' '+id.slice(0,7)+'] '+msg+'\n '+s.st.length+' arquivo(s) alterado(s)\n')}
 if(sub=='log'){const one=args.includes('--oneline'),ni=args.findIndex(x=>x=='-n'),lim=ni>=0?+args[ni+1]:(args.find(x=>/^-\d+$/.test(x))?-args.find(x=>/^-\d+$/.test(x)):1e9);let c=g.br[g.head],o='',n=0;if(!c)return R('fatal: your current branch \''+g.head+'\' does not have any commits yet\n',128);
  while(c&&n++<lim){const k=g.commits[c];o+=one?k.id.slice(0,7)+' '+k.msg+'\n':'commit '+k.id+'\nAuthor: '+k.author+'\nDate:   '+new Date(k.ts).toString()+'\n\n    '+k.msg+'\n\n';c=k.parent}return R(o)}
 if(sub=='diff'||sub=='show'){const stg=args.includes('--staged')||args.includes('--cached'),ps=args.filter(x=>x[0]!='-').map(vNorm);let o='';
  const A=stg?hT(g):g.idx,keys=new Set([...Object.keys(A),...(stg?Object.keys(g.idx):Object.keys(W))]);
  for(const k of [...keys].sort()){if(ps.length&&!ps.some(p=>k==p||k.startsWith(p+'/')))continue;const left=A[k]!=null?G[A[k]]??'':null,right=stg?(g.idx[k]!=null?G[g.idx[k]]:null):(k in f?f[k]:null);if(left===right||(left==null&&right==null))continue;o+='diff --git a/'+k+' b/'+k+'\n'+vDiff(left??'',right??'',left==null?'/dev/null':'a/'+k,right==null?'/dev/null':'b/'+k)}return R(o)}
 if(sub=='branch'){const d=args.indexOf('-d')>=0||args.indexOf('-D')>=0,nm=args.filter(x=>x[0]!='-')[0];if(!nm)return R(Object.keys({...g.br,[g.head]:1}).sort().map(b=>(b==g.head?'* ':'  ')+b).join('\n')+'\n');
  if(d){if(nm==g.head)return N('error: não dá para apagar a branch atual\n');delete g.br[nm];VSH.dirty=true;return R('Branch '+nm+' apagada.\n')}if(!g.br[g.head])return N('fatal: faça um commit antes de criar branches\n');if(g.br[nm])return N('fatal: a branch '+nm+' já existe\n');g.br[nm]=g.br[g.head];VSH.dirty=true;return R('')}
 if(sub=='checkout'||sub=='switch'){const b=args.includes('-b')||args.includes('-c'),force=args.includes('-f'),nm=args.filter(x=>x[0]!='-')[0];
  if(args.includes('--')||(nm&&!g.br[nm]&&!b&&nm in W||(nm&&!g.br[nm]&&!b&&g.idx[vNorm(nm)]))){const fl=args.filter(x=>x[0]!='-'&&x!='--').map(vNorm);for(const k of fl){const h=g.idx[k]||hT(g)[k];if(h==null)return N('error: pathspec \''+k+'\' did not match\n');f[k]=G[h]}VSH.dirty=true;return R('')}
  if(!nm)return N('git checkout: informe a branch\n');if(b){if(g.br[nm])return N('fatal: a branch '+nm+' já existe\n');if(!g.br[g.head])return N('fatal: faça um commit antes de criar branches\n');g.br[nm]=g.br[g.head];g.head=nm;VSH.dirty=true;return R('Switched to a new branch \''+nm+'\'\n')}
  if(!g.br[nm])return N('error: branch \''+nm+'\' não existe\n');const s=gst(f,g);if(!force&&(s.st.length||s.un.length))return N('error: você tem alterações não commitadas; faça commit ou use -f (descarta)\n');
  const old=hT(g);g.head=nm;restoreTree(f,g,hT(g),old);VSH.dirty=true;return R('Switched to branch \''+nm+'\'\n')}
 if(sub=='reset'||sub=='restore'){const hard=args.includes('--hard'),stg=args.includes('--staged')||sub=='reset'&&!hard,ps=args.filter(x=>x[0]!='-'&&!resolveRev(g,x)).map(vNorm),rev=args.filter(x=>x[0]!='-').find(x=>resolveRev(g,x));
  if(sub=='reset'&&hard){const c=resolveRev(g,rev||'HEAD');if(!c&&g.br[g.head])return N('fatal: revisão desconhecida\n');const old=g.idx&&Object.keys(g.idx).length?{...hT(g),...g.idx}:hT(g);if(c)g.br[g.head]=c;restoreTree(f,g,hT(g),old);VSH.dirty=true;return R('HEAD agora em '+(c||'').slice(0,7)+'\n')}
  const T=hT(g),hit=k=>!ps.length||ps.some(p=>k==p||k.startsWith(p+'/'));if(stg){for(const k of new Set([...Object.keys(g.idx),...Object.keys(T)]))if(hit(k)){if(k in T)g.idx[k]=T[k];else delete g.idx[k]}if(sub=='reset'){VSH.dirty=true;return R('')}}
  if(sub=='restore'&&!args.includes('--staged')){for(const k of new Set([...Object.keys(g.idx),...Object.keys(f)]))if(hit(k)){if(g.idx[k])f[k]=G[g.idx[k]];else if(!(k in T)&&ps.length)delete f[k]}}VSH.dirty=true;return R('')}
 return N('git '+(sub||'')+': subcomando não suportado no git local embutido (suporta: init add commit status diff log branch checkout switch reset restore rm config). Para o resto, instale o Linux completo.\n')};
VSH.names=[...new Set([...VSH.names,...Object.keys(X).filter(k=>k!='['&&k!='more'&&k!='less')])].sort();
})();
