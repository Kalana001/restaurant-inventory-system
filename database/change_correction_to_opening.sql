-- Update reason from 'Correction In' to 'Opening Stock' for manual stock adjustments
UPDATE stock_movements
SET reason_id = (SELECT id FROM movement_reasons WHERE name = 'Opening Stock' LIMIT 1)
WHERE reason_id = (SELECT id FROM movement_reasons WHERE name = 'Correction In' LIMIT 1);
