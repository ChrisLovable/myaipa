import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel,
} from 'docx'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface InvoiceItem {
  desc: string
  qty: number
  price: number
}

export interface InvoiceData {
  client: string
  clientEmail?: string
  clientAddress?: string
  items: InvoiceItem[]
  vat: boolean
  notes?: string
}

interface BusinessProfile {
  full_name?: string
  business_name?: string
  business_email?: string
  business_phone?: string
  business_address?: string
  business_registration?: string
  vat_number?: string
  bank_name?: string
  bank_account?: string
  bank_branch?: string
  bank_account_type?: string
  invoice_prefix?: string
  invoice_counter?: number
  invoice_notes?: string
  invoice_terms?: string
  logo_url?: string
  primary_color?: string
}

function formatRand(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

async function buildPDF(params: {
  invoiceNumber: string
  profile: BusinessProfile
  data: InvoiceData
  subtotal: number
  vatAmount: number
  total: number
  invoiceDate: string
  dueDate: string
}): Promise<Buffer> {
  const { invoiceNumber, profile, data, subtotal, vatAmount, total, invoiceDate, dueDate } = params
  const businessName = profile.business_name || profile.full_name || 'My Business'
  const color = profile.primary_color || '#1a6fd4'
  const [r, g, b] = hexToRgb(color)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width - 100  // usable width

    // ── Header bar ──────────────────────────────────────────────
    doc.rect(50, 40, doc.page.width - 100, 80).fill([r, g, b])
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold')
       .text(businessName, 60, 60, { width: pageW - 120 })
    doc.fontSize(10).font('Helvetica')
       .text('FAKTUUR / INVOICE', doc.page.width - 180, 60, { align: 'right', width: 130 })
    doc.fontSize(14).font('Helvetica-Bold')
       .text(invoiceNumber, doc.page.width - 180, 80, { align: 'right', width: 130 })
    doc.fillColor('black')

    // ── From / To columns ────────────────────────────────────────
    const col1 = 50, col2 = 320
    let y = 145
    doc.fontSize(9).font('Helvetica-Bold').fillColor([r, g, b]).text('VAN / FROM', col1, y)
    doc.fontSize(9).font('Helvetica-Bold').fillColor([r, g, b]).text('AAN / TO', col2, y)
    y += 14
    doc.font('Helvetica').fillColor('black')

    const fromLines = [
      businessName,
      profile.business_email || '',
      profile.business_phone || '',
      profile.business_address || '',
      profile.vat_number ? `VAT: ${profile.vat_number}` : '',
      profile.business_registration ? `Reg: ${profile.business_registration}` : '',
    ].filter(Boolean)

    const toLines = [
      data.client,
      data.clientEmail || '',
      data.clientAddress || '',
    ].filter(Boolean)

    const maxLines = Math.max(fromLines.length, toLines.length)
    for (let i = 0; i < maxLines; i++) {
      doc.fontSize(9).text(fromLines[i] || '', col1, y + i * 13, { width: 240 })
      doc.fontSize(9).text(toLines[i] || '', col2, y + i * 13, { width: 240 })
    }

    // ── Invoice dates ────────────────────────────────────────────
    y += maxLines * 13 + 10
    doc.fontSize(9).font('Helvetica-Bold').fillColor([r, g, b]).text('Datum / Date:', col1, y)
    doc.font('Helvetica').fillColor('black').text(invoiceDate, col1 + 90, y)
    doc.font('Helvetica-Bold').fillColor([r, g, b]).text('Betaalbaar / Due:', col2, y)
    doc.font('Helvetica').fillColor('black').text(dueDate, col2 + 100, y)

    // ── Items table header ───────────────────────────────────────
    y += 30
    doc.rect(50, y, pageW, 20).fill([r, g, b])
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
    doc.text('Beskrywing / Description', 55, y + 6, { width: 220 })
    doc.text('Hoeveelheid', 280, y + 6, { width: 80, align: 'right' })
    doc.text('Prys', 370, y + 6, { width: 80, align: 'right' })
    doc.text('Totaal', 455, y + 6, { width: 80, align: 'right' })
    doc.fillColor('black')

    // ── Items rows ───────────────────────────────────────────────
    y += 20
    data.items.forEach((item, idx) => {
      if (idx % 2 === 0) doc.rect(50, y, pageW, 18).fill('#f8f8f8')
      const lineTotal = item.qty * item.price
      doc.fillColor('black').fontSize(9).font('Helvetica')
      doc.text(item.desc, 55, y + 4, { width: 220 })
      doc.text(String(item.qty), 280, y + 4, { width: 80, align: 'right' })
      doc.text(formatRand(item.price), 370, y + 4, { width: 80, align: 'right' })
      doc.text(formatRand(lineTotal), 455, y + 4, { width: 80, align: 'right' })
      y += 18
    })

    // ── Totals ───────────────────────────────────────────────────
    y += 10
    doc.moveTo(370, y).lineTo(540, y).stroke('#cccccc')
    y += 6

    const totalsX = 370, amtX = 455, amtW = 80

    doc.fontSize(9).font('Helvetica').fillColor('black')
    doc.text('Subtotaal:', totalsX, y, { width: 80 })
    doc.text(formatRand(subtotal), amtX, y, { width: amtW, align: 'right' })
    y += 14

    if (data.vat) {
      doc.text('BTW / VAT (15%):', totalsX, y, { width: 80 })
      doc.text(formatRand(vatAmount), amtX, y, { width: amtW, align: 'right' })
      y += 14
    }

    doc.rect(370, y, 170, 22).fill([r, g, b])
    doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
    doc.text('TOTAAL:', totalsX + 5, y + 5, { width: 80 })
    doc.text(formatRand(total), amtX, y + 5, { width: amtW, align: 'right' })
    doc.fillColor('black')
    y += 32

    // ── Banking details ──────────────────────────────────────────
    if (profile.bank_name || profile.bank_account) {
      y += 10
      doc.fontSize(9).font('Helvetica-Bold').fillColor([r, g, b]).text('Bankbesonderhede / Banking Details', 50, y)
      y += 14
      doc.font('Helvetica').fillColor('black')
      if (profile.bank_name)        { doc.text(`Bank: ${profile.bank_name}`, 50, y); y += 12 }
      if (profile.bank_account)     { doc.text(`Rekening: ${profile.bank_account}`, 50, y); y += 12 }
      if (profile.bank_branch)      { doc.text(`Takkode: ${profile.bank_branch}`, 50, y); y += 12 }
      if (profile.bank_account_type){ doc.text(`Tipe: ${profile.bank_account_type}`, 50, y); y += 12 }
    }

    // ── Notes / Terms ─────────────────────────────────────────────
    const terms = profile.invoice_terms || 'Payment due within 30 days'
    const notes = data.notes || profile.invoice_notes || ''
    y += 10
    if (terms) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor([r, g, b]).text('Betalingsvoorwaardes:', 50, y)
      doc.font('Helvetica').fillColor('#555555').text(terms, 50, y + 11, { width: pageW })
      y += 24
    }
    if (notes) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor([r, g, b]).text('Notas:', 50, y)
      doc.font('Helvetica').fillColor('#555555').text(notes, 50, y + 11, { width: pageW })
      y += 24
    }

    // ── Footer ────────────────────────────────────────────────────
    const footerY = doc.page.height - 50
    doc.rect(50, footerY - 5, pageW, 1).fill([r, g, b])
    const footerParts = [businessName]
    if (profile.vat_number)            footerParts.push(`VAT: ${profile.vat_number}`)
    if (profile.business_registration) footerParts.push(`Reg: ${profile.business_registration}`)
    doc.fontSize(8).font('Helvetica').fillColor('#888888')
       .text(footerParts.join('  |  '), 50, footerY, { align: 'center', width: pageW })

    doc.end()
  })
}

