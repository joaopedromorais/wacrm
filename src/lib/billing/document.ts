// ============================================================
// Validação de CPF/CNPJ (dígitos verificadores). O Asaas exige o
// documento para criar o cliente; validar aqui evita ida e volta
// com erro do gateway. O documento NÃO é guardado no nosso banco.
// ============================================================

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function allSame(digits: string): boolean {
  return /^(\d)\1+$/.test(digits)
}

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || allSame(cpf)) return false
  const nums = cpf.split('').map(Number)
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i)
    const check = ((sum * 10) % 11) % 10
    if (check !== nums[len]) return false
  }
  return true
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || allSame(cnpj)) return false
  const nums = cnpj.split('').map(Number)
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, ...weights1]
  for (const [len, weights] of [[12, weights1], [13, weights2]] as const) {
    const sum = weights.reduce((acc, w, i) => acc + w * nums[i], 0)
    const rest = sum % 11
    const check = rest < 2 ? 0 : 11 - rest
    if (check !== nums[len]) return false
  }
  return true
}

export function isValidCpfCnpj(value: string): boolean {
  const digits = onlyDigits(value)
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits)
}
