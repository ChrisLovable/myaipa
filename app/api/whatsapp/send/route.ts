import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export const runtime = "nodejs";

type WhatsAppPayload = {
  to?: string;
  body?: string;
  mediaUrl?: string | string[];
};

function normalizeNumber(number: string): string {
  const cleaned = number.trim();

  if (cleaned.startsWith("whatsapp:+")) {
    return cleaned;
  }

  const international = cleaned.replace(/[^\d+]/g, "");

  if (!international.startsWith("+")) {
    throw new Error(
      "Use an international number such as +27821234567."
    );
  }

  return `whatsapp:${international}`;
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.WHATSAPP_API_SECRET;
    const suppliedSecret = request.headers.get("x-api-key");

    if (!expectedSecret) {
      return NextResponse.json(
        { success: false, error: "WhatsApp API secret is not configured." },
        { status: 503 }
      );
    }

    if (!suppliedSecret || suppliedSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !whatsappFrom) {
      return NextResponse.json(
        {
          success: false,
          error: "Twilio WhatsApp environment variables are incomplete.",
        },
        { status: 503 }
      );
    }

    const payload = (await request.json()) as WhatsAppPayload;

    if (!payload.to?.trim()) {
      return NextResponse.json(
        { success: false, error: "The 'to' number is required." },
        { status: 400 }
      );
    }

    if (!payload.body?.trim() && !payload.mediaUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Provide a message body or media URL.",
        },
        { status: 400 }
      );
    }

    const mediaUrl = payload.mediaUrl
      ? Array.isArray(payload.mediaUrl)
        ? payload.mediaUrl
        : [payload.mediaUrl]
      : undefined;

    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      from: normalizeNumber(whatsappFrom),
      to: normalizeNumber(payload.to),
      body: payload.body?.trim() || undefined,
      mediaUrl,
    });

    return NextResponse.json({
      success: true,
      sid: message.sid,
      status: message.status,
      from: message.from,
      to: message.to,
    });
  } catch (error) {
    console.error("WhatsApp send error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown WhatsApp sending error.",
      },
      { status: 500 }
    );
  }
}
