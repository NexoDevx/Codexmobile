/* execore.js — núcleo básico para .exe do Windows (PE): ler, extrair recursos e ZIP embutido, trocar textos e recursos. Sem dependências. */
const EXE=(()=>{
const DV=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),te=new TextEncoder();
const RT={1:'CURSOR',2:'BITMAP',3:'ICON',4:'MENU',5:'DIALOG',6:'STRING',9:'ACCEL',10:'RCDATA',11:'MSGTABLE',12:'GRPCURSOR',14:'GRPICON',16:'VERSION',24:'MANIFEST'};
/* ---- PE ---- */
function parse(b){const d=DV(b),g16=o=>d.getUint16(o,true),g32=o=>d.getUint32(o,true);
 if(b.length<0x40||g16(0)!=0x5a4d)throw new Error('Não é um .exe do Windows (falta o cabeçalho MZ).');
 const pe=g32(0x3c);if(pe+24>b.length||g32(pe)!=0x4550)throw new Error('Cabeçalho PE inválido (pode ser um .exe antigo de DOS).');
 const mach=g16(pe+4),ns=g16(pe+6),osz=g16(pe+20),opt=pe+24,pe32=g16(opt)==0x10b,dd=opt+(pe32?96:112),sec=[];let end=0;
 for(let i=0;i<ns;i++){const o=opt+osz+i*40,s={name:String.fromCharCode(...b.subarray(o,o+8)).replace(/\0+$/,''),vsize:g32(o+8),va:g32(o+12),rsize:g32(o+16),raw:g32(o+20)};sec.push(s);end=Math.max(end,s.raw+s.rsize)}
 const r2o=rva=>{for(const s of sec)if(rva>=s.va&&rva<s.va+Math.max(s.vsize,s.rsize))return rva-s.va+s.raw;return -1};
 const info={machine:{0x14c:'x86 (32 bits)',0x8664:'x64 (64 bits)',0xaa64:'ARM64',0x1c0:'ARM'}[mach]||'0x'+mach.toString(16),sections:sec,size:b.length,overlay:{off:end,len:Math.max(0,b.length-end)},dotnet:g32(dd+14*8+4)>0,res:[]};
 const rr=g32(dd+16);if(rr){const base=r2o(rr);if(base>=0)try{info.res=readRes(b,d,base,r2o)}catch(e){info.resErr=e.message}}return info}
function readRes(b,d,base,r2o){const g16=o=>d.getUint16(o,true),g32=o=>d.getUint32(o,true),out=[];
 const nameAt=o=>{const p=base+(o&0x7fffffff),n=g16(p);let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(g16(p+2+i*2));return s};
 const dir=(off,ids,depth)=>{if(depth>3||out.length>3000)return;const n=g16(base+off+12)+g16(base+off+14);
  for(let i=0;i<n;i++){const e=base+off+16+i*8,nm=g32(e),of=g32(e+4),id=nm&0x80000000?nameAt(nm):nm,path=[...ids,id];
   if(of&0x80000000)dir(of&0x7fffffff,path,depth+1);else{const eo=base+of,rva=g32(eo),sz=g32(eo+4),fo=r2o(rva);if(fo>=0&&fo+sz<=b.length)out.push({type:path[0],id:path[1],lang:path[2],entry:eo,off:fo,size:sz})}}};
 dir(0,[],0);for(const r of out){r.tname=typeof r.type=='number'?(RT[r.type]||'TIPO_'+r.type):r.type;r.label=r.tname+'_'+r.id}return out}
const isPNG=d=>d.length>8&&d[0]==0x89&&d[1]==0x50&&d[2]==0x4e&&d[3]==0x47;
const sniff=d=>isPNG(d)?'png':(d[0]==0xff&&d[1]==0xd8)?'jpg':(d[0]==0x47&&d[1]==0x49&&d[2]==0x46)?'gif':(d[0]==0x42&&d[1]==0x4d)?'bmp':(d[0]==0x52&&d[1]==0x49&&d[2]==0x46&&d[3]==0x46)?'wav':(d[0]==0x4f&&d[1]==0x67&&d[2]==0x67)?'ogg':(d[0]==0x50&&d[1]==0x4b)?'zip':null;
function bmpInfo(data){if(data.length<40)return null;const d=DV(data);return{w:d.getInt32(4,true),h:d.getInt32(8,true),bpp:d.getUint16(14,true),hs:d.getUint32(0,true),colors:d.getUint32(32,true)}}
/* recurso -> arquivo (BITMAP ganha cabeçalho .bmp) */
function resFile(b,r){const data=b.subarray(r.off,r.off+r.size);
 if(r.type==2){const i=bmpInfo(data);if(i){const pal=(i.bpp<=8?(i.colors||(1<<i.bpp)):0)*4,h=new Uint8Array(14+data.length),dv=DV(h);h[0]=0x42;h[1]=0x4d;dv.setUint32(2,h.length,true);dv.setUint32(10,14+i.hs+pal,true);h.set(data,14);return{name:r.label+'.bmp',data:h}}}
 const k=sniff(data);return{name:r.label+'.'+(r.type==24?'xml':k||'bin'),data}}
/* troca o conteúdo de um recurso (só cabe se for do mesmo tamanho ou menor: o exe não é reconstruído) */
function resReplace(b,r,nb){if(r.type==2&&nb[0]==0x42&&nb[1]==0x4d)nb=nb.subarray(14);
 if(nb.length>r.size)throw new Error('Não cabe: o recurso tem '+r.size+' bytes e o novo tem '+nb.length+'. Use um arquivo de até '+r.size+' bytes (imagem: mesmo tamanho em pixels e mesma profundidade de cor).');
 b.set(nb,r.off);b.fill(0,r.off+nb.length,r.off+r.size);DV(b).setUint32(r.entry+4,nb.length,true);r.size=nb.length}
/* RGBA -> DIB (sem cabeçalho de arquivo) com as dimensões e bpp pedidos; só 24/32 bits */
function dibFromRGBA(px,w,h,bpp,bg){if(bpp!=24&&bpp!=32)throw new Error('Esta imagem do exe usa '+bpp+' bits (paleta). Por enquanto só dá para trocar imagens de 24 ou 32 bits.');
 const rs=bpp==24?Math.ceil(w*3/4)*4:w*4,o=new Uint8Array(40+rs*h),dv=DV(o);dv.setUint32(0,40,true);dv.setInt32(4,w,true);dv.setInt32(8,h,true);dv.setUint16(12,1,true);dv.setUint16(14,bpp,true);dv.setUint32(20,rs*h,true);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=((h-1-y)*w+x)*4,a=px[s+3]/255,t=40+y*rs+x*(bpp/8);
  const c=bpp==32?[px[s+2],px[s+1],px[s],px[s+3]]:[Math.round(px[s+2]*a+bg[2]*(1-a)),Math.round(px[s+1]*a+bg[1]*(1-a)),Math.round(px[s]*a+bg[0]*(1-a))];o.set(c,t)}return o}
