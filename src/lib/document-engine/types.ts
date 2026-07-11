export type DocumentType = "QUOTE" | "INVOICE" | "RECEIPT";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number; // in Rands
  vat_inclusive?: boolean;
}

export interface DocumentRequest {
  documentType: DocumentType;

  // Client
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_address?: string;

  // Items
  items: LineItem[];

  // Options
  include_vat?: boolean; // default true, 15%
  currency?: string; // default ZAR
  validity_days?: number; // quotes only, default 30
  payment_terms?: string; // invoices, default "Due on receipt"
  due_date?: string; // invoices, ISO date
  notes?: string;
  banking_details?: boolean; // include banking on doc, default true for invoices

  // Convert existing
  convert_from_quote?: string; // quote number e.g. "Q00051"

  // Delivery
  send_email?: boolean;
  send_whatsapp?: boolean;

  // Call context (injected by Vapi static params or backend)
  call_id?: string;
  user_id?: string;
}

export interface DocumentResult {
  success: boolean;
  document_number: string;
  document_type: DocumentType;
  document_id: string;
  subtotal: number;
  vat: number;
  total: number;
  pdf_url?: string;
  error?: string;
}

export interface BusinessProfile {
  name: string;
  registration?: string;
  vat_number?: string;
  address: string;
  phone: string;
  email: string;
  banking: {
    bank: string;
    account_name: string;
    account_number: string;
    branch_code: string;
    account_type: string;
    reference_prefix?: string;
  };
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export const VAT_RATE = 0.15;

export const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  QUOTE: "Q",
  INVOICE: "INV",
  RECEIPT: "REC",
};

export const DOCUMENT_TITLES: Record<DocumentType, string> = {
  QUOTE: "Quotation",
  INVOICE: "Tax Invoice",
  RECEIPT: "Receipt",
};
