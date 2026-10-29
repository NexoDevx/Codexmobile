// node --test test/exe.test.mjs — editor básico de .exe (PE sintético, sem precisar de arquivos do Windows)
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const EXE=new Function(fs.readFileSync(new URL('../www/execore.js',import.meta.url),'utf8')+';return EXE')();
const u16=(a,o,v)=>{a[o]=v&255;a[o+1]=v>>8},u32=(a,o,v)=>{u16(a,o,v&0xffff);u16(a,o+2,v>>>16)};
function bmp2x2(){const d=new Uint8Array(40+16);u32(d,0,40);u32(d,4,2);u32(d,8,2);u16(d,12,1);u16(d,14,24);u32(d,20,16);d.fill(0x77,40);return d}
function buildPE(){const b=new Uint8Array(0x800);b[0]=0x4d;b[1]=0x5a;u32(b,0x3c,0x80);const pe=0x80;u32(b,pe,0x4550);u16(b,pe+4,0x14c);u16(b,pe+6,2);u16(b,pe+20,224);const opt=pe+24;u16(b,opt,0x10b);u32(b,opt+96+16,0x2000);u32(b,opt+96+20,0x200);
 const sh=opt+224;const sec=(i,n,va,vs,raw,rs)=>{const o=sh+i*40;for(let k=0;k<n.length;k++)b[o+k]=n.charCodeAt(k);u32(b,o+8,vs);u32(b,o+12,va);u32(b,o+16,rs);u32(b,o+20,raw)};sec(0,'.text',0x1000,0x200,0x200,0x200);sec(1,'.rsrc',0x2000,0x200,0x400,0x400);
 const txt='Bem-vindo vaca feliz\0\0\0\0\0\0\0\0X';for(let i=0;i<txt.length;i++)b[0x200+i]=txt.charCodeAt(i);
 const r=0x400,dir=(o,n)=>{u16(b,o+14,n)},ent=(o,i,id,off,sub)=>{u32(b,o+16+i*8,id);u32(b,o+20+i*8,sub?(0x80000000|off)>>>0:off)};
 dir(r,2);ent(r,0,2,0x20,1);ent(r,1,10,0x50,1);dir(r+0x20,1);ent(r+0x20,0,101,0x38,1);dir(r+0x38,1);ent(r+0x38,0,0x409,0x80,0);dir(r+0x50,1);ent(r+0x50,0,7,0x68,1);dir(r+0x68,1);ent(r+0x68,0,0x409,0x90,0);
 const bm=bmp2x2();u32(b,r+0x80,0x2100);u32(b,r+0x84,bm.length);b.set(bm,r+0x100);u32(b,r+0x90,0x2200);u32(b,r+0x94,10);b.set(new TextEncoder().encode('0123456789'),r+0x200);return b}
test('lê o PE e os recursos',()=>{const i=EXE.parse(buildPE());assert.equal(i.machine,'x86 (32 bits)');assert.equal(i.res.length,2);assert.equal(i.res[0].tname,'BITMAP');assert.equal(i.res[1].tname,'RCDATA')});
test('rejeita arquivo que não é exe',()=>assert.throws(()=>EXE.parse(new Uint8Array(100)),/MZ/));
test('BITMAP vira .bmp válido e dá para trocar por outro do mesmo tamanho',()=>{const b=buildPE(),i=EXE.parse(b),f=EXE.resFile(b,i.res[0]);assert.equal(f.name,'BITMAP_101.bmp');assert.equal(f.data[0],0x42);assert.equal(f.data.length,14+56);
 const novo=EXE.dibFromRGBA(new Uint8Array(16).map((_,k)=>k%4==3?255:200),2,2,24,[255,0,255]);assert.equal(novo.length,56);EXE.resReplace(b,i.res[0],novo);assert.equal(EXE.parse(b).res[0].size,56);assert.equal(b[i.res[0].off+40],200)});
