/* apkplug.js — plugins (scripts JS) e ferramentas do agente para o editor de APK. Depende de apk.js */
const PLUG_BUILTIN=[
{id:'b-img',name:'Trocar imagens por padrão',desc:'Troca todas as imagens cujo nome combina com um texto (ex.: pou, sprite, icon) por uma imagem sua, ajustada ao tamanho e formato de cada uma. Ex.: colocar uma vaca no lugar do personagem.',code:`// @name Trocar imagens por padrão
const f=await apk.pickFile('image/*');if(!f)return log('Cancelado.');
const q=prompt('Parte do nome/caminho das imagens a trocar (ex.: pou, sprite, icon). Dica: busque primeiro com o plugin “Buscar no APK”.');if(!q)return;
const imgs=apk.list(q).filter(x=>/\\.(png|jpe?g|webp)$/i.test(x.name));
if(!imgs.length)return log('Nenhuma imagem combina com "'+q+'".');
if(!confirm(imgs.length+' imagem(ns) serão trocadas:\\n'+imgs.slice(0,15).map(x=>x.name).join('\\n')+(imgs.length>15?'\\n…':'')))return;
for(const i of imgs){try{await apk.replaceImage(i.name,f);log('✓ '+i.name)}catch(e){log('✗ '+i.name+': '+e.message)}}
log('Pronto. Volte e toque em 💾 Salvar e assinar.');`},
{id:'b-find',name:'Buscar no APK',desc:'Procura um texto ou regex nos nomes dos arquivos e dentro dos textos/XMLs (o manifesto é decodificado).',code:`// @name Buscar no APK
const q=prompt('Texto ou regex a buscar:');if(!q)return;
const r=await apk.search(q);
log(r.length+' resultado(s)'+(r.length>=200?' (limitado a 200)':'')+':');
for(const x of r)log(x.name+(x.line?':'+x.line+'  '+x.text:'  '+x.text));`},
{id:'b-ren',name:'Renomear app e pacote',desc:'Troca o nome do pacote (applicationId) e, se for texto literal, o nome do app no manifesto. Serve para instalar uma cópia ao lado do original.',code:`// @name Renomear app e pacote
let m=await apk.text('AndroidManifest.xml');
const cur=(/package="([^"]*)"/.exec(m)||[])[1];
const np=prompt('Novo nome do pacote (atual: '+cur+'):',cur);if(!np)return;
m=m.replace('package="'+cur+'"','package="'+np+'"');
const lab=(/<application[^>]*?android:label="([^"]*)"/.exec(m)||[])[1];
if(lab&&!lab.startsWith('@')){const nl=prompt('Novo nome do app (atual: '+lab+'):',lab);if(nl)m=m.replace(/(<application[^>]*?android:label=")[^"]*"/,'$1'+nl+'"')}
else log('O nome do app vem de um recurso (resources.arsc): não dá para mudar por aqui.');
await apk.write('AndroidManifest.xml',m);
log('Pacote: '+cur+' → '+np+'. Se houver <provider android:authorities>, troque também.');`},
{id:'b-dbg',name:'Ligar debuggable e backup',desc:'Adiciona android:debuggable="true" e android:allowBackup="true" ao <application> (útil para inspecionar o app).',code:`// @name Ligar debuggable e backup
let m=await apk.text('AndroidManifest.xml');
if(!/<application/.test(m))return log('Manifesto sem <application>.');
if(!/android:debuggable=/.test(m))m=m.replace('<application','<application android:debuggable="true"');else m=m.replace(/android:debuggable="[^"]*"/,'android:debuggable="true"');
if(!/android:allowBackup=/.test(m))m=m.replace('<application','<application android:allowBackup="true"');else m=m.replace(/android:allowBackup="[^"]*"/,'android:allowBackup="true"');
await apk.write('AndroidManifest.xml',m);log('debuggable e allowBackup ligados.');`}];
const plugLoad=()=>{try{return JSON.parse(localStorage.getItem('cm_apkplug')||'[]')}catch(e){return[]}},plugSave=l=>{try{localStorage.setItem('cm_apkplug',JSON.stringify(l))}catch(e){alert('Não consegui guardar o plugin: '+e.message)}};
const plugMeta=c=>({name:((/^\/\/\s*@name\s+(.+)$/m.exec(c)||[])[1]||'Plugin sem nome').trim(),desc:((/^\/\/\s*@desc\s+(.+)$/m.exec(c)||[])[1]||'').trim()});
const plugAll=()=>[...PLUG_BUILTIN.map(p=>({...p,builtin:1})),...plugLoad().map(p=>({...p,...plugMeta(p.code)}))];
const AsyncFn=Object.getPrototypeOf(async function(){}).constructor;
/* roda um script com a API do APK; devolve o log */
async function plugRun(code,extra){const L=[],log=(...a)=>L.push(a.map(x=>typeof x=='string'?x:JSON.stringify(x)).join(' '));
 try{const r=await new AsyncFn('apk','log','prompt','confirm','pj','args',code)(apkAPI,log,(m,d)=>window.prompt(m,d),m=>window.confirm(m),pj(),extra||{});if(r!==undefined)log(typeof r=='string'?r:JSON.stringify(r))}catch(e){log('ERRO: '+(e&&e.message||e))}
 return L.join('\n')}
