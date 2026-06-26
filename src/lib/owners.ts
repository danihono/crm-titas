// Donos do sistema (SUPER TITAN) — super-admins que enxergam todos os clientes.
// A MESMA lista precisa estar em firestore.rules (função isOwner) para liberar
// a leitura cross-tenant. São no máximo 3 contas.
export const OWNER_EMAILS: string[] = [
  'danielboy200627@gmail.com',
  // 'dono2@exemplo.com',
  // 'dono3@exemplo.com',
].map((e) => e.toLowerCase())

export function isOwnerEmail(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.toLowerCase())
}
