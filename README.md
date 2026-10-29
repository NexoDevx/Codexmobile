# CodeMobile — gerar o APK (sem servidor)

1. Termux: `pkg install git unzip`, depois `unzip codemobile.zip && cd codemobile`
2. Crie um repositório vazio no GitHub (ex.: codemobile) e um token em github.com/settings/tokens
   com os escopos **repo** e **workflow** (sem `workflow` o push do .github/workflows é recusado).
3. `git init -b main && git add . && git commit -m "CodeMobile"`
   `git remote add origin https://github.com/SEU_USUARIO/codemobile.git`
   `git push -u origin main`  (usuário = seu login, senha = o token)
4. No GitHub: aba **Actions → Build APK → Run workflow** (roda também a cada push). Leva alguns minutos.
5. Abra a execução concluída, baixe o artefato **CodeMobile-apk** (vem em .zip), extraia e instale o app-debug.apk
   (permita "instalar apps desconhecidos").
6. Para atualizar: altere os arquivos em www/, `git commit` e `git push`; baixe o novo APK.

## Terminal do agente (3 níveis, o app escolhe o melhor sozinho)

1. **Linux embutido no APK (sem servidor externo nem Termux obrigatório).** O workflow empacota o runtime ARM64 `proroot` v1.2.8 e Ubuntu Base 24.04.5 com glibc, validando SHA-256 dos cinco binários e do rootfs antes de publicar. Na aba ⌨️ Terminal aparecem status e botões **Instalar Linux**, **Atualizar status**, **Resetar Linux** e **Excluir Linux**. A primeira instalação extrai Ubuntu Base e instala ferramentas com `apt-get`: Git, Python, Node.js/npm, ripgrep, fd, jq, tree, curl, wget, zip/unzip, make, compiladores, nano e vim. O sistema precisa de internet e espaço livre.
2. **Termux (opcional):** se preferir, `sh start.sh` no Termux sobe o servidor e o app usa o Termux.
3. **Mini-terminal embutido (sempre disponível):** ls, cat, head, tail, wc, grep, rg, find, tree, sed, sort, uniq, echo, mkdir, touch, rm, mv, cp, cd, pwd, `python` (Pyodide), `node`; pipes, `&&`, `||`, `>`. Sem git/npm/pip.

O agente recebe no prompt qual nível está ativo e quais ferramentas existem. Você usa o mesmo terminal na aba ⌨️.

### Sobre o Linux embutido (leia)
- É **experimental**: o Linux só fica disponível quando o workflow inclui `ShellPlugin`, os cinco binários `libproroot*.so` e `rootfs.bin` no APK. Esses componentes são obrigatórios; se um binário, hash, imagem Ubuntu ou plugin essencial falhar, o workflow termina sem publicar artefato. O painel da aba Terminal mostra o estado de launcher, runtime, bridge, linker, stub-loader e rootfs.
- Só arm64 (quase todos os celulares atuais). Roda via `proot` (não é root real; alguns programas que dependem do kernel podem falhar).
- O CodeMobile não incorpora o ambiente do Termux. Ele executa Ubuntu/glibc ARM64 usando o runtime rootless proroot, sem root real. Não é uma VM nem um kernel Linux próprio; algumas operações dependentes do kernel Android, do hardware ou de TTY interativo ainda podem não funcionar.

No APK o login do GitHub e o web_fetch usam HTTP nativo (sem CORS).


## Novidades (ext.js)
- **Conversa x ação:** "oi", "opa", agradecimentos e perguntas gerais recebem só uma resposta em texto (sem ferramentas e sem criar arquivos, com um prompt bem menor = menos tokens). Só cria/edita quando o pedido é explícito ("crie", "faça", "corrija"...).
- **Importar ZIP:** ＋ → Adicionar arquivo → escolha um .zip. Os arquivos de texto vão para `importados/<nome>/` (só leitura para a IA) e a caixa de texto já vem com "Veja o ZIP que importei em … e " para você completar ("crie um app parecido", "explique", etc.).
- **MCP:** ＋ → MCP e plugins → Adicionar servidor MCP (nome, URL HTTP e token opcional). As ferramentas aparecem para o agente como `mcp__servidor__ferramenta`. Só MCP por HTTP (Streamable HTTP/JSON ou SSE); servidores stdio/npx não rodam aqui.
- **Plugins:** ＋ → MCP e plugins → Instalar plugin (URL de um JSON ou o JSON colado):
  `{"name":"x","description":"...","skills":[{"name":"rev","description":"...","body":"..."}],"commands":{"rev":"Revise tudo. $ARGS"},"mcp":[{"name":"srv","url":"https://.../mcp","token":"..."}],"instructions":"texto para o AGENTS.md"}`
  Skills entram no projeto atual (`skills/<nome>/SKILL.md`), comandos viram `/comando`, servidores MCP são conectados.

