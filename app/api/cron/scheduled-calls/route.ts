// Runs every 5 minutes (see vercel.json). Checks for due scheduled calls
// and fires them via the existing /api/call/outbound route.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  // Protect against public access — Vercel Cron sends this header automatically
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()

  const { data: dueCalls, error } = await supabaseAdmin
    .from('scheduled_calls')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_time', now)

  if (error) {
    console.error('[Cron] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[Cron] found ${dueCalls?.length ?? 0} due calls`)

  const results = []
  for (const call of dueCalls ?? []) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const res = await fetch(`${baseUrl}/api/call/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: call.phone_number,
          message: call.reason,
        }),
      })

      const newStatus = res.ok ? 'called' : 'failed'
      await supabaseAdmin
        .from('scheduled_calls')
        .update({ status: newStatus, called_at: new Date().toISOString() })
        .eq('id', call.id)

      console.log(`[Cron] call ${call.id} → ${newStatus}`)
      results.push({ id: call.id, status: newStatus })
    } catch (err) {
      console.error(`[Cron] error firing call ${call.id}:`, err)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({ status: 'failed', called_at: new Date().toISOString() })
        .eq('id', call.id)
      results.push({ id: call.id, status: 'failed' })
    }
  }

  return NextResponse.json({ checked: dueCalls?.length ?? 0, results })
}
