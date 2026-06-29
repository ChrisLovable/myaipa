'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GabbyAvatar from '@/components/GabbyAvatar'

const TOTAL_STEPS = 6

const INTEGRATIONS = [
  { id: 'gmail', name: 'Gmail', icon: '📧', defaultOn: true },
  { id: 'drive', name: 'Google Drive', icon: '📂', defaultOn: true },
  { id: 'calendar', name: 'Google Calendar', icon: '📅', defaultOn: false },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', defaultOn: false },
  { id: 'twilio', name: 'Twilio Calls', icon: '📞', defaultOn: false },
]

const SAMPLE_COMMANDS = [
  '"Skryf \'n e-pos aan my kliënt"',
  '"Vat hierdie foto en gee my die teks"',
  '"Wat staan in hierdie kontrak?"',
  '"Stel \'n faktuur op vir R5,000"',
]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'af' | 'en'>('af')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.defaultOn]))
  )
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const logoInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoExists, setVideoExists] = useState(false)

  useEffect(() => {
    // Check if intro video exists
    fetch('/gabby_intro.mp4', { method: 'HEAD' })
      .then((r) => setVideoExists(r.ok))
      .catch(() => setVideoExists(false))
  }, [])

  async function startVoiceInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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

  async function saveAndAdvance() {
    setError('')
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      if (step === 2 && name) {
        await supabase.from('users_profile').upsert({ id: user.id, full_name: name })
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
      {/* Progress dots */}
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

      {/* Step content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-8">
              {videoExists ? (
                <video
                  ref={videoRef}
                  src="/gabby_intro.mp4"
                  autoPlay
                  playsInline
                  className="rounded-2xl"
                  style={{ width: 240, height: 240, objectFit: 'cover' }}
                />
              ) : (
                <GabbyAvatar size={120} showPulse />
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">Hallo, ek is Gabby</h1>
            <p className="text-base mb-8 max-w-xs leading-relaxed" style={{ color: '#8888cc' }}>
              Jou persoonlike AI-assistent wat jou help om meer te doen, vinniger.
            </p>
            <button
              onClick={() => setStep(2)}
              className="w-full max-w-xs py-4 rounded-xl font-semibold text-white text-base active:scale-95"
              style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}
            >
              Kom ons begin
            </button>
          </div>
        )}

        {/* STEP 2: Name */}
        {step === 2 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Wat is jou naam?</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>
              Ek sal jou so ken en aanspreek
            </p>

            {/* Mic button */}
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

            {isRecording && (
              <p className="text-sm mb-4 animate-thinking" style={{ color: '#c0392b' }}>
                Ek luister... druk om te stop
              </p>
            )}
            {loading && <p className="text-sm mb-4" style={{ color: '#d4ac0d' }}>Verwerk...</p>}

            <p className="text-xs mb-3" style={{ color: '#555555' }}>of tik jou naam</p>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jou naam"
              className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none text-center mb-6"
              style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', minHeight: 52 }}
              onFocus={(e) => (e.target.style.borderColor = '#1a6fd4')}
              onBlur={(e) => (e.target.style.borderColor = '#2a2a4e')}
            />

            {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

            <button
              onClick={saveAndAdvance}
              disabled={!name.trim() || loading}
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
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>
              Gabby sal altyd in jou taal antwoord
            </p>

            <div className="flex flex-col gap-3 w-full mb-8">
              {[
                { code: 'af' as const, label: '🇿🇦 Afrikaans', sub: 'Praat Afrikaans' },
                { code: 'en' as const, label: '🇬🇧 English',   sub: 'Speak English'   },
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

            <button
              onClick={saveAndAdvance}
              disabled={loading}
              className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}
            >
              Volgende
            </button>
          </div>
        )}

        {/* STEP 4: Logo */}
        {step === 4 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Jou maatskappy logo</h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>
              Laai jou logo op sodat Gabby dit kan gebruik op dokumente
            </p>

            <button
              onClick={() => logoInputRef.current?.click()}
              className="w-32 h-32 rounded-2xl flex items-center justify-center mb-6 transition-all active:scale-95"
              style={{
                backgroundColor: '#1a1a2e',
                border: '2px dashed #2a2a4e',
                overflow: 'hidden',
              }}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-4xl">🏢</span>
              )}
            </button>

            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleLogoUpload(file)
              }}
            />

            <p className="text-xs mb-8" style={{ color: '#555555' }}>
              PNG, JPG of SVG · Opsioneel
            </p>

            {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

            <button
              onClick={saveAndAdvance}
              disabled={loading}
              className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95 disabled:opacity-60 mb-3"
              style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}
            >
              {loading ? 'Laai op...' : logoFile ? 'Laai op & volgende' : 'Volgende'}
            </button>

            <button
              onClick={() => setStep(5)}
              className="text-sm"
              style={{ color: '#555555' }}
            >
              Slaan oor
            </button>
          </div>
        )}

        {/* STEP 5: Connect Apps */}
        {step === 5 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <GabbyAvatar size={80} />
            <h2 className="text-2xl font-bold text-white mt-6 mb-2">Koppel jou apps</h2>
            <p className="text-sm mb-6" style={{ color: '#8888cc' }}>
              Gabby kan met jou gunsteling dienste werk
            </p>

            <div className="flex flex-col gap-3 w-full mb-8">
              {INTEGRATIONS.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between px-5 py-4 rounded-xl"
                  style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{integration.icon}</span>
                    <div className="text-left">
                      <p className="font-medium text-white text-sm">{integration.name}</p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#2a2a4e', color: '#8888cc' }}
                      >
                        Binnekort beskikbaar
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setToggles((t) => ({ ...t, [integration.id]: !t[integration.id] }))}
                    className="relative inline-flex items-center rounded-full transition-colors"
                    style={{
                      width: 44,
                      height: 24,
                      backgroundColor: toggles[integration.id] ? '#1a6fd4' : '#2a2a4e',
                      minWidth: 44,
                      minHeight: 24,
                    }}
                  >
                    <span
                      className="inline-block rounded-full bg-white transition-transform"
                      style={{
                        width: 18,
                        height: 18,
                        transform: toggles[integration.id] ? 'translateX(22px)' : 'translateX(3px)',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={saveAndAdvance}
              className="w-full py-4 rounded-xl font-semibold text-white text-base active:scale-95"
              style={{ backgroundColor: '#1a6fd4', minHeight: 56 }}
            >
              Volgende
            </button>
          </div>
        )}

        {/* STEP 6: Ready */}
        {step === 6 && (
          <div className="flex flex-col items-center text-center w-full max-w-sm">
            <div className="mb-8">
              <GabbyAvatar size={100} showPulse />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Gabby is gereed{name ? `, ${name}` : ''}!
            </h2>
            <p className="text-sm mb-8" style={{ color: '#8888cc' }}>
              Hier is &apos;n paar dinge wat jy kan vra:
            </p>

            <div className="flex flex-col gap-3 w-full mb-10">
              {SAMPLE_COMMANDS.map((cmd, i) => (
                <div
                  key={i}
                  className="px-5 py-4 rounded-xl text-left text-sm"
                  style={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a4e',
                    color: '#8888cc',
                  }}
                >
                  {cmd}
                </div>
              ))}
            </div>

            <button
              onClick={saveAndAdvance}
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-white text-base active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: '#27ae60', minHeight: 56 }}
            >
              🎤 Praat met Gabby
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
