/*
 * CodeMobile LSP bridge — independent JSON-RPC 2.0 / Language Server Protocol client.
 * Inspired by the publicly documented LSP integration pattern in OpenCode.
 * This is a small local process manager, not a copy of OpenCode's runtime.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const LSP_SERVERS = [
  { id: 'typescript', label: 'TypeScript / JavaScript', commands: [['typescript-language-server', ['--stdio']]], exts: ['.ts','.tsx','.js','.jsx','.mjs','.cjs','.mts','.cts'], hint: 'Instale typescript e typescript-language-server no workspace ou globalmente.' },
  { id: 'deno', label: 'Deno', commands: [['deno', ['lsp']]], exts: ['.ts','.tsx','.js','.jsx','.mjs','.mts'], hint: 'Instale Deno e use deno.json/deno.jsonc para configurar o projeto.' },
  { id: 'pyright', label: 'Python (Pyright)', commands: [['pyright-langserver', ['--stdio']]], exts: ['.py','.pyi'], hint: 'Instale pyright no ambiente do projeto ou globalmente.' },
  { id: 'pylsp', label: 'Python (python-lsp-server)', commands: [['pylsp', []]], exts: ['.py','.pyi'], hint: 'Instale python-lsp-server no ambiente Python.' },
  { id: 'gopls', label: 'Go', commands: [['gopls', ['serve']]], exts: ['.go'], hint: 'Instale gopls e configure o PATH.' },
  { id: 'rust-analyzer', label: 'Rust', commands: [['rust-analyzer', []]], exts: ['.rs'], hint: 'Instale rust-analyzer usando a distribuição Rust apropriada.' },
  { id: 'clangd', label: 'C / C++', commands: [['clangd', ['--background-index=false']]], exts: ['.c','.h','.cc','.cpp','.cxx','.hpp','.hh','.hxx'], hint: 'Instale clangd; compile_commands.json melhora a precisão.' },
  { id: 'bash', label: 'Bash / Shell', commands: [['bash-language-server', ['start']]], exts: ['.sh','.bash','.zsh'], hint: 'Instale bash-language-server.' },
  { id: 'json', label: 'JSON / JSONC', commands: [['vscode-json-language-server', ['--stdio']]], exts: ['.json','.jsonc'], hint: 'Instale vscode-langservers-extracted.' },
  { id: 'html', label: 'HTML', commands: [['vscode-html-language-server', ['--stdio']]], exts: ['.html','.htm'], hint: 'Instale vscode-langservers-extracted.' },
  { id: 'css', label: 'CSS / SCSS / LESS', commands: [['vscode-css-language-server', ['--stdio']]], exts: ['.css','.scss','.less'], hint: 'Instale vscode-langservers-extracted.' },
  { id: 'yaml', label: 'YAML', commands: [['yaml-language-server', ['--stdio']]], exts: ['.yaml','.yml'], hint: 'Instale yaml-language-server.' },
  { id: 'lua', label: 'Lua', commands: [['lua-language-server', ['--stdio']]], exts: ['.lua'], hint: 'Instale lua-language-server.' },
  { id: 'php', label: 'PHP', commands: [['intelephense', ['--stdio']]], exts: ['.php'], hint: 'Instale @phpactor/language-server ou Intelephense (comando intelephense).' },
  { id: 'ruby', label: 'Ruby', commands: [['ruby-lsp', []]], exts: ['.rb','.rake','.gemspec'], hint: 'Instale ruby-lsp.' },
  { id: 'csharp', label: 'C#', commands: [['csharp-ls', []]], exts: ['.cs','.csx'], hint: 'Instale csharp-ls e .NET SDK.' },
  { id: 'kotlin', label: 'Kotlin', commands: [['kotlin-language-server', []]], exts: ['.kt','.kts'], hint: 'Instale kotlin-language-server.' },
  { id: 'vue', label: 'Vue', commands: [['vue-language-server', ['--stdio']]], exts: ['.vue'], hint: 'Instale @vue/language-server; projetos Vue podem precisar de TypeScript e configuração do workspace.' },
  { id: 'svelte', label: 'Svelte', commands: [['svelteserver', ['--stdio']]], exts: ['.svelte'], hint: 'Instale svelte-language-server.' },
  { id: 'astro', label: 'Astro', commands: [['astro-ls', ['--stdio']]], exts: ['.astro'], hint: 'Instale @astrojs/language-server e suas dependências.' },
  { id: 'markdown', label: 'Markdown', commands: [['marksman', ['server']]], exts: ['.md','.markdown'], hint: 'Instale Marksman.' },
  { id: 'toml', label: 'TOML', commands: [['taplo', ['lsp','stdio']]], exts: ['.toml'], hint: 'Instale Taplo CLI.' },
  { id: 'terraform', label: 'Terraform / HCL', commands: [['terraform-ls', ['serve']]], exts: ['.tf','.tfvars','.hcl'], hint: 'Instale terraform-ls.' },
  { id: 'zig', label: 'Zig', commands: [['zls', []]], exts: ['.zig','.zon'], hint: 'Instale ZLS compatível com sua versão de Zig.' },
  { id: 'swift', label: 'Swift', commands: [['sourcekit-lsp', []]], exts: ['.swift'], hint: 'Disponível em toolchains Swift que incluam sourcekit-lsp.' },
  { id: 'dockerfile', label: 'Dockerfile', commands: [['docker-langserver', ['--stdio']]], exts: ['.dockerfile'], hint: 'Instale dockerfile-language-server-nodejs; arquivos sem extensão Dockerfile podem precisar de associação manual.' },
  { id: 'prisma', label: 'Prisma', commands: [['prisma-language-server', ['--stdio']]], exts: ['.prisma'], hint: 'Instale prisma-language-server.' },
];

const ALLOWED = new Set([
  'textDocument/definition','textDocument/declaration','textDocument/typeDefinition','textDocument/references','textDocument/hover','textDocument/documentSymbol',
  'workspace/symbol','textDocument/implementation','textDocument/completion','textDocument/formatting','textDocument/signatureHelp',
  'textDocument/documentHighlight','textDocument/foldingRange','textDocument/prepareRename','textDocument/documentLink','textDocument/codeLens','textDocument/selectionRange',
  'textDocument/rangeFormatting','textDocument/codeAction','textDocument/rename','textDocument/prepareCallHierarchy',
  'callHierarchy/incomingCalls','callHierarchy/outgoingCalls','textDocument/diagnostic'
]);
const OPS = new Set(['status','diagnostics','definition','declaration','typeDefinition','references','hover','documentSymbol','workspaceSymbol','implementation','completion','signatureHelp','documentHighlight','foldingRange','prepareRename','documentLink','codeLens','selectionRange','format','rangeFormat','codeAction','rename','prepareCallHierarchy','incomingCalls','outgoingCalls','close']);
const MAX_TEXT = 2_000_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function safeRelativePath(value) {
  const p = String(value ?? '').trim().replace(/^\.\//, '').replace(/\\/g, '/');
  if (!p || p.startsWith('/') || p.includes('\0') || /(^|\/)\.\.(\/|$)/.test(p) || /^[A-Za-z]:/.test(p)) return '';
  return p;
}
export function executablePath(command, env = process.env, root = '') {
  if (!command || typeof command !== 'string') return null;
  const candidates = [];
  if (path.isAbsolute(command)) candidates.push(command);
  else {
    const dirs = [path.join(root, 'node_modules', '.bin'), path.join(root, 'vendor', 'bin'), ...(env.PATH || '').split(path.delimiter)];
    for (const dir of dirs) if (dir) candidates.push(path.join(dir, command));
  }
  for (const c of candidates) {
    try { const st = fs.statSync(c); if (st.isFile() && (process.platform === 'win32' || (st.mode & 0o111))) return c; } catch {}
  }
  return null;
}
function lspUri(root, rel) { return pathToFileURL(path.resolve(root, rel)).href; }
function extOf(p) { return path.extname(p).toLowerCase(); }
function matchesSpec(spec, rel) { return spec.id==='dockerfile' ? /(^|\/)dockerfile(?:\.[^/]+)?$/i.test(String(rel||'')) : spec.exts.includes(extOf(rel)); }
function position(args) { return { line: Math.max(0, Number.isFinite(+args.line) ? Math.floor(+args.line) - 1 : 0), character: Math.max(0, Number.isFinite(+args.character) ? Math.floor(+args.character) - 1 : 0) }; }
function textOfMarkup(v) {
  if (typeof v === 'string') return v;
  if (!v) return '';
  if (Array.isArray(v)) return v.map(textOfMarkup).filter(Boolean).join('\n');
  if (typeof v.value === 'string') return v.value;
  if (Array.isArray(v.contents)) return v.contents.map(textOfMarkup).filter(Boolean).join('\n');
  if (v.contents) return textOfMarkup(v.contents);
  return '';
}
function locLine(root, loc) {
  const uri = loc?.uri || loc?.targetUri || '';
  let file = uri;
  try { if (uri.startsWith('file:')) file = new URL(uri).pathname; } catch {}
  if (file) { try { const f = decodeURIComponent(file); if (f.startsWith(root + path.sep)) file = path.relative(root, f).split(path.sep).join('/'); } catch {} }
  const range = loc?.range || loc?.targetSelectionRange || loc?.targetRange || {};
  const start = range.start || {};
  return { path: String(file || '(desconhecido)'), line: Number.isFinite(start.line) ? start.line + 1 : null, character: Number.isFinite(start.character) ? start.character + 1 : null, range };
}
function compactSymbol(symbol, depth = 0) {
  if (!symbol || depth > 5) return null;
  const out = { name: String(symbol.name || ''), kind: symbol.kind, detail: String(symbol.detail || ''), range: symbol.range, selectionRange: symbol.selectionRange };
  if (Array.isArray(symbol.children) && symbol.children.length) out.children = symbol.children.slice(0, 40).map(x => compactSymbol(x, depth + 1)).filter(Boolean);
  return out;
}
export function formatDiagnostics(root, items = []) {
  const sev = {1:'ERRO',2:'AVISO',3:'INFO',4:'DICA'};
  return items.slice(0, 100).map(d => {
    const at = locLine(root, { uri: d.uri, range: d.range });
    return `${at.path}${at.line ? ':' + at.line + ':' + (at.character || 1) : ''}: ${sev[d.severity] || 'DIAGNÓSTICO'}: ${String(d.message || '').replace(/\s+/g,' ').slice(0, 500)}${d.source ? ' ['+d.source+']' : ''}${d.code != null ? ' (código '+String(d.code)+')' : ''}`;
  }).join('\n');
}

class JsonRpcProcess {
  constructor(command, args, options = {}) {
    this.command = command; this.args = args; this.options = options; this.proc = null; this.buffer = Buffer.alloc(0); this.pending = new Map(); this.seq = 0; this.diags = new Map(); this.stderr = ''; this.serverRequests = [];
  }
  start() {
    if (this.proc) return;
    const p = this.proc = (this.options.spawn || spawn)(this.command, this.args, { cwd: this.options.cwd, env: this.options.env, stdio: ['pipe','pipe','pipe'], shell: false, windowsHide: true });
    p.stdout.on('data', d => this.#data(d));
    p.stderr.on('data', d => { this.stderr = (this.stderr + d.toString('utf8')).slice(-4000); });
    p.on('error', e => this.#failAll(new Error(`Não consegui iniciar ${path.basename(this.command)}: ${e.message}`)));
    p.on('close', (code, signal) => { this.proc = null; this.#failAll(new Error(`Servidor LSP encerrou (código ${code ?? '?'}${signal ? ', sinal '+signal : ''}). ${this.stderr.slice(-800)}`)); });
  }
  #failAll(error) { for (const q of this.pending.values()) { clearTimeout(q.timer); q.reject(error); } this.pending.clear(); }
  #write(msg) {
    if (!this.proc?.stdin?.writable) throw new Error('Servidor LSP não está conectado.');
    const body = Buffer.from(JSON.stringify(msg), 'utf8');
    this.proc.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]));
  }
  #data(data) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
    while (this.buffer.length) {
      const sep = this.buffer.indexOf('\r\n\r\n');
      if (sep < 0) { if (this.buffer.length > 32_768) this.#failAll(new Error('Cabeçalho LSP excessivo.')); return; }
      const head = this.buffer.subarray(0, sep).toString('ascii');
      const m = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(head);
      if (!m) { this.#failAll(new Error('Cabeçalho LSP sem Content-Length.')); this.buffer = Buffer.alloc(0); return; }
      const n = Number(m[1]);
      if (!Number.isSafeInteger(n) || n < 0 || n > 20_000_000) { this.#failAll(new Error('Mensagem LSP excede 20 MB.')); this.buffer = Buffer.alloc(0); return; }
      if (this.buffer.length < sep + 4 + n) return;
      const payload = this.buffer.subarray(sep + 4, sep + 4 + n); this.buffer = this.buffer.subarray(sep + 4 + n);
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
      this.#message(msg);
    }
  }
  #message(msg) {
    if (msg.method === 'textDocument/publishDiagnostics') { this.diags.set(String(msg.params?.uri || ''), Array.isArray(msg.params?.diagnostics) ? msg.params.diagnostics : []); return; }
    if (msg.method && msg.id != null) {
      // Requests from server to client. Respond narrowly; never apply edits from a server.
      let result = null;
      if (msg.method === 'workspace/configuration') result = (msg.params?.items || []).map(() => null);
      else if (msg.method === 'workspace/workspaceFolders') result = this.options.workspaceFolders || [];
      else if (msg.method === 'client/registerCapability' || msg.method === 'client/unregisterCapability' || msg.method === 'window/workDoneProgress/create') result = null;
      else if (msg.method === 'workspace/applyEdit') result = { applied: false, failureReason: 'CodeMobile não aplica edições do servidor automaticamente.' };
      else if (msg.method === 'window/showMessageRequest') result = null;
      try { this.#write({ jsonrpc:'2.0', id:msg.id, result }); } catch {}
      this.serverRequests.push({ method: msg.method, ignored: !['workspace/configuration','workspace/workspaceFolders','client/registerCapability','client/unregisterCapability','window/workDoneProgress/create','workspace/applyEdit','window/showMessageRequest'].includes(msg.method) });
      if (this.serverRequests.length > 50) this.serverRequests.shift();
      return;
    }
    if (msg.id == null) return;
    const q = this.pending.get(msg.id); if (!q) return;
    clearTimeout(q.timer); this.pending.delete(msg.id);
    if (msg.error) q.reject(new Error(`LSP ${msg.error.code ?? ''}: ${msg.error.message || 'erro do servidor'}`)); else q.resolve(msg.result);
  }
  notify(method, params) { this.#write({ jsonrpc:'2.0', method, params }); }
  request(method, params, timeout = 12_000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Tempo esgotado aguardando ${method} do servidor LSP.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.#write({ jsonrpc:'2.0', id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  async dispose() {
    const p = this.proc; if (!p) return;
    try { await this.request('shutdown', null, 1200); } catch {}
    try { this.notify('exit', null); } catch {}
    try { p.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { if (this.proc === p) p.kill('SIGKILL'); } catch {} }, 1200).unref?.();
    this.proc = null;
    this.#failAll(new Error('Sessão LSP encerrada.'));
  }
}

class LspSession {
  constructor(spec, launch, root, options = {}) {
    this.spec = spec; this.command = launch.command; this.args = launch.args || []; this.root = root; this.options = options; this.opened = new Map(); this.version = new Map(); this.lastUsed = Date.now();
    this.rpc = new JsonRpcProcess(this.command, this.args, { cwd: root, env: options.env || process.env, spawn: options.spawn, workspaceFolders: [{ uri:pathToFileURL(root).href, name:path.basename(root) }] });
    this.ready = null;
  }
  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.rpc.start();
      const rootUri = pathToFileURL(this.root + path.sep).href.replace(/\/$/, '');
      await this.rpc.request('initialize', {
        processId: process.pid, clientInfo: { name:'CodeMobile', version:'2.0' }, rootPath:this.root, rootUri,
        workspaceFolders:[{ uri:rootUri, name:path.basename(this.root) }], trace:'off', initializationOptions:{},
        capabilities:{
          workspace:{ applyEdit:false, workspaceFolders:true, configuration:true, symbol:{ dynamicRegistration:false }, fileOperations:{} },
          general:{ positionEncodings:['utf-16'] },
          textDocument:{
            synchronization:{ dynamicRegistration:false, willSave:false, didSave:true },
            publishDiagnostics:{ relatedInformation:true, tagSupport:{ valueSet:[1,2] }, versionSupport:true },
            hover:{ contentFormat:['markdown','plaintext'] },
            definition:{ linkSupport:true }, declaration:{ linkSupport:true }, typeDefinition:{ linkSupport:true }, implementation:{ linkSupport:true }, references:{},
            signatureHelp:{ signatureInformation:{ documentationFormat:['markdown','plaintext'], parameterInformation:{ labelOffsetSupport:true } } },
            documentHighlight:{}, foldingRange:{ lineFoldingOnly:false }, documentLink:{ tooltipSupport:true }, codeLens:{ dynamicRegistration:false }, selectionRange:{ dynamicRegistration:false },
            documentSymbol:{ hierarchicalDocumentSymbolSupport:true, symbolKind:{ valueSet:Array.from({length:26},(_,i)=>i+1) } },
            workspaceSymbol:{ symbolKind:{ valueSet:Array.from({length:26},(_,i)=>i+1) } },
            completion:{ completionItem:{ snippetSupport:false, documentationFormat:['markdown','plaintext'], resolveSupport:{ properties:['documentation','detail'] } } },
            rename:{ prepareSupport:true }, codeAction:{ codeActionLiteralSupport:{ codeActionKind:{ valueSet:['quickfix','refactor','refactor.extract','refactor.inline','refactor.rewrite','source','source.organizeImports'] } }, dataSupport:true },
            formatting:{ dynamicRegistration:false }, rangeFormatting:{ dynamicRegistration:false }, callHierarchy:{ dynamicRegistration:false }, diagnostic:{ dynamicRegistration:false, relatedDocumentSupport:false }
          }
        }
      }, this.options.startTimeout || 15_000);
      this.rpc.notify('initialized', {});
    })().catch(e => { this.ready = null; try { this.rpc.proc?.kill('SIGKILL'); } catch {} throw e; });
    return this.ready;
  }
  async syncDocument(rel, text) {
    await this.start();
    const uri = lspUri(this.root, rel), old = this.opened.get(uri); this.lastUsed = Date.now();
    if (old === text) return uri;
    const version = (this.version.get(uri) || 0) + 1; this.version.set(uri, version); this.opened.set(uri, text);
    if (old == null) this.rpc.notify('textDocument/didOpen', { textDocument:{ uri, languageId:languageId(rel), version, text } });
    else this.rpc.notify('textDocument/didChange', { textDocument:{ uri, version }, contentChanges:[{ text }] });
    return uri;
  }
  async query(op, args, files) {
    this.lastUsed = Date.now();
    await this.start();
    // Mantenha todo documento já aberto coerente com o workspace recebido: sem isto
    // o servidor pode responder a definições/referências com buffer antigo após uma edição.
    for (const [openedUri, oldText] of [...this.opened]) {
      let openedRel = '';
      try { openedRel = safeRelativePath(path.relative(this.root, fileURLToPath(openedUri)).split(path.sep).join('/')); } catch {}
      if (!openedRel || !Object.hasOwn(files, openedRel)) {
        try { this.rpc.notify('textDocument/didClose', { textDocument:{ uri:openedUri } }); } catch {}
        this.opened.delete(openedUri); this.version.delete(openedUri); this.rpc.diags.delete(openedUri);
      } else if (String(files[openedRel] ?? '') !== oldText) await this.syncDocument(openedRel, String(files[openedRel] ?? ''));
    }
    const rel = safeRelativePath(args.path || '');
    const text = rel ? String(files[rel] ?? '') : '';
    let uri = '';
    if (rel) uri = await this.syncDocument(rel, text);
    const pos = position(args), td = { uri }, params = { textDocument:td, position:pos };
    let result;
    if (op === 'status') return 'internal-status';
    if (op === 'diagnostics') {
      if (!rel) throw new Error('Informe path para diagnosticar um arquivo.');
      await sleep(350);
      const cached = this.rpc.diags.get(uri) || [];
      try {
        const pull = await this.rpc.request('textDocument/diagnostic', { textDocument:td }, 4500);
        if (pull?.items && Array.isArray(pull.items)) this.rpc.diags.set(uri, pull.items);
        else if (pull?.kind === 'full' && Array.isArray(pull.items)) this.rpc.diags.set(uri, pull.items);
      } catch (e) { if (!/method not found| -32601|unknown method/i.test(e.message)) { /* pull diagnostics are optional; use pushed ones */ } }
      const ds = this.rpc.diags.get(uri) || cached;
      return ds.length ? `DIAGNÓSTICOS LSP REAIS (${ds.length})\n${formatDiagnostics(this.root, ds.map(d => ({...d, uri:d.uri||uri})))}` : 'O servidor LSP não publicou diagnósticos para este arquivo ainda. Isso não prova que o arquivo não tem erros.';
    }
    const call = async method => this.rpc.request(method, params, op === 'completion' ? 6000 : 12_000);
    if (op === 'definition') result = await call('textDocument/definition');
    else if (op === 'declaration') result = await call('textDocument/declaration');
    else if (op === 'typeDefinition') result = await call('textDocument/typeDefinition');
    else if (op === 'references') result = await this.rpc.request('textDocument/references', { ...params, context:{ includeDeclaration:true } });
    else if (op === 'hover') result = await call('textDocument/hover');
    else if (op === 'documentSymbol') result = await this.rpc.request('textDocument/documentSymbol', { textDocument:td });
    else if (op === 'workspaceSymbol') result = await this.rpc.request('workspace/symbol', { query:String(args.query || args.symbol || '').slice(0,200) });
    else if (op === 'implementation') result = await call('textDocument/implementation');
    else if (op === 'completion') result = await call('textDocument/completion');
    else if (op === 'signatureHelp') result = await call('textDocument/signatureHelp');
    else if (op === 'documentHighlight') result = await call('textDocument/documentHighlight');
    else if (op === 'foldingRange') result = await this.rpc.request('textDocument/foldingRange', { textDocument:td });
    else if (op === 'prepareRename') result = await this.rpc.request('textDocument/prepareRename', params);
    else if (op === 'documentLink') result = await this.rpc.request('textDocument/documentLink', { textDocument:td });
    else if (op === 'codeLens') result = await this.rpc.request('textDocument/codeLens', { textDocument:td });
    else if (op === 'selectionRange') result = await this.rpc.request('textDocument/selectionRange', { textDocument:td, positions:[pos] });
    else if (op === 'format') result = await this.rpc.request('textDocument/formatting', { textDocument:td, options:{ tabSize:Math.max(1,Math.min(8,Math.floor(+args.tabSize||2))), insertSpaces:args.insertSpaces !== false } });
    else if (op === 'rangeFormat') result = await this.rpc.request('textDocument/rangeFormatting', { textDocument:td, range:{ start:pos, end:{ line:Math.max(pos.line,Math.floor(+args.endLine||+args.line||1)-1), character:Math.max(0,Math.floor(+args.endCharacter||10000)-1) } }, options:{ tabSize:Math.max(1,Math.min(8,Math.floor(+args.tabSize||2))), insertSpaces:args.insertSpaces !== false } });
    else if (op === 'codeAction') {
      const range={start:pos,end:{line:Math.max(pos.line,Math.floor(+args.endLine||+args.line||1)-1),character:Math.max(pos.character,Math.floor(+args.endCharacter||pos.character+1))}};
      result=await this.rpc.request('textDocument/codeAction',{textDocument:td,range,context:{diagnostics:this.rpc.diags.get(uri)||[],only:args.kind?[String(args.kind).slice(0,100)]:undefined,triggerKind:1}});
    } else if (op === 'rename') {
      const newName=String(args.newName||'').trim(); if(!newName||newName.length>160||/[\r\n\0]/.test(newName)) throw new Error('Informe newName válido.');
      result=await this.rpc.request('textDocument/rename',{...params,newName});
    } else if (op === 'prepareCallHierarchy') result=await call('textDocument/prepareCallHierarchy');
    else if (op === 'incomingCalls' || op === 'outgoingCalls') {
      const item=args.item && typeof args.item==='object' ? args.item : null;
      let items=item?[item]:await this.rpc.request('textDocument/prepareCallHierarchy',params);
      if(!Array.isArray(items)||!items.length) return 'Nenhum item de hierarquia de chamadas foi retornado pelo servidor LSP.';
      result=await this.rpc.request(op==='incomingCalls'?'callHierarchy/incomingCalls':'callHierarchy/outgoingCalls',{item:items[0]});
    } else throw new Error('Operação LSP não suportada.');
    return formatResult(op, result, this.root, this.opened, uri);
  }
  async dispose() { await this.rpc.dispose(); this.opened.clear(); }
}
function languageId(p) {
  if(/(^|\/)dockerfile(?:\.[^/]+)?$/i.test(String(p||'')))return 'dockerfile';
  const e=extOf(p); return ({'.ts':'typescript','.tsx':'typescriptreact','.js':'javascript','.jsx':'javascriptreact','.mjs':'javascript','.cjs':'javascript','.py':'python','.pyi':'python','.go':'go','.rs':'rust','.c':'c','.h':'c','.cpp':'cpp','.cc':'cpp','.hpp':'cpp','.sh':'shellscript','.bash':'shellscript','.json':'json','.jsonc':'jsonc','.html':'html','.htm':'html','.css':'css','.scss':'scss','.less':'less','.yaml':'yaml','.yml':'yaml','.lua':'lua','.php':'php','.rb':'ruby','.cs':'csharp','.kt':'kotlin','.kts':'kotlin','.vue':'vue','.svelte':'svelte','.astro':'astro','.md':'markdown','.markdown':'markdown','.toml':'toml','.tf':'terraform','.tfvars':'terraform','.hcl':'terraform','.zig':'zig','.zon':'zig','.swift':'swift','.dockerfile':'dockerfile','.prisma':'prisma'}[e] || e.slice(1) || 'plaintext');
}
function offsetAt(text, pos = {}) {
  const s=String(text||''), targetLine=Math.max(0,Math.floor(Number(pos.line)||0)), targetChar=Math.max(0,Math.floor(Number(pos.character)||0));
  let start=0,line=0;
  while(line<targetLine){const next=s.indexOf('\n',start);if(next<0)return s.length;start=next+1;line++;}
  return Math.min(s.length,start+targetChar);
}
function applyTextEditsPreview(text, edits=[]) {
  let out=String(text||'');const normalized=[];
  for(const e of Array.isArray(edits)?edits:[])if(e&&e.range&&e.range.start&&e.range.end){
    const start=offsetAt(out,e.range.start),end=offsetAt(out,e.range.end);
    if(end>=start)normalized.push({start,end,text:String(e.newText||'')});
  }
  normalized.sort((a,b)=>b.start-a.start||b.end-a.end);let lastStart=out.length+1;
  for(const e of normalized){if(e.end>lastStart)continue;out=out.slice(0,e.start)+e.text+out.slice(e.end);lastStart=e.start;}
  return out;
}
function compactDiff(before,after,maxLines=50) {
  const a=String(before||'').split('\n'),b=String(after||'').split('\n');let pre=0,suf=0;
  while(pre<a.length&&pre<b.length&&a[pre]===b[pre])pre++;
  while(suf<a.length-pre&&suf<b.length-pre&&a[a.length-1-suf]===b[b.length-1-suf])suf++;
  if(pre===a.length&&pre===b.length)return '(sem diferenças textuais)';
  const old=a.slice(pre,a.length-suf),next=b.slice(pre,b.length-suf),cap=Math.max(5,Math.floor(maxLines/2));
  const show=(rows,prefix)=>rows.slice(0,cap).map(x=>prefix+x).join('\n');
  return `@@ linhas ${pre+1}–${Math.max(pre+old.length,pre+next.length)} @@\n`+show(old,'- ')+(old.length>cap?'\n- … linhas antigas omitidas':'')+'\n'+show(next,'+ ')+(next.length>cap?'\n+ … linhas novas omitidas':'');
}
function formatResult(op, result, root, documents = new Map(), currentUri = '') {
  if (result == null) return `O servidor LSP não retornou resultado para ${op}.`;
  if (op === 'hover') return result.contents ? 'HOVER LSP\n'+textOfMarkup(result.contents).slice(0,6000)+(result.range?`\n\nIntervalo: linha ${result.range.start.line+1}, caractere ${result.range.start.character+1}`:'') : 'O servidor LSP não forneceu hover para essa posição.';
  if (['definition','declaration','typeDefinition','implementation','references'].includes(op)) {
    const list=Array.isArray(result)?result:result? [result]:[];
    return list.length ? `${op==='definition'?'DEFINIÇÕES':op==='declaration'?'DECLARAÇÕES':op==='typeDefinition'?'DEFINIÇÕES DE TIPO':op==='implementation'?'IMPLEMENTAÇÕES':'REFERÊNCIAS'} LSP (${list.length})\n`+list.slice(0,80).map(x=>{const at=locLine(root,x);return `${at.path}${at.line?':'+at.line+':'+(at.character||1):''}${at.range?.end?`-${at.range.end.line+1}:${at.range.end.character+1}`:''}`}).join('\n')+(list.length>80?'\n… resultados limitados a 80.':'') : `Nenhum resultado LSP para ${op}.`;
  }
  if (op === 'documentSymbol' || op === 'workspaceSymbol') {
    const list=Array.isArray(result)?result:[]; const flatten=(xs,d=0)=>xs.flatMap(x=>{const line=x.location?.range?.start?.line ?? x.range?.start?.line;const p=x.location?locLine(root,x.location).path:'';return [`${'  '.repeat(d)}• ${x.name||'(sem nome)'}${x.kind?' [kind '+x.kind+']':''}${x.detail?' — '+x.detail:''}${line!=null?' — '+(p?p+':':'')+'linha '+(line+1):''}`,...(Array.isArray(x.children)?flatten(x.children,d+1):[])];});
    return list.length?`SÍMBOLOS LSP (${list.length})\n${flatten(list).slice(0,100).join('\n')}${list.length>100?'\n… símbolos limitados.':''}`:'Nenhum símbolo retornado pelo servidor LSP.';
  }
  if (op === 'completion') {
    const list=Array.isArray(result)?result:(result.items||[]);return list.length?'COMPLETIONS LSP ('+list.length+')\n'+list.slice(0,35).map(x=>'• '+x.label+(x.detail?' — '+x.detail:'')+(x.kind?' [kind '+x.kind+']':'')+(x.documentation?'\n  '+textOfMarkup(x.documentation).slice(0,150):'')).join('\n'):'Nenhuma sugestão de completamento retornada.';
  }
  if (op === 'signatureHelp') {
    const signatures=result.signatures||[];return signatures.length?'SIGNATURE HELP LSP\n'+signatures.slice(0,8).map((x,i)=>`${i+1}. ${x.label||'(assinatura)'}${x.documentation?'\n  '+textOfMarkup(x.documentation).slice(0,300):''}`).join('\n'):'O servidor não retornou assinatura para esta posição.';
  }
  if (op === 'documentHighlight') return Array.isArray(result)&&result.length?`DESTAQUES LSP: ${result.length} ocorrência(s) no documento.\n`+result.slice(0,50).map(x=>`linha ${(x.range?.start?.line??0)+1}:${(x.range?.start?.character??0)+1}–${(x.range?.end?.line??0)+1}:${(x.range?.end?.character??0)+1}`).join('\n'):'Nenhum destaque retornado.';
  if (op === 'foldingRange') return Array.isArray(result)&&result.length?`REGIÕES RECOLHÍVEIS LSP (${result.length})\n`+result.slice(0,80).map(x=>`linhas ${(x.startLine??0)+1}–${(x.endLine??0)+1}${x.kind?' ['+x.kind+']':''}`).join('\n'):'Nenhuma região recolhível retornada.';
  if (op === 'prepareRename') return result?`PREPARAÇÃO DE RENOMEAÇÃO LSP\n${result.placeholder?'Nome atual: '+result.placeholder+'\n':''}${result.range?`Intervalo: linha ${(result.range.start?.line??0)+1}:${(result.range.start?.character??0)+1}–${(result.range.end?.line??0)+1}:${(result.range.end?.character??0)+1}`:'O servidor aceitou a posição para renomeação.'}\nNenhum arquivo foi alterado.`:'O servidor não permite renomear o símbolo nesta posição.';
  if (op === 'documentLink') return Array.isArray(result)&&result.length?`LINKS DO DOCUMENTO LSP (${result.length})\n`+result.slice(0,50).map(x=>`linha ${(x.range?.start?.line??0)+1}${x.target?' → '+String(x.target).slice(0,180):' (destino não resolvido)'}`).join('\n'):'Nenhum link de documento retornado.';
  if (op === 'codeLens') return Array.isArray(result)&&result.length?`CODE LENS LSP (${result.length}); nada foi executado.\n`+result.slice(0,40).map(x=>`linha ${(x.range?.start?.line??0)+1}${x.command?.title?' — '+x.command.title:''}`).join('\n'):'Nenhum code lens retornado.';
  if (op === 'selectionRange') { const list=Array.isArray(result)?result:[];let out=[];function walk(x,d=0){if(!x||d>12)return;out.push(`${'  '.repeat(d)}linhas ${(x.range?.start?.line??0)+1}:${(x.range?.start?.character??0)+1}–${(x.range?.end?.line??0)+1}:${(x.range?.end?.character??0)+1}`);walk(x.parent,d+1);}list.slice(0,5).forEach(walk);return out.length?'SELECTION RANGE LSP\n'+out.join('\n'):'Nenhum intervalo de seleção retornado.'; }
  if (op === 'format' || op === 'rangeFormat') {
    const list=Array.isArray(result)?result:[];if(!list.length)return 'O formatador não sugeriu edições.';
    let out=`PRÉVIA DE FORMATAÇÃO LSP: ${list.length} edição(ões) propostas. Nada foi aplicado.\n`+list.slice(0,30).map(e=>`linha ${(e.range?.start?.line??0)+1}:${(e.range?.start?.character??0)+1} → ${JSON.stringify(String(e.newText||'').slice(0,160))}`).join('\n')+(list.length>30?'\n… prévia limitada.':'');
    const before=documents.get(currentUri);if(typeof before==='string'){const after=applyTextEditsPreview(before,list);out+='\n\nDIFF DE PRÉVIA (somente memória; arquivo não modificado)\n'+compactDiff(before,after,60);}
    return out;
  }
  if (op === 'codeAction') return Array.isArray(result)&&result.length?`AÇÕES DE CÓDIGO LSP (${result.length}); nenhuma foi executada.\n`+result.slice(0,40).map((x,i)=>`${i+1}. ${x.title||'(ação sem título)'}${x.kind?' ['+x.kind+']':''}${x.edit?' — contém edição proposta':''}${x.command?' — comando disponível':''}`).join('\n'):'Nenhuma code action disponível para este intervalo.';
  if (op === 'rename') {
    const changes=result.changes||{}, dc=result.documentChanges||[];let entries=[];
    for(const [uri,edits] of Object.entries(changes)) entries.push({uri,edits});
    for(const doc of dc) if(doc.textDocument && Array.isArray(doc.edits)) entries.push({uri:doc.textDocument.uri,edits:doc.edits});
    const total=entries.reduce((n,x)=>n+x.edits.length,0);
    return entries.length?`PRÉVIA DE RENOMEAÇÃO LSP: ${entries.length} arquivo(s), ${total} edição(ões). NÃO foi aplicado.\n`+entries.slice(0,40).map(f=>{const title=locLine(root,{uri:f.uri}).path;const diff=documents.has(f.uri)?'\n'+compactDiff(documents.get(f.uri),applyTextEditsPreview(documents.get(f.uri),f.edits),36):'';return `${title}\n`+f.edits.slice(0,12).map(e=>`  linha ${(e.range?.start?.line??0)+1}: ${JSON.stringify(String(e.newText||'').slice(0,120))}`).join('\n')+diff;}).join('\n')+(entries.length>40?'\n… arquivos limitados.':''):'O servidor LSP não propôs alterações para esse nome.';
  }
  if (op === 'prepareCallHierarchy') return Array.isArray(result)&&result.length?'HIERARQUIA DE CHAMADAS LSP\n'+result.slice(0,15).map(x=>`${x.name} — ${locLine(root,{uri:x.uri,range:x.range}).path}:${(x.range?.start?.line??0)+1}`).join('\n')+'\nPasse o item retornado para incomingCalls/outgoingCalls para expandir.':'Nenhum item de hierarquia disponível nessa posição.';
  if (op === 'incomingCalls' || op === 'outgoingCalls') return Array.isArray(result)&&result.length?`${op==='incomingCalls'?'CHAMADAS ENTRANTES':'CHAMADAS SAINTES'} LSP (${result.length})\n`+result.slice(0,50).map(x=>`${x.from?.name||'(símbolo)'} — ${locLine(root,{uri:x.from?.uri,range:x.fromRanges?.[0]}).path}:${(x.fromRanges?.[0]?.start?.line??0)+1}`).join('\n'):'Nenhuma chamada retornada pela hierarquia LSP.';
  return JSON.stringify(result).slice(0,9000);
}

