import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type InteractionType =
  | "call_inbound"
  | "call_outbound"
  | "email_sent"
  | "email_received"
  | "whatsapp_sent"
  | "whatsapp_received"
  | "quote_generated"
  | "invoice_generated"
  | "receipt_generated"
  | "quote_converted"
  | "document_sent"
  | "contact_created"
  | "contact_updated"
  | "followup_scheduled"
  | "appointment_booked"
  | "appointment_cancelled";

export type InteractionChannel = "voice" | "email" | "whatsapp" | "system";

export interface InteractionLog {
  user_id?: string;
  contact_id?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_name?: string;
  type: InteractionType;
  channel: InteractionChannel;
  direction?: "inbound" | "outbound";
  subject?: string;
  summary?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  document_id?: string;
  document_type?: string;
  document_number?: string;
  call_id?: string;
  status?: "success" | "failed" | "pending";
  error_message?: string;
}

export async function logInteraction(interaction: InteractionLog) {
  try {
    const { data, error } = await supabase
      .from("interactions")
      .insert({
        ...interaction,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[interactions] Failed to log:", error.message);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error("[interactions] Unexpected error:", err);
    return null;
  }
}

// SQL to create the interactions table - run once in Supabase SQL Editor
export const CREATE_INTERACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  contact_id UUID,
  contact_phone TEXT,
  contact_email TEXT,
  contact_name TEXT,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT,
  subject TEXT,
  summary TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  document_id UUID,
  document_type TEXT,
  document_number TEXT,
  call_id TEXT,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interactions_type ON interactions(type);
CREATE INDEX idx_interactions_contact_phone ON interactions(contact_phone);
CREATE INDEX idx_interactions_contact_email ON interactions(contact_email);
CREATE INDEX idx_interactions_created_at ON interactions(created_at DESC);
CREATE INDEX idx_interactions_user_id ON interactions(user_id);
CREATE INDEX idx_interactions_call_id ON interactions(call_id);
`;