test('recurso maior que o espaço é recusado com mensagem clara',()=>{const b=buildPE(),i=EXE.parse(b);assert.throws(()=>EXE.resReplace(b,i.res[1],new Uint8Array(11)),/Não cabe/);EXE.resReplace(b,i.res[1],new Uint8Array(4).fill(65));assert.equal(EXE.parse(b).res[1].size,4)});
test('imagem de 8 bits (paleta) é recusada',()=>assert.throws(()=>EXE.dibFromRGBA(new Uint8Array(16),2,2,8,[0,0,0]),/paleta/));
test('troca de texto: menor cabe, maior só com espaço livre',()=>{const b=buildPE();assert.equal(EXE.findText(b,'vaca').length,1);let r=EXE.replaceText(b,'vaca','dino',false);assert.equal(r.done,1);assert.ok(new TextDecoder().decode(b.subarray(0x200,0x220)).includes('dino feliz'));
 r=EXE.replaceText(b,'feliz','muitofeliz',false);assert.equal(r.skipped,1);assert.equal(r.maxLen,5);r=EXE.replaceText(b,'feliz','muitofeliz',true);assert.equal(r.done,1)});
test('texto UTF-16 também é encontrado',()=>{const b=new Uint8Array(64);b.set([86,0,97,0,99,0,97,0],8);const h=EXE.findText(b,'Vaca');assert.equal(h.length,1);assert.equal(h[0].kind,'utf16')});
test('ZIP embutido: lista, lê, edita e reempacota',async()=>{const exe=buildPE(),z=await EXE.zipBuild([{name:'data/',data:new Uint8Array(0)},{name:'data/config.json',data:new TextEncoder().encode('{"animal":"vaca"}'.repeat(10))},{name:'a.txt',data:new TextEncoder().encode('oi')}]);
 const all=new Uint8Array(exe.length+z.length);all.set(exe);all.set(z,exe.length);const zi=EXE.zipFind(all);assert.equal(zi.start,exe.length);const L=EXE.zipList(all,zi);assert.equal(L.length,3);
 const c=L.find(e=>e.name=='data/config.json');assert.ok(new TextDecoder().decode(await EXE.zipRead(all,c)).startsWith('{"animal":"vaca"}'));
 const z2=await EXE.zipBuild([{name:'a.txt',data:new TextEncoder().encode('dino')}]);const all2=new Uint8Array(zi.start+z2.length);all2.set(all.subarray(0,zi.start));all2.set(z2,zi.start);const L2=EXE.zipList(all2,EXE.zipFind(all2));assert.equal(new TextDecoder().decode(await EXE.zipRead(all2,L2[0])),'dino');assert.doesNotThrow(()=>EXE.parse(all2))});
test('detecta empacotadores conhecidos',()=>{const b=new Uint8Array(100);b.set(new TextEncoder().encode('UPX!'),30);assert.match(EXE.hints(b)[0],/UPX/)});
const REAL='/home/claude/.cache/uv/archive-v0/a641I1z5YpLSsHL5N2059/setuptools/cli-64.exe';
test('exe real do Windows (se existir na máquina)',{skip:!fs.existsSync(REAL)},()=>{const b=new Uint8Array(fs.readFileSync(REAL)),i=EXE.parse(b);assert.match(i.machine,/x64/);assert.ok(i.res.length>0);const f=EXE.resFile(b,i.res.find(r=>r.type==24)||i.res[0]);assert.ok(f.data.length>0)});
test('acha PNG, JPEG e BMP soltos no binário e lê dimensões',()=>{const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,0,0,0,4,0,0,0,3,8,6,0,0,0,0,0,0,0,0,0,0,0,0x49,0x45,0x4e,0x44,0,0,0,0]);
 const bm=new Uint8Array(54+16);bm[0]=0x42;bm[1]=0x4d;u32(bm,2,bm.length);u32(bm,10,54);u32(bm,14,40);u32(bm,18,2);u32(bm,22,2);u16(bm,26,1);u16(bm,28,24);
 const jp=Uint8Array.from([0xff,0xd8,0xff,0xc0,0,11,8,0,5,0,7,1,1,0x11,0,0xff,0xd9]);const all=new Uint8Array(300);all.set(png,10);all.set(bm,100);all.set(jp,200);
 const f=EXE.findImages(all);assert.deepEqual(f.map(x=>[x.kind,x.off,x.w,x.h]),[['png',10,4,3],['bmp',100,2,2],['jpg',200,7,5]])});
