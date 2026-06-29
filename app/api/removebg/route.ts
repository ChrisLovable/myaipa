import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: 'Geen prent URL verskaf' }, { status: 400 })
    }

    const apiKey = process.env.REMOVEBG_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Remove.bg API sleutel ontbreek' }, { status: 500 })
    }

    const formData = new FormData()
    formData.append('image_url', imageUrl)
    formData.append('size', 'auto')

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Remove.bg error:', errText)
      return NextResponse.json({ error: 'Agtergrond kon nie verwyder word nie' }, { status: 500 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const base64 = buffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({ url: dataUrl, originalUrl: imageUrl })
  } catch (err) {
    console.error('RemoveBG error:', err)
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan. Probeer weer.' },
      { status: 500 }
    )
  }
}