let PLUG={view:'list',id:null,log:''};
function plugH(){const back='<div class="r"><button class="s" data-ak="plugback">← Voltar ao APK</button></div>';
 if(PLUG.view=='edit'){const p=PLUG.id?plugLoad().find(x=>x.id==PLUG.id):null,c=PLUG.draft!=null?PLUG.draft:(p?p.code:'// @name Meu plugin\n// @desc O que ele faz\nconst arquivos=apk.list(".png");\nlog(arquivos.length+" imagens");');
  return'<b>'+(p?'Editar plugin':'Novo plugin')+'</b><div class="f" style="color:var(--m);font-size:13px">JavaScript (async). Você tem: <code>apk</code> (list, read, text, write, remove, search, strings, hex, imageSize, replaceImage, pickFile), <code>log()</code>, <code>prompt()</code>, <code>confirm()</code>. Use <code>return</code> para sair. Só execute plugins em que você confia.</div><textarea id="plugcode" spellcheck="false" style="flex:1;min-height:50vh">'+esc(c)+'</textarea><div class="r"><button class="p" data-ak="plugsave">Salvar</button><button class="s" data-ak="plugtest">▶ Testar</button><button class="s" data-ak="plugcancel">Cancelar</button></div>'+(PLUG.log?'<pre class="f" style="white-space:pre-wrap;font-size:12px">'+esc(PLUG.log)+'</pre>':'')}
 return back+'<b>🧩 Plugins</b><div class="f" style="color:var(--m);font-size:13px">Scripts que mexem no APK aberto (trocar imagens, renomear, buscar…). Depois de rodar um, volte e toque em 💾 Salvar e assinar. Você também pode pedir ao agente (aba 💬) para fazer ou escrever um.</div>'
  +plugAll().map(p=>'<div class="f"><b>'+esc(p.name)+'</b>'+(p.builtin?' <small style="color:var(--m)">incluído</small>':'')+'<br><small style="color:var(--m)">'+esc(p.desc)+'</small><div class="r" style="margin-top:6px"><button class="p" data-ak="plugrun" data-k="'+p.id+'">▶ Executar</button>'+(p.builtin?'':'<button class="s" data-ak="plugedit" data-k="'+p.id+'">✏️</button><button class="s" data-ak="plugdel" data-k="'+p.id+'">🗑</button>')+'</div></div>').join('')
  +'<div class="r"><button class="s" data-ak="plugnew">＋ Novo plugin</button><button class="s" data-ak="plugimp">📥 Importar .js</button></div>'+(PLUG.log?'<pre class="f" style="white-space:pre-wrap;font-size:12px">'+esc(PLUG.log)+'</pre>':'')}
{const _h=apkH;apkH=function(){return APK.plug?plugH():_h()}}
Object.assign(apkOnAct,{
 plug(){APK.plug=true;PLUG={view:'list',id:null,log:''};ui()},plugback(){APK.plug=false;ui()},
 plugnew(){PLUG={...PLUG,view:'edit',id:null,draft:null};ui()},plugedit(el){PLUG={...PLUG,view:'edit',id:el.dataset.k,draft:null};ui()},plugcancel(){PLUG={...PLUG,view:'list',draft:null};ui()},
 plugdel(el){if(!confirm('Apagar este plugin?'))return;plugSave(plugLoad().filter(x=>x.id!=el.dataset.k));ui()},
 plugsave(){const c=$('#plugcode').value,l=plugLoad();if(PLUG.id){const p=l.find(x=>x.id==PLUG.id);if(p)p.code=c}else l.push({id:'u'+Date.now().toString(36),code:c});plugSave(l);PLUG={...PLUG,view:'list',draft:null};ui()},
 async plugtest(){const c=$('#plugcode').value;PLUG.draft=c;PLUG.log='⏳ executando…';ui();PLUG.log=await plugRun(c)||'(sem saída)';ui()},
 async plugrun(el){const p=plugAll().find(x=>x.id==el.dataset.k);if(!p)return;PLUG.log='⏳ '+p.name+'…';ui();PLUG.log=(await plugRun(p.code)||'(concluído)');ui()},
 plugimp(){apkAPI.pickFile('.js,text/javascript,text/plain').then(async f=>{if(!f)return;const c=await f.text();if(!confirm('Importar “'+plugMeta(c).name+'”?\n\nPlugins rodam com acesso total ao APK aberto. Só importe de quem você confia.'))return;const l=plugLoad();l.push({id:'u'+Date.now().toString(36),code:c});plugSave(l);ui()})}});
