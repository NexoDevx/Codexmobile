// node test/apk.test.mjs — testes do núcleo do editor de APK (ZIP + AndroidManifest binário)
import fs from 'node:fs';import vm from 'node:vm';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';const W=fileURLToPath(new URL('../www/',import.meta.url));
const ctx={crypto:globalThis.crypto,btoa,atob,console,TextEncoder,TextDecoder,DataView,Uint8Array,Uint32Array,Float32Array,Blob,Response,DecompressionStream,CompressionStream,Math,String,Set,Map};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(W+'apkcore.js','utf8')+fs.readFileSync(W+'apksign.js','utf8')+';this.C={apkSign,apkValidate,signKeyGen,crc32,zipRead,zipRaw,zipGet,zipWrite,axmlIs,axmlParse,axmlSetStrings,axmlCompile,apkInfo};',ctx);const C=ctx.C;
let fails=0;const ok=(l,c,x)=>{if(!c)fails++;console.log((c?'✓ ':'✗ ')+l+(c?'':'  '+(x||'')))};
/* gera um AndroidManifest binário (string pool UTF-8) como o aapt faria */
function mkAxml(){const S=['versionCode','versionName','package','manifest','uses-permission','name','android','http://schemas.android.com/apk/res/android','1.0','com.exemplo.app','android.permission.INTERNET','uses-sdk','minSdkVersion'];
 const enc=new TextEncoder(),sb=S.map(s=>{const b=enc.encode(s);return Uint8Array.from([s.length,b.length,...b,0])});let so=[],t=0;for(const b of sb){so.push(t);t+=b.length}const pad=(4-t%4)%4,ps=28+S.length*4,pl=ps+t+pad;
 const u16=n=>[n&255,n>>8&255],u32=n=>[n&255,n>>8&255,n>>16&255,n>>>24&255],N=0xFFFFFFFF;
 const pool=[...u16(1),...u16(28),...u32(pl),...u32(S.length),...u32(0),...u32(256),...u32(ps),...u32(0),...so.flatMap(u32),...sb.flatMap(b=>[...b]),...Array(pad).fill(0)];
 const attr=(ns,nm,raw,ty,data)=>[...u32(ns),...u32(nm),...u32(raw),...u16(8),0,ty,...u32(data)];
 const start=(nm,attrs)=>{const a=attrs.flat();return[...u16(0x102),...u16(16),...u32(36+a.length),...u32(1),...u32(N),...u32(N),...u32(nm),...u16(20),...u16(20),...u16(attrs.length),...u16(0),...u16(0),...u16(0),...a]};
 const end=nm=>[...u16(0x103),...u16(16),...u32(24),...u32(1),...u32(N),...u32(N),...u32(nm)];
 const nsS=[...u16(0x100),...u16(16),...u32(24),...u32(1),...u32(N),...u32(6),...u32(7)],nsE=[...u16(0x101),...u16(16),...u32(24),...u32(1),...u32(N),...u32(6),...u32(7)];
 const body=[...pool,...nsS,...start(3,[attr(7,0,N,0x10,7),attr(7,1,8,3,8),attr(N,2,9,3,9)]),...start(11,[attr(7,12,N,0x10,21)]),...end(11),...start(4,[attr(7,5,10,3,10)]),...end(4),...end(3),...nsE];
 return Uint8Array.from([...u16(3),...u16(8),...u32(8+body.length),...body])}
