/* oc.js — recursos inspirados no opencode: apply_patch, glob, regras de permissão (codemobile.json) e instruções por pasta */
T.push(['apply_patch','Edita VÁRIOS arquivos de uma vez com um patch (formato Codex/opencode). Estrutura: "*** Begin Patch"; blocos "*** Add File: caminho" (todas as linhas com +), "*** Delete File: caminho" ou "*** Update File: caminho" (opcional "*** Move to: novo"), com trechos iniciados por "@@ linha de contexto" e linhas " contexto", "-removida", "+adicionada"; termina com "*** End Patch". Tudo é validado antes: se algum trecho não for achado, NADA é alterado',{patch:'string'}],
 ['glob','Procura arquivos do projeto por padrão glob (ex.: src/**/*.js, *.css, **/*.{html,js}). Sem "/" no padrão, casa pelo nome em qualquer pasta',{pattern:'string'}]);
W.push('apply_patch');GRP.write.push('apply_patch');RO.push('glob');SUB.push('glob');ico.apply_patch='🩹';ico.glob='🔎';
Object.assign(PD,{patch:'Texto do patch, de "*** Begin Patch" até "*** End Patch"',pattern:'Padrão glob, ex.: src/**/*.js'});
const OCSEEN=new Map(),OCREAD=['read_file','write_file','edit_file','multi_edit','append_file','apply_patch'];
{const _ex=exec;exec=async function(n,a){a=a||{};const F=pj().files;
 const paths=n=='apply_patch'?OC.patchPaths(a.patch):(['read_file','write_file','append_file','edit_file','multi_edit','delete_file','move_file'].includes(n)&&a.path?[String(a.path).replace(/^\.?\/+/,'')]:[]).concat(n=='move_file'&&a.to?[String(a.to).replace(/^\.?\/+/,'')]:[]);
 for(const p of paths){const kind=n=='read_file'?'read':'edit',r=OC.permRule(F,kind,p);
  if(r=='deny')return'Bloqueado pela regra de permissão do usuário ('+kind+' '+p+'). As regras ficam em codemobile.json.';
  if((r=='ask'||(p=='codemobile.json'&&kind=='edit'))&&S.mode!='plan'&&(await dlg({title:'Permitir?',text:n+' '+p,btns:['✅ Permitir','🚫 Negar']}))!==0)return'Negado pelo usuário.'}
 let r;
 if(n=='glob'){if(!a.pattern)return'Erro: parâmetro "pattern" ausente';const l=OC.glob(F,String(a.pattern));r=l.length?l.slice(0,200).join('\n')+(l.length>200?'\n… +'+(l.length-200):''):'Nenhum arquivo casa com o padrão.'}
 else if(n=='apply_patch'){if(a.patch==null||a.patch==='')return'Erro: parâmetro "patch" ausente';if(S.mode=='plan')return'Modo plano: editar arquivos fica bloqueado. Apresente o plano e peça aprovação.';if((S.perm||{}).write=='deny')return'Bloqueado pelas regras de permissão do usuário (criar/editar arquivos).';
  if(S.mode=='ask'&&(await dlg({title:'Aplicar patch?',text:paths.slice(0,8).join('\n'),btns:['✅ Permitir','🚫 Negar']}))!==0)return'Negado pelo usuário.';
  let x;try{x=OC.applyPatch(F,a.patch)}catch(e){return'Erro no patch (nada foi alterado): '+e.message}
  for(const c of x.changes){if(c.after==null)delete F[c.path];else F[c.path]=c.after}save();ui();r='Patch aplicado:\n'+x.summary.join('\n')}
 else r=await _ex(n,a);
 if(typeof r=='string'&&paths.length&&OCREAD.includes(n)&&!/^(Erro|Bloqueado|Negado)/.test(r)){const p=pj(),k=S.cur+'#'+(p.cc||0);if(!p.hist.length)OCSEEN.delete(k);if(!OCSEEN.has(k))OCSEEN.set(k,new Set());
  const add=paths.flatMap(q=>OC.instrFor(F,q,OCSEEN.get(k)));if(add.length)r+='\n\n'+add.map(([f,t])=>'[Instruções de '+f+' — valem para esta pasta]\n'+t.slice(0,3000)).join('\n\n')}
 return r}}
/* regras de permissão também valem para o terminal */
if(typeof srvShell=='function'){const _ss=srvShell;srvShell=async function(a){const c=String((a||{}).cmd||''),r=OC.shellPerm(pj().files,c);if(r=='deny')return'Bloqueado pela regra de permissão do usuário (shell). As regras ficam em codemobile.json.';
 const old=S.mode;if(old!='plan'&&r)S.mode=r=='allow'?'auto':'ask';try{return await _ss(a)}finally{S.mode=old}}}
{const _s=sys;sys=function(){const b=_s();return CHATONLY?b:b+'\nEDIÇÃO: para mudar vários trechos ou arquivos de uma vez use apply_patch (lê o arquivo antes e copie o contexto exato); para achar arquivos por padrão use glob. Regras de permissão do usuário ficam em codemobile.json (não as altere sem pedir). AGENTS.md/CLAUDE.md de subpastas são anexados automaticamente quando você lê ou edita arquivos nelas.'}}
