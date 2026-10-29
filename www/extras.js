/* extras.js — terminal (Termux real ou embutido), conversas em drawer, boas-vindas */
let CM_SRV=!!window.CM_PX,CM_BASE='',CM_CAPS=[];
const CM_CAP=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
async function cmCaps(){try{CM_CAPS=(await cmApi('caps')).tools||[]}catch(e){CM_CAPS=[]}}
/* no APK: procura o servidor do Termux (node server.mjs) via HTTP nativo; se achar, liga o terminal real */
async function cmProbe(){if(!CM_CAP){if(CM_SRV)await cmCaps();return CM_SRV}for(const b of['http://127.0.0.1:8787','http://localhost:8787']){try{const r=await fetch(b+'/api/ping');if(r.ok){CM_BASE=b;CM_SRV=true;window.CM_PX=b+'/gh';await cmCaps();return true}}catch(e){}}CM_SRV=false;window.CM_PX='';CM_CAPS=[];return false}
/* token do servidor: fica FORA do estado do app (localStorage 'cm_tok'); no navegador vem do próprio servidor (CM_TOK) */
async function cmApi(p,o={},retry=1){const t=window.CM_TOK||localStorage.getItem('cm_tok')||'';const r=await fetch(CM_BASE+'/api/'+p,{...o,headers:{'Authorization':'Bearer '+t,'content-type':'application/json'}});
 if(r.status==401&&retry&&!window.CM_TOK){const n=prompt('O servidor pede o token de acesso. Cole aqui o "Token de acesso" que apareceu no Termux ao iniciar (sh start.sh).');if(n&&n.trim()){localStorage.setItem('cm_tok',n.trim());return cmApi(p,o,0)}}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('servidor '+r.status));return j}

