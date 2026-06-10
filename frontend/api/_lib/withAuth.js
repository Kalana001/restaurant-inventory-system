import { createClient } from '@supabase/supabase-js';

/**
 * withAuth - Reusable server-side auth middleware for Vercel API routes.
 * Verifies the Bearer token from the Authorization header using the Supabase admin client.
 * Optionally enforces a required role (e.g. 'admin').
 *
 * Usage:
 *   export default withAuth(handler);
 *   export default withAuth(handler, 'admin');
 */
export function withAuth(handler, requiredRole = null) {
  return async (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server misconfiguration: missing environment variables.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Extract Bearer token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No session token provided.' });
    }

    // Verify token with Supabase
    const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    if (verifyError || !user) {
      return res.status(401).json({ error: `Unauthorized: ${verifyError?.message || 'Invalid session'}` });
    }

    // If a role is required, check the user's profile
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

    // Attach user to request and continue
    req.user = user;
    return handler(req, res);
  };
}
