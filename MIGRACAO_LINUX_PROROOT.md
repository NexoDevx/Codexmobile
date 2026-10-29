# Migração do Linux embutido: Alpine/PRoot antigo → Ubuntu/proroot

## O que muda

- O caminho novo usa o runtime `proroot` v1.2.8 para `arm64-v8a`, com cinco bibliotecas originais validadas por SHA-256.
- A imagem passa de Alpine/musl + `apk` para Ubuntu Base 24.04.5 ARM64 + glibc + `apt-get`.
- O plugin nativo verifica o marcador de build do APK e o marcador gravado dentro da instalação. Uma instalação `.ok` antiga, mas de outro runtime, não é tratada como pronta.
- O teste de instalação valida `/bin/sh`, o loader glibc, `mv`/rename e o código de saída do processo antes de marcar o Linux como instalado.
- A instalação antiga em `files/alpine` não é apagada pela atualização do APK. Ela só é removida quando o usuário escolhe **Resetar Linux** ou **Excluir Linux**.

## Como gerar o APK

1. Envie este projeto ao GitHub.
2. Abra **Actions → Build APK → Run workflow**.
3. O workflow baixa os cinco binários fixados, confirma seus hashes, verifica a soma SHA-256 do Ubuntu Base pelo arquivo oficial `SHA256SUMS`, compila e confirma que os binários não foram alterados durante o empacotamento.
4. Se qualquer recurso essencial faltar, o workflow falha e não publica um APK parcial.
5. Instale o artefato `CodeMobile-apk` e toque em **Terminal → Instalar Linux**. Depois use **Diagnosticar Linux** caso `apt-get` falhe.

## Licença e limites

`proroot` é um runtime de terceiros de código-fonte não público. Este projeto baixa e inclui somente os cinco binários originais, sem patchar ou recompilar seu conteúdo, e inclui a licença recebida do upstream. Consulte `THIRD_PARTY_NOTICES.md` e `native/PROROOT-LICENSE.txt`; a atribuição deve permanecer nos avisos do aplicativo.

O Ubuntu continua sendo um userspace rootless sobre o kernel Android — não é uma VM completa nem root real. Alguns programas que dependem de syscalls, kernel modules, hardware ou TTY interativo podem não funcionar. A migração foi verificada por testes de código e integridade do workflow, mas precisa ser compilada pelo GitHub Actions e testada no aparelho antes de afirmar que o erro `Operation not permitted` desapareceu naquele dispositivo.