/* ---- Linux embutido no APK: Ubuntu/glibc via proroot (substitui PRoot+Alpine) ---- */
const SHP=(()=>{try{const C=window.Capacitor;return CM_CAP&&C?(C.registerPlugin?C.registerPlugin('Shell'):C.Plugins&&C.Plugins.Shell):null}catch(e){return null}})();
let NAT={plugin:false,available:false,ready:false,lib:false,loader:false,runtime:false,bridge:false,linker:false,rootfs:false,engine:'proroot',prootBuild:''};
const real=()=>NAT.ready||CM_SRV;
async function natProbe(){
 if(!SHP){NAT={plugin:false,available:false,ready:false,lib:false,loader:false,runtime:false,bridge:false,linker:false,rootfs:false,engine:'proroot',prootBuild:''};return NAT}
 try{NAT={...NAT,...(await SHP.status()),plugin:true}}catch(e){NAT={plugin:false,available:false,ready:false,lib:false,loader:false,runtime:false,bridge:false,linker:false,rootfs:false,engine:'proroot',prootBuild:'',error:e.message}}
 if(NAT.ready&&!CM_CAPS.length)await natCaps();
 return NAT
}
async function natCaps(){try{const r=await shellRun('for c in git python3 python node npm pip rg fdfind jq tree curl wget bash zip unzip make nano vim apt apt-get dpkg gcc; do command -v "$c" >/dev/null 2>&1 && echo "$c"; done',30);if(!NAT.ready)return;CM_CAPS=r.out.split('\n').map(x=>x.trim()).filter(Boolean)}catch(e){}}
const NAT_PKGS='bash git ca-certificates curl wget python3 python3-pip nodejs npm ripgrep fd-find jq tree openssh-client zip unzip make nano vim build-essential pkg-config';
// Ubuntu apt usa índices e pacotes .deb; não executa apt-get upgrade global.
function natPackageCommand(upgrade=false){const log='/tmp/cm-apt-install.log';const install='DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends '+NAT_PKGS;return 'mkdir -p /tmp /var/cache/apt/archives/partial /var/lib/apt/lists/partial; printf x >/tmp/.cm-rename-a 2>/dev/null && mv /tmp/.cm-rename-a /tmp/.cm-rename-b 2>/dev/null && test -s /tmp/.cm-rename-b; fs=$?; rm -f /tmp/.cm-rename-a /tmp/.cm-rename-b; if [ "$fs" -ne 0 ]; then echo "ERRO: rename/mv falhou dentro do runtime proroot; verifique os logs do diagnóstico."; exit 70; fi; apt-get update > '+log+' 2>&1; rc=$?; if [ "$rc" -eq 0 ]; then '+install+' >> '+log+' 2>&1; rc=$?; fi; if command -v fdfind >/dev/null 2>&1 && [ ! -e /usr/local/bin/fd ]; then ln -sf /usr/bin/fdfind /usr/local/bin/fd 2>> '+log+' || true; fi; tail -n 38 '+log+'; echo APT_INSTALL_EXIT:$rc; exit "$rc"'}
function natPackageAdvice(output){const o=String(output||'');if(/Function not implemented|ENOSYS|Operation not permitted|Permission denied|EPERM/i.test(o)){const engine=(NAT.prootBuild||'runtime proroot desconhecido').split('\n').find(x=>x.startsWith('engine=')||x.startsWith('version='))||'proroot não identificado';return '\n\nDiagnóstico: o runtime ainda recebeu erro de syscall/permissão. Engine: '+engine+'. Execute “Diagnosticar Linux” e confira o código real de apt-get. Isso pode indicar incompatibilidade do aparelho, falta de espaço, rede ou configuração de repositório; não é garantido que trocar o runtime resolva todos os dispositivos. Não apague seus projetos.\n'}return ''}
async function natDiagnose(){await natProbe();if(!SHP||!NAT.ready){await dlg({title:'Diagnóstico Linux/proroot',text:'O Linux ainda não está instalado ou o plugin nativo não está disponível.\n\nPlugin Shell: '+(!!SHP)+'\nLauncher: '+(NAT.lib?'presente':'ausente')+'\nRuntime: '+(NAT.runtime?'presente':'ausente')+'\nBridge: '+(NAT.bridge?'presente':'ausente')+'\nLinker: '+(NAT.linker?'presente':'ausente')+'\nStub loader: '+(NAT.loader?'presente':'ausente')+'\nUbuntu rootfs: '+(NAT.rootfs?'presente':'ausente')+'\nArquitetura: '+(NAT.architecture||'desconhecida')+'\nBuild: '+(NAT.prootBuild||'desconhecido')+'\n\nInstale/recompile o APK ARM64 que inclui o runtime e a imagem Ubuntu.',btns:['Fechar']});return}let r;const cmd='echo "=== CodeMobile Linux/proroot diagnóstico ==="; echo "--- distro ---"; cat /etc/os-release 2>/dev/null || true; echo "--- glibc ---"; ldd --version 2>&1 | head -n 2; echo "--- apt ---"; apt-get --version 2>&1 | head -n 1; echo "--- fontes ---"; cat /etc/apt/sources.list 2>/dev/null; cat /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null; echo "--- rename ---"; printf x >/tmp/.cm-diagnose-a && mv /tmp/.cm-diagnose-a /tmp/.cm-diagnose-b && test -s /tmp/.cm-diagnose-b; fs=$?; rm -f /tmp/.cm-diagnose-a /tmp/.cm-diagnose-b; echo RENAME_EXIT:$fs; echo "--- apt-get update ---"; apt-get update 2>&1; rc=$?; echo APT_UPDATE_EXIT:$rc; exit 0';try{r=await shellRun(cmd,120)}catch(e){r={out:String(e),code:1}}await dlg({title:'Diagnóstico Linux/proroot',text:'Engine: '+(NAT.prootBuild||'Build desconhecido')+'\nCódigo: '+r.code+'\n\n'+String(r.out||'').slice(-2600)+(natPackageAdvice(r.out)||'\n\nConfira os códigos RENAME_EXIT e APT_UPDATE_EXIT acima.'),skip:'Fechar'})}
async function natNoNativeNotice(){
 const missing=[];if(!SHP)missing.push('plugin Shell');if(!NAT.lib)missing.push('launcher');if(!NAT.runtime)missing.push('runtime');if(!NAT.bridge)missing.push('bridge');if(!NAT.linker)missing.push('linker');if(!NAT.loader)missing.push('stub-loader');if(!NAT.rootfs)missing.push('Ubuntu Base rootfs');
 const reason=missing.length?'Componentes ausentes no APK: '+missing.join(', ')+'.':'Linux não disponível nesta instalação.';
 await dlg({title:'Linux via proroot indisponível',text:reason+'\n\nEste runtime requer Android ARM64. Recompile pelo workflow que verifica os cinco binários e o rootfs Ubuntu. O aplicativo não tenta baixar bibliotecas executáveis diretamente durante a instalação. Os projetos continuam preservados.',btns:['Entendi']});
}
async function natInstall(){
 await natProbe();
 if(!NAT.available){await natNoNativeNotice();termR();return}
 if(NAT.ready){return natUpdatePackages()}
 if(await dlg({title:'Instalar Ubuntu Linux via proroot?',text:'Extrai o Ubuntu Base ARM64 incluído neste APK e instala ferramentas com apt-get: Git, Python, Node.js, npm, ripgrep, curl e compiladores. Precisa de internet e de espaço livre. Os arquivos dos seus projetos ficam fora do Linux e não serão apagados.',btns:['⬇ Instalar Linux','Cancelar']})!==0)return;
 dlg({title:'⏳ Instalando Linux...',text:'Preparando Ubuntu/glibc e instalando ferramentas. Não feche o aplicativo.'});
 let msg;try{
   await SHP.install();NAT.ready=true;TM.cwd='/work';
   const r=await shellRun(natPackageCommand(false),600);
   msg=(r.code?'⚠️ Ubuntu instalado, mas a instalação de algumas ferramentas falhou (exit '+r.code+'):\n':'✅ Linux pronto!\n')+r.out.slice(-1200)+natPackageAdvice(r.out);
   CM_CAPS=[];await natCaps();
 }catch(e){NAT.ready=false;msg='❌ '+e.message}
 $('#dl').hidden=true;$('#dl').innerHTML='';await dlg({title:'Instalação do Linux',text:msg,skip:'Fechar'});await natProbe();termR();
}
async function natUpdatePackages(){
 if(!NAT.ready){return natInstall()}
 if(await dlg({title:'Atualizar ferramentas Linux?',text:'Instala/atualiza apenas o conjunto de ferramentas de desenvolvimento, usando apt-get update e apt-get install. Não executa apt-get upgrade global indiscriminadamente.',btns:['Atualizar','Cancelar']})!==0)return;
 TM.log+='\n[Atualizando ferramentas Ubuntu...]\n';termR();let msg;
 try{const r=await shellRun(natPackageCommand(true),600);msg=(r.code?'Atualização terminou com exit '+r.code+'\n':'Atualização concluída.\n')+r.out+natPackageAdvice(r.out);await natCaps()}
 catch(e){msg='Falha: '+e.message}
 await dlg({title:'Atualização do Linux',text:msg.slice(-1800),skip:'Fechar'});await natProbe();termR();
}
async function natReset(){
 await natProbe();if(!SHP||!NAT.available){return natNoNativeNotice()}
 if(await dlg({title:'Resetar o Linux?',text:'Isso remove tudo que foi instalado ou alterado dentro do Ubuntu, incluindo pacotes, configurações, arquivos em /root e /tmp. Os projetos do CodeMobile não serão apagados. Depois o Ubuntu será instalado novamente com as ferramentas de desenvolvimento.',btns:['Resetar e reinstalar','Cancelar']})!==0)return;
 dlg({title:'⏳ Resetando Linux...',text:'Apagando a instalação antiga e extraindo novamente a imagem base.'});
 let msg;try{await SHP.reset();NAT.ready=false;CM_CAPS=[];TM.cwd='/work';await SHP.install();NAT.ready=true;
   const r=await shellRun(natPackageCommand(false),600);msg=(r.code?'⚠️ Linux resetado, mas alguns pacotes falharam (exit '+r.code+'):\n':'✅ Linux resetado e reinstalado.\n')+r.out.slice(-1200)+natPackageAdvice(r.out);await natCaps()
 }catch(e){NAT.ready=false;msg='❌ Falha ao resetar/reinstalar: '+e.message}
 $('#dl').hidden=true;$('#dl').innerHTML='';await dlg({title:'Reset do Linux',text:msg,skip:'Fechar'});await natProbe();termR();
}
async function natDelete(){
 await natProbe();
 if(!SHP){return natNoNativeNotice()}
 if(!NAT.ready&&!NAT.legacyAlpinePresent){await dlg({title:'Nenhuma instalação Linux',text:'Não há uma instalação Linux removível neste aplicativo. O botão não afeta os arquivos dos projetos.',btns:['OK']});return}
 if(await dlg({title:'Excluir o Linux instalado?',text:'Remove o Ubuntu instalado, seus pacotes, configurações e os arquivos criados dentro desse Linux. Os projetos do CodeMobile não serão apagados. O runtime proroot que veio empacotado dentro do APK não pode ser removido separadamente por esta tela; para removê-lo, seria necessário instalar uma variante do APK compilada sem o Linux.',btns:['🗑 Excluir Linux','Cancelar']})!==0)return;
 try{if(typeof SHP.remove==='function')await SHP.remove();else await SHP.reset();NAT.ready=false;CM_CAPS=[];TM.cwd='';TM.log='';await natProbe();TM.log=termBanner()+'Instalação Linux removida. Os projetos do CodeMobile foram preservados.\n';}
 catch(e){TM.log+='\nFalha ao excluir Linux: '+e.message+'\n'}
 termR();
}
/* ---- terminal: um só executor para o agente e para a aba Terminal ---- */
VSH.hooks.py=(f,m,i)=>pyRun(f,m,i);VSH.hooks.proj=()=>pj();VSH.hooks.get=u=>gt(u);VSH.hooks.js=c=>runHtml('<script>'+c+'<\/script>',2500);
T.push(['shell','TERMINAL: executa um comando de shell na pasta do projeto. Com o Termux ligado é um Linux real (git, python, node, npm, pip, rg, jq, curl, make, pkg install...); sem ele é o terminal embutido do app (ls cat grep rg find tree sed head tail wc sort mkdir rm mv cp, pipes, python, node). Cada chamada começa na raiz do projeto. Timeout padrão 60s',{cmd:'string',timeout:'int?'}]);ico.shell='💻';
try{PD.cmd='Comando de shell, ex: ls -la && git status'}catch(e){}
async function shellRun(cmd,to){const p=pj();
 if(real()){const pl={project:S.cur,files:p.files,cmd,timeout:Math.min(+to||60,900)},j=NAT.ready?await SHP.exec(pl):await cmApi('exec',{method:'POST',body:JSON.stringify(pl)});
  const nm=[];for(const k in j.changed){p.files[k]=j.changed[k];nm.push(k)}for(const k of j.deleted||[]){delete p.files[k];nm.push('-'+k)}
  return{out:j.out||'',code:j.code,to:j.timedOut,nm}}
 if(!vIsDir(p.files,VSH.cwd))VSH.cwd='';const r=await vsh(cmd,p.files);return{out:r.out,code:r.code,nm:VSH.dirty?['(arquivos alterados)']:[]}}
