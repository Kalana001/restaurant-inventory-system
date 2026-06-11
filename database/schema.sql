-- ==========================================
-- 0. CLEANUP (IF NEEDED)
-- ==========================================
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS movement_reasons CASCADE;
DROP TABLE IF EXISTS grn_items CASCADE;
DROP TABLE IF EXISTS grns CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS unit_conversions CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS subcategories CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- ==========================================
-- 1. AUTHENTICATION & RBAC Profiles
-- ==========================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ==========================================
-- 2. MASTER DATA (INVENTORY & MEASUREMENT)
-- ==========================================

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_category_subcategory UNIQUE (category_id, name)
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    outstanding_balance DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    credit_limit DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    abbreviation VARCHAR(10) UNIQUE NOT NULL
);

CREATE TABLE unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    to_unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    factor DECIMAL(12, 6) NOT NULL,
    CONSTRAINT unique_unit_conversion UNIQUE (from_unit_id, to_unit_id)
);

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES categories(id),
    subcategory_id UUID REFERENCES subcategories(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    
    base_unit_id UUID NOT NULL REFERENCES units(id),
    purchase_unit_id UUID NOT NULL REFERENCES units(id),
    issue_unit_id UUID NOT NULL REFERENCES units(id),
    
    purchase_to_base_factor DECIMAL(12, 6) NOT NULL,
    issue_to_base_factor DECIMAL(12, 6) NOT NULL,
    
    min_stock DECIMAL(12, 4) NOT NULL,
    max_stock DECIMAL(12, 4) NOT NULL,
    reorder_level DECIMAL(12, 4) NOT NULL,
    
    cost_price DECIMAL(12, 2) NOT NULL,
    selling_price DECIMAL(12, 2) NOT NULL,
    is_batch_tracked BOOLEAN DEFAULT false NOT NULL,
    is_expiry_tracked BOOLEAN DEFAULT false NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 3. BATCHES
-- ==========================================

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(100) NOT NULL,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    received_date DATE DEFAULT CURRENT_DATE NOT NULL,
    expiry_date DATE,
    current_qty DECIMAL(12, 4) NOT NULL, -- in base units
    available_qty DECIMAL(12, 4) NOT NULL, -- in base units
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'OUT_OF_STOCK')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_item_batch UNIQUE (item_id, batch_number)
);

-- ==========================================
-- 4. PROCUREMENT
-- ==========================================

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')),
    total_amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity DECIMAL(12, 4) NOT NULL,
    cost_price DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL
);

CREATE TABLE grns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number VARCHAR(100) UNIQUE NOT NULL,
    po_id UUID REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    received_by UUID NOT NULL REFERENCES profiles(id),
    received_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    invoice_number VARCHAR(100),
    total_amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity DECIMAL(12, 4) NOT NULL,
    cost_price DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    batch_id UUID NOT NULL REFERENCES batches(id)
);

-- ==========================================
-- 5. STOCK MOVEMENTS & ADJUSTMENTS
-- ==========================================

CREATE TABLE movement_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT')),
    is_system BOOLEAN DEFAULT false NOT NULL
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_number VARCHAR(100) UNIQUE NOT NULL,
    item_id UUID NOT NULL REFERENCES inventory_items(id),
    batch_id UUID REFERENCES batches(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT')),
    quantity DECIMAL(12, 4) NOT NULL, -- stored in base unit
    cost_price DECIMAL(12, 2) NOT NULL,
    reason_id UUID NOT NULL REFERENCES movement_reasons(id),
    created_by UUID NOT NULL REFERENCES profiles(id),
    reference_id UUID,
    reference_type VARCHAR(50),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 6. UTILITIES (NOTIFICATIONS, LOGS, SETTINGS)
-- ==========================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRY_ALERT', 'PENDING_APPROVAL')),
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 7. FUTURE READY TABLES (RECIPES & MENU)
-- ==========================================

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    selling_price DECIMAL(12, 2) NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    yield_quantity DECIMAL(12, 4) NOT NULL,
    yield_unit_id UUID NOT NULL REFERENCES units(id),
    instructions TEXT,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE recipe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity DECIMAL(12, 4) NOT NULL, -- in ingredient item's base unit
    waste_percentage DECIMAL(5, 2) DEFAULT 0.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Helper SQL Function: Extract active user role code
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS VARCHAR AS $$
  SELECT r.name FROM profiles p
  JOIN roles r ON p.role_id = r.id
  WHERE p.id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Profiles & Roles Policies
CREATE POLICY "Allow public read access to roles" 
    ON roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to view profiles" 
    ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin to manage user profiles" 
    ON profiles FOR ALL TO authenticated 
    USING (current_user_role() = 'ADMIN');

-- Master Data
CREATE POLICY "Allow authenticated read to categories" 
    ON categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to categories" 
    ON categories FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated read to subcategories" 
    ON subcategories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to subcategories" 
    ON subcategories FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated read to suppliers" 
    ON suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to suppliers" 
    ON suppliers FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated read to units" 
    ON units FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to units" 
    ON units FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated read to unit conversions" 
    ON unit_conversions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to unit conversions" 
    ON unit_conversions FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated read to items" 
    ON inventory_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager write to items" 
    ON inventory_items FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'MANAGER'));

