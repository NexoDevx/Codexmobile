/* apk.js — abrir, ver e editar um APK (aba 📁 Arquivos). Depende de apkcore.js e do app.js */
let APK=null,APKV=false,apkDB=null;
const apkSz=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const apkExt=n=>(/\.([^./]+)$/.exec(n)||[])[1]?.toLowerCase()||'';
const apkIco=n=>{const e=apkExt(n);return zipDir(n)?'📁':/^(png|jpe?g|webp|gif|bmp)$/.test(e)?'🖼':e=='xml'?'🧩':e=='dex'?'⚙️':e=='so'?'🔩':e=='arsc'?'🗂':/^(json|txt|html|js|css|properties|md|mf|sf|smali|kt|java)$/.test(e)?'📄':'📦'};

/* ---------- guardar o APK no aparelho (IndexedDB), para sobreviver ao fechar o app ---------- */
function apkDbOpen(){return new Promise(r=>{try{const q=indexedDB.open('cm-apk',1);q.onupgradeneeded=()=>q.result.createObjectStore('a');q.onsuccess=()=>{apkDB=q.result;r(apkDB)};q.onerror=()=>r(null)}catch(e){r(null)}})}
const apkIdb=(m,k,v)=>new Promise(r=>{if(!apkDB)return r();try{const s=apkDB.transaction('a',m==='get'?'readonly':'readwrite').objectStore('a'),q=m==='get'?s.get(k):m==='del'?s.delete(k):s.put(v,k);q.onsuccess=()=>r(q.result);q.onerror=()=>r()}catch(e){r()}});
const apkSaveOver=()=>APK&&apkIdb('put','over',[...APK.over]);
async function apkRestore(){await apkDbOpen();const m=await apkIdb('get','meta');if(!m)return;const b=await apkIdb('get','buf');if(!b)return;
 try{APK={name:m.name,buf:new Uint8Array(b),ents:[],over:new Map((await apkIdb('get','over'))||[]),view:null,q:''};APK.ents=zipRead(APK.buf);await apkInfoLoad();APKV=false;ui()}catch(e){APK=null}}

/* ---------- abrir ---------- */
async function apkOpen(f){let buf;try{buf=new Uint8Array(await f.arrayBuffer())}catch(e){return alert('Não consegui ler o arquivo: '+e.message)}
 let ents;try{ents=zipRead(buf)}catch(e){return alert('APK inválido: '+e.message)}
 APK={name:f.name,buf,ents,over:new Map(),view:null,q:''};APKV=true;
 await apkInfoLoad();
 await apkIdb('put','buf',buf.buffer.byteLength==buf.length?buf.buffer:buf.slice().buffer);await apkIdb('put','meta',{name:f.name});await apkIdb('put','over',[]);
 ui();$$('nav button')[1].click()}
async function apkInfoLoad(){APK.info=null;const e=APK.ents.find(x=>x.name=='AndroidManifest.xml');if(!e)return;try{const d=await apkData('AndroidManifest.xml');if(axmlIs(d))APK.info=apkInfo(axmlParse(d).text)}catch(x){}}
async function apkData(name){if(APK.over.has(name))return APK.over.get(name);const e=APK.ents.find(x=>x.name==name);if(!e)throw new Error('arquivo não encontrado');return zipGet(APK.buf,e)}
const apkNames=()=>{const s=new Set(APK.ents.map(e=>e.name));for(const[k,d]of APK.over)d?s.add(k):s.delete(k);return[...s].filter(n=>!zipDir(n)).sort()};
const apkSize=n=>{const o=APK.over.get(n);if(o)return o.length;const e=APK.ents.find(x=>x.name==n);return e?e.usize:0};
const apkDirty=()=>APK.over.size>0;

/* ---------- classificar o arquivo e montar a visualização ---------- */
function apkKind(name,d){const e=apkExt(name);if(/^(png|jpe?g|webp|gif|bmp)$/.test(e))return'img';if(axmlIs(d))return'axml';
 if(d.length<1.5e6&&!d.subarray(0,4096).includes(0)){try{new TextDecoder('utf-8',{fatal:true}).decode(d);return'text'}catch(x){}}return'bin'}
