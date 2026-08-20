import { createClient } from '@supabase/supabase-js';

export function withAuth(handler, requiredRole = null) {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server misconfiguration: missing Supabase environment variables.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No session token provided.' });
    }

    const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    if (verifyError || !user) {
      return res.status(401).json({ error: `Unauthorized: ${verifyError?.message || 'Invalid session'}` });
    }

    if (requiredRole) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('roles(name)')
        .eq('id', user.id)
        .single();

      const roleName = profile?.roles?.name?.toLowerCase();
      if (profileError || roleName !== requiredRole.toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
      }
    }

    req.user = user;
    req.supabaseAdmin = supabaseAdmin;
    return handler(req, res);
  };
}
