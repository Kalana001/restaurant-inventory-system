-- Migration: Create daily_financial_summaries table for Profit & Loss tracking
-- Run this in Supabase SQL Editor if you prefer a separate dedicated table:

CREATE TABLE IF NOT EXISTS public.daily_financial_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE UNIQUE NOT NULL,
  
  -- Income Fields
  income_cash NUMERIC(12,2) DEFAULT 0,
  income_card NUMERIC(12,2) DEFAULT 0,
  income_pickme NUMERIC(12,2) DEFAULT 0,
  income_special NUMERIC(12,2) DEFAULT 0,
  income_special_note TEXT,
  total_income NUMERIC(12,2) DEFAULT 0,

  -- Cost & Kitchen Expenses
  expense_stock_out NUMERIC(12,2) DEFAULT 0,
  expense_daily_purchases NUMERIC(12,2) DEFAULT 0,
  expense_transport NUMERIC(12,2) DEFAULT 0,
  expense_general NUMERIC(12,2) DEFAULT 0,
  
  -- Overheads & Labor
  expense_bank_charges NUMERIC(12,2) DEFAULT 0,
  expense_salary NUMERIC(12,2) DEFAULT 0,
  expense_epf_etf NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  expense_notes TEXT,

  -- Net Profit
  net_profit NUMERIC(12,2) DEFAULT 0,
  
  status VARCHAR(20) DEFAULT 'CONFIRMED',
  recorded_by UUID REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_financial_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" 
ON public.daily_financial_summaries 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
