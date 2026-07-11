import { createClient } from "@supabase/supabase-js";
import {
  DocumentType,
  DocumentRequest,
  DocumentResult,
  LineItem,
  VAT_RATE,
  DOCUMENT_PREFIXES,
} from "./types";
import { logInteraction, InteractionType } from "../interactions/log";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Number generation ──────────────────────────────────────────────

async function getNextNumber(docType: DocumentType): Promise<string> {
  const counterKey = `${docType.toLowerCase()}_counter`;

  // Atomic increment using Supabase RPC or upsert
  const { data, error } = await supabase.rpc("increment_counter", {
    counter_name: counterKey,
  });

  if (error) {
    // Fallback: timestamp-based number
    const ts = Date.now().toString(36).toUpperCase();
    return `${DOCUMENT_PREFIXES[docType]}${ts}`;
  }

  const padded = String(data).padStart(5, "0");
  return `${DOCUMENT_PREFIXES[docType]}${padded}`;
}

// ── Calculations ───────────────────────────────────────────────────

export function calculateTotals(
  items: LineItem[],
  includeVat: boolean = true
) {
  let subtotal = 0;

  for (const item of items) {
    const lineTotal = item.quantity * item.unit_price;

    if (item.vat_inclusive && includeVat) {
      // Price already includes VAT, extract subtotal
      subtotal += lineTotal / (1 + VAT_RATE);
    } else {
      subtotal += lineTotal;
    }
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const vat = includeVat ? Math.round(subtotal * VAT_RATE * 100) / 100 : 0;
  const total = Math.round((subtotal + vat) * 100) / 100;

  return { subtotal, vat, total };
}

// ── Generate document ──────────────────────────────────────────────

export async function generateDocument(
  req: DocumentRequest
): Promise<DocumentResult> {
  const docType = req.documentType;
  const { subtotal, vat, total } = calculateTotals(
    req.items,
    req.include_vat !== false
  );

  const documentNumber = await getNextNumber(docType);

  // Validity / due date
  const now = new Date();
  let validUntil: string | null = null;
  let dueDate: string | null = null;

  if (docType === "QUOTE") {
    const days = req.validity_days ?? 30;
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    validUntil = d.toISOString().split("T")[0];
  }

  if (docType === "INVOICE") {
    if (req.due_date) {
      dueDate = req.due_date;
    } else {
      // Default: 30 days from now
      const d = new Date(now);
      d.setDate(d.getDate() + 30);
      dueDate = d.toISOString().split("T")[0];
    }
  }

  // Store document in Supabase
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      document_number: documentNumber,
      document_type: docType,
      client_name: req.client_name,
      client_email: req.client_email || null,
      client_phone: req.client_phone || null,
      client_company: req.client_company || null,
      client_address: req.client_address || null,
      items: req.items,
      subtotal,
      vat,
      total,
      currency: req.currency || "ZAR",
      include_vat: req.include_vat !== false,
      validity_days: req.validity_days ?? (docType === "QUOTE" ? 30 : null),
      valid_until: validUntil,
      payment_terms: req.payment_terms || (docType === "INVOICE" ? "Due on receipt" : null),
      due_date: dueDate,
      notes: req.notes || null,
      include_banking: req.banking_details !== false && docType !== "QUOTE",
      converted_from: req.convert_from_quote || null,
      status: docType === "INVOICE" ? "unpaid" : "active",
      user_id: req.user_id || null,
      created_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (docError) {
    console.error("[document-engine] Insert failed:", docError.message);
    return {
      success: false,
      document_number: documentNumber,
      document_type: docType,
      document_id: "",
      subtotal,
      vat,
      total,
      error: docError.message,
    };
  }

  // If converting from quote, mark the quote as converted
  if (req.convert_from_quote) {
    await supabase
      .from("documents")
      .update({
        status: "converted",
        converted_to: documentNumber,
      })
      .eq("document_number", req.convert_from_quote)
      .eq("document_type", "QUOTE");
  }

  // Log to interactions
  const interactionType: InteractionType =
    docType === "QUOTE"
      ? req.convert_from_quote
        ? "quote_converted"
        : "quote_generated"
      : docType === "INVOICE"
      ? "invoice_generated"
      : "receipt_generated";

  await logInteraction({
    user_id: req.user_id,
    contact_name: req.client_name,
    contact_email: req.client_email,
    contact_phone: req.client_phone,
    type: interactionType,
    channel: "system",
    subject: `${docType} ${documentNumber} - ${req.client_name}`,
    summary: `Generated ${docType.toLowerCase()} ${documentNumber} for ${req.client_name}. Total: R${total.toFixed(2)}`,
    metadata: {
      document_id: doc.id,
      document_number: documentNumber,
      subtotal,
      vat,
      total,
      items_count: req.items.length,
      converted_from: req.convert_from_quote || null,
    },
    document_id: doc.id,
    document_type: docType,
    document_number: documentNumber,
    call_id: req.call_id,
    status: "success",
  });

  return {
    success: true,
    document_number: documentNumber,
    document_type: docType,
    document_id: doc.id,
    subtotal,
    vat,
    total,
    // PDF URL will be added when renderer is wired
    // pdf_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/document/${doc.id}/pdf`
  };
}

// ── Convert quote to invoice ───────────────────────────────────────

export async function convertQuoteToInvoice(
  quoteNumber: string,
  overrides?: Partial<DocumentRequest>
): Promise<DocumentResult> {
  // Fetch the original quote
  const { data: quote, error } = await supabase
    .from("documents")
    .select("*")
    .eq("document_number", quoteNumber)
    .eq("document_type", "QUOTE")
    .single();

  if (error || !quote) {
    return {
      success: false,
      document_number: "",
      document_type: "INVOICE",
      document_id: "",
      subtotal: 0,
      vat: 0,
      total: 0,
      error: `Quote ${quoteNumber} not found`,
    };
  }

  if (quote.status === "converted") {
    return {
      success: false,
      document_number: "",
      document_type: "INVOICE",
      document_id: "",
      subtotal: 0,
      vat: 0,
      total: 0,
      error: `Quote ${quoteNumber} has already been converted to invoice ${quote.converted_to}`,
    };
  }

  // Generate invoice from quote data
  return generateDocument({
    documentType: "INVOICE",
    client_name: quote.client_name,
    client_email: quote.client_email,
    client_phone: quote.client_phone,
    client_company: quote.client_company,
    client_address: quote.client_address,
    items: quote.items,
    include_vat: quote.include_vat,
    currency: quote.currency,
    payment_terms: overrides?.payment_terms || "Due on receipt",
    due_date: overrides?.due_date,
    notes: overrides?.notes || quote.notes,
    banking_details: true,
    convert_from_quote: quoteNumber,
    call_id: overrides?.call_id,
    user_id: overrides?.user_id || quote.user_id,
  });
}

// ── SQL setup ──────────────────────────────────────────────────────

export const CREATE_DOCUMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_number TEXT UNIQUE NOT NULL,
  document_type TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  client_company TEXT,
  client_address TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'ZAR',
  include_vat BOOLEAN DEFAULT true,
  validity_days INTEGER,
  valid_until DATE,
  payment_terms TEXT,
  due_date DATE,
  notes TEXT,
  include_banking BOOLEAN DEFAULT false,
  converted_from TEXT,
  converted_to TEXT,
  status TEXT DEFAULT 'active',
  pdf_url TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_number ON documents(document_number);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_client ON documents(client_name);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(created_at DESC);

-- Atomic counter function
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);

INSERT INTO counters (name, value) VALUES
  ('quote_counter', 0),
  ('invoice_counter', 0),
  ('receipt_counter', 0)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION increment_counter(counter_name TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_val INTEGER;
BEGIN
  UPDATE counters SET value = value + 1 WHERE name = counter_name RETURNING value INTO new_val;
  IF NOT FOUND THEN
    INSERT INTO counters (name, value) VALUES (counter_name, 1) RETURNING value INTO new_val;
  END IF;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;
`;
