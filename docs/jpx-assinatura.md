# JPX CRM — Assinatura por conta

Customização JPX: só usa o CRM a conta com assinatura ativa.

## Como funciona

- Toda conta nova nasce **pending** (aguardando pagamento).
- Usuário logado de conta sem acesso vai para **/assinatura**, com botão de
  WhatsApp da JPX (mensagem já preenchida com conta e e-mail).
- APIs internas respondem **402** (`account_inactive`); a API pública
  (`/api/v1`) responde **403**.
- **Nunca bloqueados:** webhook da Meta (mensagens continuam chegando),
  crons, aceite de convite.
- A equipe convidada usa a assinatura do dono da conta.
- Contas que já existiam quando a migration 900 rodou ficaram **active** sem prazo.

## Operação (Supabase → SQL Editor)

Ver todas as contas:

```sql
SELECT * FROM jpx_list_accounts();
```

Liberar por 30 dias (pelo e-mail do DONO da conta):

```sql
SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'active', NOW() + INTERVAL '30 days', 'Pix 29/10');
```

Liberar sem prazo (cortesia, parceiro):

```sql
SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'active');
```

Bloquear por atraso / cancelar:

```sql
SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'past_due');
SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'canceled');
```

Vencidas nos próximos 7 dias (para cobrar antes):

```sql
SELECT * FROM jpx_list_accounts()
WHERE status = 'active' AND current_period_end < NOW() + INTERVAL '7 days';
```

O cliente liberado só precisa clicar em **"Já paguei, verificar acesso"**.

## Atualizar o fork (upstream) com a migration 900 aplicada

A 900 tem número maior que as do upstream. Quando o upstream trouxer uma
migration nova (ex.: 060), o `db push` normal recusa por ordem. Use:

```bash
supabase db push --dry-run --include-all   # confira a lista
supabase db push --include-all
```

## Cobrança automática (Asaas) — etapa 2

Com o Asaas configurado, a tela /assinatura mostra os planos e o cliente
paga sozinho por **Pix** ou **cartão**. Sem configuração, volta a mostrar
só o botão de WhatsApp (etapa 1).

### Planos

Definidos em `src/lib/billing/plans.ts` (único lugar para mudar preço):

| Plano | Lançamento (50 primeiros) | Preço cheio |
|---|---|---|
| Mensal | R$ 127 | R$ 197 |
| Semestral | R$ 647 (R$ 107,83/mês) | R$ 997 (R$ 166,17/mês) |
| Anual | R$ 1.147 (R$ 95,58/mês) | R$ 1.797 (R$ 149,75/mês) |

Tolerância após o vencimento: **3 dias** (`GRACE_DAYS`).

### Preço de lançamento

- Vale para as **50 primeiras contas que pagarem** (`LAUNCH.seats`).
  Cadastro que não paga não ocupa vaga.
- A conta vira **fundadora** (`launch_price = true`) e mantém o preço de
  lançamento enquanto for assinante, inclusive ao trocar de plano.
- Esgotadas as vagas, novos clientes veem e pagam o preço cheio sozinhos.
- Encerrar antes: `LAUNCH.enabled = false` em `plans.ts`.
- O valor cobrado é decidido no servidor, nunca vem do navegador.

```sql
SELECT jpx_launch_seats_taken();  -- vagas ocupadas
SELECT account_id, status, plan FROM account_billing WHERE launch_price;  -- fundadores
```

### Variáveis de ambiente (.env.local / servidor)

```env
ASAAS_API_KEY=            # chave da API (Asaas → Integrações → Chaves de API)
ASAAS_API_URL=https://api-sandbox.asaas.com/v3   # produção: https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=      # token longo (32+ caracteres) — o mesmo do webhook
```

Gerar um token: `openssl rand -hex 32`. Nunca use a chave da API como token.

### Webhook no Asaas (Integrações → Webhooks)

- URL: `https://<seu-dominio>/api/billing/asaas`
- Token de autenticação: o valor de `ASAAS_WEBHOOK_TOKEN`
- Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`,
  `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`

O Asaas só chama URL pública com HTTPS. Para testar no seu Mac, use um
túnel (ex.: `cloudflared tunnel --url http://localhost:3000`) e cadastre a
URL do túnel no webhook do **sandbox**.

### O que cada evento faz

| Evento | Efeito |
|---|---|
| Pagamento confirmado/recebido | Conta ativa até vencimento + período do plano + 3 dias |
| Estorno / chargeback | Bloqueia (`past_due`) |
| Assinatura removida/inativada | Só registra — o cliente usa até o fim do que pagou |
| Outros | Registrados e ignorados |

Todo evento fica em `billing_events` (auditoria). Eventos repetidos são ignorados.

### Consultas úteis

```sql
SELECT * FROM jpx_list_accounts();
SELECT received_at, event, outcome, subscription_id FROM billing_events ORDER BY received_at DESC LIMIT 20;
```

A liberação manual (`jpx_set_account_access`) continua valendo para
cortesias e negociações.
