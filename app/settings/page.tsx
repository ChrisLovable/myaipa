'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GabbyAvatar from '@/components/GabbyAvatar'

type Language = 'af' | 'en'

const LANGUAGES: { code: Language; label: string; sub: string }[] = [
  { code: 'af', label: '🇿🇦 Afrikaans', sub: 'Afrikaans' },
  { code: 'en', label: '🇬🇧 English',   sub: 'English'   },
]

export default function SettingsPage() {
  const [language, setLanguage]   = useState<Language>('af')
  const [saving,   setSaving]     = useState(false)
  const [saved,    setSaved]      = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('users_profile')
        .select('language')
        .eq('id', user.id)
        .single()
      if (profile?.language) setLanguage(profile.language as Language)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLanguageChange(lang: Language) {
    if (lang === language || saving) return
    setSaving(true)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('users_profile')
        .update({ language: lang })
        .eq('id', user.id)
    }
    setLanguage(lang)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen flex flex-col px-6 pt-8" style={{ backgroundColor: '#0d0d0d' }}>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full"
          style={{ color: '#8888cc' }}
          aria-label="Terug"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">Instellings</h1>
      </div>

      {/* Profile */}
      <div
        className="flex items-center gap-4 p-5 rounded-xl mb-6"
        style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
      >
        <GabbyAvatar size={56} />
        <div>
          <p className="font-semibold text-white">Jou rekening</p>
          <p className="text-sm" style={{ color: '#8888cc' }}>myAIpartner Basic</p>
        </div>
      </div>

      {/* Language */}
      <div
        className="p-5 rounded-xl mb-6"
        style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white text-sm">Taal / Language</h2>
          <span
            className="text-xs transition-opacity duration-300"
            style={{
              color:   saving ? '#d4ac0d' : '#27ae60',
              opacity: saving || saved ? 1 : 0,
            }}
          >
            {saving ? 'Stoor...' : 'Gestoor ✓'}
          </span>
        </div>

        <div className="flex gap-3">
          {LANGUAGES.map(({ code, label, sub }) => {
            const active = language === code
            return (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 flex flex-col items-center gap-0.5"
                style={{
                  backgroundColor: active ? '#1a6fd4' : 'transparent',
                  border: `1px solid ${active ? '#1a6fd4' : '#2a2a4e'}`,
                  color:  active ? '#ffffff' : '#8888cc',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{label}</span>
                {sub !== label && (
                  <span className="text-xs" style={{ opacity: 0.7 }}>{sub}</span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: '#555555' }}>
          Gabby sal altyd in hierdie taal antwoord. Jy kan ook in die gesprek van taal verander.
        </p>
      </div>

      {/* Business Profile */}
      <button
        onClick={() => router.push('/settings/business')}
        className="w-full p-5 rounded-xl mb-6 text-left"
        style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', cursor: 'pointer' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white text-sm">Besigheidsprofiel</h2>
            <p className="text-xs mt-0.5" style={{ color: '#8888cc' }}>
              Faktuurbranding, bankbesonderhede, BTW-nommer
            </p>
          </div>
          <span style={{ color: '#8888cc', fontSize: 18 }}>›</span>
        </div>
      </button>

      {/* About */}
      <div
        className="p-5 rounded-xl mb-6"
        style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
      >
        <h2 className="font-semibold text-white mb-3 text-sm">Oor Gabby</h2>
        <p className="text-sm leading-relaxed" style={{ color: '#8888cc' }}>
          Gabby is jou persoonlike AI-assistent, geskep deur Chris de Vries by myAIpartner.
          Besoek ons by myaipa.co.za of myaipartner.co.za.
        </p>
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #2a2a4e' }}>
          <p className="text-xs" style={{ color: '#555555' }}>Weergawe 1.0.0 · B-BBEE Level 1</p>
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-95 mt-auto mb-8"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #c0392b',
          color: '#c0392b',
          minHeight: 56,
        }}
      >
        Teken uit
      </button>
    </div>
  )
}
