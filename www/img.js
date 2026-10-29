/* img.js — imagens como assets, fotos para a IA, geração de imagens, projeto limpo e marca </> */
const IMG=new Map(),PEND=[];let imgDB=null;
function isImg(c){return typeof c=='string'&&/^img:[a-z0-9]+$/.test(c)}
function imgData(c){return isImg(c)?IMG.get(c.slice(4))||null:null}
function binOf(c){if(!isImg(c))return null;const d=imgData(c);return d?Uint8Array.from(atob(d.split(',')[1]),x=>x.charCodeAt(0)):new Uint8Array(0)}
function imgHash(d){let h=2166136261;const st=Math.max(1,d.length>>>12);for(let i=0;i<d.length;i+=st){h^=d.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)+d.length.toString(36)}

/* ---------- armazenamento: as imagens ficam no IndexedDB; o projeto guarda só uma referência curta (img:id) ---------- */
function imgOpen(){return new Promise(res=>{try{const r=indexedDB.open('cm-img',1);r.onupgradeneeded=()=>r.result.createObjectStore('i');r.onsuccess=()=>{imgDB=r.result;res(imgDB)};r.onerror=()=>res(null)}catch(e){res(null)}})}
async function imgLoad(){const db=await imgOpen();if(!db)return;await new Promise(res=>{try{const rq=db.transaction('i').objectStore('i').openCursor();rq.onsuccess=()=>{const c=rq.result;if(c){IMG.set(c.key,c.value);c.continue()}else res()};rq.onerror=()=>res()}catch(e){res()}});imgGC();ui()}
function imgPut(d){const id=imgHash(d);if(!IMG.has(id)){IMG.set(id,d);try{imgDB&&imgDB.transaction('i','readwrite').objectStore('i').put(d,id)}catch(e){}}return'img:'+id}
function imgGC(){const used=new Set((JSON.stringify(S.pj).match(/img:[a-z0-9]+/g)||[]).map(x=>x.slice(4)));for(const id of[...IMG.keys()])if(!used.has(id)){IMG.delete(id);try{imgDB&&imgDB.transaction('i','readwrite').objectStore('i').delete(id)}catch(e){}}}

/* ---------- ler, reduzir e guardar imagens ---------- */
const fileURL=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('falha ao ler o arquivo'));r.readAsDataURL(f)});
function imgFit(src,max,type,q){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{let w=im.naturalWidth,h=im.naturalHeight;const s=Math.min(1,max/Math.max(w,h));w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));
 const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);let d=c.toDataURL(type||'image/webp',q||.85);if(!/^data:image\/(webp|png|jpeg)/.test(d))d=c.toDataURL('image/png');res({d,w,h})};im.onerror=()=>rej(new Error('não consegui abrir a imagem (formato não suportado?)'));im.src=src})}
async function addAsset(path,src,o={}){let max=o.max||1024,r;const lim=o.png?7e5:4.5e5;
 for(let i=0;i<4;i++){r=await imgFit(src,max,o.png?'image/png':'image/webp',.85);if(r.d.length*.75<=lim)break;max=Math.round(max*.75)}
 const p=pj();(p.idim=p.idim||{})[path]=[r.w,r.h];p.files[path]=imgPut(r.d);return{path,w:r.w,h:r.h,kb:Math.round(r.d.length*.75/1024)}}
