-- ============================================================
-- 900_jpx_account_billing.sql — JPX CRM: acesso por assinatura
--
-- Customização JPX (não existe no wacrm original). Numerada em 900
-- para nunca colidir com as migrations do upstream (001–0NN).
-- Consequência: quando o upstream trouxer uma migration nova (ex.:
-- 060) depois desta já aplicada, rode `supabase db push --include-all`
-- e confira o `--dry-run` antes.
--
-- Modelo: UMA assinatura por CONTA (accounts). O dono paga; a equipe
-- convidada herda o acesso da conta. Sem linha "active" e dentro do
-- prazo, o middleware manda o usuário para /assinatura e a API
-- pública responde 403.
--
-- Status:
--   pending   — conta criada, aguardando primeiro pagamento (padrão)
--   active    — liberada (até current_period_end; NULL = sem prazo)
--   past_due  — pagamento em atraso (bloqueada)
--   canceled  — cancelada (bloqueada)
--
-- Escrita: só service_role / postgres (SQL Editor, webhook futuro do
-- gateway). Membros da conta só LEEM a própria linha.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_billing (
  account_id               UUID PRIMARY KEY
                             REFERENCES public.accounts(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
  plan                     TEXT,
  current_period_end       TIMESTAMPTZ,
  provider                 TEXT,
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_billing_provider_subscription
  ON public.account_billing(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE public.account_billing ENABLE ROW LEVEL SECURITY;

-- O projeto expõe tabelas novas automaticamente para anon/authenticated.
-- Aqui é o contrário: ninguém do lado do cliente escreve nesta tabela.
REVOKE ALL ON public.account_billing FROM anon, authenticated;
GRANT SELECT ON public.account_billing TO authenticated;
GRANT ALL ON public.account_billing TO service_role;

DROP POLICY IF EXISTS "account_billing_select_members" ON public.account_billing;
CREATE POLICY "account_billing_select_members" ON public.account_billing
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

DROP TRIGGER IF EXISTS set_updated_at ON public.account_billing;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.account_billing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Regra de acesso (fonte única da verdade)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_has_access(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_billing b
    WHERE b.account_id = target_account_id
      AND b.status = 'active'
      AND (b.current_period_end IS NULL OR b.current_period_end > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.account_has_access(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_access(UUID) TO service_role;

-- Versão para o usuário logado (middleware). Resolve a conta pelo
-- profiles.account_id do próprio auth.uid() — o chamador não escolhe
-- qual conta consultar, então não vaza status de outras contas.
CREATE OR REPLACE FUNCTION public.my_account_has_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT public.account_has_access(p.account_id)
       FROM profiles p
      WHERE p.user_id = auth.uid()),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.my_account_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_has_access() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Toda conta nova nasce "pending"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jpx_account_billing_init()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO account_billing (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.jpx_account_billing_init() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jpx_account_billing_init ON public.accounts;
CREATE TRIGGER jpx_account_billing_init
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.jpx_account_billing_init();

-- Contas que já existem quando esta migration roda (a sua, JP) ficam
-- liberadas sem prazo — ninguém é trancado fora na instalação.
INSERT INTO public.account_billing (account_id, status, notes)
SELECT a.id, 'active', 'Liberada na instalação do controle de assinatura'
FROM public.accounts a
ON CONFLICT (account_id) DO NOTHING;

-- ------------------------------------------------------------
-- Ferramentas de operação (SQL Editor). Só postgres/service_role.
-- ------------------------------------------------------------

-- Liberar / bloquear pelo e-mail do DONO da conta.
--   SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'active', NOW() + INTERVAL '30 days');
--   SELECT * FROM jpx_set_account_access('cliente@empresa.com', 'past_due');
CREATE OR REPLACE FUNCTION public.jpx_set_account_access(
  owner_email TEXT,
  new_status  TEXT,
  valid_until TIMESTAMPTZ DEFAULT NULL,
  note        TEXT DEFAULT NULL
)
RETURNS TABLE (
  account_id         UUID,
  account_name       TEXT,
  status             TEXT,
  current_period_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_account_id UUID;
BEGIN
  IF new_status NOT IN ('pending', 'active', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'Status inválido: % (use pending, active, past_due ou canceled)', new_status;
  END IF;

  SELECT a.id INTO v_account_id
  FROM accounts a
  JOIN auth.users u ON u.id = a.owner_user_id
  WHERE lower(u.email) = lower(trim(owner_email));

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta tem como dono o e-mail %', owner_email;
  END IF;

  INSERT INTO account_billing AS b (account_id, status, current_period_end, notes)
  VALUES (v_account_id, new_status, valid_until, note)
  ON CONFLICT (account_id) DO UPDATE
    SET status             = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end,
        notes              = COALESCE(EXCLUDED.notes, b.notes);

  RETURN QUERY
  SELECT b.account_id, a.name, b.status, b.current_period_end
  FROM account_billing b
  JOIN accounts a ON a.id = b.account_id
  WHERE b.account_id = v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.jpx_set_account_access(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_set_account_access(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- Painel rápido: todas as contas, dono, status e se está liberada agora.
--   SELECT * FROM jpx_list_accounts();
CREATE OR REPLACE FUNCTION public.jpx_list_accounts()
RETURNS TABLE (
  account_id         UUID,
  account_name       TEXT,
  owner_email        TEXT,
  status             TEXT,
  current_period_end TIMESTAMPTZ,
  has_access         BOOLEAN,
  members            BIGINT,
  created_at         TIMESTAMPTZ
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
         b.current_period_end,
         public.account_has_access(a.id),
         (SELECT COUNT(*) FROM profiles p WHERE p.account_id = a.id),
         a.created_at
  FROM accounts a
  JOIN auth.users u ON u.id = a.owner_user_id
  LEFT JOIN account_billing b ON b.account_id = a.id
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.jpx_list_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_list_accounts() TO service_role;
