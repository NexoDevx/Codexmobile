/* apkcore.js — núcleo do editor de APK (sem DOM): ler/gravar ZIP e decodificar/editar AndroidManifest binário (AXML) */
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(d){let c=-1;for(let i=0;i<d.length;i++)c=crcT[(c^d[i])&255]^(c>>>8);return(~c)>>>0}
async function zpipe(d,S){return new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(S)).arrayBuffer())}
const zinflate=d=>zpipe(d,new DecompressionStream('deflate-raw')),zdeflate=d=>zpipe(d,new CompressionStream('deflate-raw'));

/* ---------- ZIP ---------- */
function zipRead(buf){const v=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);let e=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(v.getUint32(i,true)==0x06054b50){e=i;break}
 if(e<0)throw new Error('não é um ZIP/APK válido');
 const n=v.getUint16(e+10,true);let p=v.getUint32(e+16,true);const dec=new TextDecoder(),ents=[];
 if(n==0xFFFF||p==0xFFFFFFFF)throw new Error('ZIP64 (arquivo grande demais) não suportado');
 for(let i=0;i<n;i++){if(v.getUint32(p,true)!=0x02014b50)throw new Error('diretório do ZIP corrompido');
  const nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true);
  ents.push({name:dec.decode(buf.subarray(p+46,p+46+nl)),flags:v.getUint16(p+8,true),method:v.getUint16(p+10,true),time:v.getUint16(p+12,true),date:v.getUint16(p+14,true),crc:v.getUint32(p+16,true),csize:v.getUint32(p+20,true),usize:v.getUint32(p+24,true),off:v.getUint32(p+42,true)});
  p+=46+nl+el+cl}
 return ents}
function zipRaw(buf,e){const v=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);if(v.getUint32(e.off,true)!=0x04034b50)throw new Error('cabeçalho local inválido: '+e.name);
 const s=e.off+30+v.getUint16(e.off+26,true)+v.getUint16(e.off+28,true);return buf.subarray(s,s+e.csize)}
async function zipGet(buf,e){const r=zipRaw(buf,e);if(e.method==0)return r.slice();if(e.method==8)return zinflate(r);throw new Error('método de compressão '+e.method+' não suportado')}
const zipDir=n=>n.endsWith('/');
const isSig=n=>/^META-INF\/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$/i.test(n);
/* regrava o ZIP: entradas intactas são copiadas sem recomprimir; over = Map(nome → Uint8Array | null para remover).
   Assinaturas antigas (META-INF) são descartadas porque deixam de valer; o resultado precisa ser assinado de novo. */
async function zipWrite(buf,ents,over){const enc=new TextEncoder(),parts=[],cd=[];let off=0;
 const put=a=>{parts.push(a);off+=a.length};
 const keep=ents.filter(e=>(!isSig(e.name)||over.get(e.name))&&!(over.has(e.name)&&over.get(e.name)===null)),
  list=[...keep.map(e=>({e,d:over.get(e.name)})),...[...over].filter(([k,d])=>d&&!keep.some(e=>e.name==k)).map(([k,d])=>({e:{name:k,flags:0,time:0,date:0x21},d}))];
 for(const {e,d} of list){const nm=enc.encode(e.name);let method,crc,cs,us,data;
  // Preserve native libraries uncompressed: APKs with extractNativeLibs=false need mmap-compatible entries.
  // 16 KiB alignment also supports devices using a 16 KiB memory page size.
  const nativeLib=/^lib\/[^/]+\/.+\.so$/i.test(e.name);
  if(d){us=d.length;crc=crc32(d);data=d;method=0;if(us>64&&!zipDir(e.name)&&!nativeLib){const z=await zdeflate(d);if(z.length<us){data=z;method=8}}cs=data.length}
  else{method=e.method;crc=e.crc;cs=e.csize;us=e.usize;data=zipRaw(buf,e)}
  const alignment=method==0&&nativeLib?16384:4,base=off+30+nm.length;
  // ZIP extra fields need a real (id,length) header; bare zero padding can make an APK invalid.
  let pad=0;if(method==0&&base%alignment!==0)pad=4+((alignment-((base+4)%alignment))%alignment);
  const h=new Uint8Array(30+nm.length+pad),v=new DataView(h.buffer),fl=(e.flags&0x800)|(/[^\x00-\x7f]/.test(e.name)?0x800:0);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,fl,true);v.setUint16(8,method,true);v.setUint16(10,e.time,true);v.setUint16(12,e.date,true);v.setUint32(14,crc,true);v.setUint32(18,cs,true);v.setUint32(22,us,true);v.setUint16(26,nm.length,true);v.setUint16(28,pad,true);h.set(nm,30);
  if(pad){const x=30+nm.length;v.setUint16(x,0xD935,true);v.setUint16(x+2,pad-4,true);}
  const c=new Uint8Array(46+nm.length),w=new DataView(c.buffer);
  w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,fl,true);w.setUint16(10,method,true);w.setUint16(12,e.time,true);w.setUint16(14,e.date,true);w.setUint32(16,crc,true);w.setUint32(20,cs,true);w.setUint32(24,us,true);w.setUint16(28,nm.length,true);w.setUint32(42,off,true);c.set(nm,46);cd.push(c);
  put(h);put(data)}
 const cdOff=off;let cds=0;for(const c of cd){put(c);cds+=c.length}
 const t=new Uint8Array(22),v=new DataView(t.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,cd.length,true);v.setUint16(10,cd.length,true);v.setUint32(12,cds,true);v.setUint32(16,cdOff,true);put(t);
 return new Blob(parts,{type:'application/vnd.android.package-archive'})}

