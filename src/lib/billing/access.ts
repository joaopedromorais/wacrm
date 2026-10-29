// ============================================================
// JPX CRM — consulta de acesso por assinatura (lado servidor).
//
// Usada pela API pública (/api/v1), que autentica por API key e não
// tem sessão de usuário: consulta com service role a mesma regra que
// o middleware usa (função SQL `account_has_access`, migration 900).
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * true só quando a conta está "active" e dentro do prazo.
 * Qualquer erro de consulta conta como sem acesso (falha fechada).
 */
export async function accountHasAccess(accountId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('account_has_access', {
    target_account_id: accountId,
  })
  if (error) {
    console.error('[billing] account_has_access falhou:', error.message)
    return false
  }
  return data === true
}
