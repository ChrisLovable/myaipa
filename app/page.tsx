import Link from 'next/link'

export default function LandingPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0d0d0d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Brand label */}
      <p
        style={{
          color: '#555555',
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: 500,
          marginBottom: 52,
          textAlign: 'center',
        }}
      >
        myAIpartner
      </p>

      {/* Avatar with glow */}
      <div
        className="gabby-glow"
        style={{
          width: 110,
          height: 110,
          borderRadius: '50%',
          backgroundColor: '#1a1a2e',
          border: '2px solid #1a6fd4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 50,
          marginBottom: 36,
          flexShrink: 0,
        }}
      >
        🤖
      </div>

      {/* Title */}
      <h1
        style={{
          color: '#ffffff',
          fontSize: 42,
          fontWeight: 700,
          marginBottom: 10,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        Gabby
      </h1>

      {/* Tagline */}
      <p
        style={{
          color: '#8888cc',
          fontSize: 16,
          marginBottom: 6,
          textAlign: 'center',
        }}
      >
        Jou persoonlike AI-assistent
      </p>
      <p
        style={{
          color: '#555555',
          fontSize: 13,
          marginBottom: 52,
          textAlign: 'center',
        }}
      >
        deur myAIpartner · myaipa.co.za
      </p>

      {/* Buttons — side by side */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          width: '100%',
          maxWidth: 320,
        }}
      >
        <Link
          href="/register"
          style={{
            flex: 1,
            height: 56,
            backgroundColor: '#1a6fd4',
            color: '#ffffff',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          Begin
        </Link>
        <Link
          href="/login"
          style={{
            flex: 1,
            height: 56,
            backgroundColor: 'transparent',
            color: '#8888cc',
            border: '1px solid #2a2a4e',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          Teken in
        </Link>
      </div>

      {/* Footer */}
      <p
        style={{
          position: 'absolute',
          bottom: 28,
          color: '#333355',
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        Geskep deur Chris de Vries · B-BBEE Level 1
      </p>
    </div>
  )
}
