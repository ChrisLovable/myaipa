'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim()) { setError('Voer jou e-posadres in.'); return }
    if (!password)     { setError('Voer jou wagwoord in.'); return }

    setLoading(true)
    console.log('Attempting login with:', email)

    try {
      // Create client inside handler so env vars are always fresh
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      console.log('Login result:', { user: data?.user?.id, error: authError?.message })

      if (authError) {
        setError(authError.message)
        return
      }

      router.push('/chat')
    } catch (err) {
      console.error('Login error:', err)
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: '#1a1a2e',
    border: '1px solid #2a2a4e',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: '#1a1a2e', border: '2px solid #1a6fd4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px', margin: '0 auto 16px',
          }}>🤖</div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>
            Welkom terug
          </h1>
          <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>
            Teken in om met Gabby te gesels
          </p>
        </div>

        {/* noValidate disables browser native validation so React handles it */}
        <form onSubmit={handleSubmit} noValidate>

          <div style={{ marginBottom: '16px' }}>
            <input
              type="email"
              placeholder="E-posadres"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Wagwoord"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, padding: '12px 48px 12px 16px' }}
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

          {error && (
            <div style={{
              background: '#2a0a0a',
              border: '1px solid #c0392b',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#e74c3c',
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#0d3a6e' : '#1a6fd4',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '16px',
            }}
          >
            {loading ? 'Besig...' : 'Teken In'}
          </button>

          <p style={{ textAlign: 'center', color: '#555', fontSize: '14px', margin: 0 }}>
            Nog nie &apos;n rekening nie?{' '}
            <Link href="/register" style={{ color: '#1a6fd4', textDecoration: 'none' }}>
              Registreer
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
