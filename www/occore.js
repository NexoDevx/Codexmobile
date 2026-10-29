/* occore.js — mecânicas inspiradas no opencode (MIT): apply_patch (multi-arquivo, com contexto), glob, regras de permissão, instruções por pasta. Sem dependências. */
const OC=(()=>{
const NORM=s=>s.trim().replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019\u201a\u201b]/g,"'").replace(/[\u201c\u201d\u201e\u201f]/g,'"').replace(/[\u00a0\u2002-\u200a\u202f\u205f\u3000]/g,' ');
/* ---------- apply_patch ---------- */
function parsePatch(text){let L=String(text).replace(/\r\n/g,'\n').split('\n');while(L.length&&!L[0].trim())L.shift();while(L.length&&!L[L.length-1].trim())L.pop();
 if(L.length&&/^```/.test(L[0]))L.shift();if(L.length&&/^```/.test(L[L.length-1]))L.pop();
 if((L[0]||'').trim()!='*** Begin Patch')throw new Error('o patch precisa começar com "*** Begin Patch"');
 if((L[L.length-1]||'').trim()!='*** End Patch')throw new Error('o patch precisa terminar com "*** End Patch"');
 const ops=[],end=L.length-1;let i=1;
 while(i<end){const h=L[i];let m;
  if(m=/^\*\*\* Add File: (.+)$/.exec(h)){const t=[];i++;while(i<end&&!/^\*\*\* /.test(L[i])){if(!L[i].startsWith('+'))throw new Error('Add File '+m[1]+': toda linha deve começar com + (linha '+(i+1)+')');t.push(L[i].slice(1));i++}ops.push({t:'add',path:m[1].trim(),text:t.length?t.join('\n')+'\n':''});continue}
  if(m=/^\*\*\* Delete File: (.+)$/.exec(h)){ops.push({t:'del',path:m[1].trim()});i++;continue}
  if(m=/^\*\*\* Update File: (.+)$/.exec(h)){const op={t:'upd',path:m[1].trim(),move:null,chunks:[]};i++;if(i<end&&(m=/^\*\*\* Move to: (.+)$/.exec(L[i]))){op.move=m[1].trim();i++}
   let ch=null;while(i<end&&!/^\*\*\* (Add|Delete|Update) File: /.test(L[i])){const l=L[i];
    if(l.startsWith('@@')){ch={ctx:l.slice(2).trim(),lines:[],eof:false};op.chunks.push(ch);i++;continue}
    if(l.trim()=='*** End of File'){if(ch)ch.eof=true;i++;continue}
    if(!ch){ch={ctx:'',lines:[],eof:false};op.chunks.push(ch)}
    const c=l[0];if(c==' '||c=='+'||c=='-')ch.lines.push([c,l.slice(1)]);else if(l==='')ch.lines.push([' ','']);else throw new Error('Update File '+op.path+' (linha '+(i+1)+'): cada linha deve começar com espaço, + ou -');i++}
   if(!op.chunks.length&&!op.move)throw new Error('Update File '+op.path+' sem alterações');ops.push(op);continue}
  throw new Error('cabeçalho desconhecido na linha '+(i+1)+': '+h)}
 if(!ops.length)throw new Error('patch vazio');return ops}
function seek(L,pat,start,eof){if(!pat.length)return start;const fs=[x=>x,x=>x.replace(/\s+$/,''),x=>x.trim(),NORM];
 for(const f of fs){const P=pat.map(f),at=i=>{for(let k=0;k<P.length;k++)if(f(L[i+k])!==P[k])return false;return true};
  if(eof){const i=L.length-pat.length;if(i>=start&&at(i))return i}
  for(let i=start;i+pat.length<=L.length;i++)if(at(i))return i}return -1}
function applyChunks(content,op){const trailing=content.endsWith('\n')||content==='';const L=content===''?[]:content.replace(/\n$/,'').split('\n'),reps=[];let cur=0,add=0,del=0;
 for(const ch of op.chunks){if(ch.ctx){const k=seek(L,[ch.ctx],cur);if(k<0)throw new Error(op.path+': não achei a linha de contexto "@@ '+ch.ctx+'"');cur=k+1}
  const old=ch.lines.filter(x=>x[0]!='+').map(x=>x[1]),nw=ch.lines.filter(x=>x[0]!='-').map(x=>x[1]);add+=ch.lines.filter(x=>x[0]=='+').length;del+=ch.lines.filter(x=>x[0]=='-').length;
  let pos;if(!old.length)pos=ch.ctx?cur:L.length;else{pos=seek(L,old,cur,ch.eof);if(pos<0&&old[old.length-1]===''){old.pop();if(nw[nw.length-1]==='')nw.pop();pos=seek(L,old,cur,ch.eof)}
   if(pos<0)throw new Error(op.path+': não achei este trecho (confira espaços/indentação e releia o arquivo):\n'+old.slice(0,4).join('\n'))}
  reps.push({pos,len:old.length,nw});cur=pos+old.length}
 for(const r of reps.sort((a,b)=>b.pos-a.pos))L.splice(r.pos,r.len,...r.nw);return{text:L.join('\n')+(trailing||L.length?'\n':''),add,del}}
