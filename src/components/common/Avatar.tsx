/**
 * Avatar redondo: mostra a foto quando existe, senão as iniciais sobre a cor de fundo.
 * Usado nos contatos, no rodapé da sidebar e onde mais precisar de um rosto.
 */
export default function Avatar({ photoUrl, initials, size, bg, fontSize }: {
  photoUrl?: string
  initials: string
  size: number
  bg: string
  fontSize: number
}) {
  if (photoUrl) {
    return <img src={photoUrl} alt={initials} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: bg }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
  )
}