/* ---------- AXML (AndroidManifest.xml e outros XML binários) ---------- */
const axmlIs=d=>d.length>8&&d[0]==3&&d[1]==0&&d[2]==8&&d[3]==0;
function axPool(d,o){const v=new DataView(d.buffer,d.byteOffset,d.byteLength),n=v.getUint32(o+8,true),sn=v.getUint32(o+12,true),fl=v.getUint32(o+16,true),so=v.getUint32(o+20,true),u8=!!(fl&256),dec=new TextDecoder(),strs=[];
 for(let i=0;i<n;i++){let p=o+so+v.getUint32(o+28+i*4,true);
  if(u8){let l=d[p++];if(l&128)p++;let b=d[p++];if(b&128)b=((b&127)<<8)|d[p++];strs.push(dec.decode(d.subarray(p,p+b)))}
  else{let l=v.getUint16(p,true);p+=2;if(l&32768){l=((l&32767)<<16)|v.getUint16(p,true);p+=2}const a=[];for(let j=0;j<l;j++)a.push(v.getUint16(p+j*2,true));strs.push(String.fromCharCode(...a))}}
 return{strs,end:o+v.getUint32(o+4,true),styles:sn}}
const axX=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function axVal(pool,t,raw,data){const h=x=>(x>>>0).toString(16);
 if(t==3)return pool[raw!=-1&&raw!=0xFFFFFFFF?raw:data]??'';if(t==1)return'@0x'+h(data);if(t==2)return'?0x'+h(data);if(t==0x10)return String(data|0);if(t==0x11)return'0x'+h(data);if(t==0x12)return data?'true':'false';
 if(t==4)return String(new Float32Array(new Uint32Array([data]).buffer)[0]);if(t>=0x1c&&t<=0x1f)return'#'+(data>>>0).toString(16).padStart(8,'0');return'0x'+h(data)+' (tipo '+t+')'}
