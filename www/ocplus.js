/*
 * CodeMobile OpenCode-inspired extension layer.
 * Independent implementation of documented agent patterns; this file does not
 * bundle or execute the OpenCode runtime. See THIRD_PARTY_NOTICES.md.
 */
if (typeof S !== 'undefined') {
  if (!['build', 'plan', 'explore', 'review'].includes(S.agentProfile)) S.agentProfile = 'build';
}

const OCX_PROFILE = {
  build: 'PERFIL BUILD: implemente a tarefa com mudanças focadas; examine o projeto primeiro, use patches atômicos para mudanças relacionadas, rode verificações relevantes e confira o diff antes de terminar.',
  plan: 'PERFIL PLAN: somente investigação e planejamento. Não edite arquivos, não execute comandos de shell e não altere GitHub/MCP. Entregue um plano com etapas, arquivos afetados, riscos e critérios verificáveis. Use todo_write para registrar as etapas.',
  explore: 'PERFIL EXPLORE: explorador rápido, somente leitura. Mapeie a arquitetura, procure símbolos e leia apenas os trechos necessários. Não execute código/comandos, não edite nem crie arquivos. Responda com achados, caminhos e evidências.',
  review: 'PERFIL REVIEW: revisão independente e baseada em evidências. Priorize erros concretos, regressões, segurança, testes e diferenças desta tarefa. Não modifique arquivos; rode apenas verificações já declaradas pelo projeto e permitidas pelo usuário. Não invente problemas sem evidência.'
};
const OCX_READONLY_TOOLS = new Set([
  'think', 'list_files', 'read_file', 'grep', 'todo_write', 'run_js', 'run_file',
  'check_preview', 'web_fetch', 'web_search', 'spawn_agent', 'ask_user', 'show_diff',
  'glob', 'use_skill', 'project_map', 'read_many', 'find_references', 'diff_file',
  'project_diagnostics', 'dependency_report', 'context_report', 'smart_search', 'symbol_index', 'instruction_report', 'change_report', 'verify_workspace', 'security_audit', 'test_discovery', 'impact_analysis', 'lsp'
]);
const OCX_EXPLORE_TOOLS = new Set([
  'think', 'list_files', 'read_file', 'grep', 'todo_write', 'web_fetch', 'web_search',
  'spawn_agent', 'ask_user', 'show_diff', 'glob', 'use_skill', 'project_map', 'read_many',
  'find_references', 'diff_file', 'project_diagnostics', 'dependency_report', 'context_report', 'smart_search', 'symbol_index', 'instruction_report', 'change_report', 'verify_workspace', 'security_audit', 'test_discovery', 'impact_analysis', 'lsp'
]);
const OCX_REVIEW_TOOLS = new Set([...OCX_READONLY_TOOLS, 'run_project_checks']);
const OCX_EXECUTION_TOOLS = new Set(['run_js', 'run_file', 'check_preview', 'shell', 'run_project_checks']);
const OCX_WRITE_TOOLS = new Set(['write_file', 'append_file', 'edit_file', 'multi_edit', 'apply_patch', 'delete_file', 'move_file']);
const OCX_SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|id_rsa[^/]*|id_ed25519[^/]*|[^/]+\.(?:pem|key|p12|pfx))$/i;
const OCX_LIMIT = (v, min, max, fallback) => Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.floor(+v))) : fallback;
const OCX_TRIM_PATH = p => {
  p = String(p == null ? '' : p).trim().replace(/^\.\//, '');
  if (!p || p.startsWith('/') || p.includes('\\') || p.includes('\0') || /(^|\/)\.\.(\/|$)/.test(p)) return '';
  return p;
};
const OCX_IS_SECRET = p => OCX_SECRET_PATH.test(String(p || '')) || (typeof OC !== 'undefined' && OC.permRule && OC.permRule(pj().files, 'read', String(p)) === 'deny');
const OCX_IGNORE = /(^|\/)(?:node_modules|\.git|dist|build|coverage|\.next|\.cache)\//;

function ocxProjectMap(files) {
  const names = Object.keys(files || {}).filter(p => !OCX_IGNORE.test(p)).sort();
  const extCount = Object.create(null);
  const classify = ext => ({
    '.js':'JavaScript', '.mjs':'JavaScript', '.cjs':'JavaScript', '.jsx':'JavaScript/React',
    '.ts':'TypeScript', '.tsx':'TypeScript/React', '.py':'Python', '.java':'Java', '.kt':'Kotlin',
    '.html':'HTML', '.css':'CSS', '.scss':'SCSS', '.json':'JSON/config', '.md':'Markdown',
    '.go':'Go', '.rs':'Rust', '.c':'C', '.h':'C/C++ header', '.cpp':'C++', '.cs':'C#',
    '.php':'PHP', '.rb':'Ruby', '.sh':'Shell', '.yml':'YAML', '.yaml':'YAML', '.xml':'XML',
    '.gd':'GDScript', '.lua':'Lua', '.sql':'SQL', '.vue':'Vue', '.svelte':'Svelte'
  }[ext] || 'Outros');
  for (const p of names) {
    const m = /\.[^.\/]+$/.exec(p), label = classify(m ? m[0].toLowerCase() : '');
    extCount[label] = (extCount[label] || 0) + 1;
  }
  const count = (re) => names.filter(p => re.test(p)).length;
  const tests = names.filter(p => /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\.[^.]+$/i.test(p));
  const configs = names.filter(p => /(^|\/)(package\.json|tsconfig[^/]*\.json|vite\.config\.[^/]+|webpack\.config\.[^/]+|pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|composer\.json|Gemfile|Makefile|Dockerfile|\.github\/workflows\/[^/]+)$/i.test(p));
  const docs = names.filter(p => /(^|\/)(README(?:\.[^/]*)?|AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|ARCHITECTURE\.md)$/i.test(p));
  const entries = names.filter(p => /^(index\.html|index\.[jt]sx?|main\.[jt]sx?|src\/(main|index)\.[jt]sx?|src\/main\.(py|java|kt)|main\.(py|java|go|rs)|app\.(py|js|ts)|Program\.cs)$/i.test(p));
  const pkg = (() => { try { return files['package.json'] ? JSON.parse(files['package.json']) : null; } catch (e) { return null; } })();
  const out = [
    'MAPA DO PROJETO',
    'Arquivos de texto/ativos listados: ' + names.length,
    'Linguagens/tipos: ' + Object.entries(extCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+': '+v).join(' · '),
    'Entradas prováveis: ' + (entries.join(', ') || '(não identificadas automaticamente)'),
    'Testes/pastas de testes: ' + tests.length + (tests.length ? ' — ' + tests.slice(0,18).join(', ') : ''),
    'Documentação/instruções: ' + (docs.join(', ') || '(nenhuma README/AGENTS/CLAUDE encontrada)'),
    'Configurações/build: ' + (configs.slice(0,35).join(', ') || '(nenhuma conhecida encontrada)')
  ];
  if (pkg) {
    out.push('Pacote: ' + String(pkg.name || '(sem nome)') + (pkg.version ? '@' + pkg.version : ''));
    if (pkg.scripts && typeof pkg.scripts === 'object') out.push('Scripts package.json: ' + Object.entries(pkg.scripts).map(([k,v])=>k+'='+String(v).slice(0,100)).slice(0,12).join(' | '));
  }
  out.push('Árvore (máx. 100 caminhos):\n' + names.slice(0,100).map(p => '• ' + p + (String(files[p] || '').length > 100000 ? ' [grande]' : '')).join('\n'));
  if (names.length > 100) out.push('… mais ' + (names.length - 100) + ' arquivos omitidos; use glob para filtrar.');
  return out.join('\n');
}

function ocxDependencyReport(files) {
  const out = ['RELATÓRIO DE DEPENDÊNCIAS'];
  const addJson = (path) => {
    if (!files[path] || OCX_IS_SECRET(path)) return;
    let j; try { j = JSON.parse(files[path]); } catch (e) { out.push(path + ': JSON inválido — ' + e.message); return; }
    out.push(path + (j.name ? ' — ' + j.name + (j.version ? '@' + j.version : '') : ''));
    for (const key of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) {
      const deps = j[key]; if (!deps || typeof deps !== 'object') continue;
      const list = Object.entries(deps).map(([k,v])=>k+'@'+String(v)).sort();
      out.push('  ' + key + ' (' + list.length + '): ' + (list.slice(0,35).join(', ') || '(nenhuma)') + (list.length>35?' …':'') );
    }
    if (j.scripts) out.push('  scripts: ' + Object.keys(j.scripts).join(', '));
  };
  addJson('package.json'); addJson('composer.json');
  for (const path of Object.keys(files).sort()) {
    if (OCX_IS_SECRET(path)) continue;
    const text = String(files[path] || '');
    if (/^([^/]*\/)?requirements[^/]*\.txt$/i.test(path)) {
      const deps = text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#') && !x.startsWith('-'));
      out.push(path + ' (' + deps.length + '): ' + deps.slice(0,50).join(', ') + (deps.length>50?' …':''));
    } else if (/^([^/]*\/)?Cargo\.toml$/i.test(path)) {
      const deps = text.split(/\r?\n/).filter(x=>/^\s*[A-Za-z0-9_-]+\s*=/.test(x) && !/^\s*(version|edition|name)\s*=/.test(x)).map(x=>x.trim());
      out.push(path + ' dependencies: ' + (deps.slice(0,50).join(', ') || '(verifique seções [dependencies])'));
    } else if (/^([^/]*\/)?go\.mod$/i.test(path)) {
      out.push(path + ': ' + text.split(/\r?\n/).filter(x=>/^\s*(require\s+|[\w./-]+\s+v\d)/.test(x)).slice(0,50).join('; '));
    } else if (/^([^/]*\/)?pyproject\.toml$/i.test(path)) {
      const deps = text.split(/\r?\n/).filter(x=>/^\s*(dependencies\s*=|["'][^"']+["']\s*[=<>!~])/.test(x)).slice(0,40);
      if (deps.length) out.push(path + ':\n  ' + deps.join('\n  '));
    } else if (/^([^/]*\/)?pom\.xml$/i.test(path)) {
      const deps = [...text.matchAll(/<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g)].map(m=>m[1]+':'+m[2]+'@'+m[3]);
      if (deps.length) out.push(path + ': ' + deps.slice(0,40).join(', '));
    }
  }
  if (out.length === 1) out.push('Nenhum manifesto de dependências conhecido foi encontrado.');
  return out.join('\n').slice(0,12000);
}

function ocxProjectDiagnostics(files) {
  const names = Object.keys(files || {}), issues = [], add = (sev, file, msg) => issues.push({sev,file,msg});
  for (const p of names) {
    if (OCX_IGNORE.test(p) || OCX_IS_SECRET(p)) continue;
    const s = String(files[p] == null ? '' : files[p]);
    if (/\.json$/i.test(p)) {
      try { JSON.parse(s); } catch (e) { add('ERRO',p,'JSON inválido: '+e.message); }
    }
    if (/\.html?$/i.test(p)) {
      const ids = new Set();
      for (const m of s.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)) {
        if (ids.has(m[2])) add('AVISO',p,'id HTML duplicado: '+m[2]); ids.add(m[2]);
      }
      for (const m of s.matchAll(/<(?:script|img|source|video|audio|link|iframe)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
        let ref = m[2].trim();
        if (!ref || /^(?:https?:|data:|blob:|\/\/|#|mailto:|tel:|javascript:|\{\{|\$\{|<%)/i.test(ref)) continue;
        ref = ref.split(/[?#]/,1)[0]; try { ref = decodeURIComponent(ref); } catch(e) {}
        if (!ref || /\{\{|\$\{|<%/.test(ref)) continue;
        let target = ref.startsWith('/') ? ref.slice(1) : (p.includes('/') ? p.slice(0,p.lastIndexOf('/')+1) : '') + ref;
        const parts=[]; let bad=false; for (const bit of target.split('/')) { if (bit==='.'||bit==='') continue; if(bit==='..'){ if(!parts.length){bad=true;break;} parts.pop(); } else parts.push(bit); }
        target=parts.join('/');
        if (!bad && !(target in files)) add('AVISO',p,'referência local não encontrada: '+ref+' → '+target);
      }
    }
    if (/\.css$/i.test(p)) for (const m of s.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
      let ref=m[2].trim(); if(!ref||/^(?:https?:|data:|blob:|\/\/|#|var\()/i.test(ref)) continue;
      ref=ref.split(/[?#]/,1)[0]; let target=ref.startsWith('/')?ref.slice(1):(p.includes('/')?p.slice(0,p.lastIndexOf('/')+1):'')+ref;
      const parts=[];let bad=false;for(const bit of target.split('/')){if(bit==='.'||bit==='')continue;if(bit==='..'){if(!parts.length){bad=true;break;}parts.pop();}else parts.push(bit)}
      target=parts.join('/');if(!bad&&!(target in files))add('AVISO',p,'asset CSS não encontrado: '+ref+' → '+target);
    }
  }
  if (!names.length) return 'Diagnóstico: o projeto está vazio.';
  if (!issues.length) return '✅ Diagnóstico estático: nenhum problema evidente nas referências HTML/CSS nem nos arquivos JSON verificados. Isto não substitui execução de testes.';
  return 'DIAGNÓSTICO ESTÁTICO — '+issues.length+' achado(s)\n'+issues.slice(0,80).map((x,i)=>(i+1)+'. ['+x.sev+'] '+x.file+' — '+x.msg).join('\n')+(issues.length>80?'\n… '+(issues.length-80)+' achados omitidos.':'')+'\n\nObservação: confirme os avisos antes de alterar; alguns caminhos podem ser gerados dinamicamente.';
}

function ocxDiffFiles(files, pathFilter) {
  const p = pj(), cp = p.cps && p.cps[p.cps.length-1];
  if (!cp || !cp.f) return 'Não há checkpoint anterior a esta tarefa para comparar.';
  const names = [...new Set([...Object.keys(cp.f), ...Object.keys(files)])]
    .filter(k => cp.f[k] !== files[k])
    .filter(k => !pathFilter || k === pathFilter)
    .sort();
  if (pathFilter && !names.length) return 'Nenhuma alteração em ' + pathFilter + ' desde o checkpoint.';
  if (!names.length) return 'Nenhuma alteração desde o checkpoint.';
  const out=[]; let total=0;
  for (const path of names.slice(0,8)) {
    const before = String(cp.f[path] == null ? '' : cp.f[path]);
    const after = String(files[path] == null ? '' : files[path]);
    const kind = !(path in cp.f) ? 'novo' : !(path in files) ? 'apagado' : 'editado';
    out.push('\n### '+path+' ('+kind+')');
    if (Math.max(before.length,after.length)>120000) { out.push('[diff omitido: arquivo maior que 120 KB]'); continue; }
    const diff = typeof dl === 'function' ? dl(before,after) : null;
    if (!diff) { out.push('[motor de diff indisponível]'); continue; }
    let oldN=1,newN=1;const rows=diff.map(([mark,line])=>{const r={mark,line,oldN:mark==='+'?null:oldN,newN:mark==='-'?null:newN};if(mark!=='+' )oldN++;if(mark!=='-')newN++;return r;});
    const changed=[];for(let i=0;i<rows.length;i++)if(rows[i].mark!==' ')changed.push(i);
    if (!changed.length) { out.push('(sem diferenças textuais)'); continue; }
    const ranges=[];for(const i of changed){const a=Math.max(0,i-2),b=Math.min(rows.length-1,i+2),last=ranges[ranges.length-1];if(last&&a<=last[1]+1)last[1]=Math.max(last[1],b);else ranges.push([a,b]);}
    for(const [a,b] of ranges){out.push('@@');for(let i=a;i<=b;i++){const r=rows[i];if(r.mark===' ')out.push('  '+String(r.oldN).padStart(4,' ')+'/'+String(r.newN).padStart(4,' ')+' '+r.line);else if(r.mark==='-')out.push('- '+String(r.oldN).padStart(4,' ')+' | '+r.line);else out.push('+ '+String(r.newN).padStart(4,' ')+' | '+r.line);}}
    total+=out.join('\n').length;if(total>10000)break;
  }
  if(names.length>8)out.push('\n… mais '+(names.length-8)+' arquivos; use diff_file com path para um diff específico.');
  return out.join('\n').slice(0,11000);
}


/* Token-aware helpers inspired by OpenCode's context compaction and bounded tool outputs.
 * Estimates are intentionally approximate: exact tokenization depends on the provider/model. */
function ocxEstimateTokens(value) {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch (e) { text = String(value); }
  return Math.ceil(String(text || '').length / 4);
}
function ocxClip(value, maxChars, label) {
  const text = String(value == null ? '' : value);
  const cap = OCX_LIMIT(maxChars, 300, 30000, 8000);
  if (text.length <= cap) return text;
  const head = Math.max(120, Math.floor(cap * 0.68));
  const tail = Math.max(100, cap - head - 100);
  const removed = text.length - head - tail;
  return text.slice(0, head) + '\n\n[… ' + (label || 'saída') + ' reduzida para poupar contexto: ' + removed + ' caracteres omitidos; estimativa de ' + ocxEstimateTokens(removed) + ' tokens …]\n\n' + text.slice(-tail);
}
function ocxContextReport(history) {
  const h = Array.isArray(history) ? history : (pj().hist || []);
  const files = pj().files || {};
  let chars = 0, toolChars = 0;
  const roles = Object.create(null), largest = [];
  for (let i = 0; i < h.length; i++) {
    const m = h[i] || {};
    let n = 0;
    try { n = JSON.stringify(m).length; } catch (e) { n = String(m.text || m.result || '').length; }
    chars += n;
    roles[m.role || 'unknown'] = (roles[m.role || 'unknown'] || 0) + 1;
    if (m.role === 'tool') toolChars += String(m.result || '').length;
    if (n > 1000) largest.push({ i: i + 1, role: m.role || '?', tool: m.name || '', chars: n });
  }
  largest.sort((a,b)=>b.chars-a.chars);
  const fileEntries = Object.entries(files).filter(([path])=>!OCX_IS_SECRET(path) && !OCX_IGNORE.test(path));
  const projectChars = fileEntries.reduce((n,[,content])=>n+String(content == null ? '' : content).length,0);
  const toolSchemaChars = (typeof T !== 'undefined' ? T : []).reduce((n,t)=>n+String(t[0]||'').length+String(t[1]||'').length+String(t[2]||'').length,0);
  const mode = (typeof S !== 'undefined' && S.ocxToolMode) || 'auto';
  return [
    'RELATÓRIO DE CONTEXTO (estimativa, não medição do provedor)',
    'Histórico: '+h.length+' mensagens · '+chars+' caracteres JSON · ~'+ocxEstimateTokens(chars)+' tokens estimados',
    'Saídas de ferramentas no histórico: '+toolChars+' caracteres (~'+ocxEstimateTokens(toolChars)+' tokens estimados)',
    'Distribuição: '+Object.entries(roles).map(([k,v])=>k+'='+v).join(' · '),
    'Projeto: '+fileEntries.length+' arquivos não ignorados/protegidos · '+projectChars+' caracteres (~'+ocxEstimateTokens(projectChars)+' tokens se lidos integralmente)',
    'Descrições/esquemas de ferramentas registados: ~'+ocxEstimateTokens(toolSchemaChars)+' tokens antes de o filtro por intenção reduzir ferramentas.',
    'Modo de ferramentas: '+mode+' · modo rápido: '+(S.fast?'sim':'não')+' · modelo: '+String((S.model||{})[S.prov]||'(não identificado)')+' · janela exata: desconhecida pelo app.',
    'Mensagens maiores: '+(largest.slice(0,5).map(x=>'#'+x.i+' '+x.role+(x.tool?' / '+x.tool:'')+' '+x.chars+' chars').join(' | ')||'(nenhuma acima de 1000 caracteres)'),
    'Dica: use smart_search/find_references antes de ler arquivos completos; read_many para agrupar leituras; diff_file/change_report depois de editar. O valor real pode variar porque cada modelo conta tokens de forma diferente.'
  ].join('\n');
}
function ocxSmartSearch(files, args) {
  const pattern = String(args.pattern || '').trim();
  if (!pattern) return 'Informe pattern.';
  if (pattern.length > 300) return 'Padrão longo demais (máx. 300 caracteres).';
  const mode = String(args.match || 'literal').toLowerCase();
  let re;
  try {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    re = mode === 'regex' ? new RegExp(pattern, 'i') : new RegExp(escaped, 'i');
  } catch (e) { return 'Padrão de busca inválido: ' + e.message; }
  let candidates = Object.keys(files || {}).filter(path=>!OCX_IGNORE.test(path)&&!OCX_IS_SECRET(path));
  if (args.path_glob) {
    if (typeof OC === 'undefined' || !OC.glob) return 'Glob indisponível nesta execução.';
    const selected = new Set(OC.glob(files, String(args.path_glob)));
    candidates = candidates.filter(path=>selected.has(path));
  }
  const limit = OCX_LIMIT(args.max_hits, 1, 100, 40), context = OCX_LIMIT(args.context_lines, 0, 3, 0);
  const hits = []; let total = 0;
  for (const path of candidates.sort()) {
    const body = String(files[path] == null ? '' : files[path]);
    if (body.length > 1_000_000 || /^(?:data:image\/|\[binary:)/i.test(body)) continue;
    const lines = body.split('\n');
    for (let i=0;i<lines.length;i++) {
      re.lastIndex = 0;
      if (!re.test(lines[i])) continue;
      total++;
      if (hits.length < limit) {
        const a = Math.max(0,i-context), b = Math.min(lines.length-1,i+context);
        hits.push(path+':'+(i+1)+(context?'\n'+lines.slice(a,b+1).map((line,j)=>String(a+j+1).padStart(4,' ')+(a+j===i?' > ':' | ')+line.slice(0,220)).join('\n'):' — '+lines[i].trim().slice(0,260)));
      }
    }
  }
  if (!total) return 'Nenhum resultado para '+pattern+(args.path_glob?' em '+args.path_glob:'')+'.';
  return 'BUSCA COM LIMITE · '+total+' ocorrência(s); exibindo '+hits.length+'\n'+hits.join('\n')+(total>hits.length?'\n… resultados omitidos para preservar contexto.':'');
}
function ocxSymbolIndex(files, args) {
  const filter = String(args.path_glob || '').trim();
  let paths = Object.keys(files || {}).filter(path=>!OCX_IGNORE.test(path)&&!OCX_IS_SECRET(path));
  if (filter && typeof OC !== 'undefined' && OC.glob) { const s=new Set(OC.glob(files,filter)); paths=paths.filter(p=>s.has(p)); }
  const max = OCX_LIMIT(args.max_symbols, 10, 240, 100), hits=[];
  const patterns = [
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /\b(?:export\s+)?(?:interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
    /^\s*class\s+([A-Za-z_]\w*)\b/,
    /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*[<(]/,
    /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)\b/,
    /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/,
    /^\s*(?:static\s+)?(?:public|private|protected|internal)?\s*(?:async\s+)?[\w<>,\[\]?]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:\{|=>)/,
    /^\s*func\s+([A-Za-z_]\w*)\s*\(/,
    /^\s*(?:local\s+)?function\s+([A-Za-z_]\w*)\s*\(/
  ];
  for (const path of paths.sort()) {
    const ext=(/\.([^.]+)$/.exec(path)||[])[1]||'';
    if (!/^(?:[cm]?[jt]sx?|py|java|kt|cs|go|rs|gd|lua|php|rb|ts|tsx)$/i.test(ext)) continue;
    const lines=String(files[path]||'').split('\n');
    for(let i=0;i<lines.length;i++){
      const line=lines[i]; let name='';
      for(const re of patterns){const m=re.exec(line);if(m){name=m[1];break}}
      if(name && !['if','for','while','switch','catch','return','new','super'].includes(name))hits.push(path+':'+(i+1)+' '+name);
      if(hits.length>=max)break;
    }
    if(hits.length>=max)break;
  }
  return 'ÍNDICE DE SÍMBOLOS (heurístico; não é um parser/LSP) · '+hits.length+' entrada(s)'+(filter?' · filtro '+filter:'')+'\n'+(hits.join('\n')||'Nenhuma declaração conhecida foi identificada. Para linguagens complexas, confira o arquivo e o compilador.')+(hits.length>=max?'\n… limite atingido; refine path_glob.':'');
}
function ocxInstructionReport(files, args={}) {
  const target=String(args.path||'').trim()?OCX_TRIM_PATH(args.path):'';
  if(args.path&&!target)return 'Caminho inválido; use caminho relativo do projeto.';
  const names=Object.keys(files||{}).filter(path=>/(^|\/)(?:AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|ARCHITECTURE\.md|\.cursorrules|\.editorconfig|copilot-instructions\.md)$/i.test(path)||/^\.cursor\/rules\/[^/]+\.md$/i.test(path)||/^\.codemobile\/(?:rules|hooks|regras)\.(?:md|txt)$/i.test(path)).filter(path=>!OCX_IS_SECRET(path)).sort();
  let selected=names;
  if(target){
    const slash=target.lastIndexOf('/'),targetDir=slash<0?'':target.slice(0,slash),dirs=[''];
    let cur='';for(const part of targetDir.split('/').filter(Boolean)){cur=cur?cur+'/'+part:part;dirs.push(cur);}
    const ancestor=new Set(dirs);
    selected=names.filter(path=>{
      const dir=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
      const base=path.slice(path.lastIndexOf('/')+1).toLowerCase();
      if(path==='.github/copilot-instructions.md'||path==='.cursorrules'||path==='.editorconfig'||path.startsWith('.cursor/rules/')||path.startsWith('.codemobile/'))return true;
      return ancestor.has(dir)&&['agents.md','claude.md','contributing.md','architecture.md'].includes(base);
    }).sort((a,b)=>{
      const da=(a.match(/\//g)||[]).length,db=(b.match(/\//g)||[]).length;return da-db||a.localeCompare(b);
    });
  }
  if(!selected.length)return target?'Nenhuma instrução ancestral aplicável encontrada para '+target+'.':'Nenhum AGENTS.md, CLAUDE.md, CONTRIBUTING.md, ARCHITECTURE.md, regra do editor ou arquivo de regras encontrado.';
  const out=['INSTRUÇÕES DO PROJETO'+(target?' aplicáveis a '+target:'')+' — confira conflitos antes de seguir'];let budget=9500;
  for(const path of selected.slice(0,16)){
    if(budget<=300)break;
    const cap=Math.min(1800,budget-80),body=ocxClip(files[path],cap,'instruções de '+path);
    out.push('\n### '+path+'\n'+body);budget-=body.length+path.length+8;
  }
  if(selected.length>16)out.push('\n… '+(selected.length-16)+' arquivos adicionais não incluídos para preservar contexto.');
  if(target)out.push('\nOrdem exibida: arquivos globais/raiz primeiro; regras em diretórios mais profundos vêm depois e podem especializar as anteriores.');
  return out.join('\n').slice(0,10000);
}

function ocxChangeReport(files, pathFilter) {
  const p=pj(), cp=p.cps&&p.cps[p.cps.length-1];
  if(!cp||!cp.f)return 'Não há checkpoint da tarefa atual para comparar.';
  const names=[...new Set([...Object.keys(cp.f),...Object.keys(files||{})])].filter(k=>cp.f[k]!==files[k]).filter(k=>!pathFilter||k===pathFilter).filter(k=>!OCX_IS_SECRET(k)).sort();
  if(!names.length)return pathFilter?'Nenhuma alteração em '+pathFilter+'.':'Nenhuma alteração em relação ao checkpoint.';
  const out=['RESUMO DE ALTERAÇÕES · '+names.length+' arquivo(s)']; let adds=0,dels=0;
  for(const path of names.slice(0,40)){
    const before=String(cp.f[path]??''), after=String(files[path]??'');
    const oldLines=before?before.split('\n'):[], newLines=after?after.split('\n'):[];
    let a=0,d=0;
    if(before!==after){
      const diff=typeof dl==='function'?dl(before,after):[];
      for(const row of diff){if(row[0]==='+')a++;else if(row[0]==='-')d++;}
    }
    adds+=a;dels+=d;
    const status=!(path in cp.f)?'NOVO':!(path in files)?'REMOVIDO':'EDITADO';
    out.push((status+' '+path+' · +'+a+' / -'+d+' linhas · '+before.length+' → '+after.length+' caracteres'));
  }
  if(names.length>40)out.push('… '+(names.length-40)+' arquivos omitidos.');
  out.push('Totais aproximados: +'+adds+' linhas · -'+dels+' linhas. Confirme diff_file antes de considerar a tarefa pronta.');
  return out.join('\n');
}
function ocxVerifyWorkspace(files) {
  const diag=ocxProjectDiagnostics(files);
  const changes=ocxChangeReport(files);
  let scripts='';
  try {
    const pkg=files['package.json']?JSON.parse(files['package.json']):null;
    const s=pkg&&pkg.scripts&&typeof pkg.scripts==='object'?pkg.scripts:{};
    scripts='Scripts declarados (não executados): '+(['test','lint','typecheck','build'].filter(k=>typeof s[k]==='string'&&s[k].trim()).join(', ')||'nenhum script padrão encontrado');
  } catch(e) { scripts='Scripts: package.json inválido ('+e.message+')'; }
  return ['VERIFICAÇÃO ESTÁTICA DO WORKSPACE',diag,changes,scripts,'Esta ferramenta não executa testes nem prova ausência de bugs; use run_project_checks quando apropriado e permitido.'].join('\n\n').slice(0,14000);
}

function ocxSecurityAudit(files) {
  const findings=[];
  const detectors=[
    ['Segredo possivelmente embutido',/\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*(['"])(?!your[_ -]?|replace|placeholder|example|changeme|change[_ -]?me|xxxxx|<|\$\{)[A-Za-z0-9_./+=-]{12,}\1/i],
    ['Token com formato de credencial',/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/],
    ['Execução dinâmica de código',/\beval\s*\(|\bnew\s+Function\s*\(/],
    ['HTML inserido sem sanitização aparente',/\.innerHTML\s*=|dangerouslySetInnerHTML/],
    ['Shell com string construída',/shell\s*=\s*True|exec\s*\(.*\+|child_process\.(?:exec|execSync)\s*\(/],
    ['CORS potencialmente amplo',/Access-Control-Allow-Origin[^\n]*\*|cors\s*\(\s*\{?\s*origin\s*:\s*['"]\*['"]/i],
    ['TLS/certificado desativado',/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/]
  ];
  for(const path of Object.keys(files||{}).sort()){
    if(OCX_IGNORE.test(path)||OCX_IS_SECRET(path)||/\.(?:png|jpe?g|gif|webp|woff2?|ttf|otf|ico|pdf|zip|jar|apk|class|so|dll|exe)$/i.test(path))continue;
    const body=String(files[path]||'');if(body.length>1_000_000)continue;
    const lines=body.split('\n');
    for(let i=0;i<lines.length;i++)for(const [label,re] of detectors){re.lastIndex=0;if(re.test(lines[i])){findings.push({path,line:i+1,label});break}}
    if(findings.length>=100)break;
  }
  if(!findings.length)return 'AUDITORIA ESTÁTICA DE SEGURANÇA\nNenhum padrão de risco conhecido foi detectado nos arquivos examinados. Isso não é prova de segurança; código dinâmico, dependências e configurações externas precisam de revisão.';
  return 'AUDITORIA ESTÁTICA DE SEGURANÇA · '+findings.length+' achado(s)\n'+findings.slice(0,80).map((x,i)=>(i+1)+'. '+x.path+':'+x.line+' — '+x.label).join('\n')+(findings.length>80?'\n… resultados limitados.':'')+'\n\nNão exibo os valores que possam parecer segredos. Confirme cada achado: a análise usa padrões heurísticos e pode produzir falsos positivos.';
}
function ocxTestDiscovery(files) {
  const names=Object.keys(files||{}).filter(path=>!OCX_IGNORE.test(path)&&!OCX_IS_SECRET(path)).sort();
  const tests=names.filter(path=>/(^|\/)(?:tests?|__tests__|spec)(\/|$)|\.(?:test|spec)\.[^.]+$|_test\.go$|Test\w+\.java$|(?:^|\/)test_\w+\.py$/i.test(path));
  const configs=names.filter(path=>/(^|\/)(?:pytest\.ini|tox\.ini|jest\.config\.[^.]+|vitest\.config\.[^.]+|playwright\.config\.[^.]+|cypress\.config\.[^.]+|karma\.conf\.[^.]+|pom\.xml|build\.gradle(?:\.kts)?|Cargo\.toml|go\.mod|pytest\.toml)$/i.test(path));
  const out=['DESCOBERTA DE TESTES','Arquivos/pastas possivelmente relacionados a testes: '+tests.length,...tests.slice(0,80).map(path=>'• '+path)];
  if(files['package.json']){try{const pkg=JSON.parse(files['package.json']),scripts=pkg.scripts||{};out.push('Scripts npm: '+Object.entries(scripts).filter(([k])=>/test|lint|type|check|verify/i.test(k)).map(([k,v])=>k+'='+String(v).slice(0,90)).join(' · ')||'(nenhum script com nome de teste/verificação)')}catch(e){out.push('package.json inválido: '+e.message)}}
  if(configs.length)out.push('Configurações de teste/build detectadas: '+configs.join(', '));
  if(!tests.length&&!configs.length)out.push('Nenhuma convenção de teste conhecida foi encontrada. O projeto pode usar outro framework ou não ter testes ainda.');
  return out.join('\n')+(tests.length>80?'\n… outros arquivos omitidos.':'');
}
function ocxImpactAnalysis(files, args) {
  const path=OCX_TRIM_PATH(args.path||'');
  if(!path)return 'Informe path para um arquivo do projeto.';
  if(!(path in files))return 'Arquivo não encontrado: '+path;
  if(OCX_IS_SECRET(path))return 'Bloqueado: arquivo protegido por regra de leitura.';
  const body=String(files[path]||''), base=path.split('/').pop().replace(/\.[^.]+$/,'');
  const ids=[];
  const decl=/\b(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)|(?:async\s+)?function|class|def|func|pub\s+fn|struct|trait|enum)\s+([A-Za-z_$][\w$]*)/g;
  for(const m of body.matchAll(decl))if(m[1].length>2&&!ids.includes(m[1]))ids.push(m[1]);
  const symbols=[base,...ids].filter((v,i,a)=>v&&v.length>2&&a.indexOf(v)===i).slice(0,10);
  const hits=[];let total=0;
  for(const other of Object.keys(files||{}).sort()){
    if(other===path||OCX_IGNORE.test(other)||OCX_IS_SECRET(other))continue;
    const lines=String(files[other]||'').split('\n');
    for(let i=0;i<lines.length;i++){
      const line=lines[i]; if(!symbols.some(sym=>new RegExp('(^|[^A-Za-z0-9_$])'+sym.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9_$])').test(line)))continue;
      total++;if(hits.length<60)hits.push(other+':'+(i+1)+' — '+line.trim().slice(0,220));
    }
  }
  return 'ANÁLISE DE IMPACTO HEURÍSTICA · '+path+'\nSímbolos examinados: '+(symbols.join(', ')||'(nenhum identificado)')+'\nReferências em outros arquivos: '+total+'\n'+(hits.join('\n')||'Nenhuma referência textual encontrada.')+(total>hits.length?'\n… ocorrências omitidas.':'')+'\n\nIsto não é um grafo de dependências completo: referências dinâmicas, imports reexportados e chamadas por reflexão podem não aparecer.';
}

function ocxSelectTools(tl, history) {
  const mode=(typeof S!=='undefined'&&S.ocxToolMode)||'auto';
  if(mode==='full')return tl;
  const request=ocxLatestRequest(history).toLowerCase();
  const wantsAPK=/\b(apk|android sdk|capacitor|assinar apk|compilar android|instalar apk)\b/.test(request);
  const wantsEXE=/\b(exe|dll|windows bin[aá]rio|execut[aá]vel|pe file)\b/.test(request);
  const wantsPKG=/\b(jar|mcpack|mcaddon|zip|bin[aá]rio|apk|modifica[rç][aã]o bin[aá]ria)\b/.test(request);
  const wantsGitHub=/\b(github|reposit[oó]rio|repo|pull request|\bpr\b|workflow|actions|commit|branch remota)\b/.test(request);
  const wantsImage=/\b(imagem|imagem(ns)?|logo|ilustra[cç][aã]o|desenho|[ií]cone|gerar arte|gerar imagem)\b/.test(request);
  const wantsWeb=/\b(pesquis|pesquise|pesquisa|internet|web|documenta[cç][aã]o oficial|mais recente|atualizado|latest|fontes|refer[eê]ncia externa)\b/.test(request);
  const wantsMCP=/\b(mcp|servidor externo|integra[cç][aã]o externa|ferramenta externa)\b/.test(request);
  const wantsSkills=/\b(skill|skills|plugin|plugins|instru[cç][oõ]es reutiliz[aá]veis)\b/.test(request);
  const wantsAgents=/\b(paralel|subagente|v[aá]rios agentes|agentes especializados|pesquisa profunda)\b/.test(request)||request.length>700;
  const keepCore=new Set(['list_files','read_file','write_file','edit_file','delete_file','grep','todo_write','run_js','check_preview','move_file','multi_edit','append_file','run_file','think','apply_patch','glob','show_diff','project_map','read_many','find_references','diff_file','project_diagnostics','dependency_report','run_project_checks','context_report','smart_search','symbol_index','instruction_report','change_report','verify_workspace','security_audit','test_discovery','impact_analysis','lsp','ask_user']);
  return tl.filter(t=>{
    const name=t[0];
    if(/^apk_/.test(name))return wantsAPK;
    if(/^exe_/.test(name))return wantsEXE;
    if(/^pkg_/.test(name))return wantsPKG;
    if(/^gh_/.test(name))return wantsGitHub;
    if(/^mcp__/.test(name))return wantsMCP;
    if(/^(?:generate_image|image_generate)$/.test(name))return wantsImage;
    if(name==='spawn_agent')return mode==='economy'?wantsAgents:true;
    if(name==='use_skill')return mode==='economy'?wantsSkills:true;
    if(['web_search','web_fetch'].includes(name))return mode==='economy'?wantsWeb:true;
    if(mode==='economy'&&!keepCore.has(name))return false;
    return true;
  });
}
function ocxLatestRequest(history) {
  const h=Array.isArray(history)?history:[];
  for(let i=h.length-1;i>=0;i--){const m=h[i];if(m&&m.role==='user'&&typeof m.text==='string'&&!/^\s*\[(?:Sistema|Verifica[cç][aã]o|Revis[aã]o autom[aá]tica|Resumo autom[aá]tico)/i.test(m.text))return m.text;}
  return '';
}
function ocxPruneHistory(history) {
  if(!Array.isArray(history))return history;
  const mode=(typeof S!=='undefined'&&S.ocxToolMode)||'auto';
  const total=ocxEstimateTokens(history);
  const threshold=mode==='economy'?5000:(S.fast?6000:14000);
  if(total<=threshold)return history;
  const keepRecent=mode==='economy'?8:10, cutoff=Math.max(0,history.length-keepRecent);
  let changed=false;
  const out=history.map((m,i)=>{
    if(i>=cutoff||!m||m.role!=='tool'||String(m.result||'').length<700)return m;
    const cap=mode==='economy'?500:1000, result=ocxClip(m.result,cap,'resultado antigo da ferramenta '+String(m.name||''));
    if(result===m.result)return m;
    changed=true;return {...m,result};
  });
  return changed?out:history;
}

function ocxAddTools() {
  const definitions = [
    ['project_map','Cria um mapa compacto do projeto: linguagens, pontos de entrada, testes, configs, scripts e instruções. Use antes de tarefas grandes.',{}],
    ['read_many','Lê vários arquivos relacionados em uma chamada, respeitando permissões e um orçamento de contexto.',{paths:'string',max_chars:'int?'}],
    ['find_references','Encontra referências de um símbolo/texto em todo o projeto, retornando caminho, linha e conteúdo curto.',{symbol:'string',match:'string?',path_glob:'string?'}],
    ['diff_file','Mostra o diff real com contexto das alterações desde o checkpoint da tarefa; path é opcional para limitar a um arquivo.',{path:'string?'}],
    ['project_diagnostics','Faz verificações estáticas rápidas: JSON inválido, referências locais quebradas em HTML/CSS e ids duplicados. Não modifica arquivos.',{}],
    ['dependency_report','Resume dependências e scripts encontrados nos manifestos conhecidos, sem instalar nada.',{}],
    ['run_project_checks','Executa apenas scripts de teste/lint/typecheck existentes no package.json (ou pytest se houver configuração). O comando fica limitado a uma lista permitida.',{checks:'string?'}],
    ['context_report','Estima o peso do histórico, saídas de ferramentas, arquivos e esquemas para identificar onde o contexto está sendo gasto. Não mede tokens exatos do provedor.',{}],
    ['smart_search','Busca texto ou regex com limite de resultados e contexto por linha; ignora arquivos secretos, binários e pastas de build.',{pattern:'string',match:'string?',path_glob:'string?',max_hits:'int?',context_lines:'int?'}],
    ['symbol_index','Cria um índice heurístico de funções, classes, tipos e símbolos sem ler arquivos inteiros; refine com path_glob.',{path_glob:'string?',max_symbols:'int?'}],
    ['instruction_report','Descobre instruções AGENTS.md/CLAUDE.md, regras do editor e regras locais. Passe path para combinar instruções ancestrais relevantes à área do arquivo.',{path:'string?'}],
    ['change_report','Resume arquivos alterados desde o checkpoint, com status, tamanho e linhas aproximadas adicionadas/removidas.',{path:'string?'}],
    ['verify_workspace','Combina diagnóstico estático, resumo do diff e descoberta de scripts de verificação; não executa scripts.',{}],
    ['security_audit','Procura padrões comuns de risco (segredos possivelmente embutidos, execução dinâmica, HTML não sanitizado, CORS/TLS permissivos). Não exibe possíveis valores secretos.',{}],
    ['test_discovery','Descobre arquivos de teste, frameworks/configurações e scripts de verificação prováveis; não executa nada.',{}],
    ['impact_analysis','Procura referências textuais de um arquivo/símbolos para estimar quais outros arquivos podem ser afetados. Não é um grafo LSP completo.',{path:'string'}],
    ['lsp','Usa um servidor Language Server Protocol REAL, quando instalado no servidor local: status, diagnostics, definition/declaration/typeDefinition, references, hover, documentSymbol/workspaceSymbol, implementation, completion/signatureHelp, documentHighlight/foldingRange, prepareRename/rename, documentLink/codeLens/selectionRange, format/rangeFormat, codeAction e hierarquia de chamadas. diagnostics sem path faz uma varredura limitada do workspace (até 24 arquivos/3 servidores); line/character começam em 1. format/rename/codeAction retornam prévias; nunca aplicam edições automaticamente. Quando não há servidor, fornece fallback heurístico explicitamente rotulado.',{operation:'string',path:'string?',server:'string?',line:'int?',character:'int?',symbol:'string?',query:'string?',newName:'string?',endLine:'int?',endCharacter:'int?',kind:'string?',tabSize:'int?'}]
  ];
  for (const t of definitions) if (!T.some(x=>x[0]===t[0])) T.push(t);
  for (const n of ['project_map','read_many','find_references','diff_file','project_diagnostics','dependency_report','context_report','smart_search','symbol_index','instruction_report','change_report','verify_workspace','security_audit','test_discovery','impact_analysis','lsp']) { if(!RO.includes(n))RO.push(n);if(!SUB.includes(n))SUB.push(n); }
  if (!ico.project_map) Object.assign(ico,{lsp:'🧭',project_map:'🗺️',read_many:'📚',find_references:'🔍',diff_file:'🧾',project_diagnostics:'🧪',dependency_report:'📦',run_project_checks:'✅',context_report:'🧮',smart_search:'🔎',symbol_index:'🗂️',instruction_report:'📜',change_report:'📊',verify_workspace:'🩺',security_audit:'🛡️',test_discovery:'🧪',impact_analysis:'🧭'});
  Object.assign(PD,{
    paths:'Lista de caminhos separados por vírgula ou quebra de linha; até 8 arquivos.',
    max_chars:'Orçamento total aproximado de caracteres (máximo 16000).',
    symbol:'Símbolo/texto procurado, por exemplo PlayerController ou setState.',
    match:'word (padrão), contains ou regex.',
    path_glob:'Padrão glob opcional para limitar a busca, por exemplo src/**/*.ts.',
    checks:'Testes a executar, separados por vírgula: test, lint, typecheck ou build. Padrão: os três primeiros scripts que existirem.',
    match:'literal (padrão) ou regex para smart_search.',
    max_hits:'Máximo de ocorrências exibidas, entre 1 e 100.',
    context_lines:'Número de linhas de contexto por lado, entre 0 e 3.',
    max_symbols:'Máximo de símbolos exibidos, entre 10 e 240.',
    operation:'Operação LSP: status, diagnostics, definition, references, hover, documentSymbol, workspaceSymbol, implementation, completion, format, rangeFormat, codeAction, rename, prepareCallHierarchy, incomingCalls, outgoingCalls ou close.',
    line:'Linha iniciando em 1; usado junto de character para a posição do símbolo.',
    character:'Caractere iniciando em 1.',
    newName:'Novo nome para uma prévia de rename. A prévia não é aplicada.',
    tabSize:'Tamanho de tabulação para prévia de formatação, entre 1 e 8.'
  });
  if (typeof GRP!=='undefined' && GRP.run && !GRP.run.includes('run_project_checks')) GRP.run.push('run_project_checks');
}
ocxAddTools();

const ocxBaseSys = sys;
sys = function() {
  const base = ocxBaseSys();
  const extra = '\n\nESTRATÉGIA DE AGENTE (inspirada em padrões públicos de agentes de código):\n' +
    '1. Para tarefa grande, use project_map e todo_write; separe investigação, implementação e verificação.\n' +
    '2. Procure com glob/find_references antes de ler muitos arquivos; leia relacionados com read_many, que limita a saída.\n' +
    '3. Faça a menor mudança coerente; prefira apply_patch para múltiplos arquivos/trechos e edições atômicas.\n' +
    '4. Após editar, use diff_file/show_diff e rode só as verificações relevantes. Use project_diagnostics como checagem estática, não como prova de execução.\n' +
    '5. Use subagente somente para investigação independente; devolva evidências e caminhos concretos. Paralelize apenas leituras/pesquisas independentes.\n' +
    '6. Economize contexto: não releia conteúdo já conhecido; use smart_search/symbol_index antes da leitura integral; peça trechos por linha; agrupe leituras com read_many; resuma saídas antigas grandes e preserve erros/trechos finais. O relatório context_report estima o peso, mas não conhece a janela exata do provedor. Nunca exponha chaves de API nem conteúdo de arquivos secretos.\n' +
    '7. Para entender código, tente lsp com definition/references/hover/diagnostics quando houver servidor real; diferencie os resultados LSP das heurísticas offline. format/rename/codeAction são apenas prévias e não devem ser aplicados sem revisar o diff.\n8. Antes de fechar use verify_workspace, security_audit, test_discovery e change_report; confira o diff real, execute só verificações relevantes e distinga análise estática de testes executados. Ferramentas específicas de APK/EXE/GitHub/MCP só são disponibilizadas quando a intenção atual indica que são úteis, para reduzir o esquema enviado ao modelo.\n\n' +
    'PERFIL ATUAL: ' + (OCX_PROFILE[S.agentProfile] || OCX_PROFILE.build);
  return base + extra;
};

const ocxBaseLlm = llm;
llm = async function(h = pj().hist, tl = toolsNow(), sy = sys(), nt) {
  const role = S.agentProfile || 'build';
  let allowed = tl;
  if (role === 'plan') allowed = tl.filter(t => OCX_READONLY_TOOLS.has(t[0]) && !OCX_EXECUTION_TOOLS.has(t[0]));
  else if (role === 'explore') allowed = tl.filter(t => OCX_EXPLORE_TOOLS.has(t[0]));
  else if (role === 'review') allowed = tl.filter(t => OCX_REVIEW_TOOLS.has(t[0]) && (!OCX_EXECUTION_TOOLS.has(t[0]) || t[0] === 'run_project_checks'));
  allowed = ocxSelectTools(allowed, h);
  const compactedHistory = ocxPruneHistory(h);
  return ocxBaseLlm(compactedHistory, allowed, sy, nt);
};

function ocxLspSymbolAt(text, line, character) {
  const rows=String(text||'').split('\n'), row=rows[Math.max(0,(+line||1)-1)]||'', at=Math.max(0,(+character||1)-1);
  const left=row.slice(0,at).match(/[A-Za-z_$][\w$]*$/),right=row.slice(at).match(/^[A-Za-z_$][\w$]*/);
  return left?.[0]||right?.[0]||'';
}
function ocxLspFallback(args, files) {
  const op=String(args.operation||'status'), path=OCX_TRIM_PATH(args.path||''), names=Object.keys(files||{}).filter(p=>!OCX_IGNORE.test(p)&&!OCX_IS_SECRET(p));
  if(op==='status') return 'LSP REAL INDISPONÍVEL NESTE AMBIENTE.\nO CodeMobile está usando apenas análise local heurística; ela não equivale a semantic tokens, definição ou referências confirmadas por um servidor LSP.\n\nPara LSP real, inicie o servidor local CodeMobile/Termux e instale um servidor de linguagem compatível. Os executáveis são detectados pelo backend; não há downloads automáticos.\n\nExtensões reconhecidas pelo adaptador: TypeScript/JavaScript, Deno, Python, Go, Rust, C/C++, Bash, JSON, HTML, CSS, YAML, Lua, PHP, Ruby, C#, Kotlin, Vue, Svelte, Astro, Markdown, TOML, Terraform/HCL, Zig, Swift, Dockerfile e Prisma.';
  if(['format','rangeFormat','codeAction','rename','prepareRename','prepareCallHierarchy','incomingCalls','outgoingCalls','completion','signatureHelp','implementation','declaration','typeDefinition','documentHighlight','foldingRange','documentLink','codeLens','selectionRange'].includes(op)) return 'Fallback local heurístico: esta operação exige um servidor LSP real e não foi executada. Nenhuma alteração foi feita. Use lsp(status) para verificar como habilitar o backend ou use smart_search/find_references para investigar texto.';
  if(op==='workspaceSymbol') {
    const q=String(args.query||args.symbol||'').trim(); if(!q)return 'Informe query para workspaceSymbol.';
    const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),hits=[];
    for(const p of names){const rows=String(files[p]||'').split('\n');for(let i=0;i<rows.length;i++)if(re.test(rows[i])&&/\b(function|class|interface|type|enum|const|let|var|def|fn|func|struct|trait|object|fun)\b/.test(rows[i]))hits.push(`${p}:${i+1}: ${rows[i].trim().slice(0,180)}`);}
    return 'FALLBACK HEURÍSTICO — não são símbolos LSP verificados.\n'+(hits.slice(0,60).join('\n')||'Nenhum símbolo provável encontrado.');
  }
  if(!path)return 'Informe path para esta operação LSP.';
  if(!(path in files))return 'Arquivo não encontrado: '+path;
  const text=String(files[path]||''), symbol=String(args.symbol||ocxLspSymbolAt(text,args.line,args.character)||'').trim();
  if(op==='diagnostics') {
    const raw=ocxProjectDiagnostics(files);const hits=raw.split('\n').filter(line=>line.includes(path));
    return 'FALLBACK ESTÁTICO (não são diagnósticos LSP):\n'+(hits.join('\n')||'Nenhum problema detectado pelas regras heurísticas atuais. Isso não garante que o arquivo esteja correto.');
  }
  if(op==='documentSymbol') return 'FALLBACK HEURÍSTICO — não é uma árvore semântica LSP.\n'+ocxSymbolIndex(files,{path_glob:path,max_symbols:160});
  if(!symbol)return 'Não consegui identificar um símbolo na posição informada. Passe symbol explicitamente ou ajuste line/character (base 1).';
  const esc=symbol.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), decl=new RegExp('^\\s*(?:(?:export|default|public|private|protected|static|async|pub|final|abstract|const|let|var)\\s+)*(?:function|class|interface|type|enum|def|fn|func|struct|trait|object|fun|record|module)\\s+'+esc+'\\b|^\\s*(?:export\\s+)?(?:const|let|var)\\s+'+esc+'\\s*(?::[^=]+)?=', 'i');
  if(op==='hover'||op==='definition') {
    const found=[];for(const p of names){const rows=String(files[p]||'').split('\n');for(let i=0;i<rows.length;i++)if(decl.test(rows[i]))found.push(`${p}:${i+1}: ${rows.slice(Math.max(0,i-1),Math.min(rows.length,i+3)).join('\n')}`);}
    return 'FALLBACK HEURÍSTICO para '+symbol+' (não é resolução semântica LSP).\n'+(found.slice(0,20).join('\n\n')||'Nenhuma declaração provável localizada.');
  }
  if(op==='references') {
    const re=new RegExp('(^|[^A-Za-z0-9_$])'+esc+'(?=$|[^A-Za-z0-9_$])'),hits=[];let count=0;
    for(const p of names){const rows=String(files[p]||'').split('\n');for(let i=0;i<rows.length;i++)if(re.test(rows[i])){count++;if(hits.length<80)hits.push(`${p}:${i+1}: ${rows[i].trim().slice(0,200)}`);}}
    return `FALLBACK TEXTUAL para ${symbol}: ${count} correspondência(s). Isso não confirma referências semânticas.\n`+hits.join('\n')+(count>hits.length?'\n… resultados limitados.':'');
  }
  return 'Operação desconhecida ou indisponível neste fallback.';
}
async function ocxRunLsp(args) {
  const files=pj().files, op=String(args.operation||'status');
  if(typeof cmApi==='function' && typeof CM_SRV!=='undefined' && CM_SRV) {
    try {
      const result=await cmApi('lsp',{method:'POST',body:JSON.stringify({project:S.cur,files,operation:op,path:args.path,server:args.server,line:args.line,character:args.character,symbol:args.symbol,query:args.query,newName:args.newName,endLine:args.endLine,endCharacter:args.endCharacter,kind:args.kind,tabSize:args.tabSize})});
      if(op==='status' && result.servers) return 'CATÁLOGO LSP LOCAL\nBackend LSP: '+(result.available?'ativo':'nenhum servidor reconhecido está instalado')+'\nSessões em memória: '+result.sessions+'\n'+result.servers.map(s=>`${s.available?'✅':'▫️'} ${s.label} (${s.id}) — ${s.available?s.command:'não instalado'}\n  Extensões: ${s.extensions.join(', ')}${s.available?'':'\n  '+s.hint}`).join('\n');
      if(result.ok) return result.output||JSON.stringify(result);
      if(result.available===false) return String(result.output||'LSP não disponível.')+'\n\n'+ocxLspFallback(args,files);
      return String(result.output||result.error||JSON.stringify(result));
    } catch(e) { return 'Não consegui acessar o backend LSP local: '+String(e.message||e)+'\n\n'+ocxLspFallback(args,files); }
  }
  return ocxLspFallback(args,files);
}
async function ocxShowLspStatus(){const result=await ocxRunLsp({operation:'status'});await dlg({title:'LSP — servidores de linguagem',text:result,skip:'Fechar'});}

const ocxBaseExec = exec;
exec = async function(name, args) {
  args = args || {};
  const role = S.agentProfile || 'build';
  const tool = T.find(t => t[0] === name);
  const mcpWrite = !!(tool && tool.mcp && !tool.ro);
  const githubWrite = typeof GHW !== 'undefined' && GHW.includes(name);
  if (role !== 'build' && (OCX_WRITE_TOOLS.has(name) || githubWrite || mcpWrite)) {
    return 'Bloqueado pelo perfil ' + role + ': este perfil não pode modificar arquivos nem executar ações externas de escrita. Troque para Build para implementar.';
  }
  if (role === 'explore' && OCX_EXECUTION_TOOLS.has(name)) {
    return 'Bloqueado pelo perfil Explore: este agente só pode investigar e ler; nenhum código/comando foi executado.';
  }
  if (role === 'plan' && OCX_EXECUTION_TOOLS.has(name)) return 'Bloqueado no perfil Plan: investigação e planejamento não executam código nem comandos.';
  if (role === 'review' && OCX_EXECUTION_TOOLS.has(name) && name !== 'run_project_checks') return 'Bloqueado pelo perfil Review: use run_project_checks para executar apenas verificações declaradas e permitidas.';

  const files = pj().files;
  if (name === 'lsp') return ocxRunLsp(args);
  if (name === 'project_map') return ocxProjectMap(files);
  if (name === 'dependency_report') return ocxDependencyReport(files);
  if (name === 'context_report') return ocxContextReport(pj().hist);
  if (name === 'smart_search') return ocxSmartSearch(files, args);
  if (name === 'symbol_index') return ocxSymbolIndex(files, args);
  if (name === 'instruction_report') return ocxInstructionReport(files,args);
  if (name === 'change_report') { const filter=args.path?OCX_TRIM_PATH(args.path):''; if(args.path&&!filter)return 'Caminho inválido.'; return ocxChangeReport(files,filter); }
  if (name === 'verify_workspace') return ocxVerifyWorkspace(files);
  if (name === 'security_audit') return ocxSecurityAudit(files);
  if (name === 'test_discovery') return ocxTestDiscovery(files);
  if (name === 'impact_analysis') return ocxImpactAnalysis(files,args);
  if (name === 'project_diagnostics') return ocxProjectDiagnostics(files);
  if (name === 'diff_file') {
    const filter = args.path ? OCX_TRIM_PATH(args.path) : '';
    if (args.path && !filter) return 'Caminho inválido.';
    return ocxDiffFiles(files, filter);
  }
  if (name === 'read_many') {
    const paths = String(args.paths || '').split(/[\n,]/).map(OCX_TRIM_PATH).filter(Boolean);
    const uniq = [...new Set(paths)].slice(0,8);
    if (!uniq.length) return 'Informe pelo menos um caminho válido.';
    const budget = OCX_LIMIT(args.max_chars, 1000, 16000, S.fast ? 5000 : 10000);
    let left = budget; const out=[];
    for (const path of uniq) {
      if (left <= 0) { out.push('\n… orçamento de contexto atingido; os próximos arquivos foram omitidos.'); break; }
      if (!(path in files)) { out.push('\n### '+path+'\n[arquivo não encontrado]'); continue; }
      if (OCX_IS_SECRET(path)) { out.push('\n### '+path+'\n[bloqueado: arquivo protegido por regras de leitura]'); continue; }
      const raw = String(await ocxBaseExec('read_file', {path}));
      const cap = Math.min(left, Math.max(500, Math.floor(budget / uniq.length)));
      const body = raw.slice(0,cap); out.push('\n### '+path+'\n'+body+(raw.length>cap?'\n[… trecho limitado para economizar contexto]':''));
      left -= Math.min(raw.length,cap);
    }
    return out.join('\n').slice(0,budget+Math.min(2000,uniq.length*80));
  }
  if (name === 'find_references') {
    const symbol = String(args.symbol || '').trim(); if (!symbol) return 'Informe symbol.';
    if (symbol.length > 180) return 'Símbolo longo demais (máx. 180 caracteres).';
    let candidates = Object.keys(files).filter(p=>!OCX_IGNORE.test(p) && !OCX_IS_SECRET(p));
    if (args.path_glob && typeof OC !== 'undefined' && OC.glob) candidates = candidates.filter(p=>OC.glob(files,String(args.path_glob)).includes(p));
    const mode = String(args.match || 'word').toLowerCase(); let re;
    try {
      const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      re = mode === 'regex' ? new RegExp(symbol,'i') : mode === 'contains' ? new RegExp(escaped,'i') : new RegExp('(^|[^A-Za-z0-9_$])'+escaped+'(?=$|[^A-Za-z0-9_$])','i');
    } catch(e) { return 'Regex inválida: '+e.message; }
    const hits=[]; let total=0;
    for (const path of candidates) {
      const lines = String(files[path] || '').split('\n');
      for (let i=0;i<lines.length;i++) {
        if (re.test(lines[i])) { total++; if(hits.length<60) hits.push(path+':'+(i+1)+': '+lines[i].trim().slice(0,180)); }
      }
    }
    return total ? 'Referências encontradas: '+total+'\n'+hits.join('\n')+(total>hits.length?'\n… '+(total-hits.length)+' ocorrências omitidas.':'') : 'Nenhuma referência encontrada para '+symbol+'.';
  }
  if (name === 'run_project_checks') {
    if (S.mode === 'plan') return 'Modo Plano: execução de scripts bloqueada.';
    const pm = (S.perm || {}).run;
    if (pm === 'deny') return 'Bloqueado: a permissão de executar código está como Bloquear em Ajustes.';
    if (pm === 'ask') {
      if (typeof okT !== 'undefined' && okT.run == null) okT.run = (await dlg({title:'Executar testes do projeto?',text:'Vou rodar scripts declarados no package.json dentro do workspace do projeto. Scripts podem executar código do próprio projeto.',btns:['✅ Executar','🚫 Cancelar']})) === 0;
      if (typeof okT !== 'undefined' && !okT.run) return 'Execução cancelada pelo usuário.';
    }
    let pkg; try { pkg = files['package.json'] ? JSON.parse(files['package.json']) : null; } catch(e) { return 'package.json inválido: '+e.message; }
    const scripts = pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    const jobs = new Map(), names=Object.keys(files), has=(re)=>names.some(p=>re.test(p));
    for(const key of ['test','lint','typecheck','build']) if(typeof scripts[key]==='string'&&scripts[key].trim()) jobs.set(key,{cmd:key==='test'?'npm test':'npm run '+key,source:'script declarado em package.json'});
    // Verificações de ecossistema com comando fixo; não executa scripts arbitrários descobertos por nome de arquivo.
    const native=[];
    if(files['go.mod']) { jobs.set('go_test',{cmd:'go test ./...',source:'go.mod'});jobs.set('go_vet',{cmd:'go vet ./...',source:'go.mod'});native.push({key:'test',cmd:'go test ./...',source:'go.mod'});if(!jobs.has('build'))jobs.set('build',{cmd:'go build ./...',source:'go.mod'}); }
    if(files['Cargo.toml']) { jobs.set('cargo_test',{cmd:'cargo test',source:'Cargo.toml'});jobs.set('cargo_check',{cmd:'cargo check',source:'Cargo.toml'});native.push({key:'test',cmd:'cargo test',source:'Cargo.toml'});if(!jobs.has('build'))jobs.set('build',{cmd:'cargo build',source:'Cargo.toml'}); }
    const gradle=has(/(^|\/)(?:build\.gradle|build\.gradle\.kts)$/),maven=!!files['pom.xml'];
    if(maven) {jobs.set('maven_test',{cmd:'mvn test',source:'pom.xml'});native.push({key:'test',cmd:'mvn test',source:'pom.xml'});if(!jobs.has('build'))jobs.set('build',{cmd:'mvn -DskipTests package',source:'pom.xml'});}
    if(gradle) {const cmd=names.includes('gradlew')?'./gradlew test':'gradle test';jobs.set('gradle_test',{cmd,source:'build.gradle'});native.push({key:'test',cmd,source:'build.gradle'});if(!jobs.has('build'))jobs.set('build',{cmd:names.includes('gradlew')?'./gradlew assemble':'gradle assemble',source:'build.gradle'});}
    const dotnet=has(/\.(?:sln|csproj|fsproj|vbproj)$/i);
    if(dotnet) {jobs.set('dotnet_test',{cmd:'dotnet test',source:'solution/projeto .NET'});native.push({key:'test',cmd:'dotnet test',source:'solution/projeto .NET'});if(!jobs.has('build'))jobs.set('build',{cmd:'dotnet build',source:'solution/projeto .NET'});}
    const pytestCfg=!!files['pytest.ini']||!!files['tox.ini']||!!files['setup.cfg']&&/\[tool:pytest\]|\[pytest\]/.test(files['setup.cfg'])||!!files['pyproject.toml']&&/pytest|\[tool\.pytest/.test(files['pyproject.toml']);
    const pythonTests=has(/(^|\/)(?:tests?|specs?)\/.*\.py$/i)||has(/(?:^|\/)(?:test_.*|.*_test)\.py$/i);
    if(pytestCfg||pythonTests) {jobs.set('pytest',{cmd:'python -m pytest -q',source:'testes/configuração Python'});native.push({key:'test',cmd:'python -m pytest -q',source:'testes/configuração Python'});}
    if(has(/(^|\/)(?:phpunit\.xml(?:\.dist)?|phpunit\.xml)$/i)||files['phpunit.xml']||files['phpunit.xml.dist']) {const cmd=names.includes('vendor/bin/phpunit')?'./vendor/bin/phpunit':'phpunit';jobs.set('php_test',{cmd,source:'configuração PHPUnit'});native.push({key:'test',cmd,source:'configuração PHPUnit'});}
    if(files['Gemfile']&&(has(/(^|\/)(?:spec|test)\/.*_spec\.rb$/i)||files['.rspec'])) {jobs.set('ruby_test',{cmd:'bundle exec rspec',source:'Gemfile/RSpec'});native.push({key:'test',cmd:'bundle exec rspec',source:'Gemfile/RSpec'});}
    if(!jobs.has('test')&&native.length)jobs.set('test',native[0]);
    const tsConfig=names.includes('tsconfig.json')||has(/(^|\/)tsconfig\.[^/]+\.json$/);
    if(tsConfig && pkg && Object.assign({},pkg.dependencies,pkg.devDependencies).typescript && !jobs.has('typecheck'))jobs.set('typecheck',{cmd:'npm exec --offline -- tsc --noEmit',source:'tsconfig + TypeScript local'});
    const ruffConfigured=!!files['ruff.toml']||!!files['.ruff.toml']||!!files['pyproject.toml']&&/\[tool\.ruff\]/.test(files['pyproject.toml']);
    if(ruffConfigured&&!jobs.has('lint'))jobs.set('lint',{cmd:'ruff check .',source:'configuração Ruff'});
    if (!jobs.size) return 'Nenhuma verificação conhecida foi encontrada. Procure scripts test/lint/typecheck/build em package.json, arquivos de configuração de testes ou os manifestos de Go, Rust, Maven, Gradle e .NET.';
    const allowed=new Set(['test','lint','typecheck','build','go_test','go_vet','cargo_test','cargo_check','maven_test','gradle_test','dotnet_test','pytest','php_test','ruby_test']);
    const requested=String(args.checks||'test,lint,typecheck').split(/[\s,]+/).map(x=>x.toLowerCase()).filter(x=>allowed.has(x));
    const chosen=[...new Set(requested)].filter(k=>jobs.has(k)).slice(0,3);
    if(!chosen.length)return 'Nenhuma verificação solicitada existe neste projeto. Disponíveis: '+[...jobs.keys()].join(', ');
    const results=[];
    for(const key of chosen){const cmd=jobs.get(key).cmd;const r=await ocxBaseExec('shell',{cmd,timeout:120});results.push('### '+key+' (`'+cmd+'`; fonte: '+jobs.get(key).source+')\n'+String(r).slice(-7000));if(/\b(?:timed out|tempo esgotado|cancelado)\b/i.test(String(r)))break;}
    return 'VERIFICAÇÕES DO PROJETO\nVerificações disponíveis: '+[...jobs.keys()].join(', ')+'\nComandos executados (máx. 3): '+chosen.join(', ')+'\n'+results.join('\n\n');
  }
  return ocxBaseExec(name,args);
};

function setAgentProfile(value) {
  if (!['build','plan','explore','review'].includes(value)) return;
  if (busy) return alert('Termine ou interrompa a tarefa antes de trocar o perfil.');
  S.agentProfile = value; save(); cfgR();
}
const ocxBaseCfgR = cfgR;
cfgR = function() {
  ocxBaseCfgR();
  const el = document.querySelector('#cfg'); if (!el) return;
  const role = ['build','plan','explore','review'].includes(S.agentProfile) ? S.agentProfile : 'build';
  const toolMode=['auto','economy','full'].includes(S.ocxToolMode)?S.ocxToolMode:'auto';
  const html = '<div class="f"><label>🧠 Perfil de trabalho do agente</label><select id="ocx-profile" onchange="setAgentProfile(this.value)">'+
    [['build','Build — implementar e verificar'],['plan','Plan — somente planejar'],['explore','Explore — explorar somente leitura'],['review','Review — revisar sem editar']].map(([v,l])=>'<option value="'+v+'"'+(v===role?' selected':'')+'>'+l+'</option>').join('')+
    '</select><small style="color:var(--m)">O perfil restringe as ferramentas disponíveis. Plan/Explore/Review não podem editar arquivos; Explore também não executa código.</small></div>'+
    '<div class="f"><label>🪙 Uso de ferramentas e contexto</label><select id="ocx-tool-mode" onchange="S.ocxToolMode=this.value;save();cfgR()">'+
    [['auto','Auto — esconde ferramentas irrelevantes'],['economy','Economia máxima — menos ferramentas e saídas antigas menores'],['full','Todas — enviar todas as ferramentas disponíveis']].map(([v,l])=>'<option value="'+v+'"'+(v===toolMode?' selected':'')+'>'+l+'</option>').join('')+
    '</select><small style="color:var(--m)">Auto (padrão) reduz ferramentas especializadas que não combinam com o pedido. Economia máxima também poda saídas antigas. Estimativas de tokens não são contadores oficiais do provedor.</small></div>';
  const lspHtml='<div class="f"><label>🧠 Language Server Protocol (LSP)</label><button class="s" type="button" onclick="ocxShowLspStatus()">🔌 Verificar servidores LSP</button><small style="color:var(--m)">Quando o servidor local do CodeMobile está conectado, o agente pode usar definições, referências, hover, símbolos, diagnósticos, completamento e prévias de formatação/renomeação. O modo offline informa explicitamente quando usa heurísticas.</small></div>';
  el.insertAdjacentHTML('afterbegin',html);
  el.insertAdjacentHTML('afterbegin',lspHtml);
};


/* Last-mile output budget: keep the beginning and end of large tool results, where
 * diagnostics often put the cause at the top and the final status at the bottom. */
const ocxExecWithBudget = exec;
exec = async function(name, args) {
  const result = await ocxExecWithBudget(name, args || {});
  if (typeof result !== 'string') return result;
  const mode = (typeof S !== 'undefined' && S.ocxToolMode) || 'auto';
  const cap = mode === 'economy' ? (S.fast ? 2800 : 6500) : (S.fast ? 4200 : 10500);
  return ocxClip(result, cap, 'saída de '+name);
};
