INSERT INTO units (name, abbreviation) VALUES
('Can', 'can'),
('Tin', 'tin')
ON CONFLICT (abbreviation) DO NOTHING;
