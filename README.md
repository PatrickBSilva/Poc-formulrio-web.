# Web Forms

Este repositório contém o frontend do formulário de inclusão.

## Estrutura de Arquivos
- `/css`: Estilos base e variáveis de marca.
- `/js`: Lógica de negócio (`utils.js`)

## Como configurar
1. No arquivo `js/utils.js`, substitua os placeholders `Coloque o link aqui` pelas URLs da sua Azure Function(ou outra preferência).
2. Certifique-se de configurar as variáveis de ambiente no servidor para as URLs de redirecionamento.

##Dados (Payload)
O sistema envia um objeto JSON estruturado para o backend contendo:
- `origem`: Prefixo da marca.
- `assinantesPai`: 2 signatários da matriz.
- `filiais`: Lista dinâmica contendo dados, vidas e 2 assinantes por filial.