test('hex: dump, busca e patch',()=>{const b=new Uint8Array(32);b.set([1,2,3,0xab],4);assert.match(EXE.hexdump(b,0,16),/^00000000  00 00 00 00 01 02 03 ab/);assert.deepEqual(EXE.findAll(b,EXE.hexBytes('01 02 03')),[4]);EXE.patch(b,4,EXE.hexBytes('ff'));assert.equal(b[4],255);assert.throws(()=>EXE.patch(b,31,EXE.hexBytes('0102')),/fora/);assert.throws(()=>EXE.hexBytes('abc'),/hex/);assert.equal(EXE.num('0x10'),16)});
test('ferramentas exe_* do agente (exe2.js com o app simulado)',async()=>{
 const src=fs.readFileSync(new URL('./exe.test.mjs',import.meta.url),'utf8'),build=new Function('u16','u32',src.slice(src.indexOf('function bmp2x2'),src.indexOf("test('lê o PE"))+';return buildPE');
 const T=[],W=[],GRP={write:[]},PD={},ico={},S={mode:'auto',perm:{}},files={},sent=[];let sysTxt='base',execCalls=[];
 const env={EXE,T,W,GRP,PD,ico,S,CHATONLY:false,pj:()=>({files}),save(){},ui(){},dlg:async()=>0,out:async(n,b)=>sent.push([n,b.size]),isImg:()=>false,imgData:()=>null,TextEncoder,TextDecoder,Blob,Image:class{},document:{},URL};
 const code=fs.readFileSync(new URL('../www/exe2.js',import.meta.url),'utf8');
 const run=new Function(...Object.keys(env),'var exec=async(n,a)=>"ORIGINAL:"+n;var sys=()=>"base";'+code+';return{exec:(n,a)=>exec(n,a),sys:()=>sys(),EXES,exeMake,exeAny}')(...Object.values(env));
 assert.equal(T.filter(t=>t[0].startsWith('exe_')).length,12);assert.ok(GRP.write.includes('exe_patch'));assert.equal(await run.exec('read_file',{}),'ORIGINAL:read_file');
 assert.match(await run.exec('exe_list',{}),/Nenhum .exe aberto/);
 run.EXES.set('jogo.exe',run.exeMake('jogo.exe',build(u16,u32)()));assert.ok(run.exeAny());assert.match(run.sys(),/EXE: o usuário abriu/);
 assert.match(await run.exec('exe_list',{}),/jogo\.exe — .*2 recursos/);assert.match(await run.exec('exe_info',{}),/BITMAP×1 RCDATA×1/);assert.match(await run.exec('exe_images',{}),/r0 {2}BITMAP_101 {2}2×2 24bpp/);
 assert.match(await run.exec('exe_find',{texto:'vaca'}),/ascii @0x/);assert.match(await run.exec('exe_replace_text',{buscar:'vaca',trocar_por:'dino'}),/Trocadas 1 de 1/);assert.match(await run.exec('exe_replace_text',{buscar:'dino',trocar_por:'dinossauro'}),/NÃO couberam/);
 assert.match(await run.exec('exe_hex',{deslocamento:'0x200',quantidade:32}),/Bem-vindo dino/);assert.match(await run.exec('exe_search_hex',{hex_bytes:'4d 5a'}),/0x0/);assert.match(await run.exec('exe_patch',{deslocamento:'0x200',hex_bytes:'ff'}),/ok: 1/);
 assert.match(await run.exec('exe_find',{texto:'Bem'}),/não encontrado/);assert.match(await run.exec('exe_replace_text',{buscar:'x'}),/ausente/);
 S.mode='plan';assert.match(await run.exec('exe_patch',{deslocamento:'0',hex_bytes:'00'}),/Modo plano/);S.mode='auto';
 assert.match(await run.exec('exe_save',{}),/entregue/);assert.equal(sent[0][0],'jogo-mod.exe');assert.match(await run.exec('exe_info',{exe:'naoexiste'}),/não encontrado/)});