## Plugins do GitHub e pastas conectadas (ext2.js)
- **＋ → MCP e plugins → Instalar do GitHub:** cole o link de um repositório ou de uma subpasta (`https://github.com/dono/repo` ou `.../tree/main/pasta`). Escolha *Ativar* (instala skills de `skills/*/SKILL.md`, comandos de `commands/*.md`, servidores MCP por HTTP de `.mcp.json`/`plugin.json`, e o AGENTS.md/CLAUDE.md do repo) ou *Baixar como referência* (até 120 arquivos de texto em `importados/<repo>/`). Se o link for um catálogo (`.claude-plugin/marketplace.json`) você escolhe quais plugins ativar. Repositórios privados: conecte sua conta em Ajustes → GitHub (sem conta o limite da API é pequeno). Servidores MCP que rodam por `npx`/comando local (stdio) são ignorados.
- **＋ → Pastas conectadas:** *Conectar pasta* abre o seletor de pastas do Android (plugin nativo `FolderPlugin`, precisa do APK) ou o do navegador (PWA/desktop). Os arquivos de texto vão para `importados/<pasta>/`. A IA lê à vontade e só edita quando você pede (o app confirma, a menos que seu pedido cite a pasta e peça a mudança). As alterações só vão para a pasta real quando você toca em *Salvar alterações na pasta*; *Atualizar da pasta* relê do aparelho.
- **Limite do Android:** desde o Android 11 o seletor de pastas não acessa `Android/data` nem `Android/obb`. Pastas em Documentos/Download/armazenamento interno funcionam (no Minecraft Bedrock, ative o armazenamento externo para `games/com.mojang` ficar acessível).
- **Plugins nativos são obrigatórios para publicar o APK completo:** o workflow falha sem `ShellPlugin`, `FolderPlugin`, `DownloadPlugin`, as cinco bibliotecas do proroot, o rootfs Ubuntu e os recursos JavaScript verificados. Se o workflow falhar, não instale um artefato de build parcial; leia o primeiro erro no GitHub Actions.

## Roadmap — o que já foi feito e o que falta

**Feito e testado (`npm test`: 11 testes do servidor + ~60 do terminal):**
- 1.1 Nomes e caminhos: validação central (`validName` no app; o servidor e o plugin Java repetem a regra). `.`, `..`, vazio e reservados são rejeitados; nomes que viram o mesmo diretório ganham sufixo hash (sem colisão); escrita nunca sai do projeto nem segue symlink. *Bug real corrigido: um projeto chamado `..` apontava o workspace para a pasta `data/`.*
- 1.2 Servidor: token aleatório por instalação (30 dias, `POST /api/rotate` revoga), comparação em tempo constante, rotas e métodos validados, limites de corpo/frequência/comandos simultâneos, auditoria em `data/audit.log` sem segredos, bloqueio de `cm-config.js`/`cm-state.js` para páginas de outros sites, DNS resolvido contra IP privado no `/api/fetch`. O token fica fora do estado do app (`localStorage cm_tok`). No APK o app pede o token uma vez.
- 1.3 parcial: ambiente do shell sem variáveis herdadas (só PATH/HOME/etc.), no máx. 2 comandos simultâneos, timeout, saída limitada, kill da árvore de processos.
- 2.2 parcial: sincronização por manifesto: só apaga do disco o que o app gerenciava e removeu; arquivos externos nunca são apagados (servidor e Java).
- Fase 6 (mini-terminal): glob, `$VAR`, `$(...)`, `for`/`if`, `git` local real (init/add/commit/status/diff/log/branch/checkout/reset/restore/rm), diff, awk, jq, cut, tr, xargs, tee, printf, curl/wget, `npm run`, test/[ ].
- Bug da versão enviada: `extras.js` quebrava por causa de `sys`/`sys0` (aba Terminal e menu de conversas não carregavam). Corrigido.

**Segurança por ambiente (honesto):** mini-terminal = roda em JavaScript no WebView, só enxerga os arquivos do projeto (mais seguro, menos poderoso). Linux embutido = proot sem root real, isolado do resto do Android, mas com rede e acesso à pasta do projeto. Termux = shell real do seu usuário Android: o token impede outros sites/apps de usá-lo, mas um comando aprovado pode tudo que o Termux pode. As confirmações do app são conveniência; o limite real é o executor.

