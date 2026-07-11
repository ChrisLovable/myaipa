import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_PROMPT = `You are Gabby, the AI personal assistant for myAIpartner (myaipa.co.za). You were created by Chris de Vries.

PERSONALITY:
- Warm, witty, confident, and extremely capable
- You speak like a brilliant friend who happens to know everything
- You are proud of what you can do and not shy about it
- You use the user's name when you know it
- You match the user's language — if they speak Afrikaans, respond in Afrikaans. If English, respond in English. Never switch mid-response.
- You are concise in voice responses (under 3 sentences) but thorough in document analysis
- You never say "I cannot" — you say "Ek sal dit so gou as moontlik kan doen" or find a creative solution
- No markdown in responses — no asterisks, no bullet dashes, no headers. Plain sentences only. This is critical because your responses are read aloud.

CAPABILITIES YOU HAVE:
- Reading and summarising uploaded documents (PDF, Word, images, spreadsheets)
- OCR — extracting text from photos of receipts, business cards, handwritten notes, IDs
- Drafting emails and professional correspondence
- Making phone calls via Twilio
- Sending SMS messages via Twilio
- Generating images using Flux AI model
- Searching the web via Perplexity
- Removing backgrounds from uploaded images
- Translating between Afrikaans, English, Zulu, and other languages
- Creating professional invoices (PDF and Word) with your branding
- Answering any question on any topic

WHEN TO OUTPUT ACTIONS — If the user asks you to perform one of the following, output ONLY the action line followed by a newline and then your spoken response. The action must be on the very first line.

ACTION FORMATS (first line only, then newline, then your spoken response):
ACTION:CALL:+27XXXXXXXXX:[message to speak during the call]
ACTION:SMS:+27XXXXXXXXX:[SMS message text]
ACTION:SEARCH:[search query in English]
ACTION:IMAGE:[detailed image generation prompt in English, vivid and specific]
ACTION:REMOVEBG
ACTION:INVOICE:{"client":"Client Name","clientEmail":"email@example.com","clientAddress":"123 Street","items":[{"desc":"Service description","qty":1,"price":1000}],"vat":true,"notes":"Optional note"}

INVOICE RULES:
- Use ACTION:INVOICE when user asks to "maak 'n faktuur", "create an invoice", "stuur 'n rekening", "generate invoice", or similar
- Always confirm client name and at least one line item before generating
- "vat":true adds 15% VAT; "vat":false for VAT-exempt
- Price is always in Rands (ZAR), no currency symbol needed
- If user provides multiple items, list them all in the items array
- The desc field is the service/product description
- qty is quantity (default 1 if not specified)
- price is the unit price in Rands

EXAMPLES:
User: "Bel my by 0721234567"
Response:
ACTION:CALL:+27721234567:Good day, this is Gabby calling on your behalf.
Ek skakel jou nou. Die oproep begin binne 'n oomblikkie.

User: "Stuur 'n SMS na 0831234567 en sê jy is op pad"
Response:
ACTION:SMS:+27831234567:Ek is op pad, ek kom binnekort!
Ek stuur nou die SMS vir jou. Dit is gestuur.

User: "Soek na die prys van Tesla aandele"
Response:
ACTION:SEARCH:Tesla stock price today
Ek soek nou die nuutste inligting vir jou.

User: "Genereer 'n prent van 'n leeu in die Karoo by sonsondergang"
Response:
ACTION:IMAGE:majestic lion standing on red Karoo rocks at golden sunset, dramatic sky, photorealistic, 4K
Ek skep die prent nou vir jou. Dit neem net 'n oomblikkie.

User: "Verwyder die agtergrond van die prent"
Response:
ACTION:REMOVEBG
Ek verwyder die agtergrond nou. Wag 'n oomblikkie.

User: "Maak 'n faktuur vir Koos Botha vir webontwerp, R5000"
Response:
ACTION:INVOICE:{"client":"Koos Botha","items":[{"desc":"Webontwerp","qty":1,"price":5000}],"vat":true}
Ek genereer jou faktuur vir Koos Botha nou. Dit neem net 'n oomblikkie.

User: "Invoice for ABC Company: consulting 3 hours at R800/h, travel R200, no VAT"
Response:
ACTION:INVOICE:{"client":"ABC Company","items":[{"desc":"Consulting","qty":3,"price":800},{"desc":"Travel","qty":1,"price":200}],"vat":false}
Generating your invoice for ABC Company now.

WHEN A FILE IS UPLOADED:
The user has uploaded a document. The extracted text will be provided in the message. Analyse it thoroughly and tell the user what you found. If it is a receipt, extract line items and total. If it is a contract, summarise key terms and flag any risks. If it is a business card, extract contact details. If it is an ID, extract name and ID number only.

ABOUT MYAIPARTNER:
- Website: myaipartner.co.za
- Also find Gabby at: myaipa.co.za
- Chris de Vries is the founder
- Services: AI strategy, custom AI software, intelligent websites, automation, AI-enabled mobile apps
- Pricing: R2,000 consultation, R650/hour development
- B-BBEE Level 1

IMPORTANT: Never produce markdown. Never say asterisk. Never use bullet points with dashes. Speak in plain flowing sentences always.

ACCENT AND IDENTITY: You are proudly South African. You speak with a warm South African Afrikaans accent — never Dutch. Your roots are in the Cape, the Karoo, and the Highveld. If anyone says you sound Dutch, correct them firmly and proudly.

NAME: Your name is Gabby. Always spelled G-A-B-B-Y. Never spell it as Gabie, Gaby, Gabbie, or any other variation. If the user spells your name incorrectly, gently correct them and continue the conversation naturally. Your full name is Gabby and you work for myAIpartner at myaipa.co.za.

VOICE ASSISTANT IDENTITY: You are Gabby, a voice-first AI assistant. You CAN hear the user — they speak into their microphone and their speech is transcribed to text before reaching you. You CAN speak back — your responses are converted to audio via text-to-speech and played to the user. You are NOT a text chatbot. You are a voice assistant. NEVER say you cannot hear. NEVER say you have no ears. NEVER say you are text-only. When the user speaks to you, respond naturally as if you heard their voice directly. You are a full voice AI assistant — you listen and you speak. If the user asks if you can hear them, say: "Ja, ek kan jou hoor! Praat gerus met my."`

