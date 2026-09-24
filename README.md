# LagartinShop — versão online

Esta versão troca o armazenamento local dos produtos por Firebase Firestore + Firebase Storage + Firebase Authentication.

## O que foi mantido
- Loja mobile-first.
- Galeria com várias fotos.
- Carrinho local do cliente.
- Compra pelo Instagram @lag4rt1n_.
- Painel de administrador.
- Categorias: Roupas, Pokémon TCG, Hot Wheels, Perfumes e Ofertas.

## O que mudou
- Produtos ficam online no Firestore.
- Fotos ficam no Firebase Storage.
- Login do painel usa Firebase Authentication.
- O administrador é limitado ao e-mail configurado em `firebase-config.js` e nas regras.
- Não existe mais o limite prático causado pelo localStorage do navegador.

## Configuração
1. Crie um projeto no Firebase.
2. Crie um app Web e copie as credenciais para `firebase-config.js`.
3. Em Authentication, habilite Email/Password e crie o usuário administrador.
4. Substitua `SEU_EMAIL_DE_ADMINISTRADOR` em `firebase-config.js`, `firestore.rules` e `storage.rules` pelo e-mail do administrador.
5. Crie o Firestore Database.
6. Crie o Storage.
7. Publique as regras de `firestore.rules` e `storage.rules` no Firebase.
8. Coloque os arquivos em uma hospedagem HTTPS. GitHub Pages pode hospedar os arquivos estáticos.

## Migrar os 10 produtos antigos
1. Abra `backup-local.html` no mesmo navegador onde os produtos antigos estão cadastrados.
2. Clique em “Baixar backup JSON”.
3. Depois de configurar o Firebase, abra `migrar.html`.
4. Selecione o JSON e entre com o usuário administrador.
5. Aguarde a migração. As fotos em data URL serão enviadas ao Storage e os produtos ao Firestore.

## Importante
As regras usam o e-mail do administrador. Para uma loja pública real, mantenha as regras exatamente como configuradas e não coloque senhas no código.
