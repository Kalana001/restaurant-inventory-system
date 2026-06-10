import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  const newPermissions = [
    { code: 'activity:read', description: 'View activity logs and audit trails' },
    { code: 'roles:read', description: 'View roles and their permissions' },
    { code: 'roles:manage', description: 'Create and modify roles and permissions' },
    { code: 'security:manage', description: 'Manage system security settings' },
  ];

  for (const perm of newPermissions) {
    const { data, error } = await supabase.from('permissions').upsert([perm], { onConflict: 'code' });
    if (error) {
      console.error('Error inserting', perm.code, error);
    } else {
      console.log('Inserted/Updated', perm.code);
    }
  }

  // Also map these to the ADMIN role
  const { data: adminRole } = await supabase.from('roles').select('id').eq('name', 'ADMIN').single();
  
  if (adminRole) {
    for (const perm of newPermissions) {
      const { data: p } = await supabase.from('permissions').select('id').eq('code', perm.code).single();
      if (p) {
        await supabase.from('role_permissions').upsert({
          role_id: adminRole.id,
          permission_id: p.id
        }, { onConflict: 'role_id, permission_id' });
        console.log('Mapped', perm.code, 'to ADMIN');
      }
    }
  }

  console.log('Done!');
}

seed();
