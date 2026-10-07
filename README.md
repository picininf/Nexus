# Nexus Fitness

Site estático (HTML, CSS e JavaScript) com o painel do gestor de academias:

- **CAPEX Guard**: cadastro das máquinas, registro de uso, regras de revisão, alertas (painel, e-mail e WhatsApp), histórico de custos e ordens de serviço.
- **Smart Buying**: compras coletivas de insumos.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Tela de entrada (login e acesso de demonstração) |
| `cadastro.html` | Criar conta |
| `dashboard.html` | Painel do gestor |
| `app.css` | Visual (cores e fontes) |
| `auth.js` | Contas e dados salvos no navegador |
| `capex.js` | Cálculos do CAPEX Guard |
| `dashboard.js` | Telas e botões do painel |
| `.nojekyll` | Avisa o GitHub Pages para publicar os arquivos como estão |

## Como os dados funcionam

Não há servidor: tudo fica salvo no `localStorage` do navegador de quem usa.
Outro computador ou outro navegador começa vazio. Para levar os dados, use
**Configurações → Exportar backup** e depois **Importar backup**.

Os avisos por WhatsApp e e-mail abrem o WhatsApp ou o programa de e-mail com a
mensagem pronta; a pessoa só aperta enviar. Envio automático exige um serviço
externo (por exemplo, um backend ou uma API de WhatsApp), que o GitHub Pages
não oferece.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `nexus-fitness`), público.
2. Clique em **Add file → Upload files** e arraste todos os arquivos desta pasta
   (inclusive `.nojekyll`). Não envie instaladores como `ChromeSetup.exe`.
3. Clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**,
   branch **main** e pasta **/ (root)**. Clique em **Save**.
5. Em um ou dois minutos o site fica em
   `https://SEU-USUARIO.github.io/nexus-fitness/`.

Para atualizar depois, envie os arquivos novos do mesmo jeito; o site se
atualiza sozinho.
