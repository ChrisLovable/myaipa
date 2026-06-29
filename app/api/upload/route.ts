import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Required for pdf-parse and mammoth (native Node.js modules)
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    console.log('[Upload] route called')

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      console.error('[Upload] no file field in FormData')
      return NextResponse.json({ error: 'Geen lêer ontvang' }, { status: 400 })
    }

    console.log(`[Upload] file: ${file.name} | size: ${file.size} | type: ${file.type}`)

    const MAX_SIZE = 20 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Lêer is te groot (maks 20MB)' }, { status: 400 })
    }

    // Read the buffer once — reused for both text extraction and storage upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[Upload] buffer read: ${buffer.length} bytes`)

    // ── Auth via session cookie ──────────────────────────────────
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    console.log(`[Upload] user: ${user?.id ?? 'anonymous'}`)

    // ── Text extraction ──────────────────────────────────────────
    let extractedText = ''

    if (file.type === 'application/pdf') {
      console.log('[Upload] extracting PDF text...')
      try {
        // require() avoids Next.js static-analysis issues with pdf-parse's test-file loader
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        extractedText = data.text ?? ''
        console.log(`[Upload] PDF extracted: ${extractedText.length} chars`)
      } catch (e) {
        console.error('[Upload] PDF parse error:', e)
        extractedText = '[PDF-teks kon nie onttrek word nie]'
      }
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx')
    ) {
      console.log('[Upload] extracting DOCX text...')
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        extractedText = result.value ?? ''
        console.log(`[Upload] DOCX extracted: ${extractedText.length} chars`)
      } catch (e) {
        console.error('[Upload] DOCX parse error:', e)
        extractedText = '[Word-dokument kon nie gelees word nie]'
      }
    } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      extractedText = buffer.toString('utf-8')
      console.log(`[Upload] text file: ${extractedText.length} chars`)
    } else if (file.type.startsWith('image/')) {
      console.log('[Upload] processing image with Claude Vision...')
      try {
        const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        const mediaType = supportedTypes.includes(file.type)
          ? (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
          : 'image/jpeg'

        const base64 = buffer.toString('base64')
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: mediaType, data: base64 },
                  },
                  {
                    type: 'text',
                    text: 'Extract all text from this image and describe what you see in detail. If it is a receipt, list all items and amounts. If it is a business card, extract all contact details. If it is a document, transcribe it fully. Plain text only, no markdown.',
                  },
                ],
              },
            ],
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error('[Upload] Claude Vision error:', response.status, errText)
          extractedText = '[Prent kon nie verwerk word nie]'
        } else {
          const result = await response.json()
          extractedText = result.content?.[0]?.text ?? ''
          console.log(`[Upload] image OCR: ${extractedText.length} chars`)
        }
      } catch (e) {
        console.error('[Upload] Vision error:', e)
        extractedText = '[Prent kon nie verwerk word nie]'
      }
    } else {
      extractedText = `[Lêer tipe word nie ondersteun nie: ${file.type}]`
      console.warn(`[Upload] unsupported type: ${file.type}`)
    }

    // ── Upload to Supabase storage ───────────────────────────────
    let fileUrl = ''
    const userId = user?.id ?? null

    if (userId) {
      const ext = file.name.match(/\.[^.]+$/)?.[0] ?? ''
      const filePath = `${userId}/${Date.now()}${ext}`
      console.log(`[Upload] uploading to storage: uploads/${filePath}`)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, buffer, { contentType: file.type, upsert: false })

      if (uploadError) {
        // Non-fatal: log and continue — text extraction still works
        console.error('[Upload] storage error:', uploadError.message)
      } else if (uploadData?.path) {
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(uploadData.path)
        fileUrl = urlData.publicUrl
        console.log(`[Upload] stored at: ${fileUrl}`)
      }
    } else {
      console.log('[Upload] no authenticated user — skipping storage upload')
    }

    // ── Save record to database ──────────────────────────────────
    let fileId: string | null = null
    if (userId) {
      console.log('[Upload] saving to uploaded_files table...')
      const { data: fileRecord, error: dbError } = await supabase
        .from('uploaded_files')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_url: fileUrl,
          file_type: file.type,
          extracted_text: extractedText,
        })
        .select('id')
        .single()

      if (dbError) {
        console.error('[Upload] DB insert error:', dbError.message)
      } else {
        fileId = fileRecord?.id ?? null
        console.log(`[Upload] saved with id: ${fileId}`)
      }
    }

    console.log('[Upload] complete ✓')

    return NextResponse.json({
      success: true,
      fileId,
      fileName: file.name,
      fileUrl,
      extractedText,
      message: `Lêer "${file.name}" is suksesvol opgelaai en verwerk.`,
    })
  } catch (err) {
    console.error('[Upload] unhandled error:', err)
    return NextResponse.json(
      { error: 'Upload het misluk: ' + (err as Error).message },
      { status: 500 }
    )
  }
}
