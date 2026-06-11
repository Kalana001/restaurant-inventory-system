-- Drop old admin/manager-only policies
DROP POLICY IF EXISTS "Allow admin/manager write to categories" ON categories;
DROP POLICY IF EXISTS "Allow admin/manager write to subcategories" ON subcategories;
DROP POLICY IF EXISTS "Allow admin/manager write to suppliers" ON suppliers;
DROP POLICY IF EXISTS "Allow admin/manager write to units" ON units;
DROP POLICY IF EXISTS "Allow admin/manager write to unit_conversions" ON unit_conversions;
DROP POLICY IF EXISTS "Allow admin/manager write to inventory_items" ON inventory_items;

-- Create new policies allowing ADMIN, OWNER, and MANAGER roles
CREATE POLICY "Allow admin/owner/manager write to categories" 
    ON categories FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));

CREATE POLICY "Allow admin/owner/manager write to subcategories" 
    ON subcategories FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));

CREATE POLICY "Allow admin/owner/manager write to suppliers" 
    ON suppliers FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));

CREATE POLICY "Allow admin/owner/manager write to units" 
    ON units FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));

CREATE POLICY "Allow admin/owner/manager write to unit_conversions" 
    ON unit_conversions FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));

CREATE POLICY "Allow admin/owner/manager write to inventory_items" 
    ON inventory_items FOR ALL TO authenticated 
    USING (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'))
    WITH CHECK (current_user_role() IN ('ADMIN', 'OWNER', 'MANAGER'));