**Ainda não feito (ordem sugerida):** 1.4 Keystore para chaves · 2.1/2.3/2.4 workspace unificado, snapshots reais e validação de ZIP · Fase 3 motor (planejar/verificar/tools tipadas) · Fase 4 adaptadores por provedor · 5.x descoberta de testes/diagnóstico · 7 tarefas longas persistentes · 8 permissões granulares/diff por bloco · 9 subagentes · 10.3 hooks.


## Imagens, visual da logo e projeto limpo (img.js, brand.css)
- **Importar fotos:** ＋ → Adicionar arquivo aceita PNG, JPG, WebP, GIF… Você escolhe: *mostrar para a IA* (ela enxerga a imagem na próxima mensagem; o modelo precisa aceitar imagens), *salvar como asset* (vai para `assets/` e o jogo/site usa) ou os dois. As imagens são reduzidas (máx. 1024 px, WebP) e guardadas no IndexedDB; o projeto guarda só uma referência curta (`img:id`), então checkpoints e conversas não incham. SVG continua sendo arquivo de texto.
- **Assets no preview, ZIP e GitHub:** o preview troca o caminho literal (`assets/hero.webp`) pela imagem; o ZIP exportado e o `gh_push` levam a imagem de verdade (binária). Caminhos montados em código (`'assets/'+nome`) não são trocados no preview: peça para o agente usar o caminho completo. O terminal Linux/Termux não enxerga os assets (só texto).
- **Economia de tokens com imagens:** só a imagem mais recente é enviada e só nas primeiras 3 rodadas da tarefa.
- **Gerar imagens (`generate_image`):** só aparece para o agente se houver capacidade: chave da OpenAI (gpt-image-1, com queda para dall-e-3) ou do Gemini (gemini-2.5-flash-image), ou Pollinations (grátis, escolhido em Ajustes → Geração de imagens). Sem isso o agente é avisado de que não gera imagens e desenha em SVG/canvas ou usa os assets que você anexar. Respeita modo plano, "perguntar" e as regras de permissão.
- **Projeto limpo:** o app já nasce com o Projeto 1 vazio. Para limpar um projeto que você mexeu: ＋ → *Limpar este projeto* (ou Ajustes → Projeto). Apaga arquivos, conversas, anexos e tarefas daquele projeto.
- **Visual:** nova identidade em `www/brand.css` a partir da logo `</>` (brasa laranja sobre tinta): cabeçalho, mensagens, compositor, navegação, terminal e boas-vindas. Para voltar ao visual antigo, tire a linha do `brand.css` no `index.html`.


## Plugin/MCP por link, direto na conversa (ext2.js)
- **Cole o link do GitHub no chat** (aceita `https://github.com/dono/repo`, `.../repo.git`, `git@github.com:dono/repo.git`, `.../tree/main/pasta`). Sozinho ou com "instala/conecta/baixa esse plugin ...", o app baixa e ativa na hora **sem chamar o modelo** (não gasta tokens): skills (`SKILL.md`), comandos, servidores MCP por HTTP e `AGENTS.md`. Se o repositório não tiver nada ativável, baixa como referência em `importados/<repo>/` (texto, até 120 arquivos). Se o seu pedido tiver mais coisa depois do link ("instala X e analise Y"), o app instala e só então manda o resto para a IA.
- **A IA também pode instalar:** ferramenta `install_plugin` (pedido em linguagem natural). Se você não citou o repositório, o app pergunta antes de instalar; modo Plano bloqueia.
- **Servidores MCP stdio (npx/comando local), como o `morluto/rea`:** não rodam dentro do app. O instalador baixa o que for aproveitável (skill/instruções) e mostra o comando para criar uma **ponte HTTP no Termux** (`npx -y supergateway --stdio "..." --port 8000`) e o endereço para adicionar em ＋ → MCP e plugins. Confira se as ferramentas do servidor funcionam no Android (o REA, por exemplo, foca em análise de apps nativos e depende de ferramentas externas).
- Teste: `node test/plugin.test.mjs` (fetch simulado).

## Editor de APK