const slug=n=>String(n).replace(/\.[^.]+$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'imagem';
const freePath=(b,ext)=>{const f=pj().files;let p='assets/'+b+ext,i=2;while(p in f)p='assets/'+b+'-'+(i++)+ext;return p};

/* ---------- importar fotos/imagens: mostrar para a IA e/ou salvar como asset ---------- */
const isImgFile=f=>(/^image\//.test(f.type)||/\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i.test(f.name))&&!/\.svg$/i.test(f.name);
async function imgIn(fs){const o=['👁 Mostrar para a IA (ela enxerga a imagem)','📥 Salvar no projeto como asset (assets/)','👁+📥 Os dois'];
 const c=await dlg({title:'🖼 '+(fs.length>1?fs.length+' imagens':fs[0].name),text:'Como quer usar?\n• Mostrar: a IA vê a imagem na próxima mensagem (o modelo precisa aceitar imagens).\n• Asset: a imagem entra no projeto para o jogo/site usar.',opts:o,skip:'Cancelar'});if(c==null)return;
 const k=o.indexOf(c),see=k!=1,keep=k!=0,saved=[];
 for(const f of fs){try{const src=await fileURL(f);
  if(keep){const r=await addAsset(freePath(slug(f.name),'.webp'),src);saved.push(r.path)}
  if(see){const r=await imgFit(src,768,'image/webp',.8);PEND.push({n:f.name,id:imgPut(r.d)})}}catch(e){alert(f.name+': '+e.message)}}
 save();vatcR();ui();
 const nm=saved[0];$('#in').value=see&&keep?'Veja a imagem anexada (salva em '+nm+') e ':see?'Veja a imagem que anexei e ':keep?'Use a imagem '+nm+' no ':'';
 if(see||keep){$$('nav button')[0].click();$('#in').focus()}}
{const _oc=$('#imp').onchange;$('#imp').onchange=async e=>{const all=[...e.target.files],im=all.filter(isImgFile),rest=all.filter(f=>!im.includes(f));e.target.value='';
 if(im.length)await imgIn(im);if(rest.length)return _oc({target:{files:rest,value:''}})}}
$('#bar').insertAdjacentHTML('beforebegin','<div id="vatc" class="r" hidden style="gap:6px;padding:0 10px"></div>');
function vatcR(){const e=$('#vatc');if(!e)return;e.innerHTML=PEND.map((x,i)=>'<span class="ch" data-v="'+i+'">🖼 '+esc(x.n)+' ✕</span>').join('');e.hidden=!PEND.length}
$('#vatc').addEventListener('click',e=>{const c=e.target.closest('[data-v]');if(c){PEND.splice(+c.dataset.v,1);vatcR()}});
/* a imagem vai junto com a próxima mensagem enviada */
{const _r=run;run=function(t){const was=busy,r=_r(t);if(!was&&t!=null&&PEND.length){const h=pj().hist,u=h[h.length-1];if(u&&u.role=='user'&&u.text===t){u.imgs=PEND.splice(0);u.text='🖼 '+u.imgs.map(x=>x.n).join(', ')+'\n'+u.text;vatcR();save();ui()}}return r}}
/* só a imagem mais recente e só nas primeiras rodadas (economiza tokens) */
function imgBlocks(m){if(!m.imgs||!m.imgs.length)return null;const h=pj().hist,i=h.findIndex(x=>x.imgs&&x.imgs[0]&&x.imgs[0].id==m.imgs[0].id);if(i<0)return null;
 const last=[...h].reverse().find(x=>x.imgs&&x.imgs.length);let as=0;for(let k=i+1;k<h.length;k++)if(h[k].role=='assistant')as++;if(last!==h[i]||as>2)return null;
 return m.imgs.map(x=>({n:x.n,d:imgData(x.id)})).filter(x=>x.d)}
function imgA(m){const b=imgBlocks(m);if(!b||!b.length)return m.text;return[...b.map(x=>({type:'image',source:{type:'base64',media_type:(/^data:([^;]+)/.exec(x.d)||[])[1]||'image/webp',data:x.d.split(',')[1]}})),{type:'text',text:m.text}]}
function imgO(m){const b=imgBlocks(m);if(!b||!b.length)return m.text;return[{type:'text',text:m.text},...b.map(x=>({type:'image_url',image_url:{url:x.d}}))]}

/* ---------- usar os assets: preview, visualizador, leitura protegida ---------- */
{const _b=build;build=function(){let h=_b();const f=pj().files;for(const k in f){const d=imgData(f[k]);if(!d)continue;
  h=h.replace(new RegExp('(?<![\\w.\\-/])(?:\\./|/)?'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w.\\-])','g'),()=>d)}return h}}
{const _fh=filesH;filesH=function(){const f=pj().files;if(!rv&&op!=null&&isImg(f[op])){const d=imgData(f[op]),di=(pj().idim||{})[op];
 return'<b>'+esc(op)+'</b><div class="r"><button class="s" onclick="op=null;ui()">← Voltar</button><button class="s" onclick="delImg()">🗑 Apagar</button></div>'+(d?'<img src="'+d+'" style="max-width:100%;border:1px solid var(--b);border-radius:12px;background:repeating-conic-gradient(#8883 0 25%,transparent 0 50%) 50%/16px 16px">':'<div class="f">Imagem indisponível neste aparelho.</div>')+'<div class="f">'+(di?di[0]+'×'+di[1]+' · ':'')+(d?Math.round(d.length*.75/1024)+' KB':'')+' · use no código como <code>'+esc(op)+'</code></div>'}return _fh()}}
function delImg(){delete pj().files[op];op=null;save();imgGC();ui()}

/* ---------- gerar imagens (só aparece se houver chave OpenAI/Gemini ou Pollinations escolhido) ---------- */
const IMGP={openai:'OpenAI (gpt-image-1)',gemini:'Gemini (nano banana)',poll:'Pollinations (grátis)'};
function imgCap(){const m=(S.img&&S.img.m)||'auto';if(m=='off')return null;if(m=='openai')return S.keys.openai?'openai':null;if(m=='gemini')return S.keys.gemini?'gemini':null;if(m=='poll')return'poll';return S.keys.openai?'openai':S.keys.gemini?'gemini':null}
const blobData=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('falha ao ler a imagem'));r.readAsDataURL(b)});
async function genImage(prov,prompt,size,tr){const wide=/wide|larg|16:9|paisag|horizontal/i.test(size||''),tall=/tall|alt|9:16|retrato|vertical/i.test(size||'');
 if(prov=='openai'){const k=S.keys.openai,mk=async(model,sz,extra)=>{const r=await F('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+k,'content-type':'application/json'},body:JSON.stringify({model,prompt,n:1,size:sz,...extra})}),j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||r.status);const x=j.data&&j.data[0];if(!x)throw new Error('a resposta veio sem imagem');
   if(x.b64_json)return'data:image/png;base64,'+x.b64_json;const u=await F(x.url);return blobData(await u.blob())},m=(S.img&&S.img.model)||'gpt-image-1';
  try{return await mk(m,wide?'1536x1024':tall?'1024x1536':'1024x1024',tr?{background:'transparent',output_format:'png'}:{})}
  catch(e){if(m=='gpt-image-1'&&/verif|access|not found|does not exist|model/i.test(e.message))return mk('dall-e-3',wide?'1792x1024':tall?'1024x1792':'1024x1024',{response_format:'b64_json'});throw e}}
 if(prov=='gemini'){const m=(S.img&&S.img.model)||'gemini-2.5-flash-image',r=await F('https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent',{method:'POST',headers:{'x-goog-api-key':S.keys.gemini,'content-type':'application/json'},
   body:JSON.stringify({contents:[{parts:[{text:prompt+(wide?'. Aspect ratio 16:9.':tall?'. Aspect ratio 9:16.':'')+(tr?' Plain solid single-color background.':'')}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}})}),j=await r.json();
  if(!r.ok)throw new Error((j.error&&j.error.message)||r.status);const ps=((((j.candidates||[])[0]||{}).content||{}).parts)||[],pt=ps.find(x=>x.inlineData||x.inline_data);if(!pt)throw new Error('o modelo não devolveu imagem'+(j.promptFeedback?' (bloqueada pelo filtro)':''));const id=pt.inlineData||pt.inline_data;return'data:'+(id.mimeType||id.mime_type||'image/png')+';base64,'+id.data}
 const w=wide?1280:tall?720:1024,h=wide?720:tall?1280:1024,r=await F('https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt.slice(0,800))+'?width='+w+'&height='+h+'&nologo=true&model=flux&seed='+Math.floor(Math.random()*1e6));if(!r.ok)throw new Error('Pollinations '+r.status);return blobData(await r.blob())}
T.push(['generate_image','Gera uma imagem com IA (sprite, personagem, fundo, ícone, textura) e salva em assets/. Cada imagem custa dinheiro: use só quando o usuário quiser arte e reaproveite o que já existe. Devolve o caminho salvo',{prompt:'string',path:'string',size:'string?',transparent:'string?'}]);
W.push('generate_image');GRP.write.push('generate_image');ico.generate_image='🎨';
Object.assign(PD,{prompt:'Descrição detalhada da imagem (estilo, cores, enquadramento, fundo)',size:'square (padrão), wide ou tall',transparent:'"true" para fundo transparente (sprites; melhor na OpenAI)'});
{const _ex=exec;exec=async function(n,a){a=a||{};
 if(n=='generate_image'){const pv=imgCap();if(!pv)return'Erro: a geração de imagens não está configurada (Ajustes → Geração de imagens). Desenhe com SVG/canvas/CSS ou peça ao usuário para anexar o asset.';
  if(S.mode=='plan')return'Modo plano: gerar imagens fica bloqueado. Apresente o plano e peça aprovação.';const pm=(S.perm||{}).write;if(pm=='deny')return'Bloqueado pelas regras de permissão do usuário (criar/editar arquivos).';
  const pr=String(a.prompt||'').trim();if(!pr)return'Erro: informe o prompt da imagem.';let path=String(a.path||'assets/imagem').trim().replace(/^\.?\/+/,'');if(/(^|\/)\.\.(\/|$)/.test(path))return'Erro: caminho inválido.';
  const tr=/^(true|1|sim|yes)$/i.test(String(a.transparent||''));path=path.replace(/\.(png|jpe?g|webp|gif)$/i,'')+(tr?'.png':'.webp');if(!/^assets\//.test(path))path='assets/'+path;
  if((S.mode=='ask'||pm=='ask')&&(await dlg({title:'Gerar imagem?',text:IMGP[pv]+'\n'+pr.slice(0,220)+'\n→ '+path,btns:['✅ Permitir','🚫 Negar']}))!==0)return'Negado pelo usuário.';
  try{const r=await addAsset(path,await genImage(pv,pr,a.size,tr),{png:tr});save();ui();return'ok: salvo em '+r.path+' ('+r.w+'x'+r.h+', '+r.kb+' KB). Use no código com o caminho literal "'+r.path+'".'+(tr&&pv!='openai'?' (só a OpenAI faz transparência real: aqui o fundo pode vir sólido.)':'')}catch(e){return'Erro ao gerar a imagem: '+e.message}}
 if(['read_file','edit_file','append_file','multi_edit'].includes(n)){const k=String(a.path||'').replace(/^\.?\/+/,''),c=pj().files[k];if(isImg(c)){const di=(pj().idim||{})[k];return'🖼 '+k+' é uma imagem'+(di?' ('+di[0]+'×'+di[1]+')':'')+', não é texto: não dá para ler nem editar. Use o caminho literal no código (ex.: <img src="'+k+'">) ou gere outra com generate_image.'}}
 return _ex(n,a)}}
{const _sy=sys;sys=function(){const s=_sy();if(CHATONLY)return s;const p=pj(),im=Object.keys(p.files).filter(k=>isImg(p.files[k]));
 let b=imgCap()?'\nIMAGENS: você pode gerar arte com generate_image(prompt,path,size,transparent) para sprites, fundos e ícones (salva em assets/). Cada imagem custa dinheiro: gere poucas, só quando o usuário quiser arte, e reaproveite. ':'\nIMAGENS: você NÃO gera imagens. Para arte use SVG, canvas ou CSS desenhados em código (formas, gradientes, emojis) ou peça ao usuário para anexar assets (＋ → Adicionar arquivo). ';
 b+='Referencie imagens com o caminho literal completo (ex.: "assets/hero.webp") para o preview encontrá-las.';
 if(im.length)b+='\nImagens do projeto (binárias, não leia com read_file): '+im.slice(0,40).map(k=>k+((p.idim||{})[k]?' ('+p.idim[k][0]+'x'+p.idim[k][1]+')':'')).join(', ');return s+b}}

/* ---------- Ajustes: geração de imagens e limpar projeto ---------- */
function imgCfgH(){const m=(S.img&&S.img.m)||'auto',o=[['auto','Automático (usa sua chave OpenAI ou Gemini)'],['openai','OpenAI (gpt-image-1)'],['gemini','Gemini (nano banana)'],['poll','Pollinations (grátis, sem chave, qualidade variável)'],['off','Desligado']];
 return'<label>🎨 Geração de imagens</label><select onchange="S.img=Object.assign(S.img||{},{m:this.value});save();cfgR()">'+o.map(x=>'<option value="'+x[0]+'"'+(m==x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select><div class="f">'+(imgCap()?'✅ Disponível: '+IMGP[imgCap()]+'. O agente usa generate_image quando você pedir arte.':'Indisponível: salve a chave da OpenAI ou do Gemini em Ajustes (ou escolha Pollinations). Sem isso o agente desenha em SVG/canvas ou usa os assets que você anexar.')+'</div>'
 +'<label>🧹 Projeto</label><button class="s" onclick="resetProject()">🧹 Limpar este projeto (começar do zero)</button>'}
{const _c=cfgR;cfgR=function(){_c();$('#cfg').insertAdjacentHTML('beforeend',imgCfgH())}}
async function resetProject(){if(busy)return alert('Aguarde a tarefa terminar.');const p=pj(),n=Object.keys(p.files).length;
 if((await dlg({title:'Limpar o projeto "'+S.cur+'"?',text:'Apaga '+n+' arquivo(s), as conversas e as tarefas deste projeto. Não dá para desfazer.',btns:['🧹 Limpar tudo','Cancelar']}))!==0)return;
 p.files={};p.hist=[];p.todos=[];p.cps=[];p.refs={};p.idim={};delete p.chats;delete p.cc;op=null;PEND.length=0;vatcR();try{TM.cwd='';VSH.cwd=''}catch(e){}save();imgGC();ui();alert('Projeto limpo.')}
{const _cm=cmMenu;cmMenu=function(){return[..._cm(),['🧹','Limpar este projeto','Apaga arquivos e conversas deste projeto',resetProject]]}}

/* ---------- boas-vindas com a marca </> ---------- */
welcomeH=function(){const h=new Date().getHours(),g=h<5?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';return'<div class="wl"><div class="lg">&lt;/&gt;<i class="cur"></i></div><h1>'+g+'</h1><p>O que vamos construir hoje?</p></div>'}
imgLoad();
