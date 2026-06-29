import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Geen soekterm nie' }, { status: 400 })
    }

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Perplexity API sleutel ontbreek' }, { status: 500 })
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'Be precise and concise. Return factual information with key facts.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 512,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Perplexity error:', errText)
      return NextResponse.json({ error: 'Soek het misluk' }, { status: 500 })
    }

    const data = await response.json()
    const result = data.choices?.[0]?.message?.content ?? ''
    const citations = data.citations ?? []

    return NextResponse.json({ result, citations, query })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan. Probeer weer.' },
      { status: 500 }
    )
  }
}
