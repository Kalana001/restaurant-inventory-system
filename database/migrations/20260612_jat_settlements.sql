-- ==========================================
-- Migration: Create JAT Settlements Table
-- ==========================================

CREATE TABLE jat_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE')),
    for_date DATE, -- Optional: If specific to a day's stock out
    cheque_number VARCHAR(100),
    cheque_realize_date DATE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'BOUNCED')),
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE jat_settlements ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Users can view all JAT settlements" ON jat_settlements
    FOR SELECT USING (true);

CREATE POLICY "Users can insert JAT settlements" ON jat_settlements
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update JAT settlements" ON jat_settlements
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete JAT settlements" ON jat_settlements
    FOR DELETE USING (true);

-- No updated_at trigger needed if we don't have an updated_at column
