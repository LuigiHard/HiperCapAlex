# HiperCap Brasil

Este repositório contém uma aplicação Node.js com páginas estáticas em HTML e CSS para realização de compras via PIX e consulta de cupons.

## Descrição

O projeto simula o fluxo de compra de títulos do HiperCap, permitindo gerar um QR Code de pagamento, consultar cupons pelo CPF e visualizar resultados. As páginas estáticas ficam em `public/` e o servidor Express expõe algumas rotas de API para integração com serviços externos.

## Como utilizar

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Para ambiente de desenvolvimento utilize:
   ```bash
   npm run dev
   ```
   Em produção execute:
   ```bash
   node server.js
   ```
3. Para desenvolvimento local, acesse `http://localhost:3000` e navegue entre `/checkout`, `/consulta` e `/resultados`.
   Em produção, configure subdomínios apontando para o mesmo servidor:
   - `compra.seudominio.com` → `checkout.html`
   - `consulta.seudominio.com` → `consulta.html`
   - `resultados.seudominio.com` → `results.html`

## Estrutura de Arquivos

- `public/checkout.html` – Fluxo de compra e geração de QR Code.
- `public/consulta.html` – Consulta de cupons por CPF.
- `public/results.html` – Página de resultados (em construção).
- `public/css/style.css` – Estilos gerais das páginas.
- `public/js/` – Scripts de comportamento do checkout e consulta.

## Observações

É necessário configurar as seguintes variáveis de ambiente para que as APIs funcionem corretamente:

- `HIPERCAP_BASE_URL` e `HIPERCAP_KEY` – Acesso aos serviços de compra.
- `HIPERCAP_CUSTOMER_ID` e `HIPERCAP_CUSTOMER_KEY` – Consulta de promoção.
- `GATEWAY_URL` e `GATEWAY_KEY` – Integração com o Gateway IdeaMaker.