function apkHex(d){const n=Math.min(d.length,2048);let s='';for(let i=0;i<n;i+=16){const r=d.subarray(i,Math.min(i+16,n));s+=i.toString(16).padStart(8,'0')+'  '+[...r].map(b=>b.toString(16).padStart(2,'0')).join(' ').padEnd(48)+' '+[...r].map(b=>b>31&&b<127?String.fromCharCode(b):'.').join('')+'\n'}
 return s+(d.length>n?'… (mostrando os primeiros 2048 de '+d.length+' bytes)':'')}
async function apkView(name){let d;try{d=await apkData(name)}catch(e){return alert('Erro ao abrir '+name+': '+e.message)}
 const k=apkKind(name,d),v={name,data:d,kind:k,mod:APK.over.has(name)};
 if(k=='img')v.url=URL.createObjectURL(new Blob([d],{type:'image/'+(apkExt(name)=='jpg'?'jpeg':apkExt(name))}));
 else if(k=='axml'){try{const p=axmlParse(d);v.text=p.text;v.strs=p.strs}catch(e){v.kind='bin';v.err='Não consegui decodificar o XML binário: '+e.message}}
 else if(k=='text')v.text=new TextDecoder().decode(d);
 APK.view=v;ui()}

/* ---------- telas ---------- */
const apkBtn=(a,t,c,extra)=>'<button class="'+(c||'s')+'" data-ak="'+a+'"'+(extra||'')+'>'+t+'</button>';
function apkListH(){const q=APK.q.toLowerCase(),all=apkNames(),ns=all.filter(n=>!q||n.toLowerCase().includes(q)),i=APK.info;
 return ns.slice(0,300).map(n=>'<div class="f" data-ak="open" data-k="'+esc(n)+'">'+apkIco(n)+' '+esc(n)+' <small style="color:var(--m)">'+apkSz(apkSize(n))+'</small>'+(APK.over.has(n)?' ✏️':'')+'</div>').join('')+(ns.length>300?'<div class="f" style="color:var(--m)">… mais '+(ns.length-300)+' arquivos: use a busca.</div>':'')+(!ns.length?'<div class="f" style="color:var(--m)">Nada encontrado.</div>':'')}
