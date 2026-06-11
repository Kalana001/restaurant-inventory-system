-- Make supplier_id optional in batches table
ALTER TABLE batches ALTER COLUMN supplier_id DROP NOT NULL;
