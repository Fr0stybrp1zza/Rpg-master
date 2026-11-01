# RPG Master — MVP inicial

Aplicativo Android em React Native + Expo, com Supabase para autenticação e dados sincronizados.

## O que já está preparado
- Login e cadastro por e-mail.
- Criação e listagem de campanhas.
- Relógio de campanha com iniciar/pausar.
- Consulta inicial de fichas e barras de vida/mana.
- Esquema SQL inicial para campanhas, membros, personagens, permissões e histórico de recursos.

## Requisitos
- Node.js LTS
- Expo Go no Android para testar inicialmente
- Projeto Supabase

## Configuração
1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Copie `.env.example` para `.env`.
4. Preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` com os dados do projeto.
5. Instale as dependências: `npm install`.
6. Inicie: `npx expo start`.
7. Leia o QR Code com o Expo Go.

## Estado do projeto
Este é um esqueleto funcional inicial, não uma versão pronta para produção. Antes de usar numa campanha real, ainda precisamos implementar:
- Convites seguros de jogadores para campanhas.
- Cadastro/edição de personagens e fichas completas.
- Permissões granulares aplicadas também no banco.
- RPC transacional para regeneração de mana baseada em segundos ativos da campanha.
- Gastos/recuperações de recursos e histórico.
- XP, técnicas, inventário, combate e testes automatizados.

**Importante:** a interface mostra o relógio usando o horário local para atualização visual, mas o banco acumula o tempo com `now()` no servidor. A próxima etapa deve fazer todos os cálculos de recursos exclusivamente no servidor, nunca confiar no relógio do celular.