/* o campo de texto do editor de plugin não pode ser apagado quando o app redesenha */
{const _f=filesH;filesH=function(){const t=$('#plugcode');if(t&&PLUG.view=='edit')PLUG.draft=t.value;return _f()}}

/* ---------- ferramentas para o agente ---------- */
T.push(['apk_status','APK: diz se há um APK aberto e mostra pacote, versão, SDK, permissões, quantidade de arquivos e alterações pendentes',{}],
 ['apk_list','APK: lista arquivos do APK aberto (com tamanho). filter = parte do nome (opcional)',{filter:'string?'}],
 ['apk_read','APK: lê um arquivo do APK. XML binário (AndroidManifest, layouts) vem decodificado em XML; texto vem como texto (use start/end em linhas); imagens mostram o tamanho; binários mostram strings legíveis e hex',{path:'string',start:'int?',end:'int?'}],
 ['apk_search','APK: busca texto/regex nos nomes de arquivo e dentro dos textos e XMLs do APK (engenharia reversa: achar sprites, strings, classes)',{pattern:'string'}],
 ['apk_write','APK: grava um arquivo de texto no APK (cria ou substitui). Para XML binário (AndroidManifest.xml) envie o XML completo: é recompilado automaticamente',{path:'string',content:'string'}],
 ['apk_replace_image','APK: troca uma imagem (png/jpg/webp) do APK por uma imagem do projeto (ex.: gerada com generate_image ou anexada em assets/), ajustada ao tamanho e formato originais',{path:'string',source:'string'}],
 ['apk_remove','APK: remove um arquivo do APK',{path:'string'}],
 ['apk_script','APK: roda JavaScript (async) com o objeto apk (list, read, text, write, remove, search, strings, hex, imageSize, replaceImage) e log(). Use para edições em lote. Retorna o log',{code:'string'}],
 ['apk_build','APK: gera o APK editado, assina (v1+v2) e entrega para o usuário baixar/instalar. Chame no fim, depois de editar',{sign:'string?'}]);
