import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Validate the Service Role Key
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return res.status(500).json({ 
      error: 'Admin service is not configured. Please add SUPABASE_SERVICE_ROLE_KEY to your Vercel environment variables and redeploy.' 
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });

  // 2. Verify the Authorization Token
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
  if (verifyError || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // 3. Verify the user is an Admin
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('roles(name)')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.roles?.name?.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  // 4. Handle the Request
  const { action, payload } = req.body;

  try {
    if (action === 'createUser') {
      const { email, password, username, roleId, status } = payload;
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authData.user.id,
            email,
            username,
            role_id: roleId,
            status
          });
          
        if (insertError) throw insertError;
      }

      return res.status(200).json({ success: true, user: authData.user });
    } 
    
    else if (action === 'updateUser') {
      const { id, password } = payload;
      
      const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(
        id,
        { password }
      );
      
      if (pwdError) throw pwdError;
      return res.status(200).json({ success: true });
    }
    
    else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
  } catch (error) {
    console.error('manageUser error:', error);
    return res.status(400).json({ error: error.message || 'Unknown error occurred' });
  }
}