export class LspManager {
  constructor(options = {}) { this.specs=options.specs||LSP_SERVERS; this.env=options.env||process.env; this.spawn=options.spawn||spawn; this.maxSessions=Math.max(1,Math.min(8,options.maxSessions||3)); this.idleMs=Math.max(30_000,options.idleMs||5*60_000); this.sessions=new Map(); this.startTimeout=options.startTimeout||15_000; this.sweeper=setInterval(()=>{ const now=Date.now(); for(const [key,session] of this.sessions) if(now-session.lastUsed>this.idleMs){ this.sessions.delete(key); session.dispose().catch(()=>{}); } },Math.min(60_000,this.idleMs)); this.sweeper.unref?.(); }
  catalog(root = '') {
    const specs=this.specs.map(s=>{let chosen=null;for(const [command,args] of s.commands){const found=executablePath(command,this.env,root);if(found){chosen={command:found,args};break}}return {id:s.id,label:s.label,extensions:s.id==='dockerfile'?['Dockerfile','.dockerfile']:s.exts,available:!!chosen,command:chosen?path.basename(chosen.command):null,hint:s.hint||''};});
    return {ok:true,mode:'LSP',available:specs.some(x=>x.available),sessions:this.sessions.size,servers:specs};
  }
  async handle(input, root) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Pedido LSP inválido.');
    const op=String(input.operation||'status'); if(!OPS.has(op))throw new Error('Operação LSP desconhecida: '+op);
    if(op==='status') return this.catalog(root);
    if(!root || !path.isAbsolute(root) || !fs.existsSync(root))throw new Error('Workspace LSP inválido.');
    const args=input.args&&typeof input.args==='object'?{...input.args,...input}:input;
    const file= safeRelativePath(args.path||'');
    if(op==='close') { await this.closeProject(root); return {ok:true,output:'Sessões LSP encerradas para este projeto.'}; }
    if(op==='diagnostics'&&!file) {
      const incoming=input.files&&typeof input.files==='object'?input.files:{};
      const paths=Object.keys(incoming).filter(p=>safeRelativePath(p)&&typeof incoming[p]==='string'&&String(incoming[p]).length<=MAX_TEXT&&!/(^|\/)(?:node_modules|\.git|dist|build|coverage|\.cache)\//.test(p)).sort();
      const chosen=[];const chosenServers=new Set();const denoProject=Object.keys(incoming).some(p=>/^deno\.(?:json|jsonc)$/.test(path.basename(p)));
      for(const rel of paths) {
        const ext=extOf(rel);let candidates=this.specs.filter(spec=>matchesSpec(spec,rel));
        if(input.server)candidates=candidates.filter(spec=>spec.id===String(input.server));
        if(denoProject&&['.ts','.tsx','.js','.jsx','.mjs','.mts'].includes(ext))candidates=candidates.sort((a,b)=>(a.id==='deno'?-1:0)-(b.id==='deno'?-1:0));
        const found=candidates.find(spec=>spec.commands.some(([command])=>executablePath(command,this.env,root)));
        if(!found||(!chosenServers.has(found.id)&&chosenServers.size>=3))continue;
        chosenServers.add(found.id);chosen.push(rel);if(chosen.length>=24)break;
      }
      if(!chosen.length)return {ok:true,available:false,output:'DIAGNÓSTICOS LSP DO WORKSPACE: nenhum arquivo compatível com um servidor LSP instalado foi encontrado. Instale/aponte um servidor no PATH e use lsp(status).'};
      const sections=[];let checked=0,failed=0;
      for(const rel of chosen){const r=await this.handle({...input,path:rel},root);if(r.available){checked++;sections.push('### '+rel+'\n'+String(r.output||'').slice(0,1800));}else failed++;}
      return {ok:true,available:checked>0,operation:'diagnostics',filesChecked:checked,servers:[...chosenServers],output:`DIAGNÓSTICOS LSP DO WORKSPACE — ${checked} arquivo(s) analisado(s), até 24 arquivos e 3 servidores nesta execução.${failed?` ${failed} arquivo(s) ignorado(s) por falta de servidor.`:''}\n`+sections.join('\n\n').slice(0,14000)+(paths.length>chosen.length?'\n\nNota: resultado limitado; use lsp diagnostics com path para conferir outro arquivo.':'')};
    }
    let candidateSpecs=op==='workspaceSymbol'?[]:this.specs.filter(s=>matchesSpec(s,file));
    const preferredServer=String(args.server||'').trim();
    if(preferredServer&&op!=='workspaceSymbol')candidateSpecs=candidateSpecs.filter(s=>s.id===preferredServer);
    if (['.ts','.tsx','.js','.jsx','.mjs','.mts'].includes(extOf(file))) {
      const files=input.files&&typeof input.files==='object'?input.files:{};
      const denoProject=Object.keys(files).some(p=>/^deno\.(?:json|jsonc)$/.test(path.basename(p))) || fs.existsSync(path.join(root,'deno.json')) || fs.existsSync(path.join(root,'deno.jsonc'));
      if (denoProject) candidateSpecs.sort((a,b)=>(a.id==='deno'?-1:0)-(b.id==='deno'?-1:0));
    }
    if(op!=='workspaceSymbol'&&(!file||!candidateSpecs.length))return {ok:false,available:false,output:'Não há servidor LSP registrado para esta extensão. Use project_diagnostics ou symbol_index como fallback heurístico.'};
    let chosenSpec, chosen;
    if(op==='workspaceSymbol') { const best=this.#bestAvailableSpec(root,preferredServer); chosenSpec=best?.spec; chosen=best?.chosen; }
    else {
      for(const candidate of candidateSpecs) {
        const got=candidate.commands.map(([command,argv])=>({command:executablePath(command,this.env,root),args:argv})).find(x=>x.command);
        if(got){chosenSpec=candidate;chosen=got;break;}
      }
      chosenSpec ||= candidateSpecs[0];
    }
    if(!chosenSpec || !chosen) return {ok:false,available:false,server:chosenSpec?.id||null,output:'Servidor LSP não instalado ou não está no PATH. Nenhum LSP real foi executado. '+(chosenSpec?.hint||'Verifique os servidores disponíveis em lsp(status).'),catalog:this.catalog(root)};
    if(file && !Object.hasOwn(input.files||{},file) && !fs.existsSync(path.join(root,file)))return {ok:false,output:'Arquivo não encontrado no projeto: '+file};
    if(file && !Object.hasOwn(input.files||{},file)) return {ok:false,output:'O arquivo não está no conjunto sincronizado do CodeMobile.'};
    if(file && String(input.files[file]||'').length>MAX_TEXT)return {ok:false,output:'Arquivo grande demais para enviar ao LSP (máx. 2 MB).'};
    const key=path.resolve(root)+'::'+chosenSpec.id;
    let session=this.sessions.get(key);
    if(!session || !session.rpc.proc) {
      if(session) { try{await session.dispose()}catch{} this.sessions.delete(key); }
      await this.#makeRoom();
      session=new LspSession(chosenSpec,{command:chosen.command,args:chosen.args},path.resolve(root),{env:{...this.env,PATH:[path.join(root,'node_modules','.bin'),...(this.env.PATH||'').split(path.delimiter)].join(path.delimiter)},spawn:this.spawn,startTimeout:this.startTimeout});
      this.sessions.set(key,session);
    }
    try {
      const files=input.files&&typeof input.files==='object'?input.files:{};
      const output=await session.query(op,args,files);
      session.lastUsed=Date.now();
      return {ok:true,available:true,server:chosenSpec.id,operation:op,output,diagnosticsCount:session.rpc.diags.get(file?lspUri(root,file):'')?.length||0};
    } catch(e) {
      if(!session.rpc.proc) this.sessions.delete(key);
      return {ok:false,available:true,server:chosenSpec.id,output:'Erro do servidor LSP: '+String(e.message||e).slice(0,1500),stderr:session.rpc.stderr.slice(-1000)};
    }
  }
  #bestAvailableSpec(root, preferred='') {
    if(preferred){const spec=this.specs.find(x=>x.id===preferred);if(!spec)return null;for(const [command,args] of spec.commands){const found=executablePath(command,this.env,root);if(found)return {spec,chosen:{command:found,args}};}return null;}
    const priorities=['typescript','deno','pyright','pylsp','gopls','rust-analyzer','clangd','bash','json','html','css','yaml','lua','php','ruby','csharp','kotlin','vue','svelte','astro','markdown','toml','terraform','zig','swift','dockerfile','prisma'];
    for(const id of priorities){const s=this.specs.find(x=>x.id===id);if(!s)continue;for(const [command,args] of s.commands){const found=executablePath(command,this.env,root);if(found)return {spec:s,chosen:{command:found,args}};}}
    // Custom test/project servers may not be in the built-in priority list.
    for(const s of this.specs)for(const [command,args] of s.commands){const found=executablePath(command,this.env,root);if(found)return {spec:s,chosen:{command:found,args}};}
    return null;
  }
  async #makeRoom() {
    for(const [k,s] of this.sessions) if(!s.rpc.proc || Date.now()-s.lastUsed>this.idleMs){try{await s.dispose()}catch{}this.sessions.delete(k);}
    if(this.sessions.size < this.maxSessions) return;
    const oldest=[...this.sessions.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed)[0];
    if(oldest){try{await oldest[1].dispose()}catch{}this.sessions.delete(oldest[0]);}
  }
  async closeProject(root) { for(const [k,s] of this.sessions) if(path.resolve(s.root)===path.resolve(root)){try{await s.dispose()}catch{}this.sessions.delete(k);} }
  async closeAll() { clearInterval(this.sweeper); for(const s of this.sessions.values())try{await s.dispose()}catch{};this.sessions.clear(); }
}
