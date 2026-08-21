import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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

interface AuthContextType {
  user: UserProfile | null;
  rawUser: User | null;
  loading: boolean;
  permissions: string[];
  hasPermission: (code: string) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawUser, setRawUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);

  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;

  const fetchProfile = async (uid: string) => {
    try {
      const { data: profile, error } = await supabase
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
        .eq('id', uid)
        .single();

      if (error || !profile) {
        console.error('Error fetching profile:', error);
        setUser(null);
        setPermissions([]);
        return;
      }

      const userProfile = profile as any as UserProfile;
      
      if (userProfile.status === 'INACTIVE') {
        await supabase.auth.signOut();
        setUser(null);
        setPermissions([]);
        return;
      }

      setUser(userProfile);

      // Flatten permission list
      const codeList = userProfile.role.role_permissions
        .map((rp: any) => rp.permissions?.code)
        .filter(Boolean) as string[];

      setPermissions(codeList);
    } catch (err) {
      console.error('Profile fetch exception:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Check active session on initial mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        setRawUser(session.user);
        fetchProfile(session.user.id).finally(() => {
          if (isMounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // 2. Listen to state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'TOKEN_REFRESHED') {
        // Silently update user reference without resetting loading state or remounting components
        if (session?.user) {
          setRawUser(session.user);
        }
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        setRawUser(null);
        setUser(null);
        setPermissions([]);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setRawUser(session.user);
        // Only fetch profile if not already loaded for this user
        if (!userRef.current || userRef.current.id !== session.user.id) {
          await fetchProfile(session.user.id);
        }
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasPermission = (code: string) => {
    const roleName = user?.role?.name?.toUpperCase();
    if (roleName === 'ADMIN' || roleName === 'OWNER') return true;
    return permissions.includes(code);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, rawUser, loading, permissions, hasPermission, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