async function srvShell(a){const cmd=String(a.cmd||'').trim();if(!cmd)return'Erro: cmd vazio';
 if(S.mode=='plan')return'Modo plano: comandos bloqueados. Apresente o plano e peça aprovação.';
 const risky=/\b(rm|mv|dd|chmod|chown|sudo|kill|pkill|curl|wget)\b|git\s+(push|reset|clean)|npm\s+(publish|i(nstall)?\s+-g)|>\s*\S|\|\s*(sh|bash)/.test(cmd);
 if((S.mode=='ask'||(S.mode=='edits'&&risky))&&(await dlg({title:'Executar no terminal?',text:cmd.slice(0,400),btns:['✅ Executar','🚫 Negar']}))!==0)return'Negado: o usuário não autorizou este comando.';
 let r;try{r=await shellRun(cmd,a.timeout)}catch(e){return'Erro no terminal: '+e.message}
 if(r.nm.length){save();ui()}
 return'$ '+cmd+'\n'+r.out+(r.out&&!r.out.endsWith('\n')?'\n':'')+'[exit '+r.code+(r.to?' — TEMPO ESGOTADO':'')+']'+(real()&&r.nm.length?'\n'+r.nm.length+' arquivo(s) sincronizados: '+r.nm.slice(0,15).join(', '):'')}
