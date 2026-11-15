-- Migration: Create menu_items and daily_menu_sales tables
-- Safe, additive migration

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  current_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_menu_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  sales_channel VARCHAR(50) NOT NULL CHECK (sales_channel IN ('RESTAURANT', 'PICKME')),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, sales_channel, menu_item_id)
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_menu_sales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_items' AND policyname = 'Allow authenticated users full access to menu_items') THEN
    CREATE POLICY "Allow authenticated users full access to menu_items" ON menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_menu_sales' AND policyname = 'Allow authenticated users full access to daily_menu_sales') THEN
    CREATE POLICY "Allow authenticated users full access to daily_menu_sales" ON daily_menu_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
