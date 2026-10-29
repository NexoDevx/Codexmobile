/* ext2.js — plugins direto do GitHub, pastas conectadas (nativo/FSA) e edição de importados só sob pedido */
S.links=S.links||[];
const hh2=s=>{let x=5381;for(let i=0;i<s.length;i++)x=(x*33^s.charCodeAt(i))>>>0;return x.toString(36)+s.length};
const BINX=/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|jar|apk|so|woff2?|ttf|otf|mp[34]|wav|ogg|wasm|bin|class|dex|keystore|mcpack|mcaddon|mcworld)$/i;
/* ---- GitHub: ativar plugin ou baixar como referência ---- */
const GHU=u=>{u=ghNorm(u).replace(/\.git$/,'').replace(/\/+$/,'');const m=/^([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?$/.exec(u);return m?{o:m[1],r:m[2],br:m[3]||'',p:(m[4]||'').replace(/\/$/,'')}:null};
const gj=async u=>{const r=await fetch(u,{headers:{Accept:'application/vnd.github+json',...(S.gh&&S.gh.tok?{Authorization:'Bearer '+S.gh.tok}:{})}});if(!r.ok)throw new Error('GitHub '+r.status+(r.status==403||r.status==429?' (limite da API: conecte sua conta em Ajustes → GitHub)':'')+' em '+u.replace('https://api.github.com',''));return r.json()};
const gEnc=p=>p.split('/').map(encodeURIComponent).join('/');
async function gTree(g){if(!g.br)g.br=(await gj('https://api.github.com/repos/'+g.o+'/'+g.r)).default_branch;return(await gj('https://api.github.com/repos/'+g.o+'/'+g.r+'/git/trees/'+encodeURIComponent(g.br)+'?recursive=1')).tree.filter(x=>x.type=='blob').map(x=>({p:x.path,s:x.size||0}))}
async function gGet(g,p){if(S.gh&&S.gh.tok){const x=await gj('https://api.github.com/repos/'+g.o+'/'+g.r+'/contents/'+gEnc(p)+'?ref='+encodeURIComponent(g.br));return new TextDecoder().decode(Uint8Array.from(atob((x.content||'').replace(/\n/g,'')),c=>c.charCodeAt(0)))}
 const r=await fetch('https://raw.githubusercontent.com/'+g.o+'/'+g.r+'/'+encodeURIComponent(g.br)+'/'+gEnc(p));if(!r.ok)throw new Error(p+': HTTP '+r.status);return r.text()}
const fmx=t=>{const m=/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);return m?t.slice(m[0].length):t};
async function plugFromTree(g,tree,P,notes){const J=(a,b)=>[a,b].filter(Boolean).join('/'),has=p=>tree.some(x=>x.p==p),rel=tree.filter(x=>!P||x.p.startsWith(P+'/'));let man={};
 for(const f of[J(P,'.claude-plugin/plugin.json'),J(P,'plugin.json')])if(has(f)){try{man=JSON.parse(await gGet(g,f))}catch(e){}break}
 const m={name:man.name||(P?P.split('/').pop():g.r),description:man.description||'',skills:[],commands:{},mcp:[]};
 if(has(J(P,'SKILL.md')))m.skills.push({name:m.name,raw:await gGet(g,J(P,'SKILL.md')),extra:{}});
 for(const x of rel){const mm=/^(.*)\/SKILL\.md$/.exec(x.p);if(!mm||!/(^|\/)skills\/[^/]+$/.test(mm[1])||m.skills.length>=20)continue;const dir=mm[1],ex={};
  for(const y of rel.filter(y=>y.p.startsWith(dir+'/')&&y.p!=x.p&&y.s<4e4&&/\.(md|txt|json|py|js|sh|ya?ml|csv)$/i.test(y.p)).slice(0,8))try{ex[y.p.slice(dir.length+1)]=await gGet(g,y.p)}catch(e){}
  m.skills.push({name:dir.split('/').pop(),raw:await gGet(g,x.p),extra:ex})}
 for(const x of rel){const mm=/^(?:.*\/)?commands\/([\w-]+)\.md$/.exec(x.p);if(mm&&Object.keys(m.commands).length<30)m.commands[mm[1]]=fmx(await gGet(g,x.p)).replace(/\$ARGUMENTS/g,'$ARGS').trim().slice(0,1500)}
 let mj=null;if(has(J(P,'.mcp.json')))try{mj=JSON.parse(await gGet(g,J(P,'.mcp.json'))).mcpServers}catch(e){}if(!mj&&man.mcpServers&&typeof man.mcpServers=='object')mj=man.mcpServers;
 for(const k in mj||{}){const s=mj[k]||{};if(/^https?:/.test(s.url||''))m.mcp.push({name:k,url:s.url,headers:s.headers||{},token:''});else{notes.push('MCP "'+k+'" ignorado (roda por comando local/stdio, não suportado)');(window.__stdio=window.__stdio||[]).push({name:k,cmd:s.command||'',args:s.args||[]})}}
 for(const f of['AGENTS.md','CLAUDE.md'])if(has(J(P,f))){m.instructions=(await gGet(g,J(P,f))).slice(0,3000);break}
 return m}
async function ghImport(g,tree){const pre=g.p?g.p+'/':'',L=tree.filter(x=>(!g.p||x.p.startsWith(pre))&&!/(^|\/)(node_modules|\.git)\//.test(x.p)&&!BINX.test(x.p)).slice(0,120),base='importados/'+sl(g.r+(g.p?'-'+g.p.split('/').pop():''))+'/',F=pj().files;let n=0;
 for(let i=0;i<L.length;i+=6)await Promise.all(L.slice(i,i+6).map(async x=>{try{const t=await gGet(g,x.p);if(!t.includes('\0')){F[base+x.p.slice(pre.length)]=t;n++}}catch(e){}}));
 save();ui();const b=$('#in');if(b)b.value='Veja a pasta '+base+' e ';alert(n+' arquivos baixados para '+base+(L.length>=120?'\n(limite: 120 arquivos de texto por vez)':''))}
async function plugGH(){const u=prompt('Cole o link do GitHub (repositório ou pasta), ex.: https://github.com/dono/repo  ou  .../tree/main/plugins/x');if(!u)return;const g=GHU(u);if(!g)return alert('Link do GitHub inválido');
 const a=await dlg({title:'O que fazer com '+g.o+'/'+g.r+(g.p?'/'+g.p:'')+'?',btns:['🧩 Ativar (skills, comandos, MCP)','📥 Baixar como referência (importados/)','Cancelar']});if(a!==0&&a!==1)return;
 try{const tree=await gTree(g);if(a==1)return ghImport(g,tree);
  const notes=[],mk=tree.find(x=>x.p==(g.p?g.p+'/':'')+'.claude-plugin/marketplace.json');let list=[[g.p,null]];
  if(mk){const L=(JSON.parse(await gGet(g,mk.p)).plugins||[]).filter(x=>typeof x.source=='string');if(L.length){const c=prompt('Este link é um catálogo com '+L.length+' plugins:\n'+L.map((x,i)=>(i+1)+'. '+x.name).join('\n')+'\n\nDigite os números separados por vírgula (vazio = todos):');if(c===null)return;
   const ix=c.trim()?c.split(',').map(x=>+x.trim()-1):L.map((_,i)=>i);list=ix.filter(i=>L[i]).map(i=>[[g.p,L[i].source.replace(/^\.\//,'')].filter(Boolean).join('/'),L[i].name])}}
  const done=[];for(const[P,nm]of list){const m=await plugFromTree(g,tree,P,notes);if(nm)m.name=nm;if(m.skills.length||Object.keys(m.commands).length||m.mcp.length||m.instructions){await plugApply(m,1);done.push(m.name+' ('+m.skills.length+' skills, '+Object.keys(m.commands).length+' comandos, '+m.mcp.length+' MCP)')}else notes.push('"'+(nm||P||g.r)+'": nada para ativar (sem skills, comandos ou MCP por HTTP)')}
  alert((done.length?'Ativado:\n'+done.join('\n')+'\n':'')+notes.join('\n')||'Nada encontrado')}catch(e){alert('Falhou: '+e.message)}}
/* ---- pastas conectadas: nativo (APK, SAF) ou File System Access (PWA/desktop) ---- */
function getFolderPlugin(){try{const C=window.Capacitor;if(!C)return null;/* Capacitor pode ser injetado depois dos scripts da página: resolver sob demanda, não congelar null durante o carregamento. */const native=(typeof C.isNativePlatform==='function'&&C.isNativePlatform())||!!(C.Plugins&&C.Plugins.Folder)||!!(C.PluginsNative&&C.PluginsNative.Folder);if(!native)return null;if(C.Plugins&&C.Plugins.Folder)return C.Plugins.Folder;if(C.PluginsNative&&C.PluginsNative.Folder)return C.PluginsNative.Folder;if(typeof C.registerPlugin==='function')return C.registerPlugin('Folder');return null}catch(e){return null}}let FLP=null,FLOK=false,FLERR='';
function requireFolderPlugin(){FLP=getFolderPlugin()||FLP;if(!FLP)throw new Error('Plugin de pastas ausente neste APK. Gere e instale o APK atualizado pelo workflow do GitHub Actions.');return FLP}
async function folderOk(){FLP=getFolderPlugin()||FLP;if(FLOK)return true;if(!FLP)return false;try{await FLP.status();FLOK=true;FLERR=''}catch(e){FLERR=(e&&e.message)||String(e)}return FLOK}
const idb=(m,k,v)=>new Promise((ok,no)=>{const q=indexedDB.open('cmh',1);q.onupgradeneeded=()=>q.result.createObjectStore('h');q.onerror=()=>no(q.error);q.onsuccess=()=>{const s=q.result.transaction('h',m=='get'?'readonly':'readwrite').objectStore('h'),r=m=='get'?s.get(k):m=='put'?s.put(v,k):s.delete(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}});
async function fsaRead(dh){const F={},SKL=[],IG=/^(node_modules|\.git|\.gradle|build)$/;let n=0,sk=0;const walk=async(d,p)=>{for await(const[nm,h]of d.entries()){if(h.kind=='directory'){if(!IG.test(nm))await walk(h,p+nm+'/')}else{if(BINX.test(nm)){sk++;SKL.push(p+nm);continue}const f=await h.getFile();const t=await f.text();if(t.includes('\0')){sk++;SKL.push(p+nm);continue}F[p+nm]=t;n++}}};await walk(dh,'');return{files:F,skipped:sk,skippedText:SKL.join('\n')}}
async function fsaWrite(dh,files){let n=0;for(const p in files){const a=p.split('/'),nm=a.pop();let d=dh;for(const s of a)d=await d.getDirectoryHandle(s,{create:true});const w=await(await d.getFileHandle(nm,{create:true})).createWritable();await w.write(files[p]);await w.close();n++}return n}
async function fsaHandle(l){const h=await idb('get',l.id);if(!h)throw new Error('reconecte a pasta (o navegador esqueceu a permissão)');if((await h.queryPermission({mode:'readwrite'}))!='granted'&&(await h.requestPermission({mode:'readwrite'}))!='granted')throw new Error('sem permissão na pasta');return h}
const lnkChanges=l=>{const F=pj().files,o={};for(const k in F)if(k.startsWith(l.base)){const r=k.slice(l.base.length);if(l.snap[r]!==hh2(F[k]))o[r]=F[k]}return o};
const IGNT=t=>'Arquivos da pasta que NÃO foram importados (arquivos binários: imagens, ZIP, APK etc.).\nEles continuam na pasta real, intactos; o app não os mexe.\n\n'+t;
/* seletor de pastas dentro do app (usa o servidor do Termux/PC): funciona sem o plugin nativo */
async function srvPick(){let cur='';
 for(;;){let r;try{r=await cmApi('ls?path='+encodeURIComponent(cur))}catch(e){throw new Error('servidor indisponível ('+((e&&e.message)||e)+')')}
  const L=r.dirs.slice(0,40),btn=['✅ Usar esta pasta'].concat(r.parent?['⬆ Subir']:[],L.map(d=>'📁 '+d),['Cancelar']);
  const i=await dlg({title:'Escolher pasta',text:r.path+'\n('+r.dirs.length+' pastas, '+r.nfiles+' arquivos)'+(r.dirs.length>40?'\nMostrando só 40 pastas.':''),btns:btn});
  if(i===0)return r.path;if(i==null||i<0||i==btn.length-1)return null;
  if(r.parent&&i==1){cur=r.parent;continue}cur=r.path+'/'+L[i-1-(r.parent?1:0)]}}
async function lnkAdd(){let name,uri=null,kind,res,dh=null;FLP=getFolderPlugin()||FLP;
 try{let nat=null;if(FLP){try{if(!(await folderOk()))throw new Error(FLERR||'o plugin nativo não respondeu ao teste de estado');if(typeof FLP.pick!=='function')throw new Error('o plugin Folder não expõe o método pick');nat=await FLP.pick();FLOK=true;FLERR=''}catch(e){const m=(e&&e.message)||String(e);if(/cancel|abort/i.test(m))return;FLERR=m;throw new Error('O seletor de pastas do Android falhou: '+m+'\n\nEste APK pode ter sido gerado SEM o plugin de pasta. Gere novamente e confira o passo "O que entrou no APK" no GitHub Actions.')}}
  if(nat){uri=nat.uri;name=nat.name;kind='native';res=await FLP.read({uri})}
  else if(window.showDirectoryPicker){dh=await showDirectoryPicker({mode:'readwrite'});name=dh.name;kind='fsa';res=await fsaRead(dh)}
  else{let ok=false,why='';try{await cmApi('ping');ok=true}catch(e){why=(e&&e.message)||''}
   if(!ok)return alert('Não dá para abrir o seletor de pastas aqui.\n\nDiagnóstico:\n• App nativo (Capacitor): '+(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()?'sim':'não')+'\n• Plugin de pasta: '+(FLP?(FLOK?'ok':'AUSENTE neste APK'+(FLERR?' ('+FLERR+')':'')):'não aplicável')+'\n• Seletor do navegador: indisponível\n• Servidor do Termux: '+(why||'não encontrado')+'\n\nComo resolver: (1) o APK foi gerado SEM o plugin de pasta: gere novamente e confira o passo "O que entrou no APK" no GitHub Actions; ou (2) rode o servidor no Termux (sh start.sh) e abra o app por http://localhost:8787; ou (3) compacte a pasta em ZIP e use ＋ → Adicionar arquivo.');
   const pth=await srvPick();if(!pth)return;uri=pth;name=pth.split('/').filter(Boolean).pop()||'pasta';kind='srv';res=await cmApi('dirread?path='+encodeURIComponent(pth))}}
 catch(e){if(/cancel|abort/i.test((e&&e.message)||(e&&e.name)||''))return;return alert('Não consegui abrir a pasta: '+((e&&e.message)||e)+(kind=='native'||FLP?'\n\n(Plugin de pasta: '+(FLOK?'ok':'com problema'+(FLERR?' — '+FLERR:''))+')':''))}
 const id='l'+Date.now().toString(36),base='importados/'+sl(name)+'/',F=pj().files,snap={};for(const k of Object.keys(F))if(k.startsWith(base))delete F[k];
 for(const k in res.files){F[base+k]=res.files[k];snap[k]=hh2(res.files[k])}
 if(res.skippedText){const t=IGNT(res.skippedText);F[base+'_ignorados.txt']=t;snap['_ignorados.txt']=hh2(t)}
 S.links=S.links.filter(x=>!(x.base==base&&x.proj==S.cur));S.links.push({id,name,kind,uri,base,snap,proj:S.cur});if(dh)try{await idb('put',id,dh)}catch(e){}
 save();ui();const b=$('#in');if(b)b.value='Veja a pasta '+base+' e ';alert('Pasta "'+name+'" conectada: '+Object.keys(res.files).length+' arquivos de texto em '+base+(res.skipped?'\n('+res.skipped+' ignorados: binários, grandes ou excesso; a lista está em '+base+'_ignorados.txt)':''))}
async function lnkSave(l){if(l.kind=='native')FLP=getFolderPlugin()||FLP;const ch=lnkChanges(l),n=Object.keys(ch).length;if(!n)return alert('Nenhuma alteração para salvar em '+l.name);
 if((await dlg({title:'Salvar na pasta "'+l.name+'"?',text:n+' arquivo(s) serão gravados na pasta real do aparelho:\n'+Object.keys(ch).slice(0,12).join('\n')+(n>12?'\n…':'')+'\n\nIsso sobrescreve os arquivos de lá. Arquivos apagados aqui não são apagados na pasta.',btns:['💾 Salvar','Cancelar']}))!==0)return;
 try{const c=l.kind=='srv'?(await cmApi('dirwrite',{method:'POST',body:JSON.stringify({path:l.uri,files:ch})})).count:l.kind=='native'?(await requireFolderPlugin().write({uri:l.uri,files:ch})).count:await fsaWrite(await fsaHandle(l),ch);for(const r in ch)l.snap[r]=hh2(ch[r]);save();alert(c+' arquivo(s) salvos na pasta')}catch(e){alert('Falhou ao salvar: '+((e&&e.message)||e))}}
async function lnkRefresh(l){if(l.kind=='native')FLP=getFolderPlugin()||FLP;if(Object.keys(lnkChanges(l)).length&&(await dlg({title:'Há alterações não salvas',text:'Atualizar da pasta sobrescreve suas alterações nos arquivos importados.',btns:['Atualizar mesmo assim','Cancelar']}))!==0)return;
 try{const res=l.kind=='srv'?await cmApi('dirread?path='+encodeURIComponent(l.uri)):l.kind=='native'?await requireFolderPlugin().read({uri:l.uri}):await fsaRead(await fsaHandle(l)),F=pj().files;for(const k of Object.keys(F))if(k.startsWith(l.base))delete F[k];l.snap={};for(const k in res.files){F[l.base+k]=res.files[k];l.snap[k]=hh2(res.files[k])}if(res.skippedText){const t=IGNT(res.skippedText);F[l.base+'_ignorados.txt']=t;l.snap['_ignorados.txt']=hh2(t)}save();ui();alert('Atualizado: '+Object.keys(res.files).length+' arquivos')}catch(e){alert('Falhou: '+((e&&e.message)||e))}}
async function lnkMenu(){const L=S.links.filter(l=>l.proj==S.cur),tx=L.map(l=>'• '+l.name+' — '+Object.keys(lnkChanges(l)).length+' alteração(ões) não salvas').join('\n')||'(nenhuma pasta conectada neste projeto)';
 const r=await dlg({title:'📂 Pastas conectadas',text:tx+'\n\nOs arquivos ficam em importados/<pasta>/. A IA lê à vontade e só edita quando você pedir (o app confirma). As alterações só vão para a pasta real quando você tocar em Salvar.',btns:['➕ Conectar pasta','💾 Salvar alterações na pasta','🔄 Atualizar da pasta','🗑 Desconectar','Fechar']});
 if(r===0)return lnkAdd();const pick=()=>{if(L.length<2)return L[0];const n=prompt('Qual pasta? '+L.map(l=>l.name).join(', '));return L.find(l=>l.name==n)};
 if(r===1||r===2){const l=pick();if(!l)return alert('Nenhuma pasta conectada');return r===1?lnkSave(l):lnkRefresh(l)}
 if(r===3){const l=pick();if(!l)return;S.links=S.links.filter(x=>x!==l);if(l.kind=='fsa')idb('del',l.id).catch(()=>{});save();alert('Desconectada (os arquivos importados continuam no projeto)')}}
{const _m=cmMenu;cmMenu=function(){const L=S.links.filter(l=>l.proj==S.cur),p=L.reduce((a,l)=>a+Object.keys(lnkChanges(l)).length,0);return[..._m(),['📂','Pastas conectadas',L.length+' pasta(s)'+(p?' · '+p+' alteração(ões) para salvar':''),lnkMenu]]}}
/* ---- editar importados/ só quando o usuário pedir (e confirmando) ---- */
{const _ex=exec;exec=async function(n,a){
 if(a&&typeof W!='undefined'&&W.includes(n)){const hit=[a.path,a.from,a.to].map(x=>x==null?'':String(x).trim().replace(/^\.?\/+/,'')).find(p=>p.startsWith('importados/'));
  if(hit){const root=hit.split('/').slice(0,2).join('/'),nm=root.split('/')[1];window.__okImp=window.__okImp||{};
   if(!window.__okImp[root]){const lu=[...pj().hist].reverse().find(m=>m.role=='user'&&m.text&&m.text[0]!='['),
     asked=lu&&new RegExp('(^|[^\\w])'+nm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^\\w]|$)','i').test(lu.text)&&/\b(edit\w*|alter\w*|mud\w*|modific\w*|corrij\w*|corrig\w*|ajust\w*|troc\w*|atualiz\w*|adicion\w*|remov\w*|apag\w*|renome\w*|substitu\w*|conserte|arrume|melhor\w*|refator\w*|traduz\w*|otimiz\w*)\b/i.test(lu.text);
    if(asked)window.__okImp[root]=1;else{if(S.mode=='plan')return'Modo plano: escrita bloqueada.';
     if((await dlg({title:'Alterar arquivos importados?',text:'A IA quer alterar '+hit+'.\n'+root+' é material que você importou como referência. Permitir editar esta pasta nesta tarefa?',btns:['✅ Permitir nesta tarefa','🚫 Negar']}))!==0)return'Negado: o usuário não liberou a edição de '+root+'. Trabalhe em arquivos fora de importados/ ou peça a permissão.';window.__okImp[root]=1}}}}
 return _ex(n,a)}}

/* ---- instalar plugin/MCP a partir de um link do GitHub, direto na conversa (sem diálogos) ---- */
function ghNorm(u){return String(u).trim().replace(/^git\+/,'').replace(/^git@github\.com:/i,'').replace(/^ssh:\/\/git@github\.com\//i,'').replace(/^(https?:\/\/)?(www\.)?github\.com\//i,'').replace(/[?#].*$/,'')}
const GHRX=/(?:git\+)?(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)[\w.-]+\/[\w.-]+?(?:\.git)?(?:\/(?:tree|blob)\/[^\s)>\]"']+)?(?=[\s)>\]"',;]|$)/gi;
const INSTW=/\b(plugins?|plug-in|mcp|skills?|instal\w*|conect\w*|baix\w*|adicion\w*|ativ\w*|configur\w*|add|install|connect|download|usar|use|esse|este|isso|o|a|um|uma|do|da|de|pra|para|por favor|pf|link|repo|reposit[óo]rio|github|git)\b/gi;
function plugIntent(t){t=String(t||'');if(!t||t[0]=='['||t[0]=='/')return null;const m=t.match(GHRX);if(!m)return null;
 const rest=t.replace(GHRX,' ').replace(/\s+/g,' ').trim(),w=rest.split(' ').filter(Boolean).length;
 if(w>40)return null;const inst=/\b(plugins?|plug-in|mcp|skills?|instal\w*|conect\w*|baix\w*|adicion\w*|ativ\w*|add|install|connect|download)\b/i.test(rest);
 if(/^(o que|oque|como|por ?que|qual|quais|explique|explica|analise|leia|resuma|compare|what|how|why)\b/i.test(rest)&&!inst)return null;
 if(w<=4||inst){const follow=rest.replace(INSTW,' ').replace(/\s+/g,' ').replace(/^(e|então|depois|,|;)\s+/i,'').trim();return{url:m[0],follow:follow.split(' ').filter(x=>x.length>1).length>=3?follow:''}}return null}
async function plugInstall(url){const g=GHU(url);if(!g)throw new Error('link do GitHub inválido: '+url);window.__stdio=[];
 const tree=await gTree(g),notes=[],done=[],names=[],pre=g.p?g.p+'/':'';let list=[[g.p,null]];
 const mk=tree.find(x=>x.p==pre+'.claude-plugin/marketplace.json');
 if(mk){try{const L=(JSON.parse(await gGet(g,mk.p)).plugins||[]).filter(x=>typeof x.source=='string');
   if(L.length==1)list=[[[g.p,L[0].source.replace(/^\.\//,'')].filter(Boolean).join('/'),L[0].name]];
   else if(L.length>1){const c=await dlg({title:'Catálogo com '+L.length+' plugins',text:'Qual instalar?',opts:['Todos ('+Math.min(L.length,10)+')',...L.slice(0,10).map(x=>x.name)],skip:'Cancelar'});if(c==null)return{cancel:1,summary:'Instalação cancelada.'};
    const ix=c.startsWith('Todos')?L.slice(0,10).map((_,i)=>i):[L.findIndex(x=>x.name==c)];list=ix.filter(i=>L[i]).map(i=>[[g.p,L[i].source.replace(/^\.\//,'')].filter(Boolean).join('/'),L[i].name])}}catch(e){notes.push('catálogo ilegível: '+e.message)}}
 for(const[P,nm]of list){const m=await plugFromTree(g,tree,P,notes);if(nm)m.name=nm;
  if(m.skills.length||Object.keys(m.commands).length||m.mcp.length||m.instructions){await plugApply(m,1);names.push(m.name);done.push('**'+m.name+'**: '+m.skills.length+' skill(s), '+Object.keys(m.commands).length+' comando(s), '+m.mcp.length+' servidor(es) MCP'+(m.mcp.length?' ('+m.mcp.map(x=>x.name).join(', ')+')':'')+(m.instructions?', instruções no AGENTS.md':''))}}
 let ref='';
 if(!done.length){const L=tree.filter(x=>(!g.p||x.p.startsWith(pre))&&!/(^|\/)(node_modules|\.git)\//.test(x.p)&&!BINX.test(x.p)).slice(0,120),base='importados/'+sl(g.r+(g.p?'-'+g.p.split('/').pop():''))+'/',F=pj().files;let n=0;
  for(let i=0;i<L.length;i+=6)await Promise.all(L.slice(i,i+6).map(async x=>{try{const t=await gGet(g,x.p);if(!t.includes('\0')){F[base+x.p.slice(pre.length)]=t;n++}}catch(e){}}));
  save();ui();if(n)ref='📥 Nada para ativar (sem skills, comandos ou MCP por HTTP), então baixei '+n+' arquivo(s) de texto como **referência** em `'+base+'` (somente leitura para a IA).'}
 let hint='';const st=(window.__stdio||[]).slice(0,3).map(x=>(x.cmd+' '+(x.args||[]).join(' ')).trim()).filter(Boolean);
 if(!st.length){try{const pk=tree.find(x=>x.p==pre+'package.json'),rd=tree.find(x=>/^readme(\.md)?$/i.test(x.p.slice(pre.length)));let nm='';
   if(pk){const j=JSON.parse(await gGet(g,pk.p));if(j.bin||/mcp/i.test(j.name+(j.description||'')))nm=j.name}
   if(!nm&&rd){const r=await gGet(g,rd.p),mm=/npx\s+(?:-y\s+)?([@\w./-]+)(?:\s+(mcp|serve|server|start))?/i.exec(r);if(mm&&/mcp/i.test(r))nm=mm[1]+(mm[2]?' '+mm[2]:'')}
   if(nm)st.push('npx -y '+nm.replace(/^npx\s+(-y\s+)?/,''))}catch(e){}}
 if(st.length)hint='⚠️ Este repositório também traz um servidor MCP **stdio** (roda por Node/npx), que não executa dentro do app. Para usar as ferramentas dele: no Termux, rode a ponte `npx -y supergateway --stdio "'+st[0]+'" --port 8000` (confira a documentação do supergateway) e adicione `http://127.0.0.1:8000/sse` em ＋ → MCP e plugins → Adicionar servidor MCP. Veja também se as ferramentas do servidor funcionam no Android.';
 const sum='🧩 **'+g.o+'/'+g.r+(g.p?'/'+g.p:'')+'**\n'+(done.length?'✅ Ativado:\n'+done.map(x=>'- '+x).join('\n')+(done.some(x=>/skill/.test(x))?'\n(as skills ficam neste projeto; a IA as carrega com use_skill)':''):'')+(ref?(done.length?'\n':'')+ref:'')+(!done.length&&!ref?'Não encontrei nada utilizável neste link (sem skills, comandos, MCP por HTTP nem arquivos de texto).':'')+(notes.length?'\n'+notes.map(x=>'ℹ️ '+x).join('\n'):'')+(hint?'\n\n'+hint:'');
 return{ok:done.length>0||!!ref,names,summary:sum}}
async function plugChat(t,hit){const p=pj();if(typeof chatsInit=='function')chatsInit(p);busy=true;stop=false;AC=new AbortController();p.hist.push({role:'user',text:t});ST='🧩 baixando o plugin do GitHub...';ui();let r;
 try{r=await plugInstall(hit.url)}catch(e){r={ok:false,summary:'⚠️ Não consegui instalar '+hit.url+': '+e.message+(/403|429/.test(e.message)?'':'\n(Repositório privado? Conecte sua conta em Ajustes → GitHub.)')}}
 p.hist.push({role:'assistant',text:r.summary});busy=false;ST='';save();ui();
 if(r.ok&&hit.follow)return _runPlug('Usando o plugin'+(r.names&&r.names[0]?' "'+r.names[0]+'"':'')+' que acabei de instalar: '+hit.follow)}
let _runPlug;{_runPlug=run;const _r=run;run=function(t){if(typeof t=='string'&&!busy){const hit=plugIntent(t);if(hit)return plugChat(t,hit)}return _r(t)};_runPlug=_r}
/* ferramenta para a IA instalar plugin quando o usuário pedir em linguagem natural */
T.push(['install_plugin','Instala (ativa) um plugin/skill/MCP a partir de um link do GitHub: baixa skills, comandos, servidores MCP por HTTP e AGENTS.md do repositório; se nada for ativável, baixa como referência em importados/. Use quando o usuário pedir para instalar, conectar ou baixar um plugin/MCP de um repositório',{url:'string'}]);ico.install_plugin='🧩';
{const _e=exec;exec=async function(n,a){if(n!='install_plugin')return _e(n,a);
 const url=String((a&&a.url)||'').trim();if(!GHU(url))return'Erro: link do GitHub inválido';if(S.mode=='plan')return'Modo plano: instalação bloqueada. Descreva o que instalaria e peça aprovação.';
 if(((S.perm||{}).net)=='deny')return'Bloqueado pelas regras de permissão do usuário (acessar a internet).';
 const g=GHU(url),lu=[...pj().hist].reverse().find(m=>m.role=='user'&&m.text&&m.text[0]!='['),said=lu&&lu.text.toLowerCase().includes((g.o+'/'+g.r).toLowerCase());
 if(!said&&(await dlg({title:'Instalar plugin?',text:'A IA quer instalar '+g.o+'/'+g.r+' do GitHub (skills, comandos e servidores MCP passam a influenciar o agente). Permitir?',btns:['✅ Instalar','🚫 Negar']}))!==0)return'Negado: o usuário não autorizou a instalação.';
 try{return(await plugInstall(url)).summary}catch(e){return'Erro: '+e.message}}}
