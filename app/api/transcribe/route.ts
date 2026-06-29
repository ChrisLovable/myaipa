import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('Transcribe route called')

  try {
    const formData = await request.formData()
    const audio = formData.get('audio') as File | null
    const rawLangIn = (formData.get('languageCode') as string | null) || 'af'
    // ElevenLabs Scribe accepts ISO 639-3; only Afrikaans and English supported
    const langMap: Record<string, string> = { af: 'afr', en: 'eng' }
    const rawLang = langMap[rawLangIn] ?? 'afr'

    if (!audio) {
      console.error('[Transcribe] no audio field in FormData')
      return NextResponse.json({ error: 'Geen oudio ontvang' }, { status: 400 })
    }

    console.log(`Audio received, size: ${audio.size} bytes, type: ${audio.type}, lang: ${rawLang}`)

    if (audio.size < 100) {
      console.warn('[Transcribe] audio too small — likely an empty or near-empty recording')
      return NextResponse.json(
        { error: 'Oudio-opname is te kort. Hou die knoppie langer ingedruk.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[Transcribe] ELEVENLABS_API_KEY is not set')
      return NextResponse.json({ error: 'ElevenLabs API sleutel ontbreek' }, { status: 500 })
    }
    console.log(`[Transcribe] API key present, length: ${apiKey.length}`)

    const elevenLabsForm = new FormData()
    // ElevenLabs Scribe expects the field name "file", not "audio"
    elevenLabsForm.append('file', audio, audio.name || 'recording.webm')
    elevenLabsForm.append('model_id', 'scribe_v1')
    elevenLabsForm.append('language_code', rawLang)

    console.log('Sending to ElevenLabs...')
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenLabsForm,
    })

    console.log(`ElevenLabs response status: ${response.status}`)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[Transcribe] ElevenLabs error body:', errText)
      return NextResponse.json(
        { error: `Transkripsie het misluk (${response.status}): ${errText}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const rawText: string = data.text ?? ''
    console.log(`Transcription result: "${rawText.slice(0, 120)}"`)

    // Fix common STT misspellings of "Gabby" caused by phonetic similarity
    const cleanedText = rawText
      .replace(/\bGabie\b/gi, 'Gabby')
      .replace(/\bGaby\b/gi, 'Gabby')
      .replace(/\bGabbie\b/gi, 'Gabby')
      .replace(/\bGabbi\b/gi, 'Gabby')

    return NextResponse.json({ text: cleanedText })
  } catch (err) {
    console.error('[Transcribe] unhandled exception:', err)
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan. Probeer weer.' },
      { status: 500 }
    )
  }
}
