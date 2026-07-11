'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GabbyAvatar from '@/components/GabbyAvatar'

const TOTAL_STEPS = 6

const SAMPLE_COMMANDS = [
  '"Skryf \'n e-pos aan my kliënt"',
  '"Vat hierdie foto en gee my die teks"',
  '"Wat staan in hierdie kontrak?"',
  '"Stel \'n faktuur op vir R5,000"',
]

function OnboardingPageInner() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState<'af' | 'en'>('af')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Permissions state
  const [micGranted, setMicGranted] = useState(false)
  const [notifGranted, setNotifGranted] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const logoInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoExists, setVideoExists] = useState(false)

  useEffect(() => {
    fetch('/gabby_intro.mp4', { method: 'HEAD' })
      .then((r) => setVideoExists(r.ok))
      .catch(() => setVideoExists(false))
  }, [])

  // Pick up Google OAuth redirect result and restore the permissions step
  useEffect(() => {
    const googleResult = searchParams.get('google')
    if (googleResult === 'connected') {
      setGoogleConnected(true)
      setStep(5)
    } else if (googleResult === 'error') {
      setError('Kon nie aan Google koppel nie. Probeer weer.')
      setStep(5)
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setNotifGranted(true)
    }
  }, [searchParams])

  async function startVoiceInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicGranted(true)
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeName(blob)
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      setError('Mikrofoon toegang geweier. Gebruik die teksveld.')
    }
  }

  function stopVoiceInput() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  async function transcribeName(blob: Blob) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'audio.webm')
      formData.append('languageCode', language === 'en' ? 'en' : 'af')
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { text } = await res.json()
      if (text?.trim()) setName(text.trim())
    } catch {
      setError('Iets het verkeerd gegaan. Probeer weer.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoUpload(file: File) {
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotifGranted(permission === 'granted')
  }

  function connectGoogle() {
    window.location.href = '/api/auth/google/connect'
  }

  function isValidPhone(p: string) {
    return /^\+?[0-9]{9,15}$/.test(p.replace(/\s/g, ''))
  }

  function normalizePhone(p: string) {
    const cleaned = p.replace(/\s/g, '')
    if (cleaned.startsWith('+')) return cleaned
    if (cleaned.startsWith('0')) return '+27' + cleaned.slice(1)
    return '+27' + cleaned
  }

  async function saveAndAdvance() {
    setError('')
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      if (step === 2) {
        if (!phone.trim() || !isValidPhone(phone)) {
          setError('Voer asseblief \'n geldige foonnommer in')
          setLoading(false)
          return
        }
        await supabase.from('users_profile').upsert({
          id: user.id,
          full_name: name,
          phone_number: normalizePhone(phone),
        })
      }

      if (step === 3) {
        await supabase.from('users_profile').upsert({ id: user.id, language })
      }

      if (step === 4 && logoFile) {
        const filePath = `${user.id}/${Date.now()}_logo${logoFile.name.match(/\.[^.]+$/)?.[0] ?? ''}`
        const { error: storageError } = await supabase.storage
          .from('logos')
          .upload(filePath, logoFile, { contentType: logoFile.type })

        if (!storageError) {
          const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
          await supabase.from('users_profile').upsert({
            id: user.id,
            company_logo_url: urlData.publicUrl,
          })
        }
      }

      if (step === TOTAL_STEPS) {
        await supabase.from('users_profile').upsert({ id: user.id, onboarding_complete: true })
        router.push('/chat')
        return
      }

      setStep((s) => s + 1)
    } catch {
      setError('Iets het verkeerd gegaan. Probeer weer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="flex justify-center gap-2 pt-8 pb-4 px-6">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i + 1 === step ? 24 : 8,
              height: 8,
              backgroundColor: i + 1 <= step ? '#1a6fd4' : '#2a2a4e',
            }}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-8">
              {videoExists ? (
                <video ref={videoRef} src="/gabby_intro.mp4" autoPlay playsInline className="rounded-2xl" style={{ width: 240, height: 240, objectFit: 'cover' }} />
              ) : (
                <GabbyAvatar size={120} showPulse />
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">Hallo, ek is Gabby</h1>
            <p className="text-base mb-8 max-w-xs leading-relaxed" style={{ color: '#8888cc' }}>
              Jou persoonlike AI-assistent wat jou help om meer te doen, vinniger.
            </p>
            <button onClick={() => setStep(2)} className="w-full max-w-xs py-4 rounded-xl font-semibold text-white text-base active:scale-95" style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}>
              Kom ons begin
            </button>
          </div>
        )}

        {/* STEP 2: Name + Phone */}
        {step === 2 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Wat is jou naam?</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>Ek sal jou so ken en aanspreek</p>

            <button
              onClick={isRecording ? stopVoiceInput : startVoiceInput}
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all active:scale-95"
              style={{
                backgroundColor: isRecording ? '#c0392b' : '#1a1a2e',
                border: `2px solid ${isRecording ? '#c0392b' : '#2a2a4e'}`,
                boxShadow: isRecording ? '0 0 20px rgba(192,57,43,0.4)' : 'none',
              }}
            >
              <span className="text-3xl">{isRecording ? '⏹' : '🎤'}</span>
            </button>

            {isRecording && <p className="text-sm mb-4 animate-thinking" style={{ color: '#c0392b' }}>Ek luister... druk om te stop</p>}
            {loading && <p className="text-sm mb-4" style={{ color: '#d4ac0d' }}>Verwerk...</p>}

            <p className="text-xs mb-3" style={{ color: '#555555' }}>of tik jou naam</p>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jou naam"
              className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none text-center mb-6"
              style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', minHeight: 52 }}
            />

            <p className="text-xs mb-3" style={{ color: '#555555' }}>jou foonnommer</p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="082 123 4567"
              className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none text-center mb-2"
              style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', minHeight: 52 }}
            />
            <p className="text-xs mb-6" style={{ color: '#555555' }}>Sodat Gabby jou herken wanneer jy bel</p>

            {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

            <button
              onClick={saveAndAdvance}
              disabled={!name.trim() || !phone.trim() || loading}
              className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}
            >
              Volgende
            </button>
          </div>
        )}

        {/* STEP 3: Language */}
        {step === 3 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Watter taal praat jy?</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>Gabby sal altyd in jou taal antwoord</p>

            <div className="flex flex-col gap-3 w-full mb-8">
              {[
                { code: 'af' as const, label: '🇿🇦 Afrikaans', sub: 'Praat Afrikaans' },
                { code: 'en' as const, label: '🇬🇧 English', sub: 'Speak English' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className="w-full py-4 px-5 rounded-xl flex items-center justify-between transition-all active:scale-95"
                  style={{
                    backgroundColor: language === lang.code ? '#1a2e4e' : '#1a1a2e',
                    border: `2px solid ${language === lang.code ? '#1a6fd4' : '#2a2a4e'}`,
                    minHeight: 64,
                  }}
                >
                  <div className="text-left">
                    <p className="font-semibold text-white">{lang.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8888cc' }}>{lang.sub}</p>
                  </div>
                  {language === lang.code && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1a6fd4' }}>
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <button onClick={saveAndAdvance} disabled={loading} className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-60" style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}>
              Volgende
            </button>
          </div>
        )}

        {/* STEP 4: Logo */}
        {step === 4 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Jou maatskappy logo</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>Laai jou logo op sodat Gabby dit kan gebruik op dokumente</p>

            <button
              onClick={() => logoInputRef.current?.click()}
              className="w-32 h-32 rounded-2xl flex items-center justify-center mb-6 transition-all active:scale-95"
              style={{ backgroundColor: '#1a1a2e', border: '2px dashed #2a2a4e', overflow: 'hidden' }}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-4xl">🏢</span>
              )}
            </button>

            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file) }} />

            <p className="text-xs mb-8" style={{ color: '#555555' }}>PNG, JPG of SVG · Opsioneel</p>

            {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

            <button onClick={saveAndAdvance} disabled={loading} className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-60 mb-3" style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}>
              {loading ? 'Laai op...' : logoFile ? 'Laai op & volgende' : 'Volgende'}
            </button>

            <button onClick={() => setStep(5)} className="text-sm" style={{ color: '#555555' }}>Slaan oor</button>
          </div>
        )}

        {/* STEP 5: Real Permissions */}
        {step === 5 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Gee Gabby toestemming</h2>
            <p className="text-sm mb-6" style={{ color: '#8888cc' }}>Sodat sy regtig kan help, nie net gesels nie</p>

            <div className="flex flex-col gap-3 w-full mb-8">

              {/* Microphone */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1a2e4e' }}>
                  <span>🎤</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">Mikrofoon</p>
                  <p className="text-xs" style={{ color: '#8888cc' }}>Om met jou te kan gesels</p>
                </div>
                <span className="text-xs font-medium" style={{ color: micGranted ? '#1a6fd4' : '#8888cc' }}>
                  {micGranted ? 'Toegestaan' : 'Nodig'}
                </span>
              </div>

              {/* Notifications */}
              <button
                onClick={requestNotifications}
                disabled={notifGranted}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left"
                style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1a2e4e' }}>
                  <span>🔔</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">Kennisgewings</p>
                  <p className="text-xs" style={{ color: '#8888cc' }}>Herinnerings en opdaterings</p>
                </div>
                <span className="text-xs font-medium" style={{ color: notifGranted ? '#1a6fd4' : '#8888cc' }}>
                  {notifGranted ? 'Toegestaan' : 'Aktiveer'}
                </span>
              </button>

              {/* Google (Calendar + Contacts) */}
              <button
                onClick={connectGoogle}
                disabled={googleConnected}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left"
                style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1a2e4e' }}>
                  <span>📅</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">Google Kalender & Kontakte</p>
                  <p className="text-xs" style={{ color: '#8888cc' }}>Skeduleer en bel mense op naam</p>
                </div>
                <span className="text-xs font-medium" style={{ color: googleConnected ? '#1a6fd4' : '#8888cc' }}>
                  {googleConnected ? 'Gekoppel' : 'Koppel'}
                </span>
              </button>

            </div>

            {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

            <button onClick={saveAndAdvance} disabled={loading} className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-60" style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}>
              Volgende
            </button>
            <p className="text-xs mt-3" style={{ color: '#555555' }}>Jy kan enige tyd in instellings verander</p>
          </div>
        )}

        {/* STEP 6: Ready */}
        {step === 6 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <div className="mb-8"><GabbyAvatar size={100} showPulse /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Gabby is gereed{name ? `, ${name}` : ''}!</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>Hier is &apos;n paar dinge wat jy kan vra:</p>

            <div className="flex flex-col gap-3 w-full mb-10">
              {SAMPLE_COMMANDS.map((cmd, i) => (
                <div key={i} className="px-5 py-4 rounded-xl text-left text-sm" style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', color: '#8888cc' }}>
                  {cmd}
                </div>
              ))}
            </div>

            <button onClick={saveAndAdvance} disabled={loading} className="w-full py-4 rounded-xl font-bold text-white text-base active:scale-95 disabled:opacity-60" style={{ backgroundColor: '#27ae60', minHeight: 56 }}>
              🎤 Praat met Gabby
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


export default function OnboardingPage() { return <Suspense><OnboardingPageInner /></Suspense> }
