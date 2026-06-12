-- Migration: Create daily_purchases table

CREATE TABLE IF NOT EXISTS public.daily_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  item_name text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  total_cost numeric(12,2) NOT NULL DEFAULT 0,
  department text NOT NULL, -- 'JAT' or 'KITCHEN'
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT daily_purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.daily_purchases ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for all authenticated users" 
ON public.daily_purchases FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON public.daily_purchases FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" 
ON public.daily_purchases FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" 
ON public.daily_purchases FOR DELETE 
TO authenticated 
USING (true);
