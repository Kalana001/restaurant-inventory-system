import { PrismaClient, UserStatus, BatchStatus, MovementType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // ==========================================
  // 1. SEED PERMISSIONS
  // ==========================================
  const permissionsList = [
    // Inventory Items
    { code: 'items:read', description: 'View inventory items and stock levels' },
    { code: 'items:create', description: 'Create new inventory items' },
    { code: 'items:update', description: 'Edit existing inventory items' },
    { code: 'items:delete', description: 'Delete inventory items' },

    // Suppliers
    { code: 'suppliers:read', description: 'View supplier profiles and outstanding balances' },
    { code: 'suppliers:create', description: 'Create new supplier profiles' },
    { code: 'suppliers:update', description: 'Edit existing supplier profiles' },
    { code: 'suppliers:delete', description: 'Delete supplier profiles' },

    // Purchase Orders (PO)
    { code: 'po:read', description: 'View purchase orders' },
    { code: 'po:create', description: 'Create purchase orders' },
    { code: 'po:approve', description: 'Approve or reject purchase orders' },

    // Goods Received Notes (GRN)
    { code: 'grn:read', description: 'View goods received notes' },
    { code: 'grn:create', description: 'Create goods received notes and log incoming batches' },

    // Stock Movements & Adjustments
    { code: 'stock:read', description: 'View stock movements log' },
    { code: 'stock:adjust', description: 'Request manual stock adjustments' },
    { code: 'stock:approve', description: 'Approve or reject stock adjustments' },

    // Dashboard & Reports
    { code: 'dashboard:read', description: 'View dashboard metrics and summaries' },
    { code: 'reports:read', description: 'Generate and download inventory reports' },

    // System Settings & Users
    { code: 'settings:read', description: 'View system configuration parameters' },
    { code: 'settings:update', description: 'Modify system configuration parameters' },
    { code: 'users:read', description: 'View user accounts' },
    { code: 'users:manage', description: 'Create, update, delete user accounts and assign roles' },
  ];

  console.log('Seeding permissions...');
  const permissionsMap: { [key: string]: any } = {};
  for (const perm of permissionsList) {
    const createdPerm = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
    permissionsMap[perm.code] = createdPerm;
  }

  // ==========================================
  // 2. SEED ROLES
  // ==========================================
  console.log('Seeding roles...');
  const roles = {
    ADMIN: { name: 'ADMIN', description: 'System Administrator with full access' },
    OWNER: { name: 'OWNER', description: 'Restaurant Owner with full operational visibility' },
    MANAGER: { name: 'MANAGER', description: 'Inventory/Restaurant Manager managing stock and approvals' },
    STORE_KEEPER: { name: 'STORE_KEEPER', description: 'Store Keeper recording purchases and issuing items' },
  };

  const adminRole = await prisma.role.upsert({
    where: { name: roles.ADMIN.name },
    update: {},
    create: roles.ADMIN,
  });

  const ownerRole = await prisma.role.upsert({
    where: { name: roles.OWNER.name },
    update: {},
    create: roles.OWNER,
  });

  const managerRole = await prisma.role.upsert({
    where: { name: roles.MANAGER.name },
    update: {},
    create: roles.MANAGER,
  });

  const storeKeeperRole = await prisma.role.upsert({
    where: { name: roles.STORE_KEEPER.name },
    update: {},
    create: roles.STORE_KEEPER,
  });

  // ==========================================
  // 3. SEED ROLE-PERMISSION RELATIONSHIPS
  // ==========================================
  console.log('Mapping permissions to roles...');

  // Helper to map permissions
  const assignPermissionsToRole = async (roleId: string, allowedCodes: string[]) => {
    // Delete existing maps to refresh
    await prisma.rolePermission.deleteMany({ where: { roleId } });

    const rolePermData = allowedCodes.map(code => ({
      roleId,
      permissionId: permissionsMap[code].id,
    }));

    await prisma.rolePermission.createMany({ data: rolePermData });
  };

  // ADMIN and OWNER get all permissions
  const allPermissionCodes = permissionsList.map(p => p.code);
  await assignPermissionsToRole(adminRole.id, allPermissionCodes);
  await assignPermissionsToRole(ownerRole.id, allPermissionCodes);

  // MANAGER gets everything except user management & global settings updates
  const managerPermissionCodes = allPermissionCodes.filter(
    code => code !== 'users:manage' && code !== 'settings:update'
  );
  await assignPermissionsToRole(managerRole.id, managerPermissionCodes);

  // STORE KEEPER gets read access, PO creation, GRN creation, Stock adjustment requests
  const storeKeeperPermissionCodes = [
    'items:read',
    'suppliers:read',
    'po:read',
    'po:create',
    'grn:read',
    'grn:create',
    'stock:read',
    'stock:adjust',
    'dashboard:read',
    'reports:read', // Stock only reports handled in application logic or front-end filters
  ];
  await assignPermissionsToRole(storeKeeperRole.id, storeKeeperPermissionCodes);

  // ==========================================
  // 4. SEED ADMIN USER
  // ==========================================
  console.log('Seeding default administrator user...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password123', salt);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash, // Reset in case seed re-runs
    },
    create: {
      username: 'admin',
      email: 'admin@restaurant.com',
      passwordHash,
      roleId: adminRole.id,
      status: UserStatus.ACTIVE,
    },
  });

  // ==========================================
  // 5. SEED STANDARD MEASUREMENT UNITS
  // ==========================================
  console.log('Seeding standard units of measure...');
  const unitsList = [
    { name: 'Kilogram', abbreviation: 'kg' },
    { name: 'Gram', abbreviation: 'g' },
    { name: 'Litre', abbreviation: 'litre' },
    { name: 'Millilitre', abbreviation: 'ml' },
    { name: 'Pieces', abbreviation: 'pcs' },
    { name: 'Box', abbreviation: 'box' },
    { name: 'Packet', abbreviation: 'packet' },
    { name: 'Bottle', abbreviation: 'bottle' },
  ];

  const unitsMap: { [key: string]: any } = {};
  for (const unit of unitsList) {
    const createdUnit = await prisma.unit.upsert({
      where: { abbreviation: unit.abbreviation },
      update: { name: unit.name },
      create: unit,
    });
    unitsMap[unit.abbreviation] = createdUnit;
  }

  // ==========================================
  // 6. SEED STANDARD UNIT CONVERSIONS
  // ==========================================
  console.log('Seeding default unit conversions...');
  const conversions = [
    { from: 'kg', to: 'g', factor: 1000 },
    { from: 'g', to: 'kg', factor: 0.001 },
    { from: 'litre', to: 'ml', factor: 1000 },
    { from: 'ml', to: 'litre', factor: 0.001 },
  ];

  for (const conv of conversions) {
    await prisma.unitConversion.upsert({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: unitsMap[conv.from].id,
          toUnitId: unitsMap[conv.to].id,
        },
      },
      update: { factor: conv.factor },
      create: {
        fromUnitId: unitsMap[conv.from].id,
        toUnitId: unitsMap[conv.to].id,
        factor: conv.factor,
      },
    });
  }

  // ==========================================
  // 7. SEED MOVEMENT REASONS
  // ==========================================
  console.log('Seeding default stock movement reasons...');
  const reasons = [
    // STOCK_IN reasons
    { name: 'Purchased Stock', type: MovementType.STOCK_IN, isSystem: true },
    { name: 'Returned Stock', type: MovementType.STOCK_IN, isSystem: true },
    { name: 'Correction In', type: MovementType.STOCK_IN, isSystem: true },
    
    // STOCK_OUT reasons
    { name: 'Kitchen Usage', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Damaged', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Expired', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Returned to Supplier', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Internal Use', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Promotion', type: MovementType.STOCK_OUT, isSystem: true },
    { name: 'Correction Out', type: MovementType.STOCK_OUT, isSystem: true },
  ];

  for (const reason of reasons) {
    await prisma.movementReason.upsert({
      where: { name: reason.name },
      update: { type: reason.type },
      create: reason,
    });
  }

  // ==========================================
  // 8. SEED SYSTEM CONFIGURATION SETTINGS
  // ==========================================
  console.log('Seeding system settings configs...');
  const settingsList = [
    { key: 'REQUIRE_PURCHASE_APPROVAL', value: 'false', description: 'Enable/disable workflow approval for Purchase Orders before ordering.' },
    { key: 'REQUIRE_ADJUSTMENT_APPROVAL', value: 'true', description: 'Enable/disable approval workflow for stock adjustments (waste, corrections).' },
    { key: 'REQUIRE_DELETION_APPROVAL', value: 'true', description: 'Require approval before deleting items from inventory.' },
    { key: 'RESTAURANT_NAME', value: 'Lanka Spices Dine-In', description: 'Name of the restaurant used on report branding.' },
  ];

  for (const set of settingsList) {
    await prisma.systemSetting.upsert({
      where: { key: set.key },
      update: { description: set.description },
      create: set,
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch(e => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