-- Transactions, Batches, PO, GRN (Writes via Backend Service Role)
CREATE POLICY "Allow read to batches" 
    ON batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to purchase orders" 
    ON purchase_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to purchase order items" 
    ON purchase_order_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow create PO to all authenticated users" 
    ON purchase_orders FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow create PO items to all authenticated users" 
    ON purchase_order_items FOR INSERT TO authenticated 
    WITH CHECK (true);

CREATE POLICY "Allow read to grns" 
    ON grns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to grn items" 
    ON grn_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to stock movements" 
    ON stock_movements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to movement reasons" 
    ON movement_reasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read to notifications" 
    ON notifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update notifications to mark read" 
    ON notifications FOR UPDATE TO authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow read to system settings" 
    ON system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin to manage settings" 
    ON system_settings FOR ALL TO authenticated 
    USING (current_user_role() = 'ADMIN');

-- Server-restricted writes policies (Must bypass client updates)
CREATE POLICY "Restrict writing GRNs to service role"
    ON grns FOR ALL TO service_role USING (true);

CREATE POLICY "Restrict writing GRN items to service role"
    ON grn_items FOR ALL TO service_role USING (true);

CREATE POLICY "Restrict stock movements writing to service role"
    ON stock_movements FOR ALL TO service_role USING (true);

CREATE POLICY "Restrict batches writing to service role"
    ON batches FOR ALL TO service_role USING (true);

CREATE POLICY "Restrict audit logs writing to service role"
    ON audit_logs FOR ALL TO service_role USING (true);

CREATE POLICY "Allow admin/owner read to audit logs" 
    ON audit_logs FOR SELECT TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER'));

-- ==========================================
-- 9. SYSTEM DATABASE VIEWS FOR METRICS
-- ==========================================

CREATE OR REPLACE VIEW dashboard_metrics_view AS
SELECT 
  (SELECT COUNT(*) FROM inventory_items WHERE status = 'ACTIVE') AS total_items,
  COALESCE((SELECT SUM(available_qty * cost_price) 
            FROM batches b 
            JOIN inventory_items i ON b.item_id = i.id 
            WHERE b.status = 'ACTIVE'), 0.00) AS total_inventory_value,
  (SELECT COUNT(DISTINCT item_id) 
   FROM (
     SELECT item_id, SUM(available_qty) as total_qty 
     FROM batches 
     WHERE status = 'ACTIVE' 
     GROUP BY item_id
   ) q 
   JOIN inventory_items i ON q.item_id = i.id 
   WHERE q.total_qty <= i.reorder_level AND q.total_qty > 0) AS low_stock_items,
  (SELECT COUNT(DISTINCT item_id) 
   FROM (
     SELECT item_id, SUM(available_qty) as total_qty 
     FROM batches 
     WHERE status = 'ACTIVE' 
     GROUP BY item_id
   ) q 
   RIGHT JOIN inventory_items i ON q.item_id = i.id 
   WHERE q.total_qty IS NULL OR q.total_qty = 0) AS out_of_stock_items,
  (SELECT COUNT(*) FROM batches WHERE expiry_date <= (CURRENT_DATE + INTERVAL '30 days') AND status = 'ACTIVE') AS expiring_items_30_days,
  COALESCE((SELECT SUM(outstanding_balance) FROM suppliers WHERE status = 'ACTIVE'), 0.00) AS total_supplier_outstanding;

-- Allow reading of dashboard views
GRANT SELECT ON dashboard_metrics_view TO authenticated;