/* ---- textos ---- */
function findAll(b,pat,max=2000){const o=[];let i=0;while(o.length<max){i=b.indexOf(pat[0],i);if(i<0||i+pat.length>b.length)break;let ok=true;for(let k=1;k<pat.length;k++)if(b[i+k]!==pat[k]){ok=false;break}if(ok){o.push(i);i+=pat.length}else i++}return o}
const wide=s=>{const o=[];for(const c of s){const n=c.charCodeAt(0);o.push(n&255,n>>8)}return Uint8Array.from(o)};
function zerosAfter(b,p,step){let n=0;while(p+(n+1)*step<=b.length&&(step==1?b[p+n]==0:(b[p+2*n]==0&&b[p+2*n+1]==0)))n++;return n}
/* procura texto (ASCII/UTF-8 e UTF-16) e diz quanto espaço cada ocorrência tem */
function findText(b,s){const hits=[];for(const[kind,pat,step]of[['ascii',te.encode(s),1],['utf16',wide(s),2]]){if(!pat.length)continue;for(const off of findAll(b,pat)){const z=zerosAfter(b,off+pat.length,step);hits.push({kind,off,len:pat.length,cap:pat.length+Math.max(0,z-1)*step})}}return hits.sort((a,c)=>a.off-c.off)}
/* troca por texto do mesmo tamanho ou menor (completa com zeros); grow=true usa os zeros livres depois do texto */
function replaceText(b,from,to,grow){const hits=findText(b,from);let done=0,skipped=0;const nb={ascii:te.encode(to),utf16:wide(to)};
 for(const h of hits){const n=nb[h.kind],room=grow?h.cap:h.len;if(n.length>room){skipped++;continue}b.set(n,h.off);b.fill(0,h.off+n.length,h.off+Math.max(h.len,n.length));done++}
 return{found:hits.length,done,skipped,maxLen:hits.length?Math.max(...hits.map(h=>grow?h.cap:h.len)):0}}
