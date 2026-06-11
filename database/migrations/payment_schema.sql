-- ==========================================
-- SCHEMA UPDATE: Supplier PO Payments
-- ==========================================

-- 1. Add payment tracking to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID'));
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 3) DEFAULT 0.000;

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
    v_new_amount_paid DECIMAL;
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
            SELECT total_amount, amount_paid INTO v_po FROM purchase_orders WHERE id = v_allocation.po_id;
            
            v_new_amount_paid := v_po.amount_paid + v_allocation.amount;
            
            -- Determine new status
            IF v_new_amount_paid >= v_po.total_amount THEN
                v_new_payment_status := 'PAID';
            ELSIF v_new_amount_paid > 0 THEN
                v_new_payment_status := 'PARTIAL';
            ELSE
                v_new_payment_status := 'UNPAID';
            END IF;

            -- Update PO
            UPDATE purchase_orders 
            SET amount_paid = v_new_amount_paid, payment_status = v_new_payment_status
            WHERE id = v_allocation.po_id;
        END IF;
    END LOOP;

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
