import { User } from '@supabase/supabase-js';

export interface UserRole {
  id: string;
  name: string;
  description: string | null;
  role_permissions: {
    permissions: {
      id: string;
      code: string;
      description: string | null;
    };
  }[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}
