# Seed da conta de demonstração — desenho

- **Intenção:** permitir entrar no MiniFinance e visualizar um cenário financeiro fictício em uso.
- **Escopo:** script TypeScript executado manualmente em `backend/`, usando Drizzle e a `DATABASE_URL` já configurada; criar a conta `demo@minifinance.local` com senha exclusiva de demonstração, hash Argon2, e registros relacionados para os módulos financeiros do schema.
- **Dados:** contas, categorias, transações, transferências, orçamentos, cartões, compras parceladas, faturas, parcelas, eventual quitação válida, recorrências, metas e contribuições. Datas próximas à execução mantêm os painéis demonstrativos relevantes.
- **Segurança e repetição:** abortar quando `NODE_ENV=production`; executar gravações numa transação; se a conta de demonstração já existir, encerrar sem alterar dados. Não tocar em outros usuários. A sessão não é semeada: login normal cria uma sessão válida.
- **Abordagens:** SQL manual é simples, mas dificulta o hash Argon2 e a consistência das relações; endpoints da API exigem várias chamadas e não cobrem facilmente dados históricos; script TypeScript com Drizzle reaproveita schema, hash e transação, sendo a opção escolhida.
- **Fora do escopo:** migration, alteração de schema, alteração do frontend e dados reais.
- **Critério de aceite:** comando documentado cria o cenário uma vez em todas as tabelas financeiras de domínio, pode ser executado manualmente com segurança, informa se a conta já existe e permite autenticar pela tela de login.