/* devolve {text, strs}: XML legível e a lista de textos (string pool) */
function axmlParse(d){const v=new DataView(d.buffer,d.byteOffset,d.byteLength);if(!axmlIs(d))throw new Error('não é XML binário');
 let o=8,pool=[],ids=[],meta={ids:{},types:{},vals:{}},ns={},pend=[],dep=0,out='<?xml version="1.0" encoding="utf-8"?>\n';const S=i=>i==-1||i==0xFFFFFFFF?'':pool[i]??'';
 while(o+8<=d.length){const t=v.getUint16(o,true),sz=v.getUint32(o+4,true);if(sz<8)break;
  if(t==1)pool=axPool(d,o).strs;
  else if(t==0x180){ids=[];for(let i=o+8;i<o+sz;i+=4)ids.push(v.getUint32(i,true))}
  else if(t==0x100){const p=S(v.getUint32(o+16,true)),u=S(v.getUint32(o+20,true));ns[u]=p;pend.push([p,u])}
  else if(t==0x102){const nm=S(v.getUint32(o+20,true)),ac=v.getUint16(o+28,true),as=o+16+v.getUint16(o+24,true);let s='  '.repeat(dep)+'<'+nm;
   for(const[p,u]of pend)s+=' xmlns:'+p+'="'+axX(u)+'"';pend=[];
   for(let i=0;i<ac;i++){const a=as+i*20,un=v.getUint32(a,true),an=S(v.getUint32(a+4,true)),pf=un==0xFFFFFFFF?'':ns[S(un)]?ns[S(un)]+':':'';
    const ty=d[a+15],dt=v.getUint32(a+16,true),tx=axVal(pool,ty,v.getUint32(a+8,true),dt);
    if(un!=0xFFFFFFFF&&ids[v.getUint32(a+4,true)])meta.ids[an]=ids[v.getUint32(a+4,true)];if(!(an in meta.types))meta.types[an]=ty;if(ty!=3)meta.vals[an+'\0'+tx]={t:ty,d:dt};
    s+='\n'+'  '.repeat(dep+1)+pf+an+'="'+axX(tx)+'"'}
   out+=s+'>\n';dep++}
  else if(t==0x103){dep=Math.max(0,dep-1);out+='  '.repeat(dep)+'</'+S(v.getUint32(o+20,true))+'>\n'}
  else if(t==0x104){const x=S(v.getUint32(o+16,true)).trim();if(x)out+='  '.repeat(dep)+axX(x)+'\n'}
  o+=sz}
 return{text:out,strs:pool,meta}}
/* regrava só o texto do string pool (UTF-16); a estrutura e os índices não mudam */
function axmlSetStrings(d,strs){const v=new DataView(d.buffer,d.byteOffset,d.byteLength);let o=8;
 while(o+8<=d.length&&v.getUint16(o,true)!=1)o+=v.getUint32(o+4,true);if(o+8>d.length)throw new Error('string pool não encontrado');
 const old=axPool(d,o);if(old.styles)throw new Error('este XML tem estilos no string pool (não suportado)');if(strs.length!=old.strs.length)throw new Error('quantidade de textos mudou');
 const pc=axPoolBuild(strs),r=new Uint8Array(o+pc.length+(d.length-old.end));r.set(d.subarray(0,o));r.set(pc,o);r.set(d.subarray(old.end),o+pc.length);new DataView(r.buffer).setUint32(4,r.length,true);return r}
function axPoolBuild(strs){const n=strs.length,parts=[],offs=new Uint32Array(n);let sl=0;
 strs.forEach((s,i)=>{if(s.length>32767)throw new Error('texto grande demais');offs[i]=sl;const b=new Uint8Array(4+s.length*2),w=new DataView(b.buffer);w.setUint16(0,s.length,true);for(let j=0;j<s.length;j++)w.setUint16(2+j*2,s.charCodeAt(j),true);parts.push(b);sl+=b.length});
 const pad=(4-sl%4)%4,so=28+n*4,tot=so+sl+pad,pc=new Uint8Array(tot),pv=new DataView(pc.buffer);
 pv.setUint16(0,1,true);pv.setUint16(2,28,true);pv.setUint32(4,tot,true);pv.setUint32(8,n,true);pv.setUint32(20,so,true);
 offs.forEach((x,i)=>pv.setUint32(28+i*4,x,true));let p=so;for(const b of parts){pc.set(b,p);p+=b.length}return pc}

