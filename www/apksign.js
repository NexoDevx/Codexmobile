/* apksign.js — assinatura de APK no próprio aparelho: esquema v1 (JAR) + v2 (APK Signature Scheme), chave RSA-2048 gerada no app.
   Depende de apkcore.js (zipRead/zipGet/zipWrite) e do WebCrypto. */
const sgCat=a=>{let n=0;for(const x of a)n+=x.length;const o=new Uint8Array(n);let p=0;for(const x of a){o.set(x,p);p+=x.length}return o};
const sgU32=n=>Uint8Array.of(n&255,n>>8&255,n>>16&255,n>>>24&255),sgLp=(...a)=>{const b=sgCat(a);return sgCat([sgU32(b.length),b])};
const sgSha=async d=>new Uint8Array(await crypto.subtle.digest('SHA-256',d)),sgB64=u=>{let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)};
/* --- DER --- */
const dLen=n=>n<128?[n]:n<256?[0x81,n]:n<65536?[0x82,n>>8,n&255]:[0x83,n>>16,n>>8&255,n&255];
const der=(t,...c)=>{const b=sgCat(c.map(x=>Uint8Array.from(x)));return sgCat([Uint8Array.of(t,...dLen(b.length)),b])};
const dOid=s=>{const a=s.split('.').map(Number),o=[a[0]*40+a[1]];for(const n of a.slice(2)){const t=[n&127];let m=n>>>7;while(m){t.unshift(m&127|128);m>>>=7}o.push(...t)}return der(6,o)};
const dInt=u=>{let i=0;while(i<u.length-1&&u[i]==0)i++;u=u.subarray(i);return der(2,u[0]&128?[0,...u]:u)};
const dName=cn=>der(0x30,der(0x31,der(0x30,dOid('2.5.4.3'),der(12,new TextEncoder().encode(cn)))));
const dAlg=o=>der(0x30,dOid(o),der(5,[])),ALG_SHA256='2.16.840.1.101.3.4.2.1',ALG_RSA='1.2.840.113549.1.1.1',ALG_SHA256RSA='1.2.840.113549.1.1.11';
const RSA={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
/* --- chave + certificado autoassinado. Retorna um objeto simples e serializável (guarde no aparelho / exporte como backup) --- */
async function signKeyGen(cn){cn=cn||'CodeMobile';const kp=await crypto.subtle.generateKey({...RSA,modulusLength:2048,publicExponent:Uint8Array.of(1,0,1)},true,['sign','verify']),
 spki=new Uint8Array(await crypto.subtle.exportKey('spki',kp.publicKey)),serial=crypto.getRandomValues(new Uint8Array(8));serial[0]&=0x7f;serial[0]|=0x10;
 const tbs=der(0x30,der(0xA0,der(2,[2])),dInt(serial),dAlg(ALG_SHA256RSA),dName(cn),der(0x30,der(0x17,new TextEncoder().encode('200101000000Z')),der(0x18,new TextEncoder().encode('20700101000000Z'))),dName(cn),spki),
  sig=new Uint8Array(await crypto.subtle.sign(RSA.name,kp.privateKey,tbs)),cert=der(0x30,tbs,dAlg(ALG_SHA256RSA),der(3,[0,...sig]));
 return{cn,jwk:await crypto.subtle.exportKey('jwk',kp.privateKey),cert:sgB64(cert),spki:sgB64(spki),iss:sgB64(dName(cn)),ser:sgB64(dInt(serial))}}
const sgUnb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function signKeyUse(k){return{priv:await crypto.subtle.importKey('jwk',k.jwk,RSA,false,['sign']),cert:sgUnb64(k.cert),spki:sgUnb64(k.spki),iss:sgUnb64(k.iss),ser:sgUnb64(k.ser)}}
const sgSign=async(K,d)=>new Uint8Array(await crypto.subtle.sign(RSA.name,K.priv,d));
/* --- v1: META-INF/MANIFEST.MF, CERT.SF, CERT.RSA --- */
function sgWrap(line){const e=new TextEncoder(),out=[];let cur='',cb=0,lim=72;for(const ch of line){const n=e.encode(ch).length;if(cb+n>lim){out.push(cur);cur=' ';cb=1;lim=72}cur+=ch;cb+=n}out.push(cur);return out.map(l=>l+'\r\n').join('')}
async function sgV1(buf,ents,K){const e=new TextEncoder(),sections=[];
 for(const z of ents){if(zipDir(z.name)||/^META-INF\/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$/i.test(z.name))continue;
  sections.push([z.name,e.encode(sgWrap('Name: '+z.name)+sgWrap('SHA-256-Digest: '+sgB64(await sgSha(await zipGet(buf,z))))+'\r\n')])}
 const mfHead=e.encode('Manifest-Version: 1.0\r\nCreated-By: 1.0 (CodeMobile)\r\n\r\n'),mf=sgCat([mfHead,...sections.map(s=>s[1])]);
 let sf='Signature-Version: 1.0\r\nCreated-By: 1.0 (CodeMobile)\r\n'+sgWrap('SHA-256-Digest-Manifest: '+sgB64(await sgSha(mf)))+'X-Android-APK-Signed: 2\r\n\r\n';
 for(const[n,b]of sections)sf+=sgWrap('Name: '+n)+sgWrap('SHA-256-Digest: '+sgB64(await sgSha(b)))+'\r\n';
 const sfb=e.encode(sf),sig=await sgSign(K,sfb),cert=K.cert,
  issuer={issuer:K.iss,serial:K.ser},
  p7=der(0x30,dOid('1.2.840.113549.1.7.2'),der(0xA0,der(0x30,der(2,[1]),der(0x31,dAlg(ALG_SHA256)),der(0x30,dOid('1.2.840.113549.1.7.1')),der(0xA0,cert),der(0x31,der(0x30,der(2,[1]),der(0x30,issuer.issuer,issuer.serial),dAlg(ALG_SHA256),dAlg(ALG_RSA),der(4,sig))))));
 return new Map([['META-INF/MANIFEST.MF',mf],['META-INF/CERT.SF',sfb],['META-INF/CERT.RSA',p7]])}
/* --- v2: bloco de assinatura entre as entradas e o diretório central --- */
const sgFind=u=>{for(let i=u.length-22;i>=0;i--)if(u[i]==0x50&&u[i+1]==0x4b&&u[i+2]==5&&u[i+3]==6)return i;throw new Error('EOCD não encontrado')};
async function sgChunks(parts){const ds=[];let n=0;for(const p of parts)for(let o=0;o<p.length;o+=1048576){const c=p.subarray(o,Math.min(p.length,o+1048576));ds.push(await sgSha(sgCat([Uint8Array.of(0xa5),sgU32(c.length),c])));n++}return sgSha(sgCat([Uint8Array.of(0x5a),sgU32(n),...ds]))}
async function sgV2(z,K){const e=sgFind(z),cdOff=new DataView(z.buffer,z.byteOffset).getUint32(e+16,true),ent=z.subarray(0,cdOff),cd=z.subarray(cdOff,e),eocd=z.subarray(e);
 const digest=await sgChunks([ent,cd,eocd]),signed=sgCat([sgLp(sgLp(sgU32(0x103),sgLp(digest))),sgLp(sgLp(K.cert)),sgU32(0)]),sig=await sgSign(K,signed),
  signer=sgLp(sgLp(signed),sgLp(sgLp(sgU32(0x103),sgLp(sig))),sgLp(K.spki)),val=sgLp(signer),
  pair=sgCat([sgU32(val.length+4),sgU32(0),sgU32(0x7109871a),val]),size=pair.length+24,
  blk=sgCat([sgU32(size),sgU32(0),pair,sgU32(size),sgU32(0),new TextEncoder().encode('APK Sig Block 42')]),eo=eocd.slice();
 new DataView(eo.buffer).setUint32(16,cdOff+blk.length,true);return sgCat([ent,blk,cd,eo])}
/* Validação estrutural do artefato antes de ele ser exportado. Não substitui apksigner/Android install-test. */
async function apkValidate(bytes,requireSignature=false){
 bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const ents=zipRead(bytes),names=new Set(ents.map(e=>e.name));
 const manifest=ents.find(e=>e.name==='AndroidManifest.xml');
 if(!manifest)throw new Error('APK inválido: AndroidManifest.xml não existe. Nenhum arquivo foi exportado.');
 const md=await zipGet(bytes,manifest);
 if(!axmlIs(md))throw new Error('APK inválido: AndroidManifest.xml não está em formato binário Android (AXML).');
 let text;try{text=axmlParse(md).text}catch(e){throw new Error('APK inválido: AndroidManifest.xml não pôde ser validado: '+e.message)}
 if(!/<manifest(?:\s|>)/.test(text))throw new Error('APK inválido: o XML binário não contém a raiz <manifest>.');
 if(requireSignature){
  for(const n of ['META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA'])if(!names.has(n))throw new Error('Assinatura incompleta: falta '+n+'. O APK não será salvo.');
  const e=sgFind(bytes),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),cdOff=v.getUint32(e+16,true),magic='APK Sig Block 42';
  if(cdOff<24||new TextDecoder().decode(bytes.subarray(cdOff-16,cdOff))!==magic)throw new Error('Bloco de assinatura APK v2 ausente. O APK não será salvo.');
  const size=v.getUint32(cdOff-24,true),sizeHi=v.getUint32(cdOff-20,true),start=cdOff-size-8;
  if(sizeHi!==0||start<0||v.getUint32(start,true)!==size||v.getUint32(start+4,true)!==0)throw new Error('Bloco de assinatura APK v2 inválido. O APK não será salvo.');
  let p=start+8,end=cdOff-24,hasV2=false;
  while(p<end){if(p+12>end)throw new Error('Registro incompleto no bloco de assinatura APK v2.');const len=v.getUint32(p,true),hi=v.getUint32(p+4,true),id=v.getUint32(p+8,true);if(hi!==0||len<4||p+8+len>end)throw new Error('Tamanho inválido no bloco de assinatura APK v2.');if(id===0x7109871a)hasV2=true;p+=8+len}
  if(p!==end||!hasV2)throw new Error('O bloco de assinatura não contém um registro v2 válido.');
 }
 return{entries:ents.length,manifest:true,signed:!!requireSignature};
}
/* assina um APK (bytes do zip já regravado): remove assinaturas antigas, aplica v1 e depois v2 */
async function apkSign(bytes,key){const K=await signKeyUse(key);let ents=zipRead(bytes);
 const v1=await sgV1(bytes,ents,K),a=new Uint8Array(await(await zipWrite(bytes,ents,v1)).arrayBuffer());return sgV2(a,K)}
if(typeof module!='undefined')module.exports={signKeyGen,signKeyUse,apkSign,apkValidate};
