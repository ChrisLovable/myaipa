'use client'

const actions = [
  { label: 'E-pos', icon: '✉️' },
  { label: 'Invoice', icon: '🧾' },
  { label: 'Bel', icon: '📞' },
  { label: 'Lêers', icon: '📁' },
  { label: 'Foto', icon: '📷' },
  { label: 'Musiek', icon: '🎵' },
]

interface QuickActionsProps {
  onAction: (action: string) => void
}

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="px-4 py-2 overflow-x-auto flex-shrink-0">
      <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.label)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95"
            style={{
              backgroundColor: '#1a1a2e',
              border: '1px solid #2a2a4e',
              color: '#8888cc',
              minHeight: 44,
            }}
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
