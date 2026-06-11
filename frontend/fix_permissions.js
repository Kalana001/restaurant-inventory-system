import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixPermissions() {
  console.log('Fetching all roles and permissions...');

  const { data: roles } = await supabase.from('roles').select('id, name');
  const { data: permissions } = await supabase.from('permissions').select('id, code');

  if (!roles || !permissions) {
    console.error('Failed to fetch roles or permissions');
    return;
  }

  console.log('Roles:', roles.map(r => r.name));
  console.log('Permissions:', permissions.map(p => p.code));

  const getPermId = (code) => permissions.find(p => p.code === code)?.id;
  const getRoleId = (name) => roles.find(r => r.name.toUpperCase() === name.toUpperCase())?.id;

  // Define what each role SHOULD have
  const roleMappings = {
    'ADMIN': permissions.map(p => p.code),   // Admin gets everything
    'OWNER': permissions.map(p => p.code),   // Owner gets everything
    'MANAGER': permissions.filter(p => !['users:manage', 'settings:update', 'security:manage'].includes(p.code)).map(p => p.code),
    'STORE_KEEPER': [
      'items:read', 'items:create', 'items:update',
      'suppliers:read',
      'po:read', 'po:create',
      'grn:read', 'grn:create',
      'stock:read', 'stock:adjust',
      'dashboard:read',
      'reports:read',
      'activity:read'
    ]
  };

  for (const [roleName, permCodes] of Object.entries(roleMappings)) {
    const roleId = getRoleId(roleName);
    if (!roleId) {
      console.log(`Role ${roleName} not found, skipping.`);
      continue;
    }

    // Get existing permissions for this role
    const { data: existingRolePerms } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);

    const existingPermIds = new Set((existingRolePerms || []).map(rp => rp.permission_id));

    // Find missing ones
    const toInsert = [];
    for (const code of permCodes) {
      const permId = getPermId(code);
      if (permId && !existingPermIds.has(permId)) {
        toInsert.push({ role_id: roleId, permission_id: permId });
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('role_permissions').insert(toInsert);
      if (error) console.error(`Error inserting for ${roleName}:`, error);
      else console.log(`✓ Added ${toInsert.length} missing permissions to ${roleName}`);
    } else {
      console.log(`✓ ${roleName} already has all required permissions`);
    }
  }

  // Report current state
  console.log('\n--- Current Permission Summary ---');
  for (const role of roles) {
    const { data: rp } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', role.id);
    console.log(`${role.name}: ${rp?.length || 0} permissions`);
  }

  console.log('\nDone!');
}

fixPermissions().catch(console.error);