function apkH(){const A=APK,v=A.view;
 if(v){const head='<b>'+esc(v.name)+'</b> <small style="color:var(--m)">'+apkSz(v.data.length)+(v.mod?' · modificado':'')+'</small>',
  bt='<div class="r">'+apkBtn('back','← Voltar')+apkBtn('dl','⬇ Baixar')+apkBtn('rep','🔁 Substituir')+(v.kind=='text'||v.kind=='axml'?apkBtn('ext','📥 Para o projeto'):'')+(v.kind=='text'?apkBtn('savet','Salvar','p'):'')+(v.kind=='axml'&&!v.axEd?apkBtn('axt','✏️ Editar como texto','p'):'')+(v.axEd?apkBtn('axsave','Compilar e salvar','p')+apkBtn('axcancel','Cancelar'):'')+(v.kind=='axml'&&v.strs&&!v.axEd?apkBtn('strs','Só os textos'):'')+(v.mod&&A.ents.some(e=>e.name==v.name)?apkBtn('undo','↩ Desfazer'):'')+apkBtn('del','🗑')+'</div>';
  if(v.strsEd){const q=(v.sq||'').toLowerCase(),L=v.strs.map((s,i)=>[s,i]).filter(([s])=>s&&(!q||s.toLowerCase().includes(q))).slice(0,200);
   return head+'<div class="f" style="color:var(--m)">Textos deste XML binário (nome do pacote, rótulos, permissões, versão…). Só o texto muda; a estrutura continua igual. Cuidado: trocar o nome de uma classe ou permissão quebra o app.</div><input id="apksq" placeholder="Filtrar textos…" value="'+esc(v.sq||'')+'" oninput="apkSq(this.value)"><div id="apkstr">'+L.map(([s,i])=>'<label>#'+i+'</label><input data-si="'+i+'" value="'+esc(s)+'">').join('')+'</div><div class="r">'+apkBtn('strsave','Salvar textos','p')+apkBtn('strback','Cancelar')+'</div>'}
  return head+bt+(v.kind=='img'?'<img src="'+v.url+'" style="max-width:100%;border:1px solid var(--b);border-radius:12px;background:repeating-conic-gradient(#8883 0 25%,transparent 0 50%) 50%/16px 16px">'
   :v.kind=='text'?'<textarea id="apked" spellcheck="false" style="flex:1;min-height:55vh">'+esc(v.draft!=null?v.draft:v.text)+'</textarea>'
   :v.axEd?'<div class="f" style="color:var(--m)">Edite o XML e toque em “Compilar e salvar”. Atributos <code>android:</code> novos precisam ser conhecidos (debuggable, exported, label, name, permission…).</div><textarea id="apked" spellcheck="false" style="flex:1;min-height:55vh">'+esc(v.draft!=null?v.draft:v.text)+'</textarea>'
   :v.kind=='axml'?'<div class="f" style="color:var(--m)">XML binário decodificado. Toque em “Editar como texto” para alterar e recompilar.</div><pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;overflow:auto">'+esc(v.text)+'</pre>'
   :(v.err?'<div class="f">'+esc(v.err)+'</div>':'')+'<pre style="white-space:pre;font-size:11px;overflow:auto">'+esc(apkHex(v.data))+'</pre>')}
 const i=A.info,n=apkNames().length;
 return'<div class="r">'+apkBtn('proj','← Projeto')+apkBtn('add','＋ Arquivo')+apkBtn('plug','🧩 Plugins')+apkBtn('key','🔑 Chave')+apkBtn('close','✕ Fechar')+'</div><div class="r">'+apkBtn('save','💾 Salvar e assinar','p')+apkBtn('saveu','Salvar sem assinar')+'</div>'
  +'<div class="f"><b>📱 '+esc(A.name)+'</b><br><small style="color:var(--m)">'+apkSz(A.buf.length)+' · '+n+' arquivos'+(apkDirty()?' · '+A.over.size+' alteração(ões)':'')+'</small>'
  +(i?'<br>'+(i.pkg?'<code>'+esc(i.pkg)+'</code><br>':'')+'versão '+esc(i.vn||'?')+' ('+esc(i.vc||'?')+') · SDK mín. '+esc(i.min||'?')+' · alvo '+esc(i.tgt||'?')+'<br>'+i.perms.length+' permissões'+(i.perms.length?': <small style="color:var(--m)">'+i.perms.slice(0,12).map(p=>esc(p.replace(/^android\.permission\./,''))).join(', ')+(i.perms.length>12?'…':'')+'</small>':''):'')+'</div>'
  +'<input id="apkq" placeholder="Buscar arquivo (ex.: AndroidManifest, .png, assets/)" value="'+esc(A.q)+'" oninput="apkQ(this.value)"><div id="apklist" style="display:flex;flex-direction:column;gap:6px">'+apkListH()+'</div>'}
const apkQ=s=>{APK.q=s;$('#apklist').innerHTML=apkListH()},apkSq=s=>{APK.view.sq=s;apkStrKeep();const L=APK.view.strs.map((x,i)=>[x,i]).filter(([x])=>x&&(!s||x.toLowerCase().includes(s.toLowerCase()))).slice(0,200);$('#apkstr').innerHTML=L.map(([x,i])=>'<label>#'+i+'</label><input data-si="'+i+'" value="'+esc(APK.view.edits&&i in APK.view.edits?APK.view.edits[i]:x)+'">').join('')};
function apkStrKeep(){const v=APK.view;v.edits=v.edits||{};$$('#apkstr [data-si]').forEach(e=>{v.edits[+e.dataset.si]=e.value})}

