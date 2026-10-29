# Revisão de regressões — Downloads e pastas conectadas

## Como fica o fluxo

- **APK Android 10+**: os arquivos gerados são gravados em `Downloads/` (raiz pública) por `DownloadPlugin`, usando `MediaStore` e escrita por blocos. O plugin só informa sucesso depois de fechar o stream e tornar o item visível. Nomes repetidos ganham sufixo, sem sobrescrever o arquivo anterior.
- **Android anterior ao 10**: usa o diretório de Downloads privado do app, porque a API pública moderna do `MediaStore` não existe nesses sistemas. Esse caminho pode não aparecer no app Arquivos.
- **Navegador**: usa o mecanismo de download do navegador. A aplicação não promete que o navegador concluiu o download, pois o browser controla o destino.
- **Conectar pasta no Android**: `FolderPlugin` usa o seletor de diretórios do Storage Access Framework (`ACTION_OPEN_DOCUMENT_TREE`) e tenta persistir a permissão URI. O JavaScript resolve o plugin no momento do clique e mostra erro visível se o plugin estiver ausente ou se o seletor falhar.
- **Workflow**: plugins de pasta e Downloads são obrigatórios. O job executa a suíte completa e falha caso as classes ou os assets essenciais não entrem no APK.

## Limites conhecidos

- Um APK já instalado não recebe mudanças do código-fonte: é necessário compilar e instalar a nova versão.
- Não executamos um build Gradle real neste ambiente; validamos a suíte Node.js, integridade do ZIP e sintaxe Java/API com stubs. O workflow do GitHub Actions executa o build Android real.
- Em Android 10+, a persistência em Downloads requer o plugin nativo incluído no APK. Em uma WebView/browser puro, o destino é controlado pelo navegador.
- “Conectar pasta” importa texto limitado para o projeto; não extrai binários do diretório selecionado. Arquivos binários devem ser adicionados individualmente pelo importador.
