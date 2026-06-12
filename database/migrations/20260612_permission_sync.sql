-- ==========================================
-- Migration: Sync Permissions & Admin/Owner Access
-- ==========================================

-- 1. Ensure all permissions exist in the permissions table
INSERT INTO permissions (code, description) VALUES
  ('items:read', 'View inventory items and stock levels'),
  ('items:create', 'Create new inventory items'),
  ('items:update', 'Edit existing inventory items'),
  ('items:delete', 'Delete inventory items'),
  ('suppliers:read', 'View supplier profiles and outstanding balances'),
  ('suppliers:create', 'Create new supplier profiles'),
  ('suppliers:update', 'Edit existing supplier profiles'),
  ('suppliers:delete', 'Delete supplier profiles'),
  ('po:read', 'View purchase orders'),
  ('po:create', 'Create purchase orders'),
  ('po:approve', 'Approve or reject purchase orders'),
  ('grn:read', 'View goods received notes'),
  ('grn:create', 'Create goods received notes and log incoming batches'),
  ('stock:read', 'View stock movements log'),
  ('stock:adjust', 'Request manual stock adjustments'),
  ('stock:approve', 'Approve or reject stock adjustments'),
  ('dashboard:read', 'View dashboard metrics and summaries'),
  ('reports:read', 'Generate and download inventory reports'),
  ('settings:read', 'View system configuration parameters'),
  ('settings:update', 'Modify system configuration parameters'),
  ('users:read', 'View user accounts'),
  ('users:manage', 'Create, update, delete user accounts and assign roles'),
  ('activity:read', 'View activity logs and audit trails'),
  ('roles:read', 'View roles and their permissions'),
  ('roles:manage', 'Create and modify roles and permissions'),
  ('security:manage', 'Manage system security settings')
ON CONFLICT (code) DO NOTHING;

-- 2. Assign ALL permissions to the Owner and Admin roles
DO $$
DECLARE
    owner_role_id UUID;
    admin_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO owner_role_id FROM roles WHERE name = 'Owner';
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';

    -- Insert all permissions for Owner if they don't already have them
    IF owner_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT owner_role_id, id FROM permissions
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END IF;

    -- Insert all permissions for Admin if they don't already have them
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, id FROM permissions
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END IF;

END $$;