Aba 📁 Arquivos → **📱 Abrir APK** (ou ＋ → Adicionar arquivo com um .apk). Lista os arquivos (com busca), mostra pacote/versão/SDK/permissões e permite:
- **Ver**: imagens, textos, XML binário decodificado (o AndroidManifest fica legível), hex para o resto.
- **Editar**: texto direto; **XML binário como texto** (✏️ Editar como texto → compila de volta, com os atributos ordenados por ID como o Android exige); trocar/remover/adicionar arquivos; trocar imagem (ajusta ao tamanho e formato originais).
- **💾 Salvar e assinar**: regrava o APK e assina com v1 (JAR) + v2, com uma chave RSA-2048 gerada e guardada no aparelho (🔑 Chave: exportar backup, importar, gerar nova). Mantenha a mesma chave para poder atualizar seus APKs editados. Se o app original estiver instalado, desinstale antes (assinatura diferente). Também há "Salvar sem assinar".
- **🧩 Plugins**: scripts JS que usam a API `apk` (list, read, text, write, remove, search, strings, hex, imageSize, replaceImage, pickFile) + `log`, `prompt`, `confirm`. Vêm 4 prontos (trocar imagens por padrão, buscar no APK, renomear app/pacote, ligar debuggable); você cria, edita e importa `.js` (`// @name` e `// @desc` no topo). Plugins têm acesso total ao APK aberto: só use os de quem você confia.
- **Agente de IA**: com um APK aberto, o agente ganha as ferramentas `apk_status`, `apk_list`, `apk_search`, `apk_read`, `apk_write`, `apk_replace_image`, `apk_remove`, `apk_script` e `apk_build`. Ex.: "ache os sprites do personagem, gere uma vaca (generate_image) e troque". Combina com a geração de imagens dos Ajustes.

Limites: não decompila `classes.dex`, não edita `resources.arsc` (nomes de app que vêm de recurso), sem ZIP64, sem assinatura v3/v4; imagens 9-patch perdem os metadados ao trocar; apps com sprites em formato próprio (atlas/pacotes) não têm imagens soltas para trocar. Testes: `npm test` (inclui verificação da assinatura com `jarsigner` e `test/VerifyV2.java`, que precisam de JDK).


## Núcleo do agente (nucleo.js)
Camada nova, escrita para este projeto (inspirada em ideias gerais de agentes de código, sem copiar nenhum código). Carrega por último e estende `exec`, `llm` e `sys` sem alterar a lógica existente. Testes: `node --test test/nucleo.test.mjs`.

- **Compactação incremental:** quando o contexto passa de ~100 mil caracteres (32 mil no modo ⚡ Fast), as mensagens antigas viram um resumo e as recentes continuam inteiras. O histórico visível no app **não muda** (diferente do `/compact` antigo, que apaga tudo), resultados antigos de ferramentas são encurtados no histórico bruto e o resumo é reaproveitado nas próximas chamadas. Se o resumo falhar, segue como antes. Comando `/compactar` força. O resumo total antigo só dispara agora acima de 1,2 MB.
- **Regras de permissão por ferramenta e caminho:** `.codemobile/regras.txt`, linhas `permitir|negar|perguntar <ferramenta> [padrão]` (aceita `*` e `?`; vale a mais restritiva). Ex.: `negar write_file config/*`, `perguntar shell git push*`. Comandos perigosos no `shell` (`rm -rf /`, `curl | sh`, `git push --force`, `git reset --hard`, `chmod 777`, `dd`…) sempre pedem confirmação, mesmo no modo Auto.
- **Hooks:** `.codemobile/hooks.txt`, linhas `antes|depois <ferramenta> [padrão] => bloquear|avisar: mensagem`. Ex.: `depois write_file *.js => avisar: rode check_preview`.
- **Validação de argumentos:** número escrito como texto vira inteiro, objetos viram texto, `edits` malformado volta como erro claro para o modelo corrigir.
- **Memória do projeto:** ferramentas `memory_add`, `memory_list`, `memory_remove` guardam anotações duráveis em `.codemobile/memoria.md`, injetadas no prompt (até 2 mil caracteres; não entram no modo conversa). Comando `/memoria`, `/memoria + texto`, `/memoria - número`.
- **Sub-agentes com papel:** `spawn_agent` aceita `tipo`: `explorar`, `revisar` ou `planejar`.
- **Comando `/regras`:** cria os modelos comentados de regras e hooks e mostra quantos estão ativos.

Limites (honesto): o agente não consegue alterar `regras.txt` e `hooks.txt` pelas ferramentas de arquivo, mas um comando de `shell` no Linux/Termux roda fora dessa checagem; as regras valem para o nome da ferramenta e o primeiro argumento de texto. Hooks `depois` + `bloquear` são ignorados (a ferramenta já rodou).