function strings(b,min=6,limit=300){const o=[];let s=-1;for(let i=0;i<=b.length&&o.length<limit;i++){const c=b[i],ok=c>=32&&c<127;if(ok&&s<0)s=i;else if(!ok&&s>=0){if(i-s>=min)o.push(String.fromCharCode(...b.subarray(s,Math.min(i,s+80))));s=-1}}return o}
const MK=[['MEI\x0c\x0b\x0a\x0b\x0e','PyInstaller (programa Python empacotado; o conteúdo fica num arquivo próprio ainda não suportado)'],['UPX!','UPX (exe compactado; descompacte com o UPX antes de editar)'],['Nullsoft Install','Instalador NSIS'],['Inno Setup Setup Data','Instalador Inno Setup'],['BSJB','.NET (código gerenciado; edite com ferramentas .NET)'],['UnityPlayer','Unity (os arquivos do jogo ficam na pasta *_Data ao lado do exe)'],['Rar!','RAR autoextraível (ainda não suportado)'],['7z\xbc\xaf\x27\x1c','7-Zip autoextraível (ainda não suportado)']];
function hints(b){const o=[];for(const[m,t]of MK)if(findAll(b,Uint8Array.from([...m].map(c=>c.charCodeAt(0))),1).length)o.push(t);return o}
/* ---- ZIP embutido (autoextraível) ---- */
function zipFind(b){const d=DV(b);for(let i=b.length-22;i>=Math.max(0,b.length-70000);i--)if(d.getUint32(i,true)==0x06054b50){const n=d.getUint16(i+10,true),cs=d.getUint32(i+12,true),co=d.getUint32(i+16,true),start=i-cs-co;if(start>=0&&n>0)return{eocd:i,n,cs,start,cdOff:start+co}}return null}
function zipList(b,z){const d=DV(b),o=[];let p=z.cdOff;for(let i=0;i<z.n;i++){if(d.getUint32(p,true)!=0x02014b50)break;const nl=d.getUint16(p+28,true),el=d.getUint16(p+30,true),cl=d.getUint16(p+32,true),nm=new TextDecoder().decode(b.subarray(p+46,p+46+nl));o.push({name:nm,m:d.getUint16(p+10,true),cs:d.getUint32(p+20,true),us:d.getUint32(p+24,true),lho:z.start+d.getUint32(p+42,true),dir:nm.endsWith('/')});p+=46+nl+el+cl}return o}
async function inflate(u){return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
async function deflate(u){return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())}
async function zipRead(b,e){const d=DV(b),s=e.lho+30+d.getUint16(e.lho+26,true)+d.getUint16(e.lho+28,true),raw=b.subarray(s,s+e.cs);if(e.m==0)return raw;if(e.m==8)return inflate(raw);throw new Error('Compressão ZIP não suportada ('+e.m+')')}
let CT;const crc=u=>{if(!CT){CT=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;CT[n]=c>>>0}}let c=~0;for(let i=0;i<u.length;i++)c=CT[(c^u[i])&255]^(c>>>8);return(~c)>>>0};
async function zipBuild(ents){const ch=[],cd=[];let off=0;
 for(const e of ents){const nm=te.encode(e.name),dir=e.name.endsWith('/'),raw=e.data,def=dir||raw.length<64?null:await deflate(raw),m=def&&def.length<raw.length?8:0,body=m?def:raw,c=crc(raw);
  const lh=new Uint8Array(30+nm.length),l=DV(lh);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(8,m,true);l.setUint32(14,c,true);l.setUint32(18,body.length,true);l.setUint32(22,raw.length,true);l.setUint16(26,nm.length,true);lh.set(nm,30);
  const ce=new Uint8Array(46+nm.length),x=DV(ce);x.setUint32(0,0x02014b50,true);x.setUint16(4,20,true);x.setUint16(6,20,true);x.setUint16(8,0x800,true);x.setUint16(10,m,true);x.setUint32(16,c,true);x.setUint32(20,body.length,true);x.setUint32(24,raw.length,true);x.setUint16(28,nm.length,true);x.setUint32(42,off,true);ce.set(nm,46);
  ch.push(lh,body);cd.push(ce);off+=lh.length+body.length}
 const cs=cd.reduce((a,u)=>a+u.length,0),eo=new Uint8Array(22),v=DV(eo);v.setUint32(0,0x06054b50,true);v.setUint16(8,ents.length,true);v.setUint16(10,ents.length,true);v.setUint32(12,cs,true);v.setUint32(16,off,true);
 const all=[...ch,...cd,eo],o=new Uint8Array(all.reduce((a,u)=>a+u.length,0));let p=0;for(const u of all){o.set(u,p);p+=u.length}return o}