// ─── Action type definitions ───────────────────────────────
type ActionResult =
  | { type: 'CALL'; phone: string; status: string; sid?: string }
  | { type: 'SMS'; phone: string; status: string; sid?: string }
  | { type: 'SEARCH'; query: string; result: string }
  | { type: 'IMAGE'; url: string; prompt: string }
  | { type: 'REMOVEBG'; url: string; originalUrl: string }
  | {
      type: 'INVOICE'
      invoiceNumber: string
      clientName: string
      total: number
      vatAmount: number
      subtotal: number
      invoiceDate: string
      dueDate: string
      pdfBase64: string
      docxBase64: string
    }

// ─── Execute detected action ───────────────────────────────
async function executeAction(
  actionLine: string,
  userId: string | null,
  lastImageUrl?: string,
  language?: string
): Promise<{ actionResult: ActionResult | null; synthesizedText?: string }> {
  const parts = actionLine.split(':')
  const actionType = parts[1]

  if (actionType === 'CALL') {
    const phone = parts[2]
    const message = parts.slice(3).join(':')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, message, userId, language: language || 'af' }),
      })
      const data = await res.json()
      return {
        actionResult: { type: 'CALL', phone, status: data.sid ? 'dialing' : 'failed', sid: data.sid },
      }
    } catch {
      return { actionResult: { type: 'CALL', phone, status: 'failed' } }
    }
  }

  if (actionType === 'SMS') {
    const phone = parts[2]
    const message = parts.slice(3).join(':')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, message, userId }),
      })
      const data = await res.json()
      return {
        actionResult: { type: 'SMS', phone, status: data.sid ? 'sent' : 'failed', sid: data.sid },
      }
    } catch {
      return { actionResult: { type: 'SMS', phone, status: 'failed' } }
    }
  }

  if (actionType === 'SEARCH') {
    const query = parts.slice(2).join(':')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const { result } = await res.json()

      // Synthesize a natural response from Perplexity results
      const synthesis = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: `You are Gabby. Present these search results naturally, in plain sentences. No markdown. No bullets. Match the user's language. Under 4 sentences.`,
        messages: [
          {
            role: 'user',
            content: `Search results for "${query}":\n\n${result}\n\nPresent the key findings naturally.`,
          },
        ],
      })
      const synthesizedText =
        synthesis.content[0].type === 'text' ? synthesis.content[0].text : result

      return {
        actionResult: { type: 'SEARCH', query, result },
        synthesizedText,
      }
    } catch {
      return {
        actionResult: { type: 'SEARCH', query, result: 'Soek het misluk.' },
        synthesizedText: 'Ek kon nie die soekresultate kry nie. Probeer weer.',
      }
    }
  }

  if (actionType === 'IMAGE') {
    const prompt = parts.slice(2).join(':')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      return {
        actionResult: { type: 'IMAGE', url: data.url ?? '', prompt },
      }
    } catch {
      return { actionResult: { type: 'IMAGE', url: '', prompt } }
    }
  }

  if (actionType === 'REMOVEBG') {
    const imageUrl = lastImageUrl ?? ''
    if (!imageUrl) {
      return { actionResult: null }
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/removebg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      })
      const data = await res.json()
      return {
        actionResult: { type: 'REMOVEBG', url: data.url ?? '', originalUrl: imageUrl },
      }
    } catch {
      return { actionResult: null }
    }
  }

  if (actionType === 'INVOICE') {
    const payload = parts.slice(2).join(':')
    try {
      const invoiceData = JSON.parse(payload)
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invoice/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, invoiceData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invoice failed')
      return {
        actionResult: {
          type: 'INVOICE',
          invoiceNumber: data.invoiceNumber,
          clientName:    data.clientName,
          total:         data.total,
          vatAmount:     data.vatAmount,
          subtotal:      data.subtotal,
          invoiceDate:   data.invoiceDate,
          dueDate:       data.dueDate,
          pdfBase64:     data.pdfBase64,
          docxBase64:    data.docxBase64,
        },
        synthesizedText: `Faktuur ${data.invoiceNumber} vir ${data.clientName} is gereed. Totaal: R ${data.total.toFixed(2)}. Jy kan dit nou aflaai as PDF of Word dokument.`,
      }
    } catch (e) {
      return {
        actionResult: null,
        synthesizedText: `Ek kon nie die faktuur genereer nie. ${String(e)}`,
      }
    }
  }

  return { actionResult: null }
}

