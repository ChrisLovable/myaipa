'use client'

interface GabbyAvatarProps {
  size?: number
  showPulse?: boolean
  logoUrl?: string
}

export default function GabbyAvatar({ size = 80, showPulse = false, logoUrl }: GabbyAvatarProps) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {showPulse && (
        <>
          <div
            className="absolute inset-0 rounded-full bg-[#1a6fd4] opacity-20 animate-pulse-ring"
            style={{ width: size + 20, height: size + 20, top: -10, left: -10 }}
          />
          <div
            className="absolute inset-0 rounded-full bg-[#1a6fd4] opacity-10 animate-pulse-ring"
            style={{
              width: size + 40,
              height: size + 40,
              top: -20,
              left: -20,
              animationDelay: '0.5s',
            }}
          />
        </>
      )}
      <div
        className="relative rounded-full bg-[#1a1a2e] border-2 border-[#2a2a4e] flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Gabby" className="w-full h-full object-cover" />
        ) : (
          <span style={{ fontSize: size * 0.45 }}>🤖</span>
        )}
      </div>
    </div>
  )
}
