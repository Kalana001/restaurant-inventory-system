import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { UserProfile } from '../types/express';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or invalid');
    }

    const token = authHeader.split(' ')[1];

    // Validate the token with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new UnauthorizedError('Token is invalid or expired');
    }

    // Fetch user profile from database with roles and permissions
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        email,
        role_id,
        status,
        role:roles (
          id,
          name,
          description,
          role_permissions (
            permissions (
              id,
              code,
              description
            )
          )
        )
      `)
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      throw new UnauthorizedError('User profile not found in system database');
    }

    const typedProfile = profile as unknown as UserProfile;

    if (typedProfile.status === 'INACTIVE') {
      throw new UnauthorizedError('User account has been deactivated');
    }

    // Attach profile to request
    req.user = typedProfile;
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (permissionCode: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication required');
      }

      // Extract flat permission list
      const permissions = req.user.role.role_permissions.map(
        (rp: any) => rp.permissions?.code
      ).filter(Boolean);

      const hasPermission = permissions.includes(permissionCode);

      if (!hasPermission) {
        throw new ForbiddenError(`Permission '${permissionCode}' required to access this resource`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
