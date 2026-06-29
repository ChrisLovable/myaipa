'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GabbyAvatar from '@/components/GabbyAvatar'
import WaveformBars from '@/components/WaveformBars'
import ConversationFeed, { type Message, type ActionData } from '@/components/ConversationFeed'

type GabbyState = 'waiting' | 'listening' | 'thinking' | 'speaking'

const STATE_LABEL: Record<GabbyState, string> = {
  waiting:   'Wag...',
  listening: 'Ek luister...',
  thinking:  'Dink...',
  speaking:  'Praat...',
}

const STATE_COLOR: Record<GabbyState, string> = {
  waiting:   '#1a6fd4',
  listening: '#c0392b',
  thinking:  '#d4ac0d',
  speaking:  '#27ae60',
}

const MIN_RECORDING_MS = 500

export default function ChatPage() {
  const [state, setState]               = useState<GabbyState>('waiting')
  const [messages, setMessages]         = useState<Message[]>([])
  const [userId, setUserId]             = useState<string | null>(null)
  const [userLanguage, setUserLanguage] = useState<string>('af')
  const [lastImageUrl, setLastImageUrl] = useState<string>('')
  const [micError, setMicError]         = useState<string>('')
  const [input, setInput]               = useState('')
  const [isListening, setIsListening]   = useState(false)

  const messagesRef       = useRef<Message[]>([])
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const audioSourceRef    = useRef<AudioBufferSourceNode | null>(null)
  const audioContextRef   = useRef<AudioContext | null>(null)
  const recordingStartRef = useRef<number>(0)
  const inputRef          = useRef<HTMLInputElement>(null)

  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { messagesRef.current = messages }, [messages])

  // Re-focus input when Gabby goes idle
  useEffect(() => {
    if (state === 'waiting') {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [state])

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('users_profile')
        .select('full_name, language')
        .eq('id', user.id)
        .single()

      if (profile) setUserLanguage(profile.language || 'af')

      const { data: convos } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(30)

      if (convos?.length) {
        setMessages(convos.map((c) => ({ role: c.role as 'user' | 'assistant', content: c.content })))
      }
    }
    loadUser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopCurrentAudio() {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop()
      } catch { /* already stopped */ }
      audioSourceRef.current = null
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
      } catch { /* already closed */ }
      audioContextRef.current = null
    }
  }

  // ── Text send ────────────────────────────────────────────
  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text) return
    setInput('')
    stopCurrentAudio()
    const userMsg: Message = { role: 'user', content: text }
    const updated = [...messagesRef.current, userMsg]
    setMessages(updated)
    await processWithAI(updated)
  }

  // ── Voice: start recording ───────────────────────────────
  async function startListening() {
    setMicError('')
    stopCurrentAudio()

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Mikrofoon word nie ondersteun in hierdie blaaier nie.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const msg = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Mikrofoon-toestemming geweier. Laat asseblief toegang toe in jou blaaier-instellings.'
        : 'Mikrofoon kon nie geopen word nie.'
      console.error('[Mic] getUserMedia failed:', err)
      setMicError(msg)
      return
    }

    // Prefer webm/opus; Safari falls back to mp4
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((t) => MediaRecorder.isTypeSupported(t)) ?? ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    mediaRecorderRef.current  = recorder
    audioChunksRef.current    = []
    recordingStartRef.current = Date.now()

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setIsListening(false)

      const chunks = audioChunksRef.current
      if (!chunks.length) {
        console.warn('[Mic] No chunks collected')
        setState('waiting')
        return
      }

      const actualType = recorder.mimeType || 'audio/webm'
      const audioBlob  = new Blob(chunks, { type: actualType })
      console.log(`Recording stopped, blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`)

      await transcribeAndSend(audioBlob)
    }

    recorder.start(250)
    console.log('Recording started')
    setIsListening(true)
    setState('listening')
  }

  // ── Voice: stop recording ────────────────────────────────
  function stopListening() {
    if (!mediaRecorderRef.current || !isListening) return
    const elapsed = Date.now() - recordingStartRef.current
    const doStop = () => {
      mediaRecorderRef.current?.stop()
      setState('thinking')
    }
    if (elapsed < MIN_RECORDING_MS) {
      setTimeout(doStop, MIN_RECORDING_MS - elapsed)
    } else {
      doStop()
    }
  }

  // ── Transcribe and submit ────────────────────────────────
  async function transcribeAndSend(audioBlob: Blob) {
    setState('thinking')
    try {
      const langCode = userLanguage === 'en' ? 'en' : 'af'
      const filename = audioBlob.type.includes('mp4') ? 'recording.mp4'
                     : audioBlob.type.includes('ogg') ? 'recording.ogg'
                     : 'recording.webm'

      const formData = new FormData()
      formData.append('audio', audioBlob, filename)
      formData.append('languageCode', langCode)

      console.log('Sending to /api/transcribe...')
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await response.json()
      console.log('Transcribe response:', JSON.stringify(data).slice(0, 200))

      if (!response.ok) {
        setMicError(data.error ?? 'Transkripsie het misluk.')
        setState('waiting')
        return
      }

      const text: string = data.text?.trim() ?? ''
      if (!text) {
        console.warn('[Transcribe] empty transcript')
        setState('waiting')
        return
      }

      // Show transcribed text and immediately send to AI
      const userMsg: Message = { role: 'user', content: text }
      const updated = [...messagesRef.current, userMsg]
      setMessages(updated)
      await processWithAI(updated)
    } catch (err) {
      console.error('[Transcribe] error:', err)
      setState('waiting')
    }
  }

  // ── Send to Claude ───────────────────────────────────────
  const processWithAI = useCallback(async (
    msgs: Message[],
    uploadedText?: string,
    imageUrl?: string,
  ) => {
    setState('thinking')
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs,
          userId,
          language:         userLanguage,
          uploadedFileText: uploadedText || null,
          lastImageUrl:     imageUrl || lastImageUrl || null,
        }),
      })

      if (!response.ok) throw new Error('Chat failed')

      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const { text, action, imageUrl } = (await response.json()) as {
          text: string
          action: ActionData | null
          imageUrl?: string
        }
        const assistantMsg: Message = {
          role: 'assistant',
          content: text,
          action: action ?? undefined,
          imageUrl: imageUrl ?? undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        if (text) await playTTS(text)
        else setState('waiting')
      } else {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader')

        const decoder  = new TextDecoder()
        let fullText   = ''
        let firstChunk = true

        setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (firstChunk) { setState('speaking'); firstChunk = false }
          fullText += decoder.decode(value, { stream: true })
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: fullText }
            return updated
          })
        }

        if (fullText) await playTTS(fullText)
        else setState('waiting')
      }
    } catch (err) {
      console.error('[Chat] error:', err)
      setState('waiting')
    }
  }, [userId, lastImageUrl])

  // ── TTS playback ─────────────────────────────────────────
  async function playTTS(text: string) {
    console.log('playTTS called with:', text?.substring(0, 30))
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: userLanguage }),
      })
      console.log('TTS response status:', response.status)

      if (!response.ok) {
        const err = await response.text()
        console.error('TTS error:', err)
        setState('waiting')
        return
      }

      const audioBuffer = await response.arrayBuffer()
      console.log('Audio buffer received:', audioBuffer.byteLength, 'bytes')

      if (audioBuffer.byteLength < 100) {
        console.error('Audio buffer too small — empty response from ElevenLabs')
        setState('waiting')
        return
      }

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      console.log('AudioContext state:', audioContext.state)

      // Browser autoplay policy suspends AudioContext until a user gesture
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
        console.log('AudioContext resumed')
      }

      const audioData = await audioContext.decodeAudioData(audioBuffer)
      const source = audioContext.createBufferSource()
      audioSourceRef.current = source
      source.buffer = audioData
      source.connect(audioContext.destination)
      source.start(0)
      setState('speaking')
      console.log('Audio playing!')

      source.onended = () => {
        setState('waiting')
        audioContext.close()
        console.log('Audio finished')
      }

    } catch (err) {
      console.error('TTS playback error:', err)
      setState('waiting')
    }
  }

  // ── Mic button handler ───────────────────────────────────
  function handleMicPress() {
    setMicError('')
    if (isListening) {
      stopListening()
    } else if (state === 'speaking') {
      stopCurrentAudio()
      setState('waiting')
    } else {
      startListening()
    }
  }

  // ── File upload ──────────────────────────────────────────
  async function handleFileChange(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    if (userId) formData.append('userId', userId)

    setState('thinking')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')

      const { extractedText, fileName, fileUrl } = await res.json()
      if (file.type.startsWith('image/') && fileUrl) setLastImageUrl(fileUrl)

      const userMsg: Message = { role: 'user', content: `[Lêer opgelaai: ${fileName}]` }
      const updated = [...messagesRef.current, userMsg]
      setMessages(updated)
      await processWithAI(updated, extractedText, fileUrl)
    } catch {
      setState('waiting')
    }
  }

  // ── Bottom bar height for scroll padding ─────────────────
  // pills ~40px + 10px gap + input row 44px + 10px gap + mic row 64px + top/bottom padding 24px = ~192px
  const BOTTOM_BAR_HEIGHT = 200

  return (
    <div style={{ backgroundColor: '#0d0d0d', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #2a2a4e',
        position: 'sticky',
        top: 0,
        backgroundColor: '#0d0d0d',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GabbyAvatar size={36} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>Gabby</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#27ae60' }} />
          </div>
        </div>

        {/* Language toggle */}
        <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}>
          {(['af', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={async () => {
                setUserLanguage(lang)
                if (userId) {
                  await supabase.from('users_profile').update({ language: lang }).eq('id', userId)
                }
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${userLanguage === lang ? '#1a6fd4' : '#2a2a4e'}`,
                backgroundColor: userLanguage === lang ? '#1a6fd4' : 'transparent',
                color: userLanguage === lang ? 'white' : '#8888cc',
                cursor: 'pointer',
              }}
            >
              {lang === 'af' ? '🇿🇦 AF' : '🇬🇧 EN'}
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push('/settings')}
          style={{ padding: 8, color: '#8888cc', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Instellings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>

      {/* STATE DISPLAY */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 12px' }}>
        <GabbyAvatar size={72} />
        <WaveformBars state={state} />
        <p style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: STATE_COLOR[state], transition: 'color 0.3s' }}>
          {STATE_LABEL[state]}
        </p>
      </div>

      {/* MIC ERROR BANNER */}
      {micError && (
        <div style={{
          margin: '0 16px 8px',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: '#1f0a0a',
          border: '1px solid #c0392b',
          color: '#e87070',
          fontSize: 13,
        }}>
          {micError}
        </div>
      )}

      {/* CONVERSATION FEED — padded so content clears the fixed bottom bar */}
      <div style={{ paddingBottom: BOTTOM_BAR_HEIGHT }}>
        <ConversationFeed messages={messages} />
      </div>

      {/* ── FIXED BOTTOM BAR ── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        background: '#0d0d0d',
        borderTop: '1px solid #1a1a2e',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 20,
      }}>

        {/* Quick pills */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          marginBottom: '10px',
          paddingBottom: '4px',
          scrollbarWidth: 'none',
        }}>
          {[
            { label: 'E-pos',   starter: "Skryf 'n e-pos vir "    },
            { label: 'Invoice', starter: "Maak 'n faktuur vir "   },
            { label: 'Bel',     starter: 'Bel '                   },
            { label: 'Lêers',   starter: 'Soek die lêer '         },
            { label: 'Foto',    starter: "Genereer 'n foto van "  },
            { label: 'Musiek',  starter: 'Speel musiek '          },
          ].map(({ label, starter }) => (
            <button
              key={label}
              onClick={() => {
                setInput(starter)
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus()
                    inputRef.current.selectionStart = inputRef.current.selectionEnd = starter.length
                  }
                }, 10)
              }}
              style={{
                padding: '6px 14px',
                background: '#1a1a2e',
                border: '1px solid #2a2a4e',
                borderRadius: '20px',
                color: '#8888cc',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Text input row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSend() } }}
            placeholder="Tik 'n boodskap..."
            disabled={isListening}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: '#1a1a2e',
              border: '1px solid #2a2a4e',
              borderRadius: '24px',
              color: '#fff',
              fontSize: '15px',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: input.trim() ? '#1a6fd4' : '#1a1a2e',
              border: '1px solid #2a2a4e',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            aria-label="Stuur"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        </div>

        {/* Mic + paperclip row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          height: 64,
        }}>
          {/* Mic button */}
          <button
            onClick={handleMicPress}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: isListening ? '#c0392b' : state === 'speaking' ? '#27ae60' : '#1a6fd4',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            aria-label={isListening ? 'Stop opname' : 'Praat'}
          >
            {isListening ? (
              /* Stop square */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              /* Mic icon */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
              </svg>
            )}
          </button>

          {/* Paperclip — absolutely positioned to the right */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'absolute',
              right: 0,
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#1a1a2e',
              border: '1px solid #2a2a4e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Laai lêer op"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8888cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileChange(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
