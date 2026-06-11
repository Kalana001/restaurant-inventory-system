-- Make min_stock, max_stock, and selling_price optional in inventory_items
ALTER TABLE inventory_items ALTER COLUMN min_stock DROP NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN max_stock DROP NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN selling_price DROP NOT NULL;
