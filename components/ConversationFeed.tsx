'use client'

import { useEffect, useRef } from 'react'

export interface ActionData {
  type: 'CALL' | 'SMS' | 'IMAGE' | 'SEARCH' | 'REMOVEBG' | 'INVOICE'
  phone?: string
  status?: string
  sid?: string
  url?: string
  originalUrl?: string
  prompt?: string
  query?: string
  result?: string
  // INVOICE fields
  invoiceNumber?: string
  clientName?: string
  total?: number
  vatAmount?: number
  subtotal?: number
  invoiceDate?: string
  dueDate?: string
  pdfBase64?: string
  docxBase64?: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: ActionData
  imageUrl?: string
}

interface ConversationFeedProps {
  messages: Message[]
}

function CallCard({ action }: { action: ActionData }) {
  const isCall = action.type === 'CALL'
  const success = action.status === 'dialing' || action.status === 'sent'
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl mt-1"
      style={{
        backgroundColor: success ? '#0f2e1a' : '#2e0f0f',
        border: `1px solid ${success ? '#27ae60' : '#c0392b'}`,
      }}
    >
      <span className="text-xl mt-0.5">{isCall ? '📞' : '💬'}</span>
      <div>
        <p className="text-xs font-semibold" style={{ color: success ? '#27ae60' : '#c0392b' }}>
          {isCall
            ? success ? 'Oproep besig...' : 'Oproep het misluk'
            : success ? 'SMS gestuur ✓' : 'SMS het misluk'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#8888cc' }}>
          {action.phone}
        </p>
        {action.sid && (
          <p className="text-xs mt-1 font-mono" style={{ color: '#555555' }}>
            {action.sid.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  )
}

function InlineImage({ url }: { url: string }) {
  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Gabby prent', url })
      } else {
        await navigator.clipboard.writeText(url)
        alert('Prent URL gekopieer!')
      }
    } catch { /* user cancelled */ }
  }

  const ext  = url.includes('.jpg') || url.includes('jpeg') ? 'jpg' : 'webp'
  const filename = `gabby-prent.${ext}`

  return (
    <div className="mt-2" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #2a2a4e' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Gegenereerde prent"
        style={{ width: '100%', display: 'block', borderRadius: '12px 12px 0 0' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <div
        className="flex items-center justify-between px-3 py-2 gap-2"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        <span style={{ fontSize: 11, color: '#555555' }}>Gegenereer deur Gabby</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleShare}
            style={{ fontSize: 12, fontWeight: 600, color: '#8888cc', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            📤 Deel
          </button>
          <a
            href={url}
            download={filename}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: '#1a6fd4', textDecoration: 'none' }}
          >
            ↓ Laai af
          </a>
        </div>
      </div>
    </div>
  )
}

function ImageCard({ action }: { action: ActionData }) {
  if (!action.url) {
    return (
      <div
        className="px-4 py-3 rounded-xl mt-1 text-xs"
        style={{ backgroundColor: '#2e1a0f', border: '1px solid #d4ac0d', color: '#d4ac0d' }}
      >
        Prent kon nie gegenereer word nie.
      </div>
    )
  }
  return <InlineImage url={action.url} />
}

function RemoveBgCard({ action }: { action: ActionData }) {
  return (
    <div className="mt-1 rounded-xl overflow-hidden" style={{ border: '1px solid #2a2a4e' }}>
      <div className="flex gap-1">
        <div className="flex-1 relative">
          <p className="absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded z-10"
             style={{ backgroundColor: '#1a1a2e', color: '#8888cc' }}>Voor</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={action.originalUrl} alt="Voor" className="w-full object-cover" style={{ maxHeight: 200 }} />
        </div>
        <div className="flex-1 relative" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg%20xmlns%3D\'http%3A//www.w3.org/2000/svg\'%20width%3D\'20\'%20height%3D\'20\'%3E%3Crect%20width%3D\'10\'%20height%3D\'10\'%20fill%3D\'%23ccc\'/%3E%3Crect%20x%3D\'10\'%20y%3D\'10\'%20width%3D\'10\'%20height%3D\'10\'%20fill%3D\'%23ccc\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat' }}>
          <p className="absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded z-10"
             style={{ backgroundColor: '#1a1a2e', color: '#27ae60' }}>Na</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={action.url} alt="Na" className="w-full object-cover" style={{ maxHeight: 200 }} />
        </div>
      </div>
      <div className="flex justify-end px-3 py-2" style={{ backgroundColor: '#1a1a2e' }}>
        <a
          href={action.url}
          download="gabby-removebg.png"
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: '#27ae60', color: 'white' }}
        >
          Laai af
        </a>
      </div>
    </div>
  )
}