/* deixa claro para o agente o que ele tem */
function shellPrompt(){const L=CM_CAPS.length?CM_CAPS.join(' '):'git python node npm pip rg jq curl';
 if(S.fast)return'\nTERMINAL: ferramenta shell '+(real()?'(Termux real: '+L+')':'(embutida: ls cat grep rg find tree sed awk jq diff cut tr xargs curl python node, git local, npm run; sem npm install/pip)')+'. Use-a em vez de supor.';
 return real()?'\nTERMINAL REAL ('+(NAT.ready?'Ubuntu Linux embutido no app':'Termux')+'): você TEM acesso a um Linux de verdade pela ferramenta shell, dentro da pasta do projeto no celular do usuário. Use como um engenheiro usaria: explorar (ls, tree, find, fd/fdfind, rg/grep, cat, head, tail, sed, awk, wc, sort, diff), git completo (status, diff, add, commit, log, branch, checkout, clone), python/pip, node/npm, jq, curl/wget, zip/unzip, make/clang. Instalados agora: '+L+'. Se faltar algo, instale com `'+(NAT.ready?'apt-get install <pacote>':'pkg install -y <pacote>')+'` (gerenciador de pacotes do sistema), `pip install` ou `npm install`. Cada chamada começa na raiz do projeto (cd não persiste: use `cd x && cmd`); pipes, && e redirecionamento funcionam. Rode testes/build/lint e confira o resultado de verdade; nunca peça ao usuário para rodar um comando que você mesmo pode rodar. Evite comandos destrutivos sem necessidade.'
 :'\nTERMINAL EMBUTIDO (sem Linux instalado): você TEM a ferramenta shell com um terminal dentro do app. Comandos: ls cat head tail wc grep rg find tree sed awk cut tr sort uniq diff jq xargs tee printf seq echo mkdir touch rm mv cp cd pwd test/[ ] basename dirname du stat base64 sha256sum curl wget date env export, python/python3 (arquivo ou -c), node (arquivo ou -e) e npm run/test/build (scripts do package.json). Funciona: pipes (|), && || ;, redirecionamento (> >>), globs (*.js), $VAR, $(...), e for/if de uma linha no começo do comando (ex.: for f in src/*.js; do wc -l $f; done). GIT LOCAL: git init/add/commit/status/diff/log/branch/checkout/reset/restore/rm funcionam de verdade num repositório guardado no projeto (sem remote: para GitHub use gh_pull/gh_push). NÃO há npm install, pip, npx nem compiladores: para isso o usuário instala o Linux completo (aba Terminal). Use o shell para explorar e verificar (rg, tree, git diff, npm test) em vez de supor.'}