const ax=mkAxml(),p=C.axmlParse(ax);
ok('axmlIs',C.axmlIs(ax)&&!C.axmlIs(new Uint8Array([1,2,3,4,5,6,7,8,9])));
ok('decodifica o manifesto',/<manifest xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android"/.test(p.text)&&/android:versionCode="7"/.test(p.text)&&/package="com.exemplo.app"/.test(p.text)&&/<uses-sdk\s+android:minSdkVersion="21">/.test(p.text)&&/android:name="android.permission.INTERNET"/.test(p.text)&&/<\/manifest>/.test(p.text),p.text);
const inf=C.apkInfo(p.text);ok('resumo do manifesto',inf.pkg=='com.exemplo.app'&&inf.vn=='1.0'&&inf.vc=='7'&&inf.min=='21'&&inf.perms[0]=='android.permission.INTERNET',JSON.stringify(inf));
const strs=[...p.strs];strs[9]='br.novo.pacote';strs[8]='2.5-ç';const ax2=C.axmlSetStrings(ax,strs),p2=C.axmlParse(ax2);
ok('edita textos do pool (pacote/versão, com acento)',/package="br.novo.pacote"/.test(p2.text)&&/versionName="2.5-ç"/.test(p2.text)&&/versionCode="7"/.test(p2.text)&&p2.text.replace('br.novo.pacote','com.exemplo.app').replace('2.5-ç','1.0')==p.text);
ok('tamanho do arquivo no cabeçalho coerente',new DataView(ax2.buffer).getUint32(4,true)==ax2.length&&ax2.length%4==0);
/* compilar texto → AXML */
const rt=C.axmlCompile(p.text,ax);ok('texto → AXML → texto é idêntico',C.axmlParse(rt).text===p.text,C.axmlParse(rt).text);
const edt=p.text.replace('android:versionCode="7"','android:versionCode="42"').replace('<uses-sdk','<application android:debuggable="true" android:label="Meu App" android:name=".App">\n  </application>\n  <uses-sdk').replace('package="com.exemplo.app"','package="a.b.c"');
const c2=C.axmlCompile(edt,ax),p3=C.axmlParse(c2);
ok('compila edição (valor, atributo novo com ID, elemento novo)',/versionCode="42"/.test(p3.text)&&/debuggable="true"/.test(p3.text)&&/package="a.b.c"/.test(p3.text)&&p3.meta.types.debuggable==0x12&&p3.meta.ids.debuggable==0x0101000f&&p3.meta.types.versionCode==0x10,p3.text);
ok('atributos ordenados por ID de recurso, sem ID por último',(()=>{const i=p3.text.indexOf('android:versionCode'),j=p3.text.indexOf('android:versionName'),k=p3.text.indexOf('package=');return i<j&&j<k})());
try{C.axmlCompile(edt.replace('android:versionCode=','android:inventado='),ax);ok('rejeita atributo android: sem ID',false)}catch(e){ok('rejeita atributo android: sem ID',/inventado/.test(e.message))}
try{C.axmlCompile('<a><b></a>',null);ok('rejeita XML malformado',false)}catch(e){ok('rejeita XML malformado',true)}
fs.writeFileSync(path.join(os.tmpdir(),'compiled.axml'),c2);
/* ZIP */
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apk-'));const src=path.join(dir,'src');fs.mkdirSync(src+'/res',{recursive:true});fs.mkdirSync(src+'/META-INF');fs.mkdirSync(src+'/assets');
fs.writeFileSync(src+'/AndroidManifest.xml',ax);fs.writeFileSync(src+'/assets/ola.txt','olá mundo\n'.repeat(50));fs.writeFileSync(src+'/res/dados.bin',Buffer.from(Array.from({length:300},(_,i)=>i*7%251)));fs.writeFileSync(src+'/META-INF/CERT.RSA','x');fs.writeFileSync(src+'/META-INF/MANIFEST.MF','Manifest-Version: 1.0\n');fs.writeFileSync(src+'/resources.arsc',Buffer.alloc(1000,1));
const apk=path.join(dir,'a.apk');execFileSync('zip',['-q','-r','-0','-D',apk,'resources.arsc'],{cwd:src});execFileSync('zip',['-q','-r','-D',apk,'AndroidManifest.xml','assets','res','META-INF'],{cwd:src});
const buf=new Uint8Array(fs.readFileSync(apk)),ents=C.zipRead(buf);
ok('lê o diretório central',ents.length==6&&ents.some(e=>e.name=='assets/ola.txt'),ents.map(e=>e.name).join());
const t=ents.find(e=>e.name=='assets/ola.txt');ok('descomprime (deflate)',t.method==8&&new TextDecoder().decode(await C.zipGet(buf,t))==='olá mundo\n'.repeat(50));
const ma=ents.find(e=>e.name=='AndroidManifest.xml');ok('manifesto dentro do zip é decodificável',C.axmlIs(await C.zipGet(buf,ma)));
const over=new Map([['assets/ola.txt',new TextEncoder().encode('editado '.repeat(40))],['res/dados.bin',null],['AndroidManifest.xml',ax2],['assets/novo.txt',new TextEncoder().encode('arquivo novo')]]);
const out=new Uint8Array(await (await C.zipWrite(buf,ents,over)).arrayBuffer()),f2=path.join(dir,'b.apk');fs.writeFileSync(f2,out);
let tst='';try{tst=execFileSync('unzip',['-t',f2]).toString()}catch(e){tst=String(e.stdout)+e.message}
ok('unzip -t aceita o APK regravado',/No errors detected/.test(tst),tst);
const e2=C.zipRead(out),n2=e2.map(e=>e.name);
ok('remove arquivo e assinaturas antigas, adiciona novo',!n2.includes('res/dados.bin')&&!n2.some(n=>n.startsWith('META-INF/'))&&n2.includes('assets/novo.txt')&&n2.length==4,n2.join());
ok('conteúdo editado e novo estão corretos',new TextDecoder().decode(await C.zipGet(out,e2.find(e=>e.name=='assets/ola.txt')))==='editado '.repeat(40)&&new TextDecoder().decode(await C.zipGet(out,e2.find(e=>e.name=='assets/novo.txt')))=='arquivo novo');
ok('manifesto editado sobrevive',/br.novo.pacote/.test(C.axmlParse(await C.zipGet(out,e2.find(e=>e.name=='AndroidManifest.xml'))).text));
const rs=e2.find(e=>e.name=='resources.arsc');ok('resources.arsc intacto, sem compressão e alinhado em 4 bytes',rs.method==0&&C.zipRaw(out,rs).byteOffset%4==0&&C.zipRaw(out,rs).every(b=>b==1)&&C.zipRaw(out,rs).length==1000);
ok('CRC das entradas copiadas é preservado',rs.crc==C.crc32(new Uint8Array(1000).fill(1)));
/* Uma biblioteca nativa armazenada deve continuar sem compressão e alinhada a 16 KiB. */
const libRoot=path.join(dir,'libsrc');fs.mkdirSync(path.join(libRoot,'lib','arm64-v8a'),{recursive:true});
fs.writeFileSync(path.join(libRoot,'lib','arm64-v8a','libnative.so'),Buffer.alloc(512,0x4a));
const libZip=path.join(dir,'lib.zip');execFileSync('zip',['-q','-0','-r',libZip,'lib'],{cwd:libRoot});
const lb=new Uint8Array(fs.readFileSync(libZip)),le=C.zipRead(lb),lo=new Uint8Array(await(await C.zipWrite(lb,le,new Map([['assets/extra.txt',new TextEncoder().encode('x')]]))).arrayBuffer()),ln=C.zipRead(lo).find(e=>e.name==='lib/arm64-v8a/libnative.so');
const lv=new DataView(lo.buffer,lo.byteOffset,lo.byteLength),extraStart=ln.off+30+new TextEncoder().encode(ln.name).length,extraSize=lv.getUint16(ln.off+28,true),extraId=extraSize>=4?lv.getUint16(extraStart,true):0,extraLen=extraSize>=4?lv.getUint16(extraStart+2,true):-1;
ok('biblioteca nativa mantém formato store, campo extra ZIP válido e alinhamento de 16 KiB',ln.method===0&&C.zipRaw(lo,ln).byteOffset%16384===0&&extraId===0xD935&&extraLen===extraSize-4,'method='+ln.method+', offset='+C.zipRaw(lo,ln).byteOffset+', extra='+extraId+'/'+extraLen);
/* assinatura */
const key=await C.signKeyGen('Teste CodeMobile'),signed=await C.apkSign(out,key),f3=path.join(dir,'s.apk');fs.writeFileSync(f3,signed);
let js='';try{js=execFileSync('jarsigner',['-verify','-verbose:summary',f3],{stdio:['ignore','pipe','pipe']}).toString()}catch(e){js=String(e.stdout)+String(e.stderr)}
ok('jarsigner confirma a assinatura v1',/jar verified/.test(js),js.slice(0,400));
let v2='';try{v2=execFileSync('java',['test/VerifyV2.java',f3],{stdio:['ignore','pipe','pipe'],cwd:fileURLToPath(new URL('../',import.meta.url))}).toString()}catch(e){v2=String(e.stdout)+String(e.stderr)}
ok('verificador independente confirma a assinatura v2',/v2 OK/.test(v2),v2.slice(0,400));
let t3='';try{t3=execFileSync('unzip',['-t',f3]).toString()}catch(e){t3=String(e.stdout)}
ok('APK assinado continua sendo um zip válido',/No errors/.test(t3),t3.slice(-200));
const e3=C.zipRead(signed);ok('contém MANIFEST.MF, CERT.SF e CERT.RSA e o conteúdo editado',['META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA','assets/novo.txt'].every(n=>e3.some(e=>e.name==n)));
const validSigned=await C.apkValidate(signed,true);ok('validador confirma manifesto e estruturas v1/v2',validSigned.signed&&validSigned.manifest&&validSigned.entries===e3.length);
const missingManifest=new Uint8Array(await(await C.zipWrite(buf,ents,new Map([['AndroidManifest.xml',null]])).then(b=>b.arrayBuffer())));let rejectedMissing=false;try{await C.apkValidate(missingManifest,false)}catch(e){rejectedMissing=/AndroidManifest.xml/.test(e.message)}ok('não exporta APK sem AndroidManifest.xml',rejectedMissing);
fs.writeFileSync('/tmp/dbg-signed.apk',signed);const bad=signed.slice();bad[100]^=1;fs.writeFileSync(f3,bad);let v2b='';try{v2b=execFileSync('java',['test/VerifyV2.java',f3],{stdio:['ignore','pipe','pipe'],cwd:fileURLToPath(new URL('../',import.meta.url))}).toString()}catch(e){v2b=String(e.stdout)}
ok('adulterar um byte quebra a verificação v2',/FALHA/.test(v2b),v2b);
fs.copyFileSync(f2,'/tmp/dbg-unsigned.apk');fs.rmSync(dir,{recursive:true});
console.log(fails?fails+' falha(s)':'tudo certo');process.exit(fails?1:0);