-- ==========================================
-- 10. SYSTEM DATABASE PROCEDURES & TRANSACTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION process_grn_transaction(
  p_po_id UUID,
  p_supplier_id UUID,
  p_received_by UUID,
  p_invoice_number VARCHAR,
  p_total_amount DECIMAL,
  p_remarks TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_grn_id UUID;
  v_grn_number VARCHAR(100);
  v_seq INT;
  v_date_str VARCHAR(8);
  v_item RECORD;
  v_batch_id UUID;
  v_base_qty DECIMAL;
  v_cost_base DECIMAL;
  v_p_to_b DECIMAL;
  v_reason_id UUID;
  v_stk_number VARCHAR(100);
BEGIN
  -- 1. Generate GRN Number
  v_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM grns WHERE to_char(created_at, 'YYYYMMDD') = v_date_str;
  v_grn_number := 'GRN-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');

  -- 2. Insert GRN
  INSERT INTO grns (grn_number, po_id, supplier_id, received_by, invoice_number, total_amount, remarks)
  VALUES (v_grn_number, p_po_id, p_supplier_id, p_received_by, p_invoice_number, p_total_amount, p_remarks)
  RETURNING id INTO v_grn_id;

  -- 3. Get Stock In reason id
  SELECT id INTO v_reason_id FROM movement_reasons WHERE name = 'Purchased Stock' LIMIT 1;

  -- 4. Process Items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    item_id UUID,
    quantity DECIMAL,
    cost_price DECIMAL,
    batch_number VARCHAR,
    expiry_date DATE
  ) LOOP
    -- Fetch item factors
    SELECT purchase_to_base_factor INTO v_p_to_b 
    FROM inventory_items WHERE id = v_item.item_id;

    v_base_qty := v_item.quantity * v_p_to_b;
    v_cost_base := v_item.cost_price / v_p_to_b;

    -- Upsert Batch
    INSERT INTO batches (batch_number, item_id, supplier_id, received_date, expiry_date, current_qty, available_qty, status)
    VALUES (v_item.batch_number, v_item.item_id, p_supplier_id, CURRENT_DATE, v_item.expiry_date, v_base_qty, v_base_qty, 'ACTIVE')
    ON CONFLICT (item_id, batch_number) DO UPDATE SET
      current_qty = batches.current_qty + v_base_qty,
      available_qty = batches.available_qty + v_base_qty,
      status = 'ACTIVE'
    RETURNING id INTO v_batch_id;

    -- Insert GRN Item
    INSERT INTO grn_items (grn_id, item_id, quantity, cost_price, total_cost, batch_id)
    VALUES (v_grn_id, v_item.item_id, v_item.quantity, v_item.cost_price, v_item.quantity * v_item.cost_price, v_batch_id);

    -- Log Stock Movement
    SELECT 'STK-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*1000000)::text, 6, '0') INTO v_stk_number;
    
    INSERT INTO stock_movements (movement_number, item_id, batch_id, type, quantity, cost_price, reason_id, created_by, reference_id, reference_type, status)
    VALUES (v_stk_number, v_item.item_id, v_batch_id, 'STOCK_IN', v_base_qty, v_cost_base, v_reason_id, p_received_by, v_grn_id, 'GRN', 'APPROVED');
  END LOOP;

  -- 5. Update Supplier Balance
  UPDATE suppliers 
  SET outstanding_balance = outstanding_balance + p_total_amount 
  WHERE id = p_supplier_id;

  -- 6. If PO exists, mark it COMPLETED
  IF p_po_id IS NOT NULL THEN
    UPDATE purchase_orders 
    SET status = 'COMPLETED' 
    WHERE id = p_po_id;
  END IF;

  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION process_stock_movement_transaction(
  p_item_id UUID,
  p_batch_id UUID,
  p_type VARCHAR,
  p_qty_base DECIMAL,
  p_cost_base DECIMAL,
  p_reason_id UUID,
  p_created_by UUID,
  p_status VARCHAR,
  p_reference_id UUID,
  p_reference_type VARCHAR
) RETURNS UUID AS $$
DECLARE
  v_movement_id UUID;
  v_stk_number VARCHAR(100);
  v_seq INT;
  v_date_str VARCHAR(8);
  v_current_qty DECIMAL;