/* o prompt do terminal é anexado pelo sys() do ext.js (shellPrompt) */

/* ---- aba Terminal (para você usar também) ---- */
const TM={log:'',h:[],i:0,busy:0,cwd:'',project:''};
function termBanner(){
 const env=NAT.ready?'Ubuntu Linux via proroot':CM_SRV?'Linux real via servidor Termux':NAT.available?'Linux disponível para instalar':'mini-terminal';
 return 'CodeMobile Terminal · '+env+(TM.cwd?' · '+TM.cwd:'')+'\n';
}
function linuxPanel(){
 const state=NAT.ready?['ok','Linux instalado']:NAT.available?['wait','Pronto para instalar']:NAT.plugin?['bad','Runtime/rootfs ausente no APK']:['bad','Plugin nativo não incluído'];
 const details=NAT.ready?'Ubuntu ARM64/glibc está ativo. Os comandos são executados no projeto sincronizado em /work; cada comando começa nesse diretório e a navegação é preservada pelo terminal.':NAT.available?'O APK contém proroot e a imagem Ubuntu Base. Instale o sistema para habilitar apt-get, Git, Python, Node.js e compiladores.':NAT.plugin?'Este APK está sem componentes nativos obrigatórios ou não é ARM64. Recompile o APK para adicionar o runtime e a imagem Ubuntu.':'Você pode usar o mini-terminal. Para Linux embarcado, o APK precisa do plugin Shell, os cinco binários proroot e o rootfs Ubuntu.';
 const engine=(NAT.prootBuild||'Runtime proroot não identificado').split('\n').filter(x=>x.startsWith('engine=')||x.startsWith('version='))[0]||'proroot não identificado';
 return '<div class="linux-panel"><div class="linux-head"><div><strong>Ubuntu Linux · proroot</strong><small>Ambiente ARM64/glibc isolado dos arquivos dos projetos</small></div><span class="linux-state '+state[0]+'">'+esc(state[1])+'</span></div><p>'+esc(details)+'</p><div class="linux-meta"><span>launcher: '+(NAT.lib?'incluído':'ausente')+'</span><span>runtime: '+(NAT.runtime?'incluído':'ausente')+'</span><span>bridge: '+(NAT.bridge?'incluído':'ausente')+'</span><span>linker: '+(NAT.linker?'incluído':'ausente')+'</span><span>stub-loader: '+(NAT.loader?'incluído':'ausente')+'</span><span>Ubuntu: '+(NAT.rootfs?'incluído':'ausente')+'</span></div><p class="linux-note">Motor detectado: '+esc(engine)+'</p><div class="linux-actions"><button class="p" id="tinst">'+(NAT.ready?'⬇ Instalar/atualizar ferramentas': '⬇ Instalar Linux')+'</button><button class="s" id="trefresh">↻ Atualizar status</button><button class="s" id="tdiagnose">🩺 Diagnosticar Linux</button><button class="s" id="treset">⟲ Resetar Linux</button><button class="s danger" id="tdelete">🗑 Excluir Linux</button></div><small class="linux-note">Usa Ubuntu Base e apt-get. Resetar remove também a instalação Alpine antiga guardada pelo app; seus projetos são preservados. Runtime proroot v1.2.8 por coderredlab: binários originais, licença proprietária, fornecidos sem modificações; detalhes em THIRD_PARTY_NOTICES.</small></div>';
}
function termR(){if(TM.project!==S.cur){TM.project=S.cur;TM.cwd=NAT.ready?'/work':''}if(!TM.log)TM.log=termBanner();const t=$('#term');
 t.innerHTML=linuxPanel()+'<pre id="tout" aria-live="polite">'+esc(TM.log)+'</pre><div class="trow"><span>'+(TM.cwd?'# '+esc(TM.cwd):'$')+'</span><input id="tin" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="pwd, ls -la, apt-get install git, python3…" '+(TM.busy?'disabled':'')+'><button class="p" id="tgo" '+(TM.busy?'disabled':'')+'>↵</button></div><div class="r" id="tch">'+['↑','pwd','ls -la','tree','git status','python3 --version','apt-get install -y git','clear'].map(c=>'<span class="ch" data-c="'+esc(c)+'">'+esc(c)+'</span>').join('')+'</div>';
 const o=$('#tout');o.scrollTop=1e9}