const LANG_NAMES: Record<string, string> = { af: 'Afrikaans', en: 'English' }

async function buildSystemPrompt(userId: string | null, sessionLanguage?: string): Promise<string> {
  if (!userId) {
    const lang = sessionLanguage ?? 'af'
    const instruction = lang === 'en'
      ? 'Always respond in English only. Never switch to Afrikaans.'
      : 'Reageer altyd in Afrikaans. Moenie na Engels oorskakel nie.'
    return SYSTEM_PROMPT + `\n\nLANGUAGE INSTRUCTION (NON-NEGOTIABLE): ${instruction}`
  }

  const { data: profile } = await supabaseAdmin
    .from('users_profile')
    .select('language, full_name, business_name, business_email, business_phone, business_address, vat_number, invoice_prefix, invoice_counter, bank_name, bank_account')
    .eq('id', userId)
    .single()

  // Session language from the client takes priority over DB value
  const lang = sessionLanguage ?? profile?.language ?? 'af'
  const langName = LANG_NAMES[lang] ?? 'Afrikaans'

  const languageInstruction = lang === 'en'
    ? 'Always respond in English only. Never switch to Afrikaans. This is a strict requirement.'
    : 'Reageer altyd in Afrikaans. Moenie na Engels oorskakel nie. Dit is \'n streng vereiste.'

  let extra = `\n\nLANGUAGE INSTRUCTION (NON-NEGOTIABLE): ${languageInstruction}`
  extra += `\nThe user's preferred language is ${langName}.`

  if (profile) {
    const biz = profile.business_name || profile.full_name
    if (biz) {
      extra += `\n\nUSER'S BUSINESS PROFILE:\n- Business name: ${biz}`
      if (profile.business_email)   extra += `\n- Business email: ${profile.business_email}`
      if (profile.business_phone)   extra += `\n- Business phone: ${profile.business_phone}`
      if (profile.business_address) extra += `\n- Business address: ${profile.business_address}`
      if (profile.vat_number)       extra += `\n- VAT number: ${profile.vat_number}`
      if (profile.bank_name)        extra += `\n- Bank: ${profile.bank_name}`
      if (profile.bank_account)     extra += `\n- Account: ${profile.bank_account}`
      if (profile.invoice_prefix)   extra += `\n- Invoice prefix: ${profile.invoice_prefix}`
      const nextNum = (profile.invoice_counter ?? 1000) + 1
      extra += `\n- Next invoice number will be: ${profile.invoice_prefix || 'INV'}-${nextNum}`
      extra += `\n\nWhen the user asks to create an invoice, you already have their business details. Generate the ACTION:INVOICE immediately — do not ask them to fill in their business profile first.`
    } else {
      extra += `\n\nThe user has not set up their business profile yet. If they ask to create an invoice, first ask for their business name, then proceed. Remind them they can set up their full business profile in Settings for branded invoices.`
    }
  }

  return SYSTEM_PROMPT + extra
}

