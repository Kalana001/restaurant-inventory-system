import { createClient } from '@supabase/supabase-js';
import { withAuth } from './_lib/withAuth.js';

async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { action, payload } = req.body;

  // Input validation
  if (!action || !payload) {
    return res.status(400).json({ error: 'Missing action or payload.' });
  }

  try {
    if (action === 'createUser') {
      const { email, password, username, roleId, status } = payload;

      // Validate inputs
      if (!email || !password || !username || !roleId) {
        return res.status(400).json({ error: 'Missing required fields: email, password, username, roleId.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }
      if (username.length > 50) {
        return res.status(400).json({ error: 'Username must not exceed 50 characters.' });
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { username: username.trim() }
      });
      if (authError) throw authError;

      if (authData.user) {
        const { error: insertError } = await supabaseAdmin.from('profiles').insert({
          id: authData.user.id,
          email: email.trim().toLowerCase(),
          username: username.trim(),
          role_id: roleId,
          status: status || 'ACTIVE'
        });
        if (insertError) throw insertError;
      }

      return res.status(200).json({ success: true });

    } else if (action === 'updateUser') {
      const { id, password } = payload;

      if (!id) return res.status(400).json({ error: 'Missing user id.' });
      if (password && password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (pwdError) throw pwdError;

      return res.status(200).json({ success: true });

    } else {
      return res.status(400).json({ error: 'Invalid action.' });
    }

  } catch (error) {
    console.error('manageUser error:', error);
    return res.status(400).json({ error: error.message || 'An error occurred.' });
  }
}

// Protect with withAuth middleware — requires admin role
export default withAuth(handler, 'admin');