function shellQuote(s){return "'"+String(s).replace(/'/g,"'\\''")+"'"}
async function termExec(cmd){
 cmd=cmd.trim();if(!cmd||TM.busy)return;
 if(cmd==='clear'){TM.log=termBanner();return termR()}
 if(cmd==='exit'&&!real()){TM.log+='mini-terminal não mantém uma sessão de shell real.\n';return termR()}
 TM.h.push(cmd);TM.i=TM.h.length;TM.busy=1;TM.log+='$ '+cmd+'\n';termR();let r;
 try{
   if(real()){
     // Mantém cwd entre chamadas apesar de cada execução Proot ser um processo novo.
     const marker='__CM_TERM_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)+'__';
     let wrapped=cmd+'\n__cm_code=$?\nprintf "\\n'+marker+'EXIT:%s\\n" "$__cm_code"\nprintf "'+marker+'PWD:"\npwd\n';
     if(TM.cwd)wrapped='cd '+shellQuote(TM.cwd)+' || exit 125\n'+wrapped;
     r=await shellRun(wrapped,120);
     const at=(r.out||'').indexOf(marker);
     if(at>=0){const visible=r.out.slice(0,at);const meta=r.out.slice(at+marker.length);const ex=meta.match(/EXIT:(-?\d+)/);const pw=meta.match(new RegExp(marker+'PWD:([^\\r\\n]*)'));if(ex&&pw){r.code=Number(ex[1]);TM.cwd=pw[1].trim()||TM.cwd;r.out=visible}else r.out=visible}
     else if(cmd==='exit'){TM.cwd='';}
   } else {
     if(/^cd(?:\s|$)/.test(cmd)){
       const rcd=await vsh(cmd,pj().files);r= {out:rcd.out,code:rcd.code,nm:VSH.dirty?['(arquivos alterados)']:[]};
     }else r=await shellRun(cmd,120);
   }
 }catch(e){r={out:'erro: '+e.message+'\n',code:1,nm:[]}}
 TM.log+=(r.out||'')+((r.out||'')&&!r.out.endsWith('\n')?'\n':'')+(r.code?'[exit '+r.code+']\n':'');TM.log=TM.log.slice(-30000);TM.busy=0;if(r.nm&&r.nm.length){save();ui()}termR();const inp=$('#tin');if(inp)inp.focus();
}
$('#term').addEventListener('click',async e=>{
 const c=e.target.closest('[data-c]');if(c){const v=c.dataset.c;if(v==='↑'){if(TM.h.length){TM.i=Math.max(0,TM.i-1);$('#tin').value=TM.h[TM.i]||''}return}return termExec(v)}
 if(e.target.id==='tgo')return termExec($('#tin').value);
 if(e.target.id==='tinst')return natInstall();
 if(e.target.id==='trefresh'){e.target.disabled=true;await natProbe();termR();return}
 if(e.target.id==='tdiagnose')return natDiagnose();
 if(e.target.id==='treset')return natReset();
 if(e.target.id==='tdelete')return natDelete();
});
$('#term').addEventListener('keydown',e=>{
 if(e.target.id!=='tin')return;
 if(e.key==='Enter'){e.preventDefault();termExec(e.target.value);return}
 if(e.key==='ArrowUp'){e.preventDefault();if(TM.h.length){TM.i=Math.max(0,TM.i-1);e.target.value=TM.h[TM.i]||''}return}
 if(e.key==='ArrowDown'){e.preventDefault();TM.i=Math.min(TM.h.length,TM.i+1);e.target.value=TM.h[TM.i]||''}
});
$$('nav button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.t==='term'){termR();natProbe().then(()=>{if($('#term').classList.contains('on'))termR()})}}));

/* ---- várias conversas por projeto (drawer estilo Claude) ---- */
function chatsInit(p){if(!p.chats){p.chats=[{n:'Novo chat'}];p.cc=0}}
function chatSwitch(i){if(busy)return alert('Aguarde a tarefa terminar');const p=pj();chatsInit(p);if(i==p.cc||!p.chats[i])return;const o=p.chats[p.cc];o.hist=p.hist;o.todos=p.todos;const n=p.chats[i];p.hist=n.hist||[];p.todos=n.todos||[];delete n.hist;delete n.todos;p.cc=i;save();ui()}
function chatNew(){if(busy)return alert('Aguarde a tarefa terminar');const p=pj();chatsInit(p);if(!p.hist.length&&p.chats.length&&p.chats[p.cc].n=='Novo chat')return;p.chats.push({n:'Novo chat',hist:[],todos:[]});chatSwitch(p.chats.length-1)}
function chatRen(){const p=pj();chatsInit(p);const n=prompt('Novo nome da conversa',p.chats[p.cc].n);if(n&&n.trim()){p.chats[p.cc].n=n.trim().slice(0,40);save();ui()}}
function chatDel(){if(busy)return alert('Aguarde a tarefa terminar');const p=pj();chatsInit(p);if(p.chats.length<2){p.hist=[];p.todos=[];p.chats[0].n='Novo chat';save();return ui()}if(!confirm('Apagar a conversa "'+p.chats[p.cc].n+'"? Os arquivos do projeto não são afetados.'))return;p.chats.splice(p.cc,1);const k=Math.max(0,p.cc-1),n=p.chats[k];p.cc=k;p.hist=n.hist||[];p.todos=n.todos||[];delete n.hist;delete n.todos;save();ui()}
const chatLen=(p,i)=>((i==p.cc?p.hist:p.chats[i].hist)||[]).filter(m=>m.role=='user'&&m.text[0]!='[').length;
function drawerR(){const p=pj();chatsInit(p);const q=(($('#dsq')||{}).value||'').toLowerCase();
 $('#dlist').innerHTML=p.chats.map((c,i)=>({c,i})).filter(x=>!q||x.c.n.toLowerCase().includes(q)).reverse().map(({c,i})=>'<div class="cr'+(i==p.cc?' on':'')+'" data-c="'+i+'"><span class="n">'+esc(c.n)+'</span><small>'+chatLen(p,i)+'</small>'+(i==p.cc?'<span class="ca" data-a="ren">✏️</span><span class="ca" data-a="del">🗑</span>':'')+'</div>').join('')||'<div style="color:var(--m);padding:8px">Nenhuma conversa</div>'}
function chatMenu(open=true){const d=$('#dr');if(!open){d.hidden=true;return}if(typeof menu=='function')menu(1);ui();drawerR();d.hidden=false}
$('#dr').addEventListener('click',e=>{const t=e.target.closest('[data-c],[data-a],.bk');if(!t)return;
 if(t.classList.contains('bk')||t.dataset.a=='close')return chatMenu(false);
 if(t.dataset.a=='new'){chatNew();return chatMenu(false)}if(t.dataset.a=='ren'){chatRen();return drawerR()}if(t.dataset.a=='del'){chatDel();return drawerR()}
 if(t.dataset.a=='proj'){chatMenu(false);return newP()}if(t.dataset.a=='cfg'){chatMenu(false);return $$('nav button')[3].click()}
 if(t.dataset.c!=null){chatSwitch(+t.dataset.c);chatMenu(false)}});
$('#dsq').addEventListener('input',drawerR);
$('#ps').addEventListener('change',()=>{drawerR()});
/* título da conversa a partir do 1º pedido */
const _run=run;run=function(t){const p=pj();chatsInit(p);if(t!=null&&!p.hist.some(m=>m.role=='user')&&/^(Conversa \d+|Novo chat)$/.test(p.chats[p.cc].n)){const n=String(t).split('\n\n[')[0].replace(/\s+/g,' ').trim().slice(0,32);if(n&&n[0]!='/')p.chats[p.cc].n=n}return _run(t)};
function ttlR(){const p=pj();chatsInit(p);$('#ttl').innerHTML='<b>'+esc(p.chats[p.cc].n)+'</b><small>'+esc(S.cur)+'</small>'}
const _ui=ui;ui=function(){_ui();ttlR()};
function welcomeH(){const h=new Date().getHours(),g=h<5?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';return'<div class="wl"><div class="lg">✻</div><h1>'+g+'</h1><p>O que vamos construir hoje?</p></div>'}
function cmMenu(){const p=pj();chatsInit(p);return[['💬','Conversas: '+p.chats[p.cc].n,'Abrir a lista de conversas e criar uma nova',chatMenu],
 ['💻','Terminal: '+(NAT.ready?'Linux embutido':CM_SRV?'Termux (real)':NAT.available?'mini (instale o Linux)':'mini-terminal'),NAT.ready?'Ubuntu no app: git, python, node, rg, jq... (apt-get install)':NAT.available?'Toque para instalar o Linux completo dentro do app':CM_SRV?'Linux real: git, python, node, rg, jq...':'Funciona sem servidor; git/npm/pip só no Linux completo',async()=>{if(NAT.available&&!NAT.ready)return natInstall();if(NAT.ready)return alert('Linux embutido ativo: '+CM_CAPS.join(' '));const ok=await cmProbe();alert(ok?'Conectado ao Termux: '+CM_CAPS.join(' '):'Mini-terminal ativo (sem git/npm/pip). O APK com Linux embutido traz tudo dentro do app.')}]]}
/* comandos extras (/init e /walkthrough) */
if(S.cmds!=null&&!/^init\s*=/m.test(S.cmds))S.cmds+='\ninit = Explore o projeto (use o shell: ls, tree, rg) e crie ou atualize o AGENTS.md na raiz: visão geral, estrutura de pastas, comandos de build/teste, convenções e armadilhas. Máximo 60 linhas, direto ao ponto. $ARGS\nwalkthrough = Escreva WALKTHROUGH.md resumindo o que foi feito nesta conversa: plano, arquivos alterados, como testar e pendências. $ARGS';
/* estado em disco (sem chaves de API nem token do GitHub) */
let _st=0;function cmSync(){if(!CM_SRV)return;clearTimeout(_st);_st=setTimeout(()=>{try{const{keys,gh,mcp,...rest}=S,ts=Date.now();localStorage.setItem('cm2ts',ts);cmApi('state',{method:'PUT',body:JSON.stringify({ts,state:rest})}).catch(()=>{})}catch(e){}},2500)}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
if(CM_SRV&&!CM_CAP)cmCaps();
if(CM_CAP){natProbe().then(()=>ui());cmProbe();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!CM_SRV)cmProbe()})}
ui();
