import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export const runtime = "nodejs"

const transporter = nodemailer.createTransport({
  host: process.env.GABBY_EMAIL_HOST || "smtpout.secureserver.net",
  port: Number(process.env.GABBY_EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.GABBY_EMAIL_USER || "gabby@myaipa.co.za",
    pass: process.env.GABBY_EMAIL_PASS,
  },
})

function extractParams(body: Record<string, unknown>): { to?: string; subject?: string; body?: string; replyTo?: string } {
  // Direct call: { to, subject, body }
  if (body.to && body.subject && body.body) {
    return body as { to: string; subject: string; body: string; replyTo?: string }
  }
  // Vapi tool call format
  const msg = body.message as Record<string, unknown> | undefined
  if (msg) {
    const toolCalls = (msg.toolCalls || msg.toolCallList) as Array<Record<string, unknown>> | undefined
    if (toolCalls && toolCalls.length > 0) {
      const fn = toolCalls[0].function as Record<string, unknown> | undefined
      if (fn) {
        const args = (typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments) as Record<string, string>
        return { to: args.to, subject: args.subject, body: args.body, replyTo: args.replyTo }
      }
    }
  }
  return {}
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()
    const { to, subject, body, replyTo } = extractParams(rawBody)

    console.log("[Email] Received request — to:", to, "subject:", subject)

    if (!to || !subject || !body) {
      console.log("[Email] Missing fields. Raw body keys:", Object.keys(rawBody))
      return NextResponse.json({ error: "Missing required fields: to, subject, body" }, { status: 400 })
    }

    const info = await transporter.sendMail({
      from: "Gabby - myAIpartner <gabby@myaipa.co.za>",
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      replyTo: replyTo || "gabby@myaipa.co.za",
    })

    console.log("[Email] Sent to " + to + " messageId: " + info.messageId)

    // Vapi expects a results array back
    const vapiResponse = rawBody.message ? { results: [{ result: "Email sent successfully to " + to }] } : { success: true, messageId: info.messageId }
    return NextResponse.json(vapiResponse)
  } catch (err: unknown) {
    console.error("[Email] Send error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}