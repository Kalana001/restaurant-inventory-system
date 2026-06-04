-- ==========================================
-- 1. SEED ROLES
-- ==========================================
INSERT INTO roles (id, name, description) VALUES
('b3874b3d-4cfa-4e78-bc46-88e89f8a379f', 'ADMIN', 'System Administrator with full access'),
('c3f87d4a-5c12-4d0f-90e8-6e54f7623910', 'OWNER', 'Restaurant Owner with full operational visibility'),
('d508e76f-c12b-42fa-b762-b91264c76b91', 'MANAGER', 'Inventory Manager with approval authority'),
('a126f345-30fa-40f8-bc71-12f8a490b8f1', 'STORE_KEEPER', 'Store Keeper logging stock items and GRNs')
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- 2. SEED PERMISSIONS
-- ==========================================
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
('users:manage', 'Create, update, delete user accounts and assign roles')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- 3. MAP ROLE-PERMISSIONS
-- ==========================================
-- Clear existing maps to refresh during re-run
DELETE FROM role_permissions;

-- Helper to map Admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b3874b3d-4cfa-4e78-bc46-88e89f8a379f', id FROM permissions;

-- Helper to map Owner permissions (same as Admin)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'c3f87d4a-5c12-4d0f-90e8-6e54f7623910', id FROM permissions;

-- Helper to map Manager permissions (everything except user and settings management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'd508e76f-c12b-42fa-b762-b91264c76b91', id FROM permissions
WHERE code NOT IN ('users:manage', 'settings:update');

-- Helper to map Store Keeper permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'a126f345-30fa-40f8-bc71-12f8a490b8f1', id FROM permissions
WHERE code IN (
    'items:read',
    'suppliers:read',
    'po:read',
    'po:create',
    'grn:read',
    'grn:create',
    'stock:read',
    'stock:adjust',
    'dashboard:read',
    'reports:read'
);

-- ==========================================
-- 4. SEED STANDARD MEASUREMENT UNITS
-- ==========================================
INSERT INTO units (id, name, abbreviation) VALUES
('b38fa1b9-3e0f-4889-9a74-2ab6e91129f1', 'Kilogram', 'kg'),
('d08912e7-578f-4cb1-80fc-ef38cb27161b', 'Gram', 'g'),
('cb23f81b-c12a-4be7-ab8c-bc54f89d38fe', 'Litre', 'litre'),
('a59b71e0-3bf0-4d89-994c-e83fa2d3161c', 'Millilitre', 'ml'),
('c5f17d23-289f-4310-a92c-6872fae38b30', 'Pieces', 'pcs'),
('ef08e923-a128-40fa-b12e-1e9a2d83c21c', 'Box', 'box'),
('fa12f38d-cdfa-42f8-bd03-c3f2d29e3ef1', 'Packet', 'packet'),
('0a91f34d-1a8e-49b0-bc32-1e9f8a37db8e', 'Bottle', 'bottle')
ON CONFLICT (abbreviation) DO NOTHING;

-- ==========================================
-- 5. SEED STANDARD UNIT CONVERSIONS
-- ==========================================
INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor) VALUES
-- kg to g (multiply by 1000)
('b38fa1b9-3e0f-4889-9a74-2ab6e91129f1', 'd08912e7-578f-4cb1-80fc-ef38cb27161b', 1000.000000),
-- g to kg (multiply by 0.001)
('d08912e7-578f-4cb1-80fc-ef38cb27161b', 'b38fa1b9-3e0f-4889-9a74-2ab6e91129f1', 0.001000),
-- litre to ml (multiply by 1000)
('cb23f81b-c12a-4be7-ab8c-bc54f89d38fe', 'a59b71e0-3bf0-4d89-994c-e83fa2d3161c', 1000.000000),
-- ml to litre (multiply by 0.001)
('a59b71e0-3bf0-4d89-994c-e83fa2d3161c', 'cb23f81b-c12a-4be7-ab8c-bc54f89d38fe', 0.001000)
ON CONFLICT (from_unit_id, to_unit_id) DO NOTHING;

-- ==========================================
-- 6. SEED DEFAULT MOVEMENT REASONS
-- ==========================================
INSERT INTO movement_reasons (name, type, is_system) VALUES
('Purchased Stock', 'STOCK_IN', true),
('Returned Stock', 'STOCK_IN', true),
('Correction In', 'STOCK_IN', true),
('Kitchen Usage', 'STOCK_OUT', true),
('Damaged', 'STOCK_OUT', true),
('Expired', 'STOCK_OUT', true),
('Returned to Supplier', 'STOCK_OUT', true),
('Internal Use', 'STOCK_OUT', true),
('Promotion', 'STOCK_OUT', true),
('Correction Out', 'STOCK_OUT', true)
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- 7. SEED SYSTEM CONFIGURATION SETTINGS
-- ==========================================
INSERT INTO system_settings (key, value, description) VALUES
('REQUIRE_PURCHASE_APPROVAL', 'false', 'Enable/disable workflow approval for Purchase Orders before ordering.'),
('REQUIRE_ADJUSTMENT_APPROVAL', 'true', 'Enable/disable approval workflow for stock adjustments (waste, corrections).'),
('REQUIRE_DELETION_APPROVAL', 'true', 'Require approval before deleting items from inventory.'),
('RESTAURANT_NAME', 'Lanka Spices Dine-In', 'Name of the restaurant used on report branding.')
ON CONFLICT (key) DO NOTHING;
