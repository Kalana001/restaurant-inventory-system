-- Migration: Staff Members, Staff Attendance, and Staff Salaries
-- Safe table creation with RLS enabled and authenticated policies

CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  default_daily_rate NUMERIC(12, 2) DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

CREATE TABLE IF NOT EXISTS staff_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'RESTAURANT')),
  reason_type TEXT NOT NULL CHECK (reason_type IN ('DAILY_WAGE', 'ADVANCE', 'MONTHLY_SALARY', 'OTHER')),
  reason_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_salaries ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_members' AND policyname = 'Allow authenticated users full access to staff_members') THEN
    CREATE POLICY "Allow authenticated users full access to staff_members" ON staff_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_attendance' AND policyname = 'Allow authenticated users full access to staff_attendance') THEN
    CREATE POLICY "Allow authenticated users full access to staff_attendance" ON staff_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_salaries' AND policyname = 'Allow authenticated users full access to staff_salaries') THEN
    CREATE POLICY "Allow authenticated users full access to staff_salaries" ON staff_salaries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