## Pacotes: APK, EXE, ZIP e qualquer arquivo (pkg.js)
Não existem mais menus separados por tipo de arquivo. **＋ → Adicionar arquivo** aceita qualquer coisa; APK, AAB, JAR, ZIP, DOCX, EXE, DLL, DEX, SO e binários em geral viram uma pasta do projeto em `pacotes/<nome>/`, e todo o resto é igual a qualquer outro arquivo.

- **Legível:** o `AndroidManifest.xml` e os XMLs binários do Android aparecem como texto editável; imagens, textos e o ZIP embutido de um EXE viram arquivos; o que é binário grande fica dentro do pacote e é lido sob demanda.
- **Edição:** com a IA (ferramentas normais `read_file`, `edit_file`, `grep` e as `pkg_*`: `pkg_list`, `pkg_info`, `pkg_find`, `pkg_hex`, `pkg_strings`, `pkg_patch`, `pkg_replace`, `pkg_replace_image`, `pkg_extract`, `pkg_remove`) ou à mão, na aba Arquivos.
- **Reempacotar:** `pkg_build` (a IA) ou ＋ → Pacotes. O editor de pacotes preserva conteúdo binário que não altera, valida o manifesto, remove assinaturas antigas e assina o APK editado com a chave guardada no aparelho. Isso não equivale a recompilar DEX/Java/Kotlin nem recursos que o editor não suporta. XML inválido e imagens/recursos que não cabem no espaço original retornam erro explícito, em vez de exportar um pacote que se sabe inválido.
- Os editores antigos (`apk.js`, `apkplug.js`, `exe.js`, `exe2.js`) deixaram de ser carregados; os arquivos continuam na pasta e podem ser apagados quando você quiser (`test/exe.test.mjs` ainda testa o `exe2.js`).
- `node --test test/carga.test.mjs` carrega todos os scripts do `index.html` juntos e falha se um nome for declarado em dois arquivos (isso derrubaria o app inteiro).


## Modelos reserva (reserva.js)
**Ajustes → 🔁 Modelos reserva.** Monte uma lista ordenada de provedores (Claude, OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral, xAI, Together, Ollama/personalizado). Se o principal bater o limite, ficar sem crédito, recusar a chave ou cair, o app troca sozinho para o próximo e continua a tarefa de onde estava; avisa na barra de status.
- Cada reserva usa a **própria chave e o próprio modelo** (os mesmos campos que você já usa por provedor); nenhuma chave vai para arquivo do projeto.
- Castigo do principal: ~3 min em limite por minuto/sobrecarga, ~30 min em cota/crédito, ~2 h em chave inválida. Passado o castigo, o app volta sozinho ao principal (ou toque em "voltar agora").
- Erros de pedido (contexto grande demais, política de conteúdo) **não** trocam de provedor, porque outro provedor não resolveria; o botão de parar do usuário também não dispara troca.
- Enquanto uma reserva está ativa, o modelo "rápido/profundo" do principal fica de lado e volta junto com ele.
- Limite honesto: a troca altera o provedor ativo dos Ajustes (assim as chamadas em paralelo ficam coerentes); se você escolher outro provedor à mão, o app esquece a troca automática.

## Downloads nativos e seletor de pastas
- No APK, os resultados do agente (APK assinado, EXE, ZIP e outros arquivos) são gravados por blocos em `Downloads/` (raiz pública de Downloads) via `MediaStore`, sem converter o arquivo completo para Base64 de uma só vez. O app mostra o caminho confirmado pelo Android. Em Android anterior ao 10, o fallback fica no diretório de Downloads específico do app. A gravação só é confirmada depois que o plugin nativo termina o arquivo. Em Android 10 ou superior, abra Arquivos → Downloads; em versões anteriores, o caminho é privado do app e pode não aparecer na pasta pública.
- O plugin `DownloadPlugin` é obrigatório no workflow. O build falha se `FolderPlugin` ou `DownloadPlugin` não estiver no APK, em vez de publicar silenciosamente uma versão quebrada.
- O JavaScript resolve os plugins nativos por `Capacitor.Plugins` (forma disponível em HTML sem bundler) antes de tentar `registerPlugin`; isto é importante porque `registerPlugin` normalmente é exportado pelo módulo `@capacitor/core`, não garantido no global `window.Capacitor`.