async function buildDOCX(params: {
  invoiceNumber: string
  profile: BusinessProfile
  data: InvoiceData
  subtotal: number
  vatAmount: number
  total: number
  invoiceDate: string
  dueDate: string
}): Promise<Buffer> {
  const { invoiceNumber, profile, data, subtotal, vatAmount, total, invoiceDate, dueDate } = params
  const businessName = profile.business_name || profile.full_name || 'My Business'
  const color = (profile.primary_color || '#1a6fd4').replace('#', '')

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  }

  const thinBorder = {
    top:    { style: BorderStyle.SINGLE, size: 4, color: 'cccccc' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'cccccc' },
    left:   { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
    right:  { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
  }

  const headerCell = (text: string) =>
    new TableCell({
      shading: { fill: color, type: 'clear' },
      borders: noBorder,
      children: [new Paragraph({
        children: [new TextRun({ text, color: 'FFFFFF', bold: true, size: 18 })],
      })],
    })

  const itemRow = (item: InvoiceItem, shade: boolean) => {
    const lineTotal = item.qty * item.price
    const fill = shade ? 'f8f8f8' : 'ffffff'
    const cell = (text: string, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
      new TableCell({
        shading: { fill, type: 'clear' },
        borders: noBorder,
        children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 18 })] })],
      })
    return new TableRow({ children: [
      cell(item.desc),
      cell(String(item.qty), AlignmentType.RIGHT),
      cell(formatRand(item.price), AlignmentType.RIGHT),
      cell(formatRand(lineTotal), AlignmentType.RIGHT),
    ]})
  }

  const totalRow = (label: string, value: string, bold = false, highlight = false) => {
    const fill = highlight ? color : 'ffffff'
    const textColor = highlight ? 'FFFFFF' : '000000'
    return new TableRow({ children: [
      new TableCell({ columnSpan: 3, borders: highlight ? noBorder : thinBorder,
        shading: { fill, type: 'clear' },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: label, bold, size: 20, color: textColor })] })] }),
      new TableCell({ borders: highlight ? noBorder : thinBorder,
        shading: { fill, type: 'clear' },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: value, bold, size: 20, color: textColor })] })] }),
    ]})
  }

  const doc = new Document({
    sections: [{
      children: [
        // Business name as heading
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
          new TextRun({ text: businessName, color, bold: true, size: 48 })
        ]}),
        new Paragraph({ children: [new TextRun({ text: `FAKTUUR / INVOICE: ${invoiceNumber}`, bold: true, size: 24 })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),

        // From / To / Dates info
        ...[
          `Van: ${businessName}`,
          profile.business_email ? `E-pos: ${profile.business_email}` : '',
          profile.business_phone ? `Tel: ${profile.business_phone}` : '',
          profile.business_address ? `Adres: ${profile.business_address}` : '',
          '',
          `Aan: ${data.client}`,
          data.clientEmail ? `E-pos: ${data.clientEmail}` : '',
          data.clientAddress ? `Adres: ${data.clientAddress}` : '',
          '',
          `Datum: ${invoiceDate}`,
          `Betaalbaar teen: ${dueDate}`,
          '',
        ].filter(s => s !== null).map(text =>
          new Paragraph({ children: [new TextRun({ text: text || '', size: 20 })] })
        ),

        // Items table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Beskrywing / Description'),
              headerCell('Hoeveelheid'),
              headerCell('Prys'),
              headerCell('Totaal'),
            ]}),
            ...data.items.map((item, i) => itemRow(item, i % 2 === 0)),
            totalRow('Subtotaal:', formatRand(subtotal)),
            ...(data.vat ? [totalRow('BTW / VAT (15%):', formatRand(vatAmount))] : []),
            totalRow('TOTAAL:', formatRand(total), true, true),
          ],
        }),

        new Paragraph({ children: [new TextRun({ text: '' })] }),

        // Banking
        ...(profile.bank_name || profile.bank_account ? [
          new Paragraph({ children: [new TextRun({ text: 'Bankbesonderhede / Banking Details', bold: true, color, size: 22 })] }),
          ...[
            profile.bank_name        ? `Bank: ${profile.bank_name}` : '',
            profile.bank_account     ? `Rekening: ${profile.bank_account}` : '',
            profile.bank_branch      ? `Takkode: ${profile.bank_branch}` : '',
            profile.bank_account_type ? `Tipe: ${profile.bank_account_type}` : '',
          ].filter(Boolean).map(t => new Paragraph({ children: [new TextRun({ text: t, size: 20 })] })),
        ] : []),

        // Terms
        ...(profile.invoice_terms ? [
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({ children: [new TextRun({ text: 'Betalingsvoorwaardes:', bold: true, color, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: profile.invoice_terms, size: 18 })] }),
        ] : []),

        // Notes
        ...(data.notes || profile.invoice_notes ? [
          new Paragraph({ children: [new TextRun({ text: 'Notas:', bold: true, color, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: data.notes || profile.invoice_notes || '', size: 18 })] }),
        ] : []),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}

