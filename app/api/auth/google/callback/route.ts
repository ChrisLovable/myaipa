// Handles the redirect back from Google after consent. Exchanges the
// authorization code for access + refresh tokens and stores them.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const userId = request.nextUrl.searchParams.get('state')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!code || !userId) {
    return NextResponse.redirect(new URL('/onboarding?google=error', baseUrl))
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('[Google Callback] token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(new URL('/onboarding?google=error', baseUrl))
    }

    const tokens = await tokenRes.json()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error } = await supabaseAdmin.from('google_connections').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[Google Callback] DB error:', error.message)
      return NextResponse.redirect(new URL('/onboarding?google=error', baseUrl))
    }

    return NextResponse.redirect(new URL('/onboarding?google=connected', baseUrl))
  } catch (err) {
    console.error('[Google Callback] unhandled error:', err)
    return NextResponse.redirect(new URL('/onboarding?google=error', baseUrl))
  }
}