function InvoiceCard({ action }: { action: ActionData }) {
  const fmt = (n: number) =>
    `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  function download(base64: string, filename: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="rounded-xl mt-1 overflow-hidden"
      style={{ border: '1px solid #2a4e2a', backgroundColor: '#0f1f0f' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: '#1a6fd4' }}
      >
        <div>
          <p className="text-white font-bold text-sm">{action.invoiceNumber}</p>
          <p className="text-blue-100 text-xs">{action.clientName}</p>
        </div>
        <div className="text-right">
          <p className="text-white font-bold text-base">{fmt(action.total ?? 0)}</p>
          {(action.vatAmount ?? 0) > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
            >
              BTW ingesluit
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-2" style={{ color: '#8888cc', fontSize: 11 }}>
        <span>Datum: {action.invoiceDate}</span>
        <span className="mx-2">·</span>
        <span>Betaalbaar: {action.dueDate}</span>
        {(action.vatAmount ?? 0) > 0 && (
          <>
            <span className="mx-2">·</span>
            <span>BTW: {fmt(action.vatAmount ?? 0)}</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex gap-2 px-4 py-3"
        style={{ borderTop: '1px solid #1a2e1a' }}
      >
        {action.pdfBase64 && (
          <button
            onClick={() =>
              download(action.pdfBase64!, `${action.invoiceNumber}.pdf`, 'application/pdf')
            }
            className="flex-1 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: '#c0392b', color: 'white' }}
          >
            ↓ PDF
          </button>
        )}
        {action.docxBase64 && (
          <button
            onClick={() =>
              download(
                action.docxBase64!,
                `${action.invoiceNumber}.docx`,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              )
            }
            className="flex-1 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: '#1a6fd4', color: 'white' }}
          >
            ↓ Word
          </button>
        )}
        <button
          onClick={() => {
            const subject = encodeURIComponent(`Faktuur ${action.invoiceNumber}`)
            const body = encodeURIComponent(
              `Beste ${action.clientName},\n\nHiermee stuur ek faktuur ${action.invoiceNumber} vir R ${action.total?.toFixed(2)}.\n\nGroete`
            )
            window.open(`mailto:?subject=${subject}&body=${body}`)
          }}
          className="flex-1 py-2 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: '#2a4e2a', color: '#27ae60' }}
        >
          E-pos
        </button>
      </div>
    </div>
  )
}

function SearchBadge({ action }: { action: ActionData }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs mt-1"
      style={{ backgroundColor: '#1a2e4e', border: '1px solid #1a6fd4', color: '#8888cc' }}
    >
      <span>🔍</span>
      <span>{action.query}</span>
    </div>
  )
}

function ActionCard({ action }: { action: ActionData }) {
  switch (action.type) {
    case 'CALL':
    case 'SMS':
      return <CallCard action={action} />
    case 'IMAGE':
      return <ImageCard action={action} />
    case 'REMOVEBG':
      return <RemoveBgCard action={action} />
    case 'SEARCH':
      return <SearchBadge action={action} />
    case 'INVOICE':
      return <InvoiceCard action={action} />
    default:
      return null
  }
}

export default function ConversationFeed({ messages }: ConversationFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-[#555555] text-sm text-center leading-relaxed">
          Druk die mikrofoon om met Gabby te praat,{'\n'}of kies een van die vinnige aksies hieronder.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
          {/* Text bubble — skip if empty (e.g. streaming not started yet) */}
          {msg.content && (
            <div
              className={`max-w-[82%] rounded-xl px-4 py-3 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#1a6fd4] text-white'
                  : 'bg-[#1a2e1a] text-white border border-[#2a4e2a]'
              }`}
            >
              {msg.content}
            </div>
          )}
          {/* Inline generated image */}
          {msg.imageUrl && (
            <div className="max-w-[82%] w-full">
              <InlineImage url={msg.imageUrl} />
            </div>
          )}
          {/* Other action cards (CALL, SMS, SEARCH, REMOVEBG) */}
          {msg.action && (
            <div className="max-w-[82%] w-full">
              <ActionCard action={msg.action} />
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
