-- Business profile columns for multi-tenant invoice branding
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS business_email text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS business_phone text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS business_address text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS business_registration text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS bank_account_type text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS invoice_prefix text DEFAULT 'INV';
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS invoice_counter integer DEFAULT 1000;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS invoice_notes text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS invoice_terms text DEFAULT 'Payment due within 30 days';
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#1a6fd4';
