CREATE TABLE IF NOT EXISTS transportation_costs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    reason TEXT NOT NULL,
    cost NUMERIC(10, 2) NOT NULL,
    department TEXT NOT NULL CHECK (department IN ('JAT', 'KITCHEN')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE transportation_costs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Enable all for authenticated users" 
ON transportation_costs FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);
