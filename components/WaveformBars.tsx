'use client'

type GabbyState = 'waiting' | 'listening' | 'thinking' | 'speaking'

interface WaveformBarsProps {
  state: GabbyState
}

const barCount = 7

const stateConfig = {
  waiting: {
    color: '#1a6fd4',
    animated: false,
    heights: [0.2, 0.3, 0.25, 0.35, 0.25, 0.3, 0.2],
  },
  listening: {
    color: '#c0392b',
    animated: true,
    heights: [0.4, 0.7, 0.9, 1.0, 0.9, 0.7, 0.4],
  },
  thinking: {
    color: '#d4ac0d',
    animated: true,
    heights: [0.3, 0.5, 0.7, 0.8, 0.7, 0.5, 0.3],
  },
  speaking: {
    color: '#27ae60',
    animated: true,
    heights: [0.5, 0.8, 1.0, 0.9, 1.0, 0.8, 0.5],
  },
}

export default function WaveformBars({ state }: WaveformBarsProps) {
  const config = stateConfig[state]
  const barHeight = 32

  return (
    <div className="flex items-end gap-[3px] justify-center mt-3" style={{ height: barHeight }}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={config.animated ? 'wave-bar' : ''}
          style={{
            width: 4,
            height: barHeight * config.heights[i],
            backgroundColor: config.color,
            borderRadius: 2,
            transformOrigin: 'bottom',
            animationDelay: config.animated ? `${i * 0.1}s` : undefined,
            opacity: state === 'waiting' ? 0.5 : 1,
            transition: 'background-color 0.3s ease, height 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