/* ---------- ações ---------- */
function apkPick(multi,cb){const i=document.createElement('input');i.type='file';i.hidden=true;i.multiple=!!multi;let done=false;const clean=()=>{if(done)return;done=true;window.removeEventListener('focus',onFocus);i.onchange=null;i.oncancel=null;i.remove()};const onFocus=()=>setTimeout(()=>{if(!done&&!(i.files&&i.files.length))clean()},700);i.onchange=async()=>{const fs=Array.from(i.files||[]);clean();try{for(const f of fs)await cb(f)}catch(e){alert('Erro ao importar arquivo: '+((e&&e.message)||e))}};i.oncancel=clean;document.body.appendChild(i);window.addEventListener('focus',onFocus,{once:true});try{i.click()}catch(e){clean();alert('O Android não conseguiu abrir o seletor de arquivos: '+e.message)}}
async function apkSetFile(name,d){APK.over.set(name,d);apkSaveOver();if(name=='AndroidManifest.xml')await apkInfoLoad()}
const apkOnAct={
 proj(){APKV=false;ui()},close(){if(apkDirty()&&!confirm('Fechar o APK? As alterações não salvas serão perdidas.'))return;APK=null;APKV=false;['buf','meta','over'].forEach(k=>apkIdb('del',k));ui()},
 back(){if(APK.view&&APK.view.url)URL.revokeObjectURL(APK.view.url);APK.view=null;ui()},
 async open(el){await apkView(el.dataset.k)},
 async dl(){const v=APK.view;out(v.name.split('/').pop(),new Blob([v.data]))},
 rep(){const v=APK.view;apkPick(0,async f=>{if(v.kind=='img'&&/^image\//.test(f.type)){try{await apkAPI.replaceImage(v.name,f)}catch(e){return alert('Não consegui trocar a imagem: '+e.message)}}else await apkSetFile(v.name,new Uint8Array(await f.arrayBuffer()));await apkView(v.name)})},
 axt(){const v=APK.view;v.axEd=true;v.draft=v.text;ui()},axcancel(){const v=APK.view;v.axEd=false;v.draft=null;ui()},
 async axsave(){const v=APK.view,t=$('#apked')?$('#apked').value:v.draft;let d;try{d=axmlCompile(t,v.data)}catch(e){return alert('Erro no XML: '+e.message)}await apkSetFile(v.name,d);v.axEd=false;v.draft=null;await apkView(v.name);alert('XML compilado e guardado no APK.')},
 async key(){const c=await dlg({title:'🔑 Chave de assinatura',text:'O APK é assinado com uma chave RSA guardada só neste aparelho. Use sempre a mesma para que seus APKs editados possam atualizar uns aos outros.',opts:['📤 Exportar backup da chave','📥 Importar chave','🔄 Gerar uma chave nova'],skip:'Fechar'});if(c==null)return;
  if(c.startsWith('📤')){const k=await apkKey();out('codemobile-chave.json',new Blob([JSON.stringify(k)],{type:'application/json'}))}
  else if(c.startsWith('📥'))apkPick(0,async f=>{try{const k=JSON.parse(await f.text());await signKeyUse(k);APK_KEY=k;await apkIdb('put','key',k);alert('Chave importada.')}catch(e){alert('Arquivo de chave inválido: '+e.message)}})
  else if(confirm('Gerar uma chave nova? APKs assinados com a chave antiga não poderão ser atualizados por APKs assinados com a nova (o Android exige a mesma assinatura).')){APK_KEY=null;await apkIdb('del','key');await apkKey();alert('Chave nova gerada.')}},
 add(){apkPick(0,async f=>{const n=prompt('Caminho dentro do APK (ex.: assets/'+f.name+')','assets/'+f.name);if(!n||/(^|\/)\.\.(\/|$)|^\//.test(n.trim()))return n&&alert('Caminho inválido');await apkSetFile(n.trim(),new Uint8Array(await f.arrayBuffer()));ui()})},
 async del(){const v=APK.view;if(!confirm('Remover '+v.name+' do APK?'))return;APK.over.set(v.name,null);apkSaveOver();if(v.name=='AndroidManifest.xml')APK.info=null;APK.view=null;ui()},
 async undo(){const v=APK.view;APK.over.delete(v.name);apkSaveOver();if(v.name=='AndroidManifest.xml')await apkInfoLoad();await apkView(v.name)},
 async savet(){const v=APK.view,t=$('#apked').value;await apkSetFile(v.name,new TextEncoder().encode(t));await apkView(v.name);alert('Alteração guardada no APK (use 💾 Salvar APK para gerar o arquivo).')},
 ext(){const v=APK.view,p=pj(),k='apk/'+v.name;if(k in p.files&&!confirm(k+' já existe no projeto. Sobrescrever?'))return;p.files[k]=v.text;save();alert('Copiado para o projeto como '+k+'. O agente pode lê-lo. (Edições no projeto não voltam sozinhas ao APK.)')},
 strs(){APK.view.strsEd=true;APK.view.edits={};ui()},strback(){APK.view.strsEd=false;ui()},
 async strsave(){const v=APK.view;apkStrKeep();const ns=v.strs.map((s,i)=>i in v.edits?v.edits[i]:s);
  try{await apkSetFile(v.name,axmlSetStrings(v.data,ns))}catch(e){return alert('Não consegui salvar: '+e.message)}await apkView(v.name);alert('Textos guardados no APK.')},
 async save(){await apkSaveAs(true)},async saveu(){await apkSaveAs(false)}};
let APK_KEY=null;
async function apkKey(){if(APK_KEY)return APK_KEY;let k=await apkIdb('get','key');if(!k){k=await signKeyGen('CodeMobile');await apkIdb('put','key',k)}return APK_KEY=k}
async function apkBuild(sign){if(!APK)throw new Error('Nenhum APK está aberto.');
 const raw=new Uint8Array(await(await zipWrite(APK.buf,APK.ents,APK.over)).arrayBuffer());
 await apkValidate(raw,false);
 if(!sign)return raw;
 const signed=await apkSign(raw,await apkKey());
 await apkValidate(signed,true);
 return signed}
async function apkSaveAs(sign){if(!APK)return alert('Abra um APK primeiro.');if(!apkDirty()&&!confirm('Nenhuma alteração feita. Gerar mesmo assim?'))return;
 const note='Esta função reempacota o APK existente e assina o resultado; ela não recompila código DEX/Java/Kotlin nem recursos que o editor não consegue editar.\n\n';
 if(!confirm(note+(sign?'O APK será validado, regravado e assinado com sua chave local (v1 + v2). Se o app original estiver instalado, o Android recusará atualização com outra assinatura.':'O APK será regravado e validado SEM assinatura. O Android não instala APKs sem assinatura.')))return;
 try{const source=APK.name,u=await apkBuild(sign),name=source.replace(/\.apk$/i,'')+(sign?'-editado-assinado.apk':'-editado.apk');const result=await out(name,new Blob([u],{type:'application/vnd.android.package-archive'}));
  const path=result&&result.path?'\nDestino: '+result.path:result&&result.browserDownload?'\nO download foi encaminhado ao navegador. Confira Downloads.':'';
  if(typeof dlg==='function')await dlg({title:'APK gerado e validado',text:name+'\nTamanho: '+apkSz(u.length)+path+'\n\nA validação estrutural do ZIP, do manifesto e '+(sign?'do bloco v1/v2':'do conteúdo')+' passou. A compatibilidade final depende de o APK conter recursos nativos/DEX válidos para o app.',skip:'OK'});else alert('APK gerado: '+name+path)
 }catch(e){alert('Não foi possível gerar/salvar o APK: '+e.message+'\n\nNenhum arquivo foi confirmado como salvo.')}}
$('#files').addEventListener('click',async e=>{const b=e.target.closest('[data-ak]');if(!b)return;e.stopImmediatePropagation();const f=apkOnAct[b.dataset.ak];if(f)try{await f(b)}catch(x){alert('Erro: '+x.message)}},true);


/* ---------- API para plugins e para o agente ---------- */
const apkTxtExt=/\.(xml|json|txt|properties|html?|js|css|smali|cfg|ini|md|mf|sf|yml|yaml|csv|kt|java|gradle|pro|version)$/i;
const apkNeed=()=>{if(!APK)throw new Error('nenhum APK aberto (abra um na aba Arquivos)');return APK};
const apkAPI={
 get info(){return APK&&APK.info},
 list(f){apkNeed();const m=f instanceof RegExp?n=>f.test(n):f?n=>n.toLowerCase().includes(String(f).toLowerCase()):()=>1;return apkNames().filter(m).map(n=>({name:n,size:apkSize(n),modified:APK.over.has(n)}))},
 read(n){apkNeed();return apkData(n)},
 async text(n){const d=await apkData(n);return axmlIs(d)?axmlParse(d).text:new TextDecoder().decode(d)},
 async write(n,v){apkNeed();let d=typeof v=='string'?new TextEncoder().encode(v):v;if(typeof v=='string'&&/\.xml$/i.test(n)){const o=await apkData(n).catch(()=>null);if(o&&axmlIs(o))d=axmlCompile(v,o)}await apkSetFile(n,d)},
 remove(n){apkNeed();APK.over.set(n,null);apkSaveOver();if(n=='AndroidManifest.xml')APK.info=null},
 async search(pat,max){apkNeed();let re;try{re=pat instanceof RegExp?pat:new RegExp(String(pat),'i')}catch(e){re=new RegExp(String(pat).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')}const out=[];max=max||200;
  for(const n of apkNames()){if(out.length>=max)break;if(re.test(n))out.push({name:n,line:0,text:'(nome do arquivo)'});
   if(apkSize(n)>3e6||!(apkTxtExt.test(n)||APK.over.has(n)))continue;let t;try{t=await apkAPI.text(n)}catch(e){continue}if(t.includes('\0'))continue;
   const L=t.split('\n');for(let i=0;i<L.length&&out.length<max;i++)if(re.test(L[i]))out.push({name:n,line:i+1,text:L[i].trim().slice(0,200)})}return out},
 async strings(n,min){const d=await apkData(n),o=[];let c='';min=min||6;for(let i=0;i<Math.min(d.length,2e6);i++){const b=d[i];if(b>31&&b<127)c+=String.fromCharCode(b);else{if(c.length>=min)o.push(c);c=''}}if(c.length>=min)o.push(c);return o},
 hex(n,len){return apkData(n).then(d=>apkHex(d.subarray(0,len||512)))},
 async imageSize(n){const d=await apkData(n),b=await createImageBitmap(new Blob([d]));const r=[b.width,b.height];b.close&&b.close();return r},
 /* troca uma imagem do APK por outra (File/Blob, dataURL ou caminho de um asset do projeto), ajustada ao tamanho original e no mesmo formato */
 async replaceImage(n,src,o){apkNeed();o=o||{};let blob=src;
  if(typeof src=='string'){const c=pj().files[src];const du=typeof imgData=='function'&&isImg(c)?imgData(c):/^data:/.test(src)?src:null;if(!du)throw new Error('origem de imagem inválida: '+src);blob=await (await fetch(du)).blob()}
  const e=apkExt(n);if(!/^(png|jpe?g|webp)$/.test(e))throw new Error('só troco png, jpg e webp');
  let W,H;try{[W,H]=await apkAPI.imageSize(n)}catch(x){}
  const im=await createImageBitmap(blob);W=W||im.width;H=H||im.height;const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  if(e!='png'&&e!='webp'){g.fillStyle='#fff';g.fillRect(0,0,W,H)}
  if(o.fit=='stretch')g.drawImage(im,0,0,W,H);else{const k=Math.min(W/im.width,H/im.height),w=im.width*k,h=im.height*k;g.drawImage(im,(W-w)/2,(H-h)/2,w,h)}
  const mt=e=='png'?'image/png':e=='webp'?'image/webp':'image/jpeg',out=await new Promise(r=>c.toBlob(r,mt,.92));if(!out)throw new Error('falha ao codificar a imagem');
  await apkSetFile(n,new Uint8Array(await out.arrayBuffer()));return{name:n,w:W,h:H}},
 pickFile(accept){return new Promise(r=>{const i=document.createElement('input');i.type='file';i.hidden=true;if(accept)i.accept=accept;i.onchange=()=>{const f=i.files[0];i.remove();r(f||null)};i.oncancel=()=>{i.remove();r(null)};document.body.appendChild(i);i.click()})},
 async build(sign){apkNeed();return apkBuild(sign!==false)}};

/* ---------- ligação com o app ---------- */
{const _f=filesH;filesH=function(){if(APK&&APKV){const t=$('#apked');if(t&&APK.view&&(APK.view.kind=='text'||APK.view.axEd))APK.view.draft=t.value;if(APK.view&&APK.view.strsEd&&$('#apkstr'))apkStrKeep();return apkH()}
 const h=_f();return(APK&&!APKV?'<div class="r"><button class="p" data-ak="show">📱 Voltar ao APK ('+esc(APK.name)+')</button></div>':'<div class="r"><button class="s" onclick="apkPick(0,apkOpen)">📱 Abrir APK</button></div>')+h}}
apkOnAct.show=()=>{APKV=true;ui()};
{const _o=$('#imp').onchange;$('#imp').onchange=async e=>{const all=[...e.target.files],ap=all.filter(f=>/\.apk$/i.test(f.name)),rest=all.filter(f=>!ap.includes(f));e.target.value='';
 if(ap.length)await apkOpen(ap[0]);if(rest.length)return _o({target:{files:rest,value:''}})}}
apkRestore();