const APK_W=['apk_write','apk_replace_image','apk_remove','apk_script','apk_build'];
W.push(...APK_W);GRP.write.push(...APK_W);Object.assign(ico,{apk_status:'📱',apk_list:'📱',apk_read:'📱',apk_search:'🔎',apk_write:'✏️',apk_replace_image:'🖼',apk_remove:'🗑',apk_script:'🧩',apk_build:'🔏'});
Object.assign(PD,{filter:'Parte do nome do arquivo (opcional)',source:'Caminho de uma imagem do projeto (ex.: assets/vaca.webp)',code:'Código JavaScript async; use apk.* e log()',sign:'"false" para não assinar (padrão: assina)'});
{const _ex=exec;exec=async function(n,a){a=a||{};if(!/^apk_/.test(n))return _ex(n,a);
 const need=k=>a[k]==null||a[k]===''?'Erro: parâmetro "'+k+'" ausente':null;
 if(!APK)return'Nenhum APK aberto. Peça ao usuário para abrir um na aba 📁 Arquivos (📱 Abrir APK).';
 if(APK_W.includes(n)){if(S.mode=='plan')return'Modo plano: alterar o APK fica bloqueado. Apresente o plano e peça aprovação.';const pm=(S.perm||{}).write;if(pm=='deny')return'Bloqueado pelas regras de permissão do usuário (criar/editar arquivos).';
  if(S.mode=='ask'&&(await dlg({title:'Alterar o APK?',text:n+' '+String(a.path||a.source||'').slice(0,200),btns:['✅ Permitir','🚫 Negar']}))!==0)return'Negado pelo usuário.'}
 try{switch(n){
  case'apk_status':{const i=APK.info||{};return'APK: '+APK.name+' ('+apkSz(APK.buf.length)+', '+apkNames().length+' arquivos, '+APK.over.size+' alteração(ões) pendente(s))\npacote: '+(i.pkg||'?')+' | versão '+(i.vn||'?')+' ('+(i.vc||'?')+') | SDK mín '+(i.min||'?')+' alvo '+(i.tgt||'?')+'\npermissões: '+((i.perms||[]).join(', ')||'(nenhuma)')}
  case'apk_list':{const l=apkAPI.list(a.filter);return(l.length?l.slice(0,400).map(x=>x.name+'  '+x.size+(x.modified?'  [modificado]':'')).join('\n'):'(nada)')+(l.length>400?'\n… +'+(l.length-400)+' (use filter)':'')}
  case'apk_read':{const e=need('path');if(e)return e;const d=await apkData(a.path).catch(()=>null);if(!d)return'Erro: arquivo não existe no APK. Use apk_list.';const k=apkKind(a.path,d);
   if(k=='img'){let s='';try{s=(await apkAPI.imageSize(a.path)).join('×')}catch(x){}return'🖼 imagem '+a.path+' '+s+' ('+d.length+' bytes). Para trocá-la use apk_replace_image.'}
   if(k=='text'||k=='axml'){const t=k=='axml'?axmlParse(d).text:new TextDecoder().decode(d),L=t.split('\n'),s=Math.max(1,+a.start||1),en=Math.min(L.length,+a.end||s+399);return(k=='axml'?'(XML binário decodificado) ':'')+a.path+' linhas '+s+'-'+en+' de '+L.length+':\n'+L.slice(s-1,en).join('\n').slice(0,12000)}
   const st=await apkAPI.strings(a.path,6);return'binário '+a.path+' ('+d.length+' bytes). Strings legíveis ('+st.length+'):\n'+st.slice(0,150).join('\n').slice(0,4000)+'\n\nHex:\n'+apkHex(d.subarray(0,256))}
  case'apk_search':{const e=need('pattern');if(e)return e;const r=await apkAPI.search(a.pattern);return r.length?r.map(x=>x.name+(x.line?':'+x.line+'  '+x.text:'  '+x.text)).join('\n'):'Nada encontrado'}
  case'apk_write':{const e=need('path')||need('content');if(e)return e;await apkAPI.write(a.path,String(a.content));ui();return'ok: '+a.path+' gravado no APK'}
  case'apk_replace_image':{const e=need('path')||need('source');if(e)return e;const r=await apkAPI.replaceImage(a.path,String(a.source).replace(/^\.?\/+/,''));ui();return'ok: '+r.name+' trocada ('+r.w+'×'+r.h+', mesmo formato)'}
  case'apk_remove':{const e=need('path');if(e)return e;apkAPI.remove(a.path);ui();return'ok: removido '+a.path}
  case'apk_script':{const e=need('code');if(e)return e;const r=await plugRun(String(a.code));ui();return r||'(concluído, sem saída)'}
  case'apk_build':{const u=await apkBuild(String(a.sign)!='false');await out(APK.name.replace(/\.apk$/i,'')+(String(a.sign)!='false'?'-editado-assinado.apk':'-editado.apk'),new Blob([u],{type:'application/vnd.android.package-archive'}));return'ok: APK '+(String(a.sign)!='false'?'assinado ':'')+'gerado ('+apkSz(u.length)+') e entregue ao usuário. Avise: se o app original estiver instalado, desinstale antes de instalar o editado.'}}}
 catch(e){return'Erro: '+e.message}
 return'Erro: ferramenta desconhecida'}}
{const _sy=sys;sys=function(){const s=_sy();if(CHATONLY||!APK)return s;const i=APK.info||{};
 return s+'\nAPK ABERTO: '+APK.name+' (pacote '+(i.pkg||'?')+', '+apkNames().length+' arquivos). Você pode inspecionar e editar o APK com as ferramentas apk_*: apk_status, apk_list, apk_search (achar sprites/strings), apk_read (XML binário já vem decodificado; binários mostram strings e hex), apk_write (texto e XML; o AndroidManifest é recompilado), apk_replace_image (troca png/jpg/webp por uma imagem do projeto, ajustando tamanho; combine com generate_image ou assets anexados), apk_remove, apk_script (JS em lote) e, no fim, apk_build (assina e entrega). Método: explore (apk_list/apk_search) antes de mexer, confirme o arquivo certo com apk_read, edite, e finalize com apk_build. Limites: não há decompilação de classes.dex nem edição de resources.arsc; se os sprites estiverem empacotados em formato próprio (não png/jpg/webp soltos), diga isso ao usuário em vez de inventar.'}}