/* ---------- texto XML → AXML (para editar o AndroidManifest como texto) ---------- */
const AX_NS='http://schemas.android.com/apk/res/android';
/* IDs de recurso dos atributos android: mais comuns (usados só quando o XML original não os tem) */
const AX_IDS={theme:0x01010000,label:0x01010001,icon:0x01010002,name:0x01010003,permission:0x01010006,enabled:0x0101000e,debuggable:0x0101000f,exported:0x01010010,process:0x01010011,priority:0x0101001c,launchMode:0x0101001d,screenOrientation:0x0101001e,configChanges:0x0101001f,authorities:0x01010018,targetPackage:0x01010021,value:0x01010024,resource:0x01010025,mimeType:0x01010026,scheme:0x01010027,host:0x01010028,minSdkVersion:0x0101020c,versionCode:0x0101021b,versionName:0x0101021c,targetSdkVersion:0x01010270,maxSdkVersion:0x01010271,allowBackup:0x01010280,glEsVersion:0x01010281,required:0x0101028e,installLocation:0x010102b7,hardwareAccelerated:0x010102d3,largeHeap:0x0101035a,supportsRtl:0x010103af,extractNativeLibs:0x010104ea,usesCleartextTraffic:0x010104ec,networkSecurityConfig:0x01010527,roundIcon:0x0101052c,requestLegacyExternalStorage:0x01010603};
const AX_BOOL=new Set('enabled debuggable exported allowBackup required hardwareAccelerated largeHeap supportsRtl extractNativeLibs usesCleartextTraffic requestLegacyExternalStorage'.split(' ')),AX_INT=new Set(['priority','minSdkVersion','versionCode','targetSdkVersion','maxSdkVersion']);
const axUnX=s=>s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi,(m,e)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'}[e.toLowerCase()]??(e[1]=='x'||e[1]=='X'?String.fromCodePoint(parseInt(e.slice(2),16)):String.fromCodePoint(+e.slice(1)))));
function axXml(s){const re=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/\s*([^\s>]+)\s*>|<([^\s\/>!?]+)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y,o=[];let p=0;
 while(p<s.length){re.lastIndex=p;const m=re.exec(s);if(!m)throw new Error('XML inválido perto de: '+s.slice(p,p+40).replace(/\n/g,' '));p=re.lastIndex;
  if(m[1]!=null)o.push({t:'x',text:m[1]});else if(m[2])o.push({t:'e',name:m[2]});
  else if(m[3]){const at=[];for(const a of m[4].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))at.push([a[1],axUnX(a[2]??a[3])]);o.push({t:'s',name:m[3],attrs:at});if(m[5])o.push({t:'e',name:m[3]})}
  else if(m[6]!=null&&m[6].trim())o.push({t:'x',text:axUnX(m[6].trim())})}
 return o}
