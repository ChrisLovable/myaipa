import { NextRequest, NextResponse } from "next/server";
import { generateDocument, convertQuoteToInvoice } from "@/lib/document-engine/service";
import { DocumentRequest } from "@/lib/document-engine/types";

// Validate API key
function isAuthorized(req: NextRequest): boolean {
  const apiKey = req.headers.get("x-api-key");
  return apiKey === process.env.DOCUMENT_API_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // ── Quote-to-invoice conversion shortcut ─────────────────────
    if (body.convert_from_quote && !body.items) {
      const result = await convertQuoteToInvoice(body.convert_from_quote, {
        payment_terms: body.payment_terms,
        due_date: body.due_date,
        notes: body.notes,
        call_id: body.call_id,
        user_id: body.user_id,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json(result);
    }

    // ── Validate required fields ─────────────────────────────────
    if (!body.documentType || !["QUOTE", "INVOICE", "RECEIPT"].includes(body.documentType)) {
      return NextResponse.json(
        { error: "documentType must be QUOTE, INVOICE, or RECEIPT" },
        { status: 400 }
      );
    }

    if (!body.client_name) {
      return NextResponse.json(
        { error: "client_name is required" },
        { status: 400 }
      );
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate each line item
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      if (!item.description || typeof item.quantity !== "number" || typeof item.unit_price !== "number") {
        return NextResponse.json(
          { error: `Item ${i + 1}: description, quantity (number), and unit_price (number) are required` },
          { status: 400 }
        );
      }
      if (item.quantity <= 0 || item.unit_price < 0) {
        return NextResponse.json(
          { error: `Item ${i + 1}: quantity must be > 0 and unit_price must be >= 0` },
          { status: 400 }
        );
      }
    }

    // ── Generate document ────────────────────────────────────────
    const request: DocumentRequest = {
      documentType: body.documentType,
      client_name: body.client_name,
      client_email: body.client_email,
      client_phone: body.client_phone,
      client_company: body.client_company,
      client_address: body.client_address,
      items: body.items,
      include_vat: body.include_vat,
      currency: body.currency,
      validity_days: body.validity_days,
      payment_terms: body.payment_terms,
      due_date: body.due_date,
      notes: body.notes,
      banking_details: body.banking_details,
      send_email: body.send_email,
      send_whatsapp: body.send_whatsapp,
      call_id: body.call_id,
      user_id: body.user_id,
    };

    const result = await generateDocument(request);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // ── Auto-send if requested ───────────────────────────────────
    const sent: { email?: boolean; whatsapp?: boolean } = {};

    if (body.send_email && body.client_email) {
      try {
        const emailRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "https://myaipa.vercel.app"}/api/email/send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.EMAIL_API_SECRET!,
            },
            body: JSON.stringify({
              to: body.client_email,
              subject: `${result.document_type === "QUOTE" ? "Quotation" : result.document_type === "INVOICE" ? "Invoice" : "Receipt"} ${result.document_number}`,
              body: `Dear ${body.client_name},\n\nPlease find attached ${result.document_type.toLowerCase()} ${result.document_number}.\n\nTotal: R${result.total.toFixed(2)}\n\n${body.notes || ""}\n\nKind regards,\nGabby\nmyAIpartner`,
            }),
          }
        );
        sent.email = emailRes.ok;
      } catch (e) {
        console.error("[document] Email send failed:", e);
        sent.email = false;
      }
    }

    // WhatsApp send placeholder — activate once Meta approval comes through
    if (body.send_whatsapp && body.client_phone) {
      // TODO: Call /api/whatsapp/send once approved
      sent.whatsapp = false;
    }

    return NextResponse.json({
      ...result,
      sent,
      // Human-friendly message for Gabby to read back to the caller
      message: `${result.document_type === "QUOTE" ? "Quotation" : result.document_type === "INVOICE" ? "Invoice" : "Receipt"} ${result.document_number} has been generated for ${body.client_name}. The total is R${result.total.toFixed(2)}.${sent.email ? " It has been emailed." : ""}`,
    });
  } catch (err) {
    console.error("[document/generate] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
