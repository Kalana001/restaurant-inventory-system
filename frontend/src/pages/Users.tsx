import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { Users as UsersIcon, Plus, Edit3, ShieldCheck, Mail, AlertCircle } from 'lucide-react';

export const Users: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  
  // Form states
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchUsersData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*, roles(name)'),
        supabase.from('roles').select('*').order('name')
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (rolesRes.data) {
        setRoles(rolesRes.data);
        if (rolesRes.data.length > 0 && !roleId) {
          setRoleId(rolesRes.data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersData();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setEmail('');
    setUsername('');
    setPassword('');
    setStatus('ACTIVE');
    if (roles.length > 0) setRoleId(roles[0].id);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEmail(user.email);
    setUsername(user.username);
    setPassword(''); // don't load password, leave blank unless changing
    setRoleId(user.role_id);
    setStatus(user.status);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !username.trim() || !roleId) {
      setFormError('Please fill out all required fields.');
      return;
    }

    if (!editingUser && (!password || password.length < 6)) {
      setFormError('Password must be at least 6 characters for new accounts.');
      return;
    }

    setIsSaving(true);
    try {
      const adminClient = getSupabaseAdmin();
      if (!adminClient) {
        setFormError('Admin service is not configured. Please add VITE_SUPABASE_SERVICE_ROLE_KEY to your Vercel environment variables and redeploy.');
        setIsSaving(false);
        return;
      }

      if (editingUser) {
        // 1. Optionally update password via admin API if provided
        if (password.trim()) {
          const { error: pwdError } = await adminClient.auth.admin.updateUserById(
            editingUser.id,
            { password: password }
          );
          if (pwdError) throw pwdError;
        }

        // 2. Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            username: username.trim(),
            role_id: roleId,
            status: status
          })
          .eq('id', editingUser.id);
        if (profileError) throw profileError;

      } else {
        // Create new user using admin API to avoid logging out the current session
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: email.trim(),
          password: password,
          email_confirm: true,
          user_metadata: { username: username.trim() }
        });

        if (authError) throw authError;

        if (authData.user) {
          // Insert profile record for the newly created user
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: authData.user.id,
              email: email.trim(),
              username: username.trim(),
              role_id: roleId,
              status: status
            });
            
          if (profileError) throw profileError;
        }
      }

      setModalOpen(false);
      fetchUsersData();
    } catch (err: any) {
      setFormError(err.message || 'Error saving user account.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h2>
          <p className="text-sm text-slate-500">Manage employee access and assign roles</p>
        </div>
        <button
          onClick={openAddModal}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Create User
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">User Details</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">No users found.</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <UsersIcon size={18} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{user.username}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                            <Mail size={12} />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={16} className="text-primary" />
                        <span className="font-medium">{user.roles?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${
                        user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit3 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md card-shadow flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 p-6 shrink-0">
              <h3 className="text-xl font-bold text-slate-800">
                {editingUser ? 'Edit User Account' : 'Create User Account'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            <div className="p-6">
              {formError && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-sm font-semibold text-red-700">{formError}</p>
                </div>
              )}

              <form id="user-form" onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm ${editingUser ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    {editingUser ? 'Reset Password (Optional)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
                    <select
                      value={roleId}
                      onChange={e => setRoleId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive (Suspended)</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="user-form"
                disabled={isSaving}
                className="px-6 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm shadow-blue-500/20 active:scale-95 disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