export async function POST(request: NextRequest) {
  try {
    const { userId, invoiceData } = (await request.json()) as { userId: string; invoiceData: InvoiceData }

    if (!userId || !invoiceData) {
      return NextResponse.json({ error: 'Missing userId or invoiceData' }, { status: 400 })
    }

    // Fetch business profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users_profile')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Could not load business profile' }, { status: 500 })
    }

    // Increment invoice counter and generate invoice number
    const currentCounter = profile.invoice_counter ?? 1000
    const newCounter = currentCounter + 1
    await supabaseAdmin
      .from('users_profile')
      .update({ invoice_counter: newCounter })
      .eq('id', userId)

    const prefix = profile.invoice_prefix || 'INV'
    const invoiceNumber = `${prefix}-${newCounter}`

    // Dates
    const now = new Date()
    const invoiceDate = now.toLocaleDateString('af-ZA')
    const due = new Date(now)
    due.setDate(due.getDate() + 30)
    const dueDate = due.toLocaleDateString('af-ZA')

    // Calculate totals
    const subtotal  = invoiceData.items.reduce((s, i) => s + i.qty * i.price, 0)
    const vatAmount = invoiceData.vat ? Math.round(subtotal * 0.15 * 100) / 100 : 0
    const total     = subtotal + vatAmount

    const docParams = { invoiceNumber, profile, data: invoiceData, subtotal, vatAmount, total, invoiceDate, dueDate }

    const [pdfBuffer, docxBuffer] = await Promise.all([
      buildPDF(docParams),
      buildDOCX(docParams),
    ])

    return NextResponse.json({
      invoiceNumber,
      clientName:  invoiceData.client,
      total,
      vatAmount,
      subtotal,
      invoiceDate,
      dueDate,
      pdfBase64:  pdfBuffer.toString('base64'),
      docxBase64: docxBuffer.toString('base64'),
    })
  } catch (err) {
    console.error('[Invoice] generation error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
