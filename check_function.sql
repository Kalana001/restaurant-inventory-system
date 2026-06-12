-- FIX: Update process_stock_movement_transaction to accept p_movement_number parameter
-- This prevents duplicate key errors when bulk submissions happen rapidly.
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor

-- First, check what the current function signature looks like
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'process_stock_movement_transaction';
