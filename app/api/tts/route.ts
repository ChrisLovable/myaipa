import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text, language } = await request.json()

    console.log(`[TTS] called — lang: ${language ?? 'af'} | text length: ${text?.length}`)

    if (!text) {
      return NextResponse.json({ error: 'No text' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY
    if (!apiKey) {
      console.error('[TTS] GOOGLE_TTS_API_KEY missing')
      return NextResponse.json({ error: 'API key missing' }, { status: 500 })
    }

    // Voice and speed differ per language
    const isEnglish = language === 'en'
    const voiceConfig = isEnglish
      ? { languageCode: 'en-GB', name: 'en-GB-Neural2-C', ssmlGender: 'FEMALE' }
      : { languageCode: 'af-ZA', name: 'af-ZA-Standard-A', ssmlGender: 'FEMALE' }
    const speakingRate = isEnglish ? 1.15 : 1.3

    console.log(`[TTS] voice: ${voiceConfig.name} | rate: ${speakingRate}`)

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: voiceConfig,
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate,
            pitch: 0.0,
          },
        }),
      }
    )

    console.log('[TTS] Google status:', response.status)

    if (!response.ok) {
      const err = await response.text()
      console.error('[TTS] Google error:', err)
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    const audioBuffer = Buffer.from(data.audioContent, 'base64')

    console.log('[TTS] audio buffer size:', audioBuffer.byteLength)

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })

  } catch (err) {
    console.error('[TTS] route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