/* orig = AXML original (para reaproveitar IDs e tipos dos valores). Devolve o novo AXML. */
function axmlCompile(text,orig){const meta=orig&&axmlIs(orig)?axmlParse(orig).meta:{ids:{},types:{},vals:{}},toks=axXml(text),u32=n=>[n&255,n>>8&255,n>>16&255,n>>>24&255],u16=n=>[n&255,n>>8&255],N=0xFFFFFFFF;
 /* 1ª passada: elementos, namespaces, atributos tipados */
 const scope=[{}],els=[];let depth=0,roots=0;const ext=[];
 for(const k of toks){
  if(k.t=='s'){const decl=[],sc=Object.assign({},scope[scope.length-1]),at=[];
   for(const[n,v]of k.attrs)if(n=='xmlns')sc['']=v,decl.push(['',v]);else if(n.startsWith('xmlns:'))sc[n.slice(6)]=v,decl.push([n.slice(6),v]);
   for(const[n,v]of k.attrs){if(n=='xmlns'||n.startsWith('xmlns:'))continue;let uri=null,nm=n;const i=n.indexOf(':');if(i>0){const u=sc[n.slice(0,i)];if(u===undefined)throw new Error('prefixo de namespace desconhecido: '+n.slice(0,i));uri=u;nm=n.slice(i+1)}
    let id=uri==AX_NS?(meta.ids[nm]||AX_IDS[nm]):0;if(uri==AX_NS&&!id)throw new Error('atributo android:'+nm+' desconhecido: não tem ID de recurso e não existe no manifesto original');
    at.push({uri,nm,v,id:id||0})}
   scope.push(sc);const el={name:k.name,decl,at,end:[]};els.push({k:'s',el});if(!depth++)roots++}
  else if(k.t=='e'){scope.pop();els.push({k:'e',name:k.name});depth--;if(depth<0)throw new Error('tag de fechamento sem abertura: </'+k.name+'>')}
  else els.push({k:'x',text:k.text})}
 if(depth!=0)throw new Error('há tags sem fechamento');if(roots!=1)throw new Error('o XML precisa de exatamente um elemento raiz');
 /* pool: atributos com ID primeiro, em ordem de ID (o resource map acompanha o índice) */
 const idNames=new Map();for(const x of els)if(x.k=='s')for(const a of x.el.at)if(a.id)idNames.set(a.nm,a.id);
 const ids=[...idNames].sort((a,b)=>a[1]-b[1]),pool=ids.map(x=>x[0]),px=new Map(pool.map((s,i)=>[s,i]));
 const S=s=>{if(!px.has(s)){px.set(s,pool.length);pool.push(s)}return px.get(s)};
 const typed=(nm,v)=>{const o=meta.vals[nm+'\0'+v];if(o)return o;const ty=meta.types[nm];let m;
  if(/^@0x[0-9a-f]+$/i.test(v))return{t:1,d:parseInt(v.slice(1),16)>>>0};if(/^\?0x[0-9a-f]+$/i.test(v))return{t:2,d:parseInt(v.slice(1),16)>>>0};
  if(m=/^0x([0-9a-f]+) \(tipo (\d+)\)$/i.exec(v))return{t:+m[2],d:parseInt(m[1],16)>>>0};if(/^#[0-9a-f]{8}$/i.test(v)&&(ty>=0x1c&&ty<=0x1f))return{t:ty,d:parseInt(v.slice(1),16)>>>0};
  if((ty==0x12||AX_BOOL.has(nm))&&/^(true|false)$/.test(v))return{t:0x12,d:v=='true'?N:0};
  if((ty==0x10||AX_INT.has(nm))&&/^-?\d+$/.test(v))return{t:0x10,d:(+v)>>>0};if(ty==0x11&&/^0x[0-9a-f]+$/i.test(v))return{t:0x11,d:parseInt(v,16)>>>0};return null};
 const body=[];let line=1;const hd=(t,sz)=>[...u16(t),...u16(16),...u32(sz),...u32(line++),...u32(N)],stack=[];
 for(const x of els){
  if(x.k=='s'){const e=x.el;for(const[p,u]of e.decl)body.push(...hd(0x100,24),...u32(S(p)),...u32(S(u)));
   const at=e.at.map((a,i)=>({...a,i})).sort((a,b)=>(a.id?0:1)-(b.id?0:1)||(a.id&&b.id?a.id-b.id:0)||a.i-b.i),bytes=[];
   const nsIdx=u=>u==null?N:S(u);const nmI=S(e.name);
   for(const a of at){const tv=typed(a.nm,a.v);bytes.push(...u32(nsIdx(a.uri)),...u32(S(a.nm)),...u32(tv?N:S(a.v)),...u16(8),0,tv?tv.t:3,...u32(tv?tv.d:S(a.v)))}
   body.push(...hd(0x102,36+bytes.length),...u32(N),...u32(nmI),...u16(20),...u16(20),...u16(at.length),...u16(0),...u16(0),...u16(0),...bytes);stack.push(e)}
  else if(x.k=='e'){const e=stack.pop();body.push(...hd(0x103,24),...u32(N),...u32(S(x.name)));for(const[p,u]of[...e.decl].reverse())body.push(...hd(0x101,24),...u32(S(p)),...u32(S(u)))}
  else body.push(...hd(0x104,28),...u32(S(x.text)),...u16(8),0,0,...u32(0))}
 const pc=axPoolBuild(pool),rm=[...u16(0x180),...u16(8),...u32(8+ids.length*4),...ids.flatMap(x=>u32(x[1]))],tot=8+pc.length+rm.length+body.length;
 return Uint8Array.from([...u16(3),...u16(8),...u32(tot),...pc,...rm,...body])}
/* resumo do manifesto: pacote, versão, SDK, permissões */
function apkInfo(text){const g=(re)=>(re.exec(text)||[])[1]||'';return{pkg:g(/\bpackage="([^"]*)"/),vn:g(/android:versionName="([^"]*)"/),vc:g(/android:versionCode="([^"]*)"/),min:g(/android:minSdkVersion="([^"]*)"/),tgt:g(/android:targetSdkVersion="([^"]*)"/),perms:[...text.matchAll(/<uses-permission[^>]*?android:name="([^"]*)"/g)].map(m=>m[1])}}
if(typeof module!='undefined')module.exports={crc32,zipRead,zipRaw,zipGet,zipWrite,axmlIs,axmlParse,axmlSetStrings,axmlCompile,apkInfo};
