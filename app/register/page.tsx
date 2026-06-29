'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword]       = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [error, setError]                     = useState('')
  const [info, setInfo]                       = useState('')
  const [loading, setLoading]                 = useState(false)
  const router = useRouter()

  // Confirm component mounted and env vars are readable
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(missing)'
    console.log('[Register] mounted. NEXT_PUBLIC_SUPABASE_URL =', url)

    if (!url || url.includes('placeholder')) {
      setError(
        'Supabase is not configured. Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server.'
      )
    }
  }, [])

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    console.log('[Register] handleRegister called', { email, passwordLength: password.length })

    setError('')
    setInfo('')

    if (!email.trim()) {
      setError('Voer asseblief jou e-posadres in.')
      return
    }
    if (password.length < 8) {
      setError('Wagwoord moet minstens 8 karakters wees.')
      return
    }
    if (password !== confirmPassword) {
      setError('Wagwoorde stem nie ooreen nie.')
      return
    }

    setLoading(true)

    try {
      // Create client inside the handler to avoid SSR hydration mismatch
      const supabase = createClient()
      console.log('[Register] calling supabase.auth.signUp...')

      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      console.log('[Register] signUp result:', { data, authError })

      if (authError) throw authError

      // Supabase may require email confirmation — check session
      if (data.session) {
        // Session exists → logged in immediately → go to onboarding
        console.log('[Register] session created, redirecting to /onboarding')
        router.push('/onboarding')
      } else if (data.user && !data.session) {
        // Email confirmation required
        console.log('[Register] confirmation email sent')
        setInfo('Bevestigings-e-pos gestuur! Gaan kyk in jou inkassie en klik die skakel om voort te gaan.')
      } else {
        router.push('/onboarding')
      }
    } catch (err: unknown) {
      console.error('[Register] caught error:', err)
      const msg = err instanceof Error ? err.message : String(err)

      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        setError('Hierdie e-posadres is reeds geregistreer. Teken eerder in.')
      } else if (msg.includes('invalid') && msg.includes('email')) {
        setError('Voer asseblief \'n geldige e-posadres in.')
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        setError('Kan nie met die bediener verbind nie. Kontroleer dat NEXT_PUBLIC_SUPABASE_URL in .env.local ingestel is.')
      } else {
        setError(`Iets het verkeerd gegaan: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4e',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 15,
    outline: 'none',
    minHeight: 52,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  }

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
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360, paddingTop: 40, paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              backgroundColor: '#1a1a2e',
              border: '2px solid #1a6fd4',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              marginBottom: 16,
            }}
          >
            🤖
          </div>
          <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
            Skep jou rekening
          </h1>
          <p style={{ color: '#8888cc', fontSize: 14 }}>Begin jou reis met Gabby</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} noValidate>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#8888cc', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              E-posadres
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jou@epos.co.za"
              autoComplete="email"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#1a6fd4' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a4e' }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#8888cc', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              Wagwoord
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 karakters"
                autoComplete="new-password"
                style={{ ...inputStyle, padding: '14px 48px 14px 16px' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#1a6fd4' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#555',
                  fontSize: '18px',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#8888cc', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              Bevestig wagwoord
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                style={{ ...inputStyle, padding: '14px 48px 14px 16px' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#1a6fd4' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#555',
                  fontSize: '18px',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                backgroundColor: '#1f0a0a',
                border: '1px solid #c0392b',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                color: '#e87070',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {/* Info / success message */}
          {info && (
            <div
              style={{
                backgroundColor: '#0a1f0a',
                border: '1px solid #27ae60',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                color: '#5dd87e',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {info}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 56,
              backgroundColor: loading ? '#1255a4' : '#1a6fd4',
              color: '#ffffff',
              border: 'none',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 16,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: 'inherit',
              transition: 'background-color 0.15s',
            }}
          >
            {loading && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ animation: 'spin 0.8s linear infinite' }}
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? 'Besig...' : 'Skep rekening'}
          </button>
        </form>

        {/* Footer links */}
        <p style={{ textAlign: 'center', fontSize: 14, color: '#8888cc', marginTop: 24 }}>
          Reeds &apos;n rekening?{' '}
          <Link href="/login" style={{ color: '#1a6fd4', fontWeight: 500, textDecoration: 'none' }}>
            Teken in
          </Link>
        </p>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/" style={{ color: '#555555', fontSize: 12, textDecoration: 'none' }}>
            ← Terug na tuis
          </Link>
        </div>
      </div>

      {/* Spinner keyframe — injected inline so it works without Tailwind */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
