'use client'

type GabbyState = 'waiting' | 'listening' | 'thinking' | 'speaking'

interface MicButtonProps {
  state: GabbyState
  onPress: () => void
}

const stateColors = {
  waiting: { bg: '#1a6fd4', ring: '#1a6fd4', shadow: '0 0 20px rgba(26,111,212,0.4)' },
  listening: { bg: '#c0392b', ring: '#c0392b', shadow: '0 0 20px rgba(192,57,43,0.5)' },
  thinking: { bg: '#555555', ring: '#555555', shadow: 'none' },
  speaking: { bg: '#27ae60', ring: '#27ae60', shadow: '0 0 20px rgba(39,174,96,0.4)' },
}

const stateIcon = {
  waiting: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
  ),
  listening: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  thinking: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white" opacity="0.5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  ),
  speaking: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
    </svg>
  ),
}

export default function MicButton({ state, onPress }: MicButtonProps) {
  const colors = stateColors[state]
  const isDisabled = state === 'thinking'

  return (
    <button
      onClick={onPress}
      disabled={isDisabled}
      aria-label={
        state === 'waiting' ? 'Begin praat' :
        state === 'listening' ? 'Stop luister' :
        state === 'speaking' ? 'Onderbreek Gabby' :
        'Besig...'
      }
      className="relative flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        width: 72,
        height: 72,
        backgroundColor: colors.bg,
        boxShadow: colors.shadow,
        minWidth: 44,
        minHeight: 44,
      }}
    >
      {state === 'listening' && (
        <div
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ backgroundColor: colors.ring, opacity: 0.3 }}
        />
      )}
      {stateIcon[state]}
    </button>
  )
}