## Pasta do aparelho
- **Seleção:** ＋ → 📂 Pastas conectadas. No APK usa o plugin nativo (`native/FolderPlugin.java`); em navegador/PWA usa o File System Access.
- **O que importa:** só texto (até 600 arquivos, 300 KB cada). Tudo o que ficou de fora (binários, grandes, excesso) agora é listado em `importados/<pasta>/_ignorados.txt`, e continua intacto na pasta real. Esse arquivo não conta como alteração ao salvar.
- **O build avisa:** o passo "O que entrou no APK" do GitHub Actions mostra se `FolderPlugin`/`ShellPlugin` e os scripts novos estão dentro do APK. Se o plugin de pasta foi descartado, o app agora diz isso em vez de "não dá para escolher pasta".
- `FolderPlugin.java` foi compilado contra stubs fiéis das APIs do Android/Capacitor com o `javac` do JDK 21 (compila sem erros), mas **não foi testado num aparelho**.
- **Ainda não faz:** abrir binários (APK, EXE, DLL, assets de jogo) direto da pasta. Para isso, hoje, importe o arquivo avulso por ＋ → Adicionar arquivo (vira `pacotes/`).

Migração e limites: [MIGRACAO_LINUX_PROROOT.md](MIGRACAO_LINUX_PROROOT.md).

## Linux embutido (proroot + Ubuntu) — básico
A aba ⌨️ Terminal sempre mostra o painel de estado do Linux, mesmo quando faltam componentes nativos. **Instalar Linux** extrai o Ubuntu Base ARM64 empacotado, testa `/bin/sh`, glibc, renomeação de arquivos e código de saída, e instala ferramentas por `apt-get`. **Atualizar status** verifica runtime/rootfs. **Resetar Linux** apaga as instalações Ubuntu e Alpine legada e reinstala o Ubuntu; **Excluir Linux** remove as duas instalações Linux, mas preserva projetos do CodeMobile. Os binários do runtime não podem ser removidos separadamente nessa tela. A pasta atual é preservada entre comandos, mas cada comando cria um processo novo; programas interativos que exigem um TTY verdadeiro não são garantidos.

**Licença do runtime:** o projeto usa os binários originais de proroot v1.2.8, com licença proprietária e código-fonte não público. O build verifica os hashes upstream e mantém os binários sem modificação. Consulte `THIRD_PARTY_NOTICES.md` e `native/PROROOT_NOTICE.md` antes de redistribuir o aplicativo.

## Trazido do opencode (MIT)
- **`apply_patch`**: o agente edita vários arquivos de uma vez com um patch (Add/Update/Delete/Move, com contexto). Tolera espaços e aspas tipográficas e é atômico: se um trecho não for achado, nada muda.
- **`glob`**: achar arquivos por padrão (`src/**/*.js`, `**/*.{html,css}`).
- **Regras de permissão por padrão** em `codemobile.json` na raiz (a última regra que casar vence; ações `allow`, `ask`, `deny`):
  `{"permission":{"shell":{"*":"ask","git *":"allow","rm *":"deny"},"edit":{"dist/**":"deny"},"read":{"secrets/**":"deny"}}}`.
  Por padrão `.env`, `.env.*`, `id_rsa*` e `*.pem` não podem ser lidos pelo agente. Mexer em `codemobile.json` sempre pede confirmação.
- **Instruções por pasta**: ao ler/editar um arquivo, o `AGENTS.md`/`CLAUDE.md` mais próximo (nas pastas acima dele) é anexado ao resultado, uma vez por conversa.


## Provedores de IA (grátis e outros)

Ajustes → **Provedor** lista ~36 provedores em 4 grupos (🆓 grátis, 🎁 créditos de teste, 💳 pagos, 🏠 local). Cada um mostra uma dica de como obter a chave, um botão que abre a página da chave e modelos sugeridos (até você tocar em "Buscar modelos").
- **Grátis:** Gemini, Groq, OpenRouter (modelos `:free` aparecem primeiro), **NVIDIA NIM**, **Cloudflare Workers AI** (preencha o Account ID), Cerebras, GitHub Models, Hugging Face, Mistral/Codestral, Zhipu e Z.ai (GLM-flash), SiliconFlow, ModelScope, Ollama Cloud.
- **Sem chave e sem cadastro:** LLM7.io, OVHcloud (anônimo), Kilo Gateway, Pollinations. Local: Ollama e LM Studio (use o IP do PC na URL).
- **Créditos de teste:** SambaNova, Cohere (trial), Alibaba Qwen/DashScope, Fireworks, Hyperbolic, DeepInfra, Novita, Scaleway, Chutes.
- Dá para usar vários ao mesmo tempo como **modelos reserva**: quando um bate o limite grátis, o app troca para o próximo.
Os limites grátis mudam com frequência; confira na página de cada provedor. O agente precisa de um modelo com suporte a chamadas de ferramenta (tool calling); modelos pequenos ou do Pollinations costumam falhar nisso. Para adicionar outro provedor compatível com a API da OpenAI, edite `www/provedores.js` (uma linha) ou use "Personalizado".


