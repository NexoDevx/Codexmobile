/* exe.js — editor básico de .exe: importar, ver recursos, descompactar o ZIP embutido, trocar textos e imagens e baixar o exe modificado */
(()=>{
let X=null;const st=document.createElement('style');
st.textContent='#exe{position:fixed;inset:0;z-index:45;background:var(--bg);color:var(--t);overflow:auto;padding:calc(10px + env(safe-area-inset-top,0px)) 12px calc(20px + env(safe-area-inset-bottom,0px))}#exe h3{margin:16px 0 6px;font:500 17px Georgia,serif}#exe .rw{display:flex;align-items:center;gap:6px;padding:7px 8px;border:1px solid var(--b);border-radius:12px;margin:4px 0;background:var(--c)}#exe .rw span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#exe .rw button{min-height:0;padding:6px 9px}#exe .m{color:var(--m);font-size:13px}#exe img.th{max-width:64px;max-height:48px;image-rendering:pixelated;border-radius:6px}#exe input[type=text]{width:100%;margin:4px 0}#exe .hint{background:var(--c);border:1px solid var(--b);border-radius:12px;padding:8px 10px;margin:6px 0;font-size:13px}';document.head.appendChild(st);
const el=document.createElement('div');el.id='exe';el.hidden=true;document.body.appendChild(el);
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?(n/1024).toFixed(1)+' KB':n+' B';
const pick=acc=>new Promise(resolve=>{const i=document.createElement('input');i.type='file';i.accept=acc||'';i.hidden=true;let done=false;const clean=()=>{if(done)return;done=true;window.removeEventListener('focus',onFocus);i.onchange=null;i.oncancel=null;i.remove()};const finish=f=>{clean();resolve(f||null)};const onFocus=()=>setTimeout(()=>{if(!done&&!(i.files&&i.files.length))finish(null)},700);i.onchange=()=>finish(i.files&&i.files[0]);i.oncancel=()=>finish(null);document.body.appendChild(i);window.addEventListener('focus',onFocus,{once:true});try{i.click()}catch(e){finish(null);alert('O Android não conseguiu abrir o seletor de arquivos: '+((e&&e.message)||e))}});
const bytes=async f=>new Uint8Array(await f.arrayBuffer());
function openExe(){pick('.exe,.scr,.dll,application/octet-stream').then(async f=>{if(!f)return;try{const b=await bytes(f),info=EXE.parse(b),z=EXE.zipFind(b);X=exeMake(f.name,b);EXES.set(X.name,X);exePersist(X);await render()}catch(e){alert('Não consegui abrir: '+e.message)}})}
const isImg=r=>r.type==2||r.type==3&&EXE.sniff(X.b.subarray(r.off,r.off+8))=='png'||EXE.sniff(X.b.subarray(r.off,r.off+8))&&['png','jpg','gif'].includes(EXE.sniff(X.b.subarray(r.off,r.off+8)));
async function render(){if(!X)return;const I=X.info,sc=el.scrollTop;
 const res=I.res.filter(r=>X.filt=='all'?true:isImg(r)),th=[];
 el.innerHTML='<div class="r"><button class="s" data-a="close">✕ Fechar</button><button class="p" data-a="save">💾 Baixar .exe modificado</button><button class="s" data-a="del" title="Remover do app">🗑</button></div>'
 +'<h3>🧩 '+esc(X.name)+'</h3><div class="m">'+I.machine+' · '+kb(I.size)+' · '+I.sections.length+' seções · '+I.res.length+' recursos'+(I.dotnet?' · .NET':'')+'</div>'
 +(X.msg?'<div class="hint">'+esc(X.msg)+'</div>':'')+X.hints.map(h=>'<div class="hint">ℹ️ '+esc(h)+'</div>').join('')
 +'<h3>🔤 Textos dentro do exe</h3><div class="m">Troque um texto por outro do <b>mesmo tamanho ou menor</b> (o exe não tem espaço extra). Ex.: nomes, mensagens, nomes de arquivos de sprites.</div>'
 +'<input type="text" id="xq" placeholder="Texto a procurar (ex.: vaca)" value="'+esc(X.q)+'"><input type="text" id="xr" placeholder="Trocar por (ex.: dino)"><label class="m"><input type="checkbox" id="xg"> usar espaço livre depois do texto (arriscado)</label>'
 +'<div class="r"><button class="s" data-a="find">🔎 Procurar</button><button class="p" data-a="swap">Trocar</button><button class="s" data-a="strs">Ver textos</button></div>'
 +(X.hits?'<div class="hint">'+(X.hits.length?X.hits.length+' ocorrência(s): '+X.hits.slice(0,8).map(h=>h.kind+' @0x'+h.off.toString(16)+' (cabem '+h.len+(h.cap>h.len?'–'+h.cap:'')+' bytes)').join('; '):'Nenhuma ocorrência.')+'</div>':'')
 +(X.strs?'<div class="hint" style="max-height:160px;overflow:auto">'+X.strs.map(s=>'<div data-s="'+esc(s)+'" style="cursor:pointer">'+esc(s)+'</div>').join('')+'</div>':'')
 +'<h3>🖼 Recursos</h3><div class="r"><button class="s" data-f="img">'+(X.filt=='img'?'● ':'')+'Imagens</button><button class="s" data-f="all">'+(X.filt=='all'?'● ':'')+'Todos</button></div>'
 +(res.length?res.slice(0,150).map(r=>{const i=I.res.indexOf(r);return'<div class="rw"><span id="th'+i+'"></span><span>'+esc(r.label)+(X.rep[i]?' ✏️':'')+'<br><small class="m">'+kb(r.size)+(r.type==2?(()=>{const n=EXE.bmpInfo(X.b.subarray(r.off,r.off+r.size));return n?' · '+n.w+'×'+Math.abs(n.h)+' · '+n.bpp+' bits':''})():'')+'</small></span><button class="s" data-d="'+i+'">⬇</button><button class="s" data-r="'+i+'">🔁</button></div>'}).join(''):'<div class="m">Nenhum recurso nesta categoria.</div>')
 +(res.length>150?'<div class="m">Mostrando 150 de '+res.length+'.</div>':'')
 +(X.imgs.length?'<h3>🖼 Imagens soltas no exe</h3><div class="m">PNG/JPG/BMP achados dentro do binário (sem nome). A nova imagem precisa caber no mesmo espaço.</div>'+X.imgs.slice(0,100).map((m,k)=>'<div class="rw"><span id="ti'+k+'"></span><span>'+m.kind+' @0x'+m.off.toString(16)+'<br><small class="m">'+kb(m.size)+' · '+m.w+'×'+m.h+'</small></span><button class="s" data-id="'+k+'">⬇</button><button class="s" data-ir="'+k+'">🔁</button></div>').join(''):'')
 +(X.z?'<h3>📦 Arquivos embutidos (ZIP)</h3><div class="m">Este exe carrega um ZIP junto ('+X.zl.length+' arquivos). Os textos podem ser copiados para o projeto, editados (por você ou pelo agente) e reempacotados.</div><div class="r"><button class="s" data-a="unz">📥 Copiar textos para o projeto</button><button class="p" data-a="repack">📦 Reempacotar no exe</button></div>'
  +X.zl.filter(e=>!e.dir).slice(0,200).map((e,k)=>'<div class="rw"><span>'+esc(e.name)+'<br><small class="m">'+kb(e.us)+'</small></span><button class="s" data-zd="'+X.zl.indexOf(e)+'">⬇</button><button class="s" data-zr="'+X.zl.indexOf(e)+'">🔁</button></div>').join(''):'');
 for(const r of res.slice(0,150)){const i=I.res.indexOf(r),f=EXE.resFile(X.b,r),k=EXE.sniff(f.data);if(k&&k!='wav'&&k!='ogg'&&k!='zip'&&f.data.length<4e6){const s=el.querySelector('#th'+i);if(s)s.innerHTML='<img class="th" src="'+URL.createObjectURL(new Blob([f.data],{type:'image/'+(k=='jpg'?'jpeg':k)}))+'">'}}
 X.imgs.slice(0,100).forEach((m,k)=>{if(m.size<4e6){const s=el.querySelector('#ti'+k);if(s)s.innerHTML='<img class="th" src="'+URL.createObjectURL(new Blob([X.b.slice(m.off,m.off+m.size)],{type:'image/'+(m.kind=='jpg'?'jpeg':m.kind)}))+'">'}});
 el.hidden=false;el.scrollTop=sc}
const note=m=>{X.msg=m;exePersist(X);return render()};
window.exeRefresh=()=>{if(X&&!el.hidden)render()};
function exeShow(n){X=EXES.get(n);if(X)render()}
async function replaceRes(i){const r=X.info.res[i],f=await pick(r.type==2?'image/*,.bmp':'');if(!f)return;
 try{if(/^image\//.test(f.type)||/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)){try{return await note(await exeReplaceImage(X,'r'+i,f))}catch(e){if(r.type==2)throw e}}
  EXE.resReplace(X.b,r,await bytes(f));X.rep[i]=1;await note('✅ '+r.label+' trocado. Baixe o .exe modificado quando terminar.')}catch(e){await note('⚠️ '+e.message)}}
const textLike=n=>/\.(txt|json|xml|ini|cfg|conf|lua|js|py|html?|css|md|csv|yml|yaml|tsv|log|bat|cmd|sh)$/i.test(n);
const base=()=>'exe/'+X.name.replace(/\.[^.]+$/,'').replace(/[^\w.-]+/g,'_')+'/';
el.addEventListener('click',async e=>{const t=e.target.closest('[data-a],[data-f],[data-d],[data-r],[data-s],[data-zd],[data-zr],[data-id],[data-ir]');if(!t||!X)return;const D=t.dataset;
 if(D.s){el.querySelector('#xq').value=D.s;X.q=D.s;return}
 if(D.f){X.filt=D.f;return render()}
 if(D.id!=null){const m=X.imgs[+D.id];return out('img_'+m.off.toString(16)+'.'+m.kind,new Blob([X.b.slice(m.off,m.off+m.size)]))}
 if(D.ir!=null){const m=X.imgs[+D.ir],f=await pick('image/*');if(!f)return;try{return await note(await exeReplaceImage(X,'i'+m.off.toString(16),f))}catch(e){return note('⚠️ '+e.message)}}
 if(D.d!=null){const f=EXE.resFile(X.b,X.info.res[+D.d]);return out(f.name,new Blob([f.data]))}
 if(D.r!=null)return replaceRes(+D.r);
 if(D.zd!=null){const en=X.zl[+D.zd];return out(en.name.split('/').pop(),new Blob([await EXE.zipRead(X.b,en)]))}
 if(D.zr!=null){const en=X.zl[+D.zr],f=await pick();if(!f)return;X.zrep=X.zrep||{};X.zrep[en.name]=await bytes(f);return note('✅ '+en.name+' será trocado ao reempacotar.')}
 const a=D.a;X.q=el.querySelector('#xq').value;const rp=el.querySelector('#xr').value,gr=el.querySelector('#xg').checked;
 if(a=='close'){el.hidden=true;return}
 if(a=='del'){if(confirm('Remover '+X.name+' do app? (o arquivo original no seu aparelho não é afetado)')){EXES.delete(X.name);exeForget(X.name);X=null;el.hidden=true}return}
 if(a=='save')return out(X.name.replace(/\.(exe|scr|dll)$/i,'')+'-mod.'+(X.name.match(/\.(exe|scr|dll)$/i)||['','exe'])[1],new Blob([X.b]));
 if(a=='find'){X.hits=X.q?EXE.findText(X.b,X.q):[];X.strs=null;return render()}
 if(a=='strs'){X.strs=EXE.strings(X.b);X.hits=null;return render()}
 if(a=='swap'){if(!X.q)return;const r=EXE.replaceText(X.b,X.q,rp,gr);X.hits=null;return note(r.found?('Trocadas '+r.done+' de '+r.found+' ocorrências'+(r.skipped?'. '+r.skipped+' não couberam (máx. '+r.maxLen+' bytes; tente "usar espaço livre").':'.')):'Texto não encontrado.')}
 if(a=='unz'){const F=pj().files;let n=0;for(const en of X.zl){if(en.dir||!textLike(en.name)||en.us>2e5)continue;const d=await EXE.zipRead(X.b,en);try{F[base()+en.name]=new TextDecoder('utf-8',{fatal:true}).decode(d);n++}catch(_){}}save();ui();return note('📥 '+n+' arquivo(s) de texto copiados para '+base()+' no projeto. Edite-os (ou peça ao agente) e depois toque em Reempacotar.')}
 if(a=='repack'){const F=pj().files,ents=[];let ch=0;for(const en of X.zl){let d=en.dir?new Uint8Array(0):(X.zrep&&X.zrep[en.name])||await EXE.zipRead(X.b,en);const k=base()+en.name;if(!en.dir&&k in F&&textLike(en.name)){const nd=new TextEncoder().encode(F[k]);if(nd.length!=d.length||nd.some((v,j)=>v!==d[j])){d=nd;ch++}}ents.push({name:en.name,data:d})}
  ch+=Object.keys(X.zrep||{}).length;const nz=await EXE.zipBuild(ents),nb=new Uint8Array(X.z.start+nz.length);nb.set(X.b.subarray(0,X.z.start));nb.set(nz,X.z.start);X.b=nb;X.info=EXE.parse(nb);X.z=EXE.zipFind(nb);X.zl=EXE.zipList(nb,X.z);X.zrep={};return note('📦 Reempacotado ('+ch+' arquivo(s) alterado(s)). Baixe o .exe modificado. Atenção: se o exe estiver assinado digitalmente, a assinatura deixa de valer.')}});
async function exeMenu(){const n=[...EXES.keys()];if(!n.length)return openExe();const i=await dlg({title:'Editar .exe',text:'Escolha um exe já aberto ou importe outro.',btns:['📂 Importar outro .exe',...n.slice(0,4).map(x=>'🧩 '+x),'Cancelar']});if(i===0)return openExe();if(i>=1&&i<=n.slice(0,4).length)exeShow(n[i-1])}
{const _m=cmMenu;cmMenu=function(){return[..._m(),['🧩','Editar .exe (básico)','Importar, ver recursos, descompactar e trocar imagens/textos',exeMenu]]}}
})();
