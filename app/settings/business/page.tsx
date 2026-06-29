'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface BizProfile {
  business_name: string
  business_email: string
  business_phone: string
  business_address: string
  business_registration: string
  vat_number: string
  bank_name: string
  bank_account: string
  bank_branch: string
  bank_account_type: string
  invoice_prefix: string
  invoice_counter: number
  invoice_notes: string
  invoice_terms: string
  logo_url: string
  primary_color: string
}

const EMPTY: BizProfile = {
  business_name: '',
  business_email: '',
  business_phone: '',
  business_address: '',
  business_registration: '',
  vat_number: '',
  bank_name: '',
  bank_account: '',
  bank_branch: '',
  bank_account_type: 'Cheque',
  invoice_prefix: 'INV',
  invoice_counter: 1000,
  invoice_notes: '',
  invoice_terms: 'Payment due within 30 days',
  logo_url: '',
  primary_color: '#1a6fd4',
}

export default function BusinessSettingsPage() {
  const [profile, setProfile] = useState<BizProfile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router  = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('users_profile')
        .select('business_name,business_email,business_phone,business_address,business_registration,vat_number,bank_name,bank_account,bank_branch,bank_account_type,invoice_prefix,invoice_counter,invoice_notes,invoice_terms,logo_url,primary_color')
        .eq('id', user.id)
        .single()
      if (data) {
        setProfile({
          business_name:        data.business_name        ?? '',
          business_email:       data.business_email       ?? '',
          business_phone:       data.business_phone       ?? '',
          business_address:     data.business_address     ?? '',
          business_registration:data.business_registration?? '',
          vat_number:           data.vat_number           ?? '',
          bank_name:            data.bank_name            ?? '',
          bank_account:         data.bank_account         ?? '',
          bank_branch:          data.bank_branch          ?? '',
          bank_account_type:    data.bank_account_type    ?? 'Cheque',
          invoice_prefix:       data.invoice_prefix       ?? 'INV',
          invoice_counter:      data.invoice_counter      ?? 1000,
          invoice_notes:        data.invoice_notes        ?? '',
          invoice_terms:        data.invoice_terms        ?? 'Payment due within 30 days',
          logo_url:             data.logo_url             ?? '',
          primary_color:        data.primary_color        ?? '#1a6fd4',
        })
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(field: keyof BizProfile, value: string | number) {
    setProfile(p => ({ ...p, [field]: value }))
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext  = file.name.split('.').pop()
      const path = `logos/${user.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('business-assets')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('business-assets').getPublicUrl(path)
      set('logo_url', urlData.publicUrl)
    } catch (err) {
      setError(`Logo upload failed: ${String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error: saveErr } = await supabase
        .from('users_profile')
        .update(profile)
        .eq('id', user.id)
      if (saveErr) throw saveErr
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#0f0f1e',
    border: '1px solid #2a2a4e',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'white',
    fontSize: 14,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#8888cc',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: 500,
  }

  const sectionTitle = (text: string) => (
    <h3 style={{ color: profile.primary_color || '#1a6fd4', fontSize: 13, fontWeight: 700, marginTop: 24, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
      {text}
    </h3>
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8888cc' }}>Laai besigheidsbesonderhede...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a1a', padding: '0 0 120px' }}>
      {/* Top bar */}
      <div style={{ backgroundColor: '#0f0f1e', borderBottom: '1px solid #1a1a2e', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button
          onClick={() => router.push('/settings')}
          style={{ color: '#8888cc', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
        >
          ←
        </button>
        <h1 style={{ color: 'white', fontSize: 17, fontWeight: 700, flex: 1 }}>Besigheidsprofiel</h1>
        {saved && <span style={{ color: '#27ae60', fontSize: 13 }}>Gestoor ✓</span>}
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px' }}>

        {/* Logo + Colour */}
        {sectionTitle('Handelsmerk / Branding')}

        {/* Logo preview */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logo_url}
                alt="Logo"
                style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, border: '1px solid #2a2a4e', backgroundColor: '#1a1a2e' }}
              />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed #2a2a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' }}>
                <span style={{ color: '#555555', fontSize: 11 }}>Geen</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a4e', backgroundColor: '#1a1a2e', color: '#8888cc', fontSize: 13, cursor: 'pointer' }}
            >
              {uploading ? 'Laai op...' : 'Kies logo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
          </div>
        </div>

        {/* Primary colour */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Handelsmerkkleur / Brand colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="color"
              value={profile.primary_color}
              onChange={e => set('primary_color', e.target.value)}
              style={{ width: 48, height: 36, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, backgroundColor: 'transparent' }}
            />
            <input
              type="text"
              value={profile.primary_color}
              onChange={e => set('primary_color', e.target.value)}
              style={{ ...inputStyle, width: 120 }}
              placeholder="#1a6fd4"
            />
            <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: profile.primary_color, border: '1px solid #2a2a4e', flexShrink: 0 }} />
          </div>
        </div>

        {/* Business info */}
        {sectionTitle('Besigheidsbesonderhede')}

        {[
          { key: 'business_name',         label: 'Besigheidsnaam / Business Name',            placeholder: 'Botha Bou Pty Ltd' },
          { key: 'business_email',        label: 'Besigheids-e-pos / Business Email',          placeholder: 'info@mybusiness.co.za' },
          { key: 'business_phone',        label: 'Besigheidstelefoonnommer / Business Phone',  placeholder: '+27 21 555 0000' },
          { key: 'business_registration', label: 'Registrasienommer / Company Registration',   placeholder: '2023/123456/07' },
          { key: 'vat_number',            label: 'BTW-nommer / VAT Number',                    placeholder: '4123456789' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{label}</label>
            <input
              type="text"
              value={profile[key as keyof BizProfile] as string}
              onChange={e => set(key as keyof BizProfile, e.target.value)}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Besigheidsadres / Business Address</label>
          <textarea
            value={profile.business_address}
            onChange={e => set('business_address', e.target.value)}
            placeholder="123 Hoofstraat&#10;Kaapstad, 8001"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
        </div>

        {/* Banking */}
        {sectionTitle('Bankbesonderhede')}

        {[
          { key: 'bank_name',    label: 'Bank',            placeholder: 'FNB / Standard Bank / Absa / Nedbank' },
          { key: 'bank_account', label: 'Rekeningnommer',  placeholder: '62123456789' },
          { key: 'bank_branch',  label: 'Takkode / Branch Code', placeholder: '250655' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{label}</label>
            <input
              type="text"
              value={profile[key as keyof BizProfile] as string}
              onChange={e => set(key as keyof BizProfile, e.target.value)}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Rekening tipe / Account Type</label>
          <select
            value={profile.bank_account_type}
            onChange={e => set('bank_account_type', e.target.value)}
            style={{ ...inputStyle, appearance: 'none' as const }}
          >
            <option value="Cheque">Cheque / Current</option>
            <option value="Savings">Savings / Spaar</option>
            <option value="Business">Business</option>
            <option value="Transmission">Transmission</option>
          </select>
        </div>

        {/* Invoice settings */}
        {sectionTitle('Faktuurinstellings')}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Faktuurvoorvoegsel / Prefix</label>
            <input
              type="text"
              value={profile.invoice_prefix}
              onChange={e => set('invoice_prefix', e.target.value.toUpperCase())}
              placeholder="INV"
              maxLength={6}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Volgende nommer / Next number</label>
            <input
              type="number"
              value={profile.invoice_counter}
              onChange={e => set('invoice_counter', parseInt(e.target.value) || 1000)}
              min={1}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 6, padding: '8px 12px', borderRadius: 8, backgroundColor: '#1a1a2e', color: '#8888cc', fontSize: 12 }}>
          Jou volgende faktuur sal wees: <strong style={{ color: 'white' }}>{profile.invoice_prefix || 'INV'}-{(profile.invoice_counter || 1000) + 1}</strong>
        </div>

        <div style={{ marginBottom: 14, marginTop: 14 }}>
          <label style={labelStyle}>Betalingsvoorwaardes / Payment Terms</label>
          <input
            type="text"
            value={profile.invoice_terms}
            onChange={e => set('invoice_terms', e.target.value)}
            placeholder="Payment due within 30 days"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Standaard notas / Default Notes</label>
          <textarea
            value={profile.invoice_notes}
            onChange={e => set('invoice_notes', e.target.value)}
            placeholder="Dankie vir u besigheid!"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
        </div>

        {error && (
          <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || uploading}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: saving ? '#555555' : (profile.primary_color || '#1a6fd4'),
            color: 'white',
            fontSize: 15,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            marginTop: 8,
          }}
        >
          {saving ? 'Besig om te stoor...' : 'Stoor besigheidsprofiel'}
        </button>
      </form>
    </div>
  )
}