## Modelos locais (rodam no aparelho)

Ajustes → provedor **Modelo local** → seção **🧠 Modelos locais**. Catálogo só de modelos pequenos (GGUF, do Hugging Face): 🟢 *muito fracos* (SmolLM2 135M/360M, Qwen2.5 0.5B), 🟡 *fracos* (Llama 3.2 1B, Gemma 3 1B, Qwen2.5 1.5B) e 🟠 *médios* (Qwen2.5 Coder 1.5B, Gemma 2 2B, Qwen2.5 3B). Toque em **Baixar** (use Wi-Fi), depois **Usar este modelo**; **Testar** mostra a velocidade e **Apagar** remove o arquivo. Dá para adicionar outro `.gguf` por URL.
- Motor: [wllama](https://github.com/ngxson/wllama) (llama.cpp em WebAssembly), CPU, sem GPU. O build do APK embute a biblioteca em `www/llm/` (passo opcional do workflow); sem isso o app a baixa da CDN jsDelivr na 1ª vez. Para trocar a versão/origem: `S.llm.lib` (URL do `esm/index.js`).
- O app fala com o modelo local por um servidor "virtual" interno (`http://cm-local.invalid/v1`): agente, modelos reserva e contador de custo funcionam como nos outros provedores. As chamadas de ferramenta são feitas por texto (`<tool_call>…</tool_call>`) com um prompt compacto; modelos desse tamanho erram bastante nelas.
- Expectativa realista: celular médio roda os "muito fracos" a poucas palavras por segundo e os "médios" bem mais devagar; modelos maiores que ~1,5 GB podem travar o app em aparelhos com pouca RAM. Para modelos maiores e mais rápidos, rode o Ollama no Termux ou no PC e use o provedor **Ollama**.

## Conectar pasta (se o seletor não abrir)
- **APK com plugin nativo**: abre o seletor do Android (SAF). Se o plugin faltar, o app mostra o diagnóstico exato (e o passo "O que entrou no APK" do GitHub Actions confirma).
- **Chrome desktop**: usa o seletor do navegador.
- **Termux / navegador no celular** (sem seletor): o app abre um seletor de pastas próprio, via servidor (`/api/ls`, `/api/dirread`, `/api/dirwrite`). Restrito ao HOME, `/storage` e `/sdcard`; precisa de `termux-setup-storage` para ver o armazenamento do celular.


## Integração inspirada no OpenCode (ocplus.js)

A camada `www/ocplus.js` amplia o motor mobile sem importar o runtime desktop/terminal inteiro. Ela aplica padrões públicos do OpenCode — perfis separados, permissões por capacidade, ferramentas focadas, exploração do repositório, diffs e verificações delimitadas — no app atual. Veja `THIRD_PARTY_NOTICES.md` para referência e atribuição; o CodeMobile é independente e não é afiliado ao OpenCode.

**Perfis em Ajustes → Perfil de trabalho do agente:**
- **Build:** implementação normal, com ferramentas de edição e verificação.
- **Plan:** análise e plano sem escrita nem execução de scripts de projeto.
- **Explore:** pesquisa somente leitura; bloqueia edição e execução de código/comandos.
- **Review:** revisão sem editar; permite rodar apenas verificações detectadas e selecionadas a partir dos scripts existentes.

**Ferramentas adicionadas:** `project_map` (mapa de linguagens, entradas, testes e configurações), `read_many` (leitura em lote com orçamento de contexto e regras para arquivos secretos), `find_references` (busca por símbolo/texto/regex), `diff_file` (diff com contexto desde o checkpoint), `project_diagnostics` (JSON, referências HTML/CSS e ids duplicados), `dependency_report` (manifestos de dependências/scripts) e `run_project_checks` (executa scripts declarados e, quando detectados, verificações conhecidas de Go, Rust, Python/pytest, Maven, Gradle, .NET, PHPUnit, RSpec e TypeScript local).

O agente também recebe uma estratégia para mapear antes de editar, agrupar leituras relacionadas, minimizar contexto, preferir patches atômicos, separar investigação/implementação/verificação e fundamentar a revisão em evidências. As verificações estáticas não garantem que o programa esteja correto; os testes e o preview continuam necessários.

**Camada avançada de contexto e inspeção:**
- `context_report` estima o custo do histórico, saídas de ferramentas e esquemas. É uma aproximação (caracteres/4), não telemetria exata do provedor.
- `smart_search` limita resultados e pode incluir linhas de contexto; `symbol_index` cria um índice heurístico de declarações; `impact_analysis` procura referências para estimar efeitos de uma mudança.
- `instruction_report` localiza arquivos de instrução; `test_discovery` encontra convenções/configurações de teste; `security_audit` procura padrões comuns de risco sem imprimir valores de possíveis credenciais.
- `change_report` resume o checkpoint atual; `verify_workspace` combina diagnóstico estático, resumo do diff e scripts encontrados sem executá-los.
- **LSP real** (`lsp`): por meio de `POST /api/lsp`, comunica com servidores de linguagem instalados via JSON-RPC 2.0/stdio. Inclui navegação para definição/declaração/tipo, referências, hover, símbolos, completamento, assinatura, diagnósticos, code actions, hierarquia de chamadas e prévias de rename/formatação. O catálogo suporta TypeScript/JavaScript, Deno, Python, Go, Rust, C/C++, Bash, JSON/HTML/CSS, YAML, Lua, PHP, Ruby, C#, Kotlin, Vue, Svelte, Astro, Markdown, TOML, Terraform/HCL, Zig, Swift, Dockerfile e Prisma. O CodeMobile não baixa os servidores; é preciso instalá-los no host local. O fallback do APK offline é rotulado como heurístico.
- **Uso de ferramentas e contexto** nas configurações tem três opções: **Auto** mantém as ferramentas gerais e filtra ferramentas especializadas que não combinam com o pedido; **Economia máxima** reduz também o conjunto comum e poda saídas antigas de ferramentas apenas na cópia enviada ao modelo; **Todas** envia o conjunto completo disponível. O histórico mostrado no app não é reescrito pela poda.
- Resultados grandes são limitados preservando parte do começo e do fim. O app já utiliza compactação incremental e poda no `nucleo.js`; esta camada complementa isso com orçamento de saída, seleção de ferramentas e um relatório de contexto. A API exata de tokens/janela não é conhecida para todos os provedores.

As ferramentas heurísticas de índice/impacto/diagnóstico não substituem AST/compiladores/scanners dedicados. A ponte `lsp` usa servidores LSP reais quando instalados, mas não fornece automaticamente os executáveis nem todas as extensões específicas de cada linguagem. A camada não importa nem incorpora o runtime inteiro do OpenCode; os padrões foram adaptados em módulos independentes.


## Importação de arquivos grandes e formatos adicionais

O importador não impõe um teto fixo de tamanho para APK, EXE, ZIP e outros pacotes. O seletor aceita qualquer tipo; formatos reconhecidos são encaminhados ao leitor de pacotes e binários desconhecidos são preservados como pacotes genéricos. A extração explícita não tem teto artificial de 40 itens nem recusa arquivos acima de 4 MB. Conteúdos internos que não são pré-carregados permanecem no pacote original e podem ser listados/extraídos sob demanda.

“Sem limite fixo” não significa memória ou armazenamento infinitos: o Android/WebView, o IndexedDB e a RAM física continuam impondo limites práticos. Para arquivos muito grandes, feche outras aplicações e deixe espaço livre.

## Linux/proroot: diagnóstico de instalação

O motor antigo baseado em PRoot + Alpine foi retirado do novo caminho de build porque continuava falhando em chamadas de arquivo durante `apk update`. A versão atual usa o runtime rootless `proroot` v1.2.8 e Ubuntu Base ARM64/glibc, em vez do `apk` do Alpine. O workflow fixa a versão e valida os cinco binários publicados pelo upstream por SHA-256, e valida o hash do rootfs usando o `SHA256SUMS` oficial do Ubuntu.

Na nova instalação, toque em **Terminal → Diagnosticar Linux** para ver o estado de cada biblioteca, versão do Ubuntu/glibc, fontes do apt e os códigos de retorno de `mv` e `apt-get update`. Se ainda aparecer `Operation not permitted`, o runtime novo não resolveu a incompatibilidade específica do seu aparelho e o resultado do diagnóstico deve ser usado para investigar a causa; não há garantia universal de suporte a todos os dispositivos Android.

Depois de atualizar o repositório, execute **Actions → Build APK** e instale o artefato novo. O cache offline foi invalidado (`cm-v28`). A instalação Alpine antiga fica preservada até o usuário escolher resetar/excluir; os projetos permanecem fora do rootfs. O APK final não foi testado num aparelho durante esta revisão, portanto a compilação e o teste no Android continuam necessários.