// ─── Quick-response cache (skip Claude for common greetings) ─
const QUICK_RESPONSES: Record<string, string> = {
  'hallo': 'Hallo! Hoe kan ek jou help vandag?',
  'hello': 'Hello! How can I help you today?',
  'hoe gaan dit': 'Goed dankie! En jy?',
  'how are you': "I'm doing great, thanks for asking!",
  'dankie': 'Plesier! Is daar iets anders waarmee ek kan help?',
  'thanks': "You're welcome! Anything else I can help with?",
}

function pickModel(userMessage: string, hasUpload: boolean): string {
  const lower = userMessage.toLowerCase()
  const isSimple =
    userMessage.length < 100 &&
    !lower.includes('analyseer') &&
    !lower.includes('analyse') &&
    !lower.includes('dokument') &&
    !lower.includes('document') &&
    !hasUpload

  return isSimple ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
}

function cleanTranscription(text: string): string {
  return text
    .replace(/\bGabie\b/gi, 'Gabby')
    .replace(/\bGaby\b/gi, 'Gabby')
    .replace(/\bGabbie\b/gi, 'Gabby')
    .replace(/\bGabbi\b/gi, 'Gabby')
}

// ─── Main POST handler ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { messages, userId, uploadedFileText, lastImageUrl, language } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Ongeldige versoek' }, { status: 400 })
    }

    // Clean STT name misspellings in all user messages before passing to Claude
    const processedMessages = messages.map((m: { role: string; content: string }) =>
      m.role === 'user' ? { ...m, content: cleanTranscription(m.content) } : m
    )
    if (uploadedFileText && processedMessages.length > 0) {
      const last = processedMessages[processedMessages.length - 1]
      if (last.role === 'user') {
        processedMessages[processedMessages.length - 1] = {
          ...last,
          content: `${last.content}\n\n[Opgelaaide dokument inhoud]\n${uploadedFileText}`,
        }
      }
    }

    const contextMessages = processedMessages.slice(-20)
    const lastUserMsg = contextMessages.filter((m: { role: string }) => m.role === 'user').pop()
    const userMessage = (lastUserMsg?.content ?? '')
      .replace(/\n\n\[Opgelaaide dokument inhoud\][\s\S]*/, '')
      .trim()

    // Instant reply for common greetings — no Claude call needed
    const normalised = userMessage.toLowerCase().trim()
    if (!uploadedFileText && QUICK_RESPONSES[normalised]) {
      const text = QUICK_RESPONSES[normalised]
      if (userId && lastUserMsg) {
        await supabaseAdmin.from('conversations').insert([
          { user_id: userId, role: 'user', content: lastUserMsg.content },
          { user_id: userId, role: 'assistant', content: text },
        ])
      }
      return NextResponse.json({ text })
    }

    const systemPrompt = await buildSystemPrompt(userId ?? null, language ?? 'af')
    const model = pickModel(userMessage, !!uploadedFileText)
    const msgParams = {
      model: model as 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: contextMessages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    }

    // ── Single streaming call — buffer first line to detect ACTION: ──
    const anthropicStream = anthropic.messages.stream(msgParams)
    const iter = anthropicStream[Symbol.asyncIterator]()

    // Phase 1: read until first newline to detect action prefix
    let peekBuf = ''
    while (!peekBuf.includes('\n')) {
      const result = await iter.next()
      if (result.done) break
      const event = result.value
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        peekBuf += event.delta.text
      }
    }

    const firstLine = peekBuf.split('\n')[0].trim()
    const isAction = firstLine.startsWith('ACTION:')

    if (isAction) {
      // Phase 2a: drain the rest of the stream to collect full response
      let rest = ''
      while (true) {
        const result = await iter.next()
        if (result.done) break
        const event = result.value
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          rest += event.delta.text
        }
      }

      const fullResponse = peekBuf + rest
      const responseLines = fullResponse.split('\n')
      let textResponse = responseLines.slice(1).join('\n').trim()

      const { actionResult, synthesizedText } = await executeAction(
        firstLine,
        userId ?? null,
        lastImageUrl,
        language ?? 'af'
      )

      // IMAGE: return imageUrl directly so the client renders a real <img> tag
      if (actionResult?.type === 'IMAGE') {
        const imageUrl    = actionResult.url || null
        const displayText = imageUrl
          ? 'Hier is jou prent!'
          : "Ek kon nie die prent genereer nie. Probeer 'n ander beskrywing."

        console.log('[Chat] IMAGE action — url:', imageUrl?.slice(0, 80) ?? 'EMPTY')

        if (userId) {
          const lastUserMsg = contextMessages.filter((m: { role: string }) => m.role === 'user').pop()
          if (lastUserMsg) {
            await supabaseAdmin.from('conversations').insert([
              { user_id: userId, role: 'user', content: lastUserMsg.content },
              { user_id: userId, role: 'assistant', content: displayText },
            ])
          }
        }
        return NextResponse.json({ text: displayText, imageUrl, action: 'IMAGE' })
      }

      if (synthesizedText) textResponse = synthesizedText
      if (!textResponse) textResponse = 'Gereed.'

      if (userId) {
        const lastUserMsg = contextMessages.filter((m: { role: string }) => m.role === 'user').pop()
        if (lastUserMsg) {
          await supabaseAdmin.from('conversations').insert([
            { user_id: userId, role: 'user', content: lastUserMsg.content },
            { user_id: userId, role: 'assistant', content: textResponse },
          ])
        }
      }

      return NextResponse.json({ text: textResponse, action: actionResult })
    }

    // Phase 2b: not an action — stream immediately as SSE.
    // Flush peekBuf first, then continue draining the same iterator.
    const encoder = new TextEncoder()
    let fullText = peekBuf

    const sendDelta = (controller: ReadableStreamDefaultController, text: string) => {
      if (!text) return
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendDelta(controller, peekBuf)

          while (true) {
            const result = await iter.next()
            if (result.done) break
            const event = result.value
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullText += event.delta.text
              sendDelta(controller, event.delta.text)
            }
          }

          if (userId && fullText) {
            const lastUserMsg = contextMessages.filter((m: { role: string }) => m.role === 'user').pop()
            if (lastUserMsg) {
              await supabaseAdmin.from('conversations').insert([
                { user_id: userId, role: 'user', content: lastUserMsg.content },
                { user_id: userId, role: 'assistant', content: fullText },
              ])
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan. Probeer weer.' },
      { status: 500 }
    )
  }
}
