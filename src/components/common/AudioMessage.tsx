import { useRef, useState } from 'react'
import MaterialIcon from './MaterialIcon'

/**
 * Player de áudio no estilo WhatsApp para mensagens de voz do chat.
 * O `src` já é uma URL HTTPS diretamente tocável (Firebase Storage), então basta
 * dirigir um `<audio>` oculto via ref — sem fetch/descriptografia no frontend.
 */

// Garante que só um áudio toca por vez (igual WhatsApp): ao dar play, pausa o anterior.
let currentlyPlaying: HTMLAudioElement | null = null

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioMessage({ src, fromMe, downloadName }: { src: string; fromMe: boolean; downloadName?: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [duration, setDuration] = useState(0)

  const accent = fromMe ? '#ffffff' : '#7a52a0'
  const onAccent = fromMe ? '#7a52a0' : '#ffffff'
  const trackBg = fromMe ? 'rgba(255,255,255,0.30)' : '#d9d2e6'
  const timeColor = fromMe ? 'rgba(240,230,250,0.85)' : '#6e6780'
  const iconMuted = fromMe ? '#f5f0fa' : '#7a52a0'

  const hasDur = isFinite(duration) && duration > 0
  const progress = hasDur ? Math.min(cur / duration, 1) : 0

  function toggle() {
    const a = ref.current
    if (!a) return
    if (a.paused) {
      if (currentlyPlaying && currentlyPlaying !== a) currentlyPlaying.pause()
      currentlyPlaying = a
      void a.play().catch(() => {})
    } else {
      a.pause()
    }
  }

  function onLoadedMetadata() {
    const a = ref.current
    if (!a) return
    if (isFinite(a.duration) && a.duration > 0) {
      setDuration(a.duration)
      return
    }
    // Opus/Ogg do WhatsApp costuma reportar duration = Infinity até haver um seek.
    const fix = () => {
      a.removeEventListener('timeupdate', fix)
      if (isFinite(a.duration)) setDuration(a.duration)
      a.currentTime = 0
      setCur(0)
    }
    a.addEventListener('timeupdate', fix)
    a.currentTime = 1e101
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = ref.current
    if (!a || !hasDur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    a.currentTime = frac * duration
    setCur(a.currentTime)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 210, maxWidth: 300, padding: '8px 10px', borderRadius: 10, marginBottom: 2, border: '1px solid ' + (fromMe ? 'rgba(255,255,255,0.24)' : '#e6e3ee'), background: fromMe ? 'rgba(255,255,255,0.1)' : '#f8f6fb' }}>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        style={{ display: 'none' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { const a = ref.current; if (a) setCur(a.currentTime) }}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={() => { setPlaying(false); setCur(0); if (currentlyPlaying === ref.current) currentlyPlaying = null }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Tocar'}
        style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <MaterialIcon name={playing ? 'pause' : 'play_arrow'} size={20} color={onAccent} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={seek} style={{ padding: '6px 0', cursor: hasDur ? 'pointer' : 'default' }}>
          <div style={{ position: 'relative', height: 4, borderRadius: 3, background: trackBg }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, borderRadius: 3, background: accent }} />
            <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, width: 11, height: 11, borderRadius: '50%', background: accent, transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: timeColor, fontVariantNumeric: 'tabular-nums' }}>{fmt(cur > 0 ? cur : duration)}</div>
      </div>

      <a href={src} download={downloadName} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Baixar áudio" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: iconMuted }}>
        <MaterialIcon name="download" size={17} color={iconMuted} />
      </a>
    </div>
  )
}
