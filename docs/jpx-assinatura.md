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

## Próxima etapa (gateway)

O webhook do gateway (Asaas, Mercado Pago, Stripe…) vai só fazer
automaticamente o que `jpx_set_account_access` faz hoje à mão, usando as
colunas `provider`, `provider_customer_id` e `provider_subscription_id`.
