-- ============================================================
-- 901_jpx_asaas_billing.sql — JPX CRM: cobrança automática (Asaas)
--
-- Customização JPX. Depende da 900 (account_billing).
--
--  - billing_events: registro dos webhooks recebidos (idempotência
--    e auditoria). Sem FK para accounts de propósito: é log, e não
--    pode impedir a remoção de uma conta.
--  - jpx_billing_apply_payment: pagamento confirmado → conta ativa
--    até o fim do período pago (nunca encurta um prazo já maior).
--  - jpx_billing_set_status: estorno/chargeback → bloqueia.
--
-- Tudo só para service_role (rotas de servidor). Nada exposto ao
-- usuário logado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id        TEXT PRIMARY KEY,
  provider        TEXT NOT NULL DEFAULT 'asaas',
  event           TEXT NOT NULL,
  subscription_id TEXT,
  account_ref     UUID,
  outcome         TEXT,
  payload         JSONB NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_subscription
  ON public.billing_events(subscription_id, received_at DESC);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
GRANT ALL ON public.billing_events TO service_role;

-- Forma de pagamento escolhida (PIX / CREDIT_CARD) — para reaproveitar
-- a fatura pendente quando o cliente clica "Assinar" de novo.
ALTER TABLE public.account_billing ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Uma assinatura do gateway pertence a uma única conta.
DROP INDEX IF EXISTS public.idx_account_billing_provider_subscription;
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_billing_provider_subscription
  ON public.account_billing(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ------------------------------------------------------------
-- Pagamento confirmado/recebido
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jpx_billing_apply_payment(
  p_provider        TEXT,
  p_subscription_id TEXT,
  p_period_end      TIMESTAMPTZ,
  p_note            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  UPDATE account_billing
     SET status             = 'active',
         current_period_end = GREATEST(COALESCE(current_period_end, p_period_end), p_period_end),
         notes              = COALESCE(p_note, notes)
   WHERE provider = p_provider
     AND provider_subscription_id = p_subscription_id
  RETURNING account_id INTO v_account_id;

  RETURN v_account_id; -- NULL = assinatura desconhecida
END;
$$;

REVOKE ALL ON FUNCTION public.jpx_billing_apply_payment(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_billing_apply_payment(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- ------------------------------------------------------------
-- Mudança de status (estorno, chargeback)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jpx_billing_set_status(
  p_provider        TEXT,
  p_subscription_id TEXT,
  p_status          TEXT,
  p_note            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF p_status NOT IN ('pending', 'active', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  UPDATE account_billing
     SET status = p_status,
         notes  = COALESCE(p_note, notes)
   WHERE provider = p_provider
     AND provider_subscription_id = p_subscription_id
  RETURNING account_id INTO v_account_id;

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.jpx_billing_set_status(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_billing_set_status(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Painel: inclui plano e assinatura do gateway na listagem da 900.
DROP FUNCTION IF EXISTS public.jpx_list_accounts();
CREATE FUNCTION public.jpx_list_accounts()
RETURNS TABLE (
  account_id               UUID,
  account_name             TEXT,
  owner_email              TEXT,
  status                   TEXT,
  plan                     TEXT,
  current_period_end       TIMESTAMPTZ,
  has_access               BOOLEAN,
  members                  BIGINT,
  provider_subscription_id TEXT,
  created_at               TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         a.name,
         u.email::TEXT,
         COALESCE(b.status, 'pending'),
         b.plan,
         b.current_period_end,
         public.account_has_access(a.id),
         (SELECT COUNT(*) FROM profiles p WHERE p.account_id = a.id),
         b.provider_subscription_id,
         a.created_at
  FROM accounts a
  JOIN auth.users u ON u.id = a.owner_user_id
  LEFT JOIN account_billing b ON b.account_id = a.id
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.jpx_list_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_list_accounts() TO service_role;
