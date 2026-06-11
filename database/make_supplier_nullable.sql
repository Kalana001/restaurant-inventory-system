-- Make supplier_id optional in inventory_items
ALTER TABLE inventory_items ALTER COLUMN supplier_id DROP NOT NULL;
