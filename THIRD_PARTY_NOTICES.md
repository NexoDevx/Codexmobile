# CodeMobile — avisos de terceiros e inspiração arquitetural

O CodeMobile permanece um projeto independente e **não é produzido, endossado nem afiliado à equipe OpenCode**.

A versão de código-fonte do OpenCode enviada para esta adaptação identifica a versão 2.1.4 e usa a licença MIT. Nesta camada de integração, foram adaptados de forma independente padrões de arquitetura e fluxo de trabalho observáveis na documentação/produto público — perfis de agente, ferramentas focadas, permissões por capacidade, investigação de código, revisão/diff, diagnóstico e verificações de projeto. Nenhum runtime ou arquivo de implementação do OpenCode foi incorporado pelo `ocplus.js`.

Referências:
- Repositório oficial: https://github.com/anomalyco/opencode
- Ferramentas: https://opencode.ai/docs/tools/
- Agentes: https://opencode.ai/docs/agents/
- Permissões: https://opencode.ai/docs/permissions/
- Configuração/compactação: https://opencode.ai/docs/config/

A licença MIT abaixo é preservada para fins de atribuição do projeto de referência; ela não declara que o restante do CodeMobile seja licenciado sob MIT.

## OpenCode — licença MIT (texto do arquivo LICENSE da cópia de referência)

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## proroot — runtime Linux rootless para Android

- Projeto/atribuição: **proroot**, por **coderredlab** — https://github.com/coderredlab/proroot
- Release fixada no build: **v1.2.8** — https://github.com/coderredlab/proroot/releases/tag/v1.2.8
- O código-fonte do runtime ainda não é público; o projeto publica os cinco binários ARM64 usados aqui.
- Os binários são transferidos do tag fixo, verificados por SHA-256 e copiados para o APK sem alteração. Eles não são incluídos como arquivos binários soltos no repositório do CodeMobile.
- Licença do upstream: proprietária; uso gratuito permitido, redistribuição de binários modificados proibida. A licença permite redistribuir os binários originais somente como parte de um pacote completo de aplicativo. O CodeMobile usa os binários sem modificação e mantém esta atribuição.
- O app informa o runtime na interface do Terminal. Os cinco hashes esperados constam em `native/setup-linux.sh` e `.github/workflows/apk.yml`.

O runtime não é um projeto open source e precisa ser tratado como uma dependência binária externa. Consulte o texto vigente da licença: https://github.com/coderredlab/proroot/blob/main/LICENSE.

## Ubuntu Base ARM64

O rootfs incluído no APK é o Ubuntu Base 24.04.5 ARM64, distribuído pelo projeto Ubuntu:
https://cdimages.ubuntu.com/cdimage/ubuntu-base/releases/noble/release/

O workflow baixa a imagem e verifica seu SHA-256 com a lista oficial `SHA256SUMS` no mesmo diretório antes de colocá-la no APK.

## Nota de arquitetura

O runtime antigo baseado em `oonid/pr` e Alpine foi removido do caminho de build. A instalação existente em `files/alpine` é mantida até que a pessoa escolha explicitamente resetar ou excluir o Linux, quando ela é removida junto com o novo rootfs. Nenhum projeto de `files/ws` é apagado por essas ações.
