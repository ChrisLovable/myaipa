import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

type EmailPayload = {
  to?: string;
  subject?: string;
  body?: string;
  replyTo?: string;
};

const transporter = nodemailer.createTransport({
  host: process.env.GABBY_EMAIL_HOST || "smtpout.secureserver.net",
  port: Number(process.env.GABBY_EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.GABBY_EMAIL_USER || "gabby@myaipa.co.za",
    pass: process.env.GABBY_EMAIL_PASS,
  },
});

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.EMAIL_API_SECRET;
    const suppliedSecret = request.headers.get("x-api-key");

    if (!expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          error: "Email API secret is not configured.",
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

    const payload = (await request.json()) as EmailPayload;

    const to = payload.to?.trim();
    const subject = payload.subject?.trim();
    const body = payload.body?.trim();
    const replyTo = payload.replyTo?.trim();

    if (!to || !subject || !body) {
      return NextResponse.json(
        {
          success: false,
          error: "Required fields: to, subject, body.",
        },
        { status: 400 }
      );
    }

    if (!process.env.GABBY_EMAIL_PASS) {
      return NextResponse.json(
        {
          success: false,
          error: "Email credentials are incomplete.",
        },
        { status: 503 }
      );
    }

    const info = await transporter.sendMail({
      from: "Gabby - MyAIPA <gabby@myaipa.co.za>",
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      replyTo: replyTo || "gabby@myaipa.co.za",
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      to,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email sending error.";

    console.error("[Email] Send error:", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
