-- 1. Add discount and payment fields to Purchase Orders
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL;

-- 2. Add item-level discount to Purchase Order Items
ALTER TABLE purchase_order_items
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL;

-- 3. Enhance supplier_payments to support PO linking and cheque realization dates
ALTER TABLE supplier_payments
ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cheque_realize_date DATE;
