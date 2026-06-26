import type { CSSProperties } from 'react'

// Tokens visuais reutilizáveis extraídos dos estilos inline do protótipo.
// Cores-chave da identidade (roxo/escuro + painéis claros).

export const C = {
  ink: '#1d1726',
  sub: '#6e6780',
  muted: '#9c95a8',
  faint: '#a39bb0',
  line: '#ececf3',
  lineSoft: '#eeebf3',
  panel: '#f5f3f8',
  field: '#f7f5fa',
  fieldBorder: '#e6e3ee',
  purple: '#7a52a0',
  purpleDeep: '#553578',
  green: '#2f9e6f',
  amber: '#b3801f',
  rose: '#c14d77',
  blue: '#4f7fc0',
  darkA: '#0d0a11',
  darkB: '#0a070d',
}

export const primaryGradient = 'linear-gradient(140deg,#7a52a0,#553578)'
export const purpleAvatar = 'linear-gradient(150deg,#b692d6,#6f4d92)'

const card: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #ececf3',
  borderRadius: 18,
  boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)',
}

const btnPrimary: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: primaryGradient,
  border: '1px solid rgba(200,160,230,0.3)',
  borderRadius: 11,
  padding: '9px 16px',
  color: '#f4eefa',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(110,65,150,0.25)',
}

const btnGhost: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: '#ffffff',
  border: '1px solid #e6e3ee',
  borderRadius: 11,
  padding: '9px 14px',
  color: '#4a4458',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(28,20,50,0.04)',
}

const input: CSSProperties = {
  width: '100%',
  background: '#f7f5fa',
  border: '1px solid #e6e3ee',
  borderRadius: 11,
  padding: '11px 13px',
  color: '#1d1726',
  fontSize: 13.5,
  outline: 'none',
}

const label: CSSProperties = {
  fontSize: 12,
  color: '#6e6780',
  fontWeight: 600,
}

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20,14,30,0.5)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
}

const modalBox: CSSProperties = {
  width: 480,
  background: '#ffffff',
  border: '1px solid #ececf3',
  borderRadius: 20,
  padding: '26px 28px',
  boxShadow: '0 30px 80px rgba(20,14,40,0.3)',
}

const serif: CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
}

export const sx = { card, btnPrimary, btnGhost, input, label, modalOverlay, modalBox, serif }
