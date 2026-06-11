-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Creates supplier_payments table for recording payment history

CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'By Restaurant',
  notes TEXT,
  paid_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Enable RLS
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and insert
CREATE POLICY "Allow authenticated read" ON supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON supplier_payments FOR INSERT TO authenticated WITH CHECK (true);