/* ---- imagens soltas no binário (jogos "exe puro" guardam sprites assim) + utilitários hex ---- */
const be32=(b,o)=>((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0,be16=(b,o)=>(b[o]<<8)|b[o+1];
function imgDims(d){if(isPNG(d)&&d.length>24)return{kind:'png',w:be32(d,16),h:be32(d,20)};
 if(d[0]==0xff&&d[1]==0xd8){let i=2;while(i+9<d.length){if(d[i]!=0xff){i++;continue}const m=d[i+1];if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return{kind:'jpg',h:be16(d,i+5),w:be16(d,i+7)};if(m==0xd8||m==0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue}if(m==0xda)break;i+=2+be16(d,i+2)}return{kind:'jpg',w:0,h:0}}
 if(d[0]==0x42&&d[1]==0x4d&&d.length>26){const v=DV(d);return{kind:'bmp',w:v.getInt32(18,true),h:Math.abs(v.getInt32(22,true)),bpp:v.getUint16(28,true)}}return null}
function findImages(b,max=200){const o=[],push=x=>{if(o.length<max)o.push(x)};
 for(const off of findAll(b,Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),500)){let p=off+8,ok=false;while(p+12<=b.length){const n=be32(b,p),t=String.fromCharCode(b[p+4],b[p+5],b[p+6],b[p+7]);if(n>b.length||p+12+n>b.length)break;p+=12+n;if(t=='IEND'){ok=true;break}}if(ok){const d=imgDims(b.subarray(off,off+32));if(d&&d.w>0&&d.h>0&&d.w<16384)push({kind:'png',off,size:p-off,w:d.w,h:d.h})}}
 for(const off of findAll(b,Uint8Array.from([0xff,0xd8,0xff]),500)){let e=-1;for(let i=off+3;i+1<b.length&&i<off+8e6;i++)if(b[i]==0xff&&b[i+1]==0xd9){e=i+2;break}if(e>0){const d=imgDims(b.subarray(off,e));if(d&&d.w>0&&d.h>0&&d.w<16384)push({kind:'jpg',off,size:e-off,w:d.w,h:d.h})}}
 for(const off of findAll(b,Uint8Array.from([0x42,0x4d]),20000)){if(off+54>b.length)continue;const v=DV(b.subarray(off,off+54)),sz=v.getUint32(2,!0),po=v.getUint32(10,!0),hs=v.getUint32(14,!0),w=v.getInt32(18,!0),h=Math.abs(v.getInt32(22,!0)),bp=v.getUint16(28,!0);
  if(v.getUint32(6,!0)==0&&[40,108,124].includes(hs)&&sz>54&&off+sz<=b.length&&po>=14+hs&&po<sz&&w>0&&w<8192&&h>0&&h<8192&&[1,4,8,16,24,32].includes(bp)&&v.getUint16(26,!0)==1)push({kind:'bmp',off,size:sz,w,h,bpp:bp})}
 return o.sort((a,c)=>a.off-c.off)}
const hexBytes=s=>{const t=String(s).replace(/0x/gi,'').replace(/[^0-9a-fA-F]/g,'');if(!t||t.length%2)throw new Error('hex inválido (use pares de dígitos, ex.: "89 50 4E 47")');return Uint8Array.from(t.match(/../g).map(x=>parseInt(x,16)))};
const num=s=>{const n=/^\s*0x/i.test(String(s))?parseInt(s,16):parseInt(s,10);if(!Number.isFinite(n)||n<0)throw new Error('offset inválido: '+s);return n};
function hexdump(b,off,len){const e=Math.min(b.length,off+len);let o='';for(let i=off;i<e;i+=16){const r=b.subarray(i,Math.min(i+16,e));o+=i.toString(16).padStart(8,'0')+'  '+[...r].map(x=>x.toString(16).padStart(2,'0')).join(' ').padEnd(47)+'  '+[...r].map(x=>x>=32&&x<127?String.fromCharCode(x):'.').join('')+'\n'}return o}
function patch(b,off,bytes){if(off+bytes.length>b.length)throw new Error('fora do arquivo (tamanho '+b.length+')');b.set(bytes,off)}

return{imgDims,findImages,hexBytes,num,hexdump,patch,findAll,parse,resFile,resReplace,bmpInfo,dibFromRGBA,findText,replaceText,strings,hints,sniff,zipFind,zipList,zipRead,zipBuild}})();
if(typeof module!='undefined')module.exports=EXE;
