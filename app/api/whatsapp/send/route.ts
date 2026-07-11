import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    throw new Error("Use an international number such as +27821234567.");
  }

  return `whatsapp:${international}`;
}

function extractParams(
  rawBody: Record<string, unknown>
): WhatsAppPayload {
  if (rawBody.to || rawBody.body || rawBody.mediaUrl) {
    return {
      to: rawBody.to as string | undefined,
      body: rawBody.body as string | undefined,
      mediaUrl: rawBody.mediaUrl as string | string[] | undefined,
    };
  }

  const message = rawBody.message as Record<string, unknown> | undefined;

  if (!message) {
    return {};
  }

  const toolCalls = (
    message.toolCalls || message.toolCallList
  ) as Array<Record<string, unknown>> | undefined;

  if (!toolCalls?.length) {
    return {};
  }

  const fn = toolCalls[0].function as Record<string, unknown> | undefined;

  if (!fn) {
    return {};
  }

  const args =
    typeof fn.arguments === "string"
      ? JSON.parse(fn.arguments)
      : fn.arguments;

  return (args ?? {}) as WhatsAppPayload;
}

async function logMessage(data: {
  phoneNumber: string;
  messageBody?: string;
  mediaUrl?: string;
  messageSid?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    phone_number: data.phoneNumber,
    direction: "outbound",
    message_body: data.messageBody || null,
    media_url: data.mediaUrl || null,
    twilio_message_sid: data.messageSid || null,
    status: data.status || null,
    error_code: data.errorCode || null,
    error_message: data.errorMessage || null,
  });

  if (error) {
    console.error("[WhatsApp] Logging failed:", error.message);
  }
}

export async function POST(request: NextRequest) {
  let rawBody: Record<string, unknown> = {};
  let to = "";

  try {
    rawBody = (await request.json()) as Record<string, unknown>;

    const isVapiToolCall = Boolean(rawBody.message);

    if (!isVapiToolCall) {
      const expectedSecret = process.env.WHATSAPP_API_SECRET;
      const suppliedSecret = request.headers.get("x-api-key");

      if (!expectedSecret) {
        return NextResponse.json(
          {
            success: false,
            error: "WhatsApp API secret is not configured.",
          },
          { status: 503 }
        );
      }

      if (!suppliedSecret || suppliedSecret !== expectedSecret) {
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized.",
          },
          { status: 401 }
        );
      }
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

    const payload = extractParams(rawBody);

    to = payload.to?.trim() || "";

    if (!to) {
      return NextResponse.json(
        {
          success: false,
          error: "The 'to' number is required.",
        },
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

    const mediaUrls = payload.mediaUrl
      ? Array.isArray(payload.mediaUrl)
        ? payload.mediaUrl
        : [payload.mediaUrl]
      : undefined;

    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      from: normalizeNumber(whatsappFrom),
      to: normalizeNumber(to),
      body: payload.body?.trim() || undefined,
      mediaUrl: mediaUrls,
    });

    await logMessage({
      phoneNumber: to,
      messageBody: payload.body,
      mediaUrl: mediaUrls?.[0],
      messageSid: message.sid,
      status: message.status,
    });

    if (rawBody.message) {
      return NextResponse.json({
        results: [
          {
            result: `WhatsApp sent successfully to ${to}`,
          },
        ],
      });
    }

    return NextResponse.json({
      success: true,
      sid: message.sid,
      status: message.status,
      from: message.from,
      to: message.to,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown WhatsApp sending error.";

    console.error("[WhatsApp] Send error:", error);

    if (to) {
      await logMessage({
        phoneNumber: to,
        status: "failed",
        errorMessage,
      });
    }

    if (rawBody.message) {
      return NextResponse.json({
        results: [
          {
            result: `WhatsApp failed: ${errorMessage}`,
          },
        ],
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