const okPath=p=>{p=String(p).replace(/^\.\//,'');if(!p||p.startsWith('/')||/(^|\/)\.\.(\/|$)/.test(p)||/[\0]/.test(p))throw new Error('caminho inválido: '+p);return p};
/* aplica na memória; devolve {changes:[{path,before,after}],summary}. Atômico: se algo falha, lança erro e nada muda */
function applyPatch(files,text){const ops=parsePatch(text),over=new Map(),ex=p=>over.has(p)?over.get(p)!==null:p in files,get=p=>over.has(p)?over.get(p):files[p],sum=[];
 for(const op of ops){const p=okPath(op.path);
  if(op.t=='add'){if(ex(p))throw new Error('Add File: '+p+' já existe (use Update File)');over.set(p,op.text);sum.push('A '+p+' (+'+(op.text?op.text.replace(/\n$/,'').split('\n').length:0)+')')}
  else if(op.t=='del'){if(!ex(p))throw new Error('Delete File: '+p+' não existe');over.set(p,null);sum.push('D '+p)}
  else{if(!ex(p))throw new Error('Update File: '+p+' não existe');const r=applyChunks(get(p),op),to=op.move?okPath(op.move):p;if(to!=p&&ex(to))throw new Error('Move to: '+to+' já existe');
   if(to!=p)over.set(p,null);over.set(to,r.text);sum.push((to!=p?'R '+p+' → '+to:'M '+p)+' (+'+r.add+' -'+r.del+')')}}
 const changes=[];for(const[p,v]of over)if(v!==(files[p]??null))changes.push({path:p,before:files[p]??null,after:v});return{changes,summary:sum}}
const patchPaths=text=>{try{return parsePatch(text).flatMap(o=>[o.path,o.move].filter(Boolean))}catch(e){return[]}};
/* ---------- glob ---------- */
const E=s=>s.replace(/[.+^${}()|[\]\\]/g,'\\$&');
function globRe(g){let s='';for(let i=0;i<g.length;i++){const c=g[i];
  if(c=='*'){if(g[i+1]=='*'){s+='.*';i++;if(g[i+1]=='/')i++}else s+='[^/]*'}else if(c=='?')s+='[^/]';
  else if(c=='{'){const j=g.indexOf('}',i);if(j>0){s+='(?:'+g.slice(i+1,j).split(',').map(x=>E(x).replace(/\\\*/g,'[^/]*')).join('|')+')';i=j}else s+='\\{'}else s+=E(c)}
 return new RegExp('^'+s+'$')}
const gmatch=(g,p)=>g.includes('/')?globRe(g).test(p):globRe(g).test(p.split('/').pop());
const glob=(files,g)=>Object.keys(files).filter(p=>gmatch(g.replace(/^\.\//,''),p)).sort();
/* ---------- regras de permissão (codemobile.json) ---------- */
const DEF=[['read','.env','deny'],['read','.env.*','deny'],['read','*.env.example','allow'],['read','id_rsa*','deny'],['read','*.pem','deny']];
function rules(files){let cfg={};try{cfg=JSON.parse(files['codemobile.json']||'{}')}catch(e){}const r=[...DEF];
 for(const[k,v]of Object.entries(cfg.permission||{})){const kind=k=='bash'?'shell':k;if(typeof v=='string')r.push([kind,'*',v]);else for(const[p,a]of Object.entries(v||{}))r.push([kind,p,a])}return r.filter(x=>['allow','ask','deny'].includes(x[2]))}
const shellRe=p=>new RegExp('^'+p.split('*').map(E).join('.*')+'$');
function permRule(files,kind,target){let res=null;for(const[k,p,a]of rules(files)){if(k!=kind)continue;if(kind=='shell'?shellRe(p).test(target):gmatch(p,target))res=a}return res}
function shellPerm(files,cmd){const segs=String(cmd).split(/&&|\|\||;|\||\n/).map(s=>s.trim()).filter(Boolean),r=segs.map(s=>permRule(files,'shell',s));if(r.includes('deny'))return'deny';if(r.includes('ask'))return'ask';return r.length&&r.every(x=>x=='allow')?'allow':null}
/* ---------- instruções por pasta (AGENTS.md / CLAUDE.md mais próximos do arquivo) ---------- */
function instrFor(files,path,seen){const parts=String(path).split('/');parts.pop();const o=[];while(parts.length){const d=parts.join('/');for(const n of['AGENTS.md','CLAUDE.md']){const k=d+'/'+n;if(k in files){if(!seen.has(k)){seen.add(k);o.push([k,files[k]])}break}}parts.pop()}return o}
return{parsePatch,applyPatch,patchPaths,glob,permRule,shellPerm,rules,instrFor}})();
