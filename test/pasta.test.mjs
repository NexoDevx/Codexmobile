import test from 'node:test';import assert from 'node:assert';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('API de pastas do servidor: lista, lê, grava e bloqueia fora do HOME', async()=>{
 const h=fs.mkdtempSync(path.join(os.tmpdir(),'cmh-')),d=fs.mkdtempSync(path.join(os.tmpdir(),'cmd-'));fs.mkdirSync(h+'/p/src',{recursive:true});fs.writeFileSync(h+'/p/src/a.js','hi');fs.writeFileSync(h+'/p/x.bin',Buffer.from([0,1]));
 const port=8790+Math.floor(Math.random()*90),c=spawn('node',['server.mjs'],{env:{...process.env,HOME:h,CM_DATA:d,PORT:port},stdio:['ignore','pipe','ignore']});
 let out='';c.stdout.on('data',x=>out+=x);try{
  for(let i=0;i<40&&!/Token/.test(out);i++)await new Promise(r=>setTimeout(r,100));
  const tok=out.split('Token')[1].split(': ').pop().trim(),B='http://localhost:'+port,H={Authorization:'Bearer '+tok,'content-type':'application/json'};
  const g=async u=>(await fetch(B+u,{headers:H})).json();
  assert.deepEqual((await g('/api/ls?path='+fs.realpathSync(h))).dirs,['p']);
  const r=await g('/api/dirread?path='+fs.realpathSync(h+'/p'));assert.equal(r.files['src/a.js'],'hi');assert.equal(r.skipped,1);
  const w=await (await fetch(B+'/api/dirwrite',{method:'POST',headers:H,body:JSON.stringify({path:h+'/p',files:{'src/b.js':'x','../../evil':'y'}})})).json();
  assert.equal(w.count,1);assert.ok(fs.existsSync(h+'/p/src/b.js'));assert.ok(!fs.existsSync(h+'/../evil'));
  assert.ok((await g('/api/ls?path=/etc')).error);
 }finally{c.kill()}});
