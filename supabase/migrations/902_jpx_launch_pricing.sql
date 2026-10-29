-- ============================================================
-- 902_jpx_launch_pricing.sql — JPX CRM: preço de lançamento
--
-- Customização JPX. Depende da 900/901.
--
-- launch_price = TRUE marca a conta como "fundadora": assinou com
-- preço de lançamento e mantém esse preço enquanto for assinante.
-- Vaga ocupada = fundador que JÁ PAGOU (current_period_end preenchido
-- pela confirmação do pagamento). Cadastro que não paga não ocupa vaga.
-- ============================================================

ALTER TABLE public.account_billing
  ADD COLUMN IF NOT EXISTS launch_price BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.jpx_launch_seats_taken()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM account_billing
  WHERE launch_price
    AND provider IS NOT NULL
    AND current_period_end IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.jpx_launch_seats_taken() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jpx_launch_seats_taken() TO service_role;