BEGIN
  -- 1. If status is APPROVED and batch is provided, update batch balance
  IF p_status = 'APPROVED' AND p_batch_id IS NOT NULL THEN
    IF p_type = 'STOCK_IN' THEN
      UPDATE batches 
      SET current_qty = current_qty + p_qty_base, available_qty = available_qty + p_qty_base
      WHERE id = p_batch_id;
    ELSIF p_type = 'STOCK_OUT' OR p_type = 'ADJUSTMENT' THEN
      -- Check sufficient available stock
      SELECT available_qty INTO v_current_qty FROM batches WHERE id = p_batch_id;
      IF v_current_qty < p_qty_base THEN
        RAISE EXCEPTION 'Insufficient stock in selected batch. Available: %, Requested: %', v_current_qty, p_qty_base;
      END IF;

      UPDATE batches 
      SET current_qty = current_qty - p_qty_base, available_qty = available_qty - p_qty_base
      WHERE id = p_batch_id;
    END IF;

    -- Update batch status if out of stock
    UPDATE batches
    SET status = 'OUT_OF_STOCK'
    WHERE id = p_batch_id AND current_qty <= 0;
  END IF;

  -- 2. Generate stock movement code
  v_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM stock_movements WHERE to_char(created_at, 'YYYYMMDD') = v_date_str;
  v_stk_number := 'STK-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');

  -- 3. Log stock movement
  INSERT INTO stock_movements (
    movement_number, item_id, batch_id, type, quantity, cost_price, reason_id, created_by, reference_id, reference_type, status
  ) VALUES (
    v_stk_number, p_item_id, p_batch_id, p_type, p_qty_base, p_cost_base, p_reason_id, p_created_by, p_reference_id, p_reference_type, p_status
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- SCHEMA UPDATE: Supplier PO Payments
-- ==========================================

-- 1. Add payment tracking to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID'));
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 3) DEFAULT 0.000;

-- 2. Create supplier_payments table to log actual payments
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    amount DECIMAL(12, 3) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE NOT NULL,
    reference_number VARCHAR(100),
    remarks TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to supplier_payments" 
    ON supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Restrict writing supplier_payments to service role"
    ON supplier_payments FOR ALL TO service_role USING (true);

-- 3. Create payment_allocations table to track which POs were paid by which payment
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    amount DECIMAL(12, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read to payment_allocations" 
    ON payment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Restrict writing payment_allocations to service role"
    ON payment_allocations FOR ALL TO service_role USING (true);

-- 4. Create RPC to process supplier payments securely
CREATE OR REPLACE FUNCTION process_supplier_payment_transaction(
    p_supplier_id UUID,
    p_amount DECIMAL,
    p_payment_method VARCHAR,
    p_payment_date DATE,
    p_reference_number VARCHAR,
    p_remarks TEXT,
    p_created_by UUID,
    p_allocations JSONB -- array of { "po_id": "uuid", "amount": decimal }
) RETURNS UUID AS $$
DECLARE
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
    v_seq INT;
    v_date_str VARCHAR(8);
    v_allocation RECORD;
    v_po RECORD;
    v_new_paid_amount DECIMAL;
    v_new_payment_status VARCHAR;
BEGIN
    -- 1. Generate Payment Number
    v_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM supplier_payments WHERE to_char(created_at, 'YYYYMMDD') = v_date_str;
    v_payment_number := 'PAY-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');

    -- 2. Insert Payment Record
    INSERT INTO supplier_payments (
        payment_number, supplier_id, amount, payment_method, payment_date, reference_number, remarks, created_by
    ) VALUES (
        v_payment_number, p_supplier_id, p_amount, p_payment_date, p_reference_number, p_remarks, p_created_by
    ) RETURNING id INTO v_payment_id;

    -- 3. Deduct from Supplier Outstanding Balance
    UPDATE suppliers 
    SET outstanding_balance = outstanding_balance - p_amount 
    WHERE id = p_supplier_id;

    -- 4. Process Allocations
    FOR v_allocation IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(
        po_id UUID,
        amount DECIMAL
    )
    LOOP
        IF v_allocation.amount > 0 THEN
            -- Insert Allocation
            INSERT INTO payment_allocations (payment_id, po_id, amount)
            VALUES (v_payment_id, v_allocation.po_id, v_allocation.amount);

            -- Fetch current PO details
            SELECT total_amount, paid_amount INTO v_po FROM purchase_orders WHERE id = v_allocation.po_id;
            
            v_new_paid_amount := v_po.paid_amount + v_allocation.amount;
            
            -- Determine new status
            IF v_new_paid_amount >= v_po.total_amount THEN
                v_new_payment_status := 'PAID';
            ELSIF v_new_paid_amount > 0 THEN
                v_new_payment_status := 'PARTIAL';
            ELSE
                v_new_payment_status := 'UNPAID';
            END IF;

            -- Update PO
            UPDATE purchase_orders 
            SET paid_amount = v_new_paid_amount, payment_status = v_new_payment_status
            WHERE id = v_allocation.po_id;
        END IF;
    END LOOP;

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

