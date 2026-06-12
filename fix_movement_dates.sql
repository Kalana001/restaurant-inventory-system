-- Fix stock movements for these receipts to show 11 June 2026 instead of 12 June 2026
-- Run this in the Supabase SQL Editor: https://app.supabase.com → SQL Editor

UPDATE stock_movements
SET created_at = '2026-06-11T12:00:00.000Z'
WHERE reference_type IN (
  'RCP-20260612-5526',
  'RCP-20260612-4610',
  'RCP-20260612-3837',
  'RCP-20260612-3746',
  'RCP-20260612-5862',
  'RCP-20260611-9525'
);

-- Verify the update worked (run this after the UPDATE above)
SELECT reference_type, created_at 
FROM stock_movements 
WHERE reference_type IN (
  'RCP-20260612-5526',
  'RCP-20260612-4610',
  'RCP-20260612-3837',
  'RCP-20260612-3746',
  'RCP-20260612-5862',
  'RCP-20260611-9525'
)
ORDER BY reference_type;
