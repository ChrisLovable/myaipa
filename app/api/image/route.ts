import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

export const runtime    = 'nodejs'
export const maxDuration = 60  // seconds — requires Vercel Pro; Hobby plan capped at 10s

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    console.log('[Image] called — prompt:', prompt?.slice(0, 80))
    console.log('[Image] REPLICATE_API_KEY exists:', !!process.env.REPLICATE_API_KEY)
    console.log('[Image] REPLICATE_API_KEY prefix:', process.env.REPLICATE_API_KEY?.slice(0, 6))

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Geen prent beskrywing nie' }, { status: 400 })
    }

    const apiKey = process.env.REPLICATE_API_KEY
    if (!apiKey) {
      console.error('[Image] REPLICATE_API_KEY missing from environment')
      return NextResponse.json({ error: 'Replicate API sleutel ontbreek' }, { status: 500 })
    }

    const replicate = new Replicate({ auth: apiKey })

    console.log('[Image] calling Replicate flux-schnell...')
    const output = await replicate.run('black-forest-labs/flux-schnell', {
      input: {
        prompt,
        num_outputs:    1,
        aspect_ratio:   '1:1',
        output_format:  'jpg',
        output_quality: 80,
        go_fast:        true,
        megapixels:     '1',
      },
    })

    console.log('[Image] Replicate raw output type:', typeof output, '| isArray:', Array.isArray(output))
    console.log('[Image] Replicate output:', JSON.stringify(output)?.slice(0, 200))

    // Replicate SDK v1.x returns FileOutput objects whose toString() yields the CDN URL.
    // Handle both array and scalar return shapes.
    let imageUrl = ''
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = String(output[0])
    } else if (output) {
      imageUrl = String(output)
    }

    console.log('[Image] resolved imageUrl:', imageUrl?.slice(0, 100))

    if (!imageUrl || !imageUrl.startsWith('http')) {
      console.error('[Image] invalid URL from Replicate:', imageUrl)
      return NextResponse.json({ error: 'Prent kon nie gegenereer word nie' }, { status: 500 })
    }

    return NextResponse.json({ url: imageUrl, imageUrl, prompt })
  } catch (err) {
    console.error('[Image] generation error:', err)
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan: ' + (err as Error).message },
      { status: 500 }
    )
  }
}
