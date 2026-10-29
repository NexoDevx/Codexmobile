// node test/vsh.test.mjs — testes do mini-terminal (glob, variáveis, for/if, jq, awk, git local...)
import fs from 'node:fs';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';const W=fileURLToPath(new URL('../www/',import.meta.url));
const ctx={console,crypto:globalThis.crypto,TextEncoder,btoa,atob,escape,unescape,decodeURIComponent,encodeURIComponent,setTimeout,Date,JSON};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(W+'vsh.js','utf8')+fs.readFileSync(W+'vsh2.js','utf8')+';this.vsh=vsh;this.VSH=VSH;',ctx);
const proj={files:{'index.html':'<h1>oi</h1>\n','src/app.js':'let a=1;\n// TODO fix\n','src/b.js':'export default 2\n','data.json':'{"nome":"Ana","itens":[{"id":1},{"id":2}],"n":3}','notas.csv':'a,10\nb,20\nc,30\n','package.json':'{"name":"x","version":"1.0.0","scripts":{"test":"echo rodando testes && grep -c let src/app.js","ola":"echo ola"}}'}};
ctx.VSH.hooks.proj=()=>proj;ctx.VSH.hooks.get=async u=>'<html>'+u+'</html>';ctx.VSH.hooks.py=async()=>({ok:1,out:'py\n'});ctx.VSH.hooks.js=async c=>'[log] js';
let fails=0;const f=proj.files;
const t=async(l,exp)=>{const r=await ctx.vsh(l,f);const ok=exp===undefined?true:(exp instanceof RegExp?exp.test(r.out):r.out===exp);if(!ok)fails++;console.log((ok?'✓':'✗ ')+' $ '+l+(ok?'':'\n   obtido: '+JSON.stringify(r.out)+' [exit '+r.code+']'))};
await t('echo *.html','index.html\n');await t('ls src/*.js','src/app.js\nsrc/b.js\n');await t('for x in src/*.js; do echo ARQ $x; done',/ARQ src\/app.js\nARQ src\/b.js/);
await t('N=3; echo valor $N e ${N}0','valor 3 e 30\n');await t('echo "total: $(ls src | wc -l)"',/total: 2/);await t('echo `echo oi`','oi\n');await t("echo '$N não expande'",'$N não expande\n');
await t('if [ -f index.html ]; then echo existe; else echo nao; fi','existe\n');await t('if [ -f zzz ]; then echo existe; else echo nao; fi','nao\n');await t('[ -d src ] && echo dir','dir\n');await t('[ 3 -gt 2 ] && echo maior','maior\n');
await t("jq -r '.nome' data.json",'Ana\n');await t("jq '.itens[].id' data.json",'1\n2\n');await t("jq '.itens | length' data.json",'2\n');await t("jq 'keys' data.json",/itens/);
await t("awk -F, '{print $1}' notas.csv",'a\nb\nc\n');await t("awk -F, '{s+=$2} END{print s}' notas.csv",'60\n');await t("awk -F, 'NR>1 {print $2}' notas.csv",'20\n30\n');await t("cut -d, -f2 notas.csv | sort -nr | head -1",'30\n');
await t('cat notas.csv | tr a-z A-Z | head -1','A,10\n');await t('echo a b c | xargs -n1 echo',/a b c|a\nb\nc/);await t('seq 3','1\n2\n3\n');await t("printf '%s-%d\\n' x 7",'x-7\n');
await t('echo novo | tee t.txt | wc -c','5\n');await t('cp src/b.js src/c.js; echo "export default 3" > src/c.js; diff src/b.js src/c.js',/-export default 2\n\+export default 3/);
await t('curl -s https://x.com/a','<html>https://x.com/a</html>\n');await t('wget https://x.com/p.html; ls p.html','p.html\n');await t('npm test',/rodando testes\n1/);await t('npm run',/ola: echo ola/);await t('npm install lodash',/indisponível/);
await t('sha256sum notas.csv',/^[0-9a-f]{64}  notas.csv/);await t('echo oi | base64',"b2kK\n");await t('echo b2kK | base64 -d','oi\n');await t('basename src/app.js .js','app\n');await t('dirname src/app.js','src\n');await t('du -sh src',/src/);
// git-lite
await t('git status',/not a git|não é um repositório/);await t('git init',/inicializado/);await t('git status',/Untracked files:[\s\S]*index.html/);
await t('git add . && git commit -m "primeiro commit"',/root-commit.*primeiro commit/);await t('git status',/nothing to commit/);
await t('echo "// novo" >> src/app.js; git status -s',/ M src\/app.js/);await t('git diff',/\+\/\/ novo/);await t('git add src/app.js; git diff --staged',/\+\/\/ novo/);await t('git commit -m segundo',/segundo/);await t('git log --oneline',/segundo\n[0-9a-f]{7} primeiro commit/);
await t('git checkout -b feature && echo extra > extra.txt && git add . && git commit -m "na feature" && ls',/extra.txt/);await t('git checkout main && ls',/^(?!.*extra)/s);await t('git branch',/  feature\n\* main/);
await t('echo sujo >> index.html; git checkout feature',/alterações não commitadas/);await t('git checkout -- index.html; cat index.html','<h1>oi</h1>\n');await t('git checkout feature; ls',/extra.txt/);
await t('rm src/b.js; git status -s',/ D src\/b.js/);await t('git reset --hard; ls src',/b.js/);await t('git push origin main',/não existe no git local/);await t('git log -n 1',/na feature/);
await t('which git awk jq',/git: embutido/);await t('help',/awk/);await t('foo',/não encontrado/);
if(fails)process.exit(1);console.log('TODOS OK');
