# CodeMobile — camada avançada inspirada no OpenCode

Esta implementação é uma integração independente de padrões de agente de código. Ela **não incorpora nem executa o runtime do OpenCode**, e não torna o CodeMobile afiliado ao projeto.

## O que o CodeMobile já tinha e foi preservado

- Perfis Build/Plan/Explore/Review com limites de escrita e execução.
- Patches multi-arquivo atômicos, busca glob, permissões por caminho/comando e instruções `AGENTS.md`/`CLAUDE.md` aplicáveis ao diretório.
- Memória de projeto, hooks e regras definidas pelo usuário, papéis de subagentes e compactação incremental de histórico.
- Checkpoint por tarefa e visualização de diffs; revisão e verificações delimitadas pelo projeto.
- Uso de cache efêmero de prompt nos pedidos Anthropic quando suportado e contador de tokens reais reportados por provedores compatíveis.

## Recursos adicionados nesta camada

| Ferramenta/controle | Função |
| --- | --- |
| `context_report` | Estima o tamanho do histórico, saídas de ferramentas, arquivos e esquemas. |
| `smart_search` | Busca literal/regex com limite de ocorrências e contexto por linha. |
| `symbol_index` | Índice heurístico de funções, classes, tipos e outras declarações comuns. |
| `impact_analysis` | Localiza referências textuais a um arquivo e símbolos que ele declara para estimar impacto. |
| `instruction_report` | Localiza e resume instruções/documentação relevantes do projeto. |
| `test_discovery` | Descobre arquivos/configurações de teste e scripts possíveis. |
| `security_audit` | Procura padrões comuns de risco sem imprimir valores que pareçam credenciais. |
| `change_report` | Resume as alterações por arquivo desde o checkpoint atual. |
| `verify_workspace` | Combina diagnóstico, diff e descoberta de scripts; não executa os scripts. |
| `lsp` | Ponte LSP via JSON-RPC/stdio para servidores reais instalados, com navegação, diagnósticos, símbolos, completamento, code actions e prévias de formatação/renomeação. |
| Ajuste de ferramentas | `Auto`, `Economia máxima` ou `Todas`; ferramentas especializadas são selecionadas conforme a intenção. |
| Orçamento de saídas | Resultados excepcionalmente longos são limitados, preservando trechos do início e do final. |
| Poda de histórico | Em pressão de contexto, reduz resultados antigos de ferramentas apenas na cópia enviada ao modelo; a conversa visível não é modificada por essa poda. |

## Estratégias de uso de contexto

1. Descobrir a arquitetura e procurar símbolos antes de ler arquivos enormes.
2. Agrupar leituras relacionadas com `read_many` e limitar buscas com `smart_search`.
3. Evitar repetir resultados antigos de ferramentas; quando necessário, manter início e fim em vez de simplesmente cortar o fim.
4. Após editar, rever `change_report`/`diff_file`, executar apenas os testes relevantes e não tratar análise estática como prova de correção.
5. Usar o modo `Economia máxima` em modelos com limites ou custo de entrada apertados; usar `Todas` quando uma tarefa realmente precisar de um conjunto especializado de ferramentas.

## Limitações explícitas

- A contagem `context_report` usa uma aproximação baseada em caracteres; **não é uma contagem exata de tokens** e não consegue descobrir a janela de contexto real de todos os modelos.
- `symbol_index`, `impact_analysis`, `project_diagnostics` e `security_audit` são heurísticas locais. Não substituem compiladores ou scanners dedicados. O `lsp` usa servidores reais quando disponíveis; se faltar um executável, o app informa a indisponibilidade e usa apenas fallback heurístico explicitamente rotulado.
- `verify_workspace` não executa testes. Para executar verificações, use `run_project_checks`, que só aceita verificações reconhecidas/declaradas e ainda respeita as permissões existentes.
- O LSP cobre um conjunto amplo de operações e um catálogo de servidores conhecidos, mas não implementa cada extensão de cada servidor, nem hospeda/baixa esses executáveis automaticamente. É necessário que o servidor de linguagem apropriado já esteja instalado e acessível no PATH ou em `node_modules/.bin`. A integração mobile offline usa heurísticas identificadas como tais.
- O runtime completo do OpenCode, seu banco/sistema de sessões, worktrees/snapshots Git internos, compactação concorrente de background e todos os plugins/providers não foram portados como um pacote único; a compatibilidade foi implementada em módulos independentes sobre o CodeMobile existente.
- Resultados e estimativas variam por provedor/modelo. Em caso de incerteza, confira a medição de uso retornada pela API do provedor.

## Referências públicas

- OpenCode — agentes: https://opencode.ai/docs/agents/
- OpenCode — ferramentas: https://opencode.ai/docs/tools/
- OpenCode — configuração e compactação: https://opencode.ai/docs/config/
- OpenCode — repositório: https://github.com/anomalyco/opencode

## Ponte LSP real

`server.mjs` expõe `POST /api/lsp` protegido pelo mesmo token local do restante da API. `lsp.mjs` inicia executáveis conhecidos sem `shell:true`, transporta JSON-RPC 2.0 pelo `stdio`, inicializa capacidades, sincroniza `didOpen`/`didChange`/`didClose`, guarda diagnósticos, restringe a quantidade de processos simultâneos e encerra sessões ociosas. O catálogo inclui TypeScript/JavaScript, Deno, Python (Pyright/pylsp), Go, Rust, C/C++, Bash, JSON, HTML, CSS, YAML, Lua, PHP, Ruby, C#, Kotlin, Vue, Svelte, Astro, Markdown, TOML, Terraform/HCL, Zig, Swift, Dockerfile e Prisma. O catálogo apenas detecta instalações; não instala servidores.

Operações incluem definition/declaration/type definition, references, hover, implementation, document/workspace symbols, completion, signature help, document highlights, folding ranges, prepare rename/rename, document links, code lens, selection ranges, formatting, range formatting, code actions, diagnostics e call hierarchy. Formatação e renomeação são sempre prévias; a bridge recusa `workspace/applyEdit` para impedir que um servidor altere arquivos sem revisão explícita. O modo sem backend informa claramente que usou heurísticas. O manifesto da sincronização LSP é separado do manifesto usado pelo endpoint de shell.
