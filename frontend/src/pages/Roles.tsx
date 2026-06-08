import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, Plus, Edit3, Trash2, Check, AlertCircle } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

export const Roles: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role?.name?.toLowerCase() === 'admin';
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchRolesData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        supabase.from('roles').select('*, role_permissions(permission_id)'),
        supabase.from('permissions').select('*').order('code')
      ]);

      if (rolesRes.data) setRoles(rolesRes.data);
      if (permsRes.data) setPermissions(permsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesData();
  }, []);

  const openAddModal = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setSelectedPermissions(new Set());
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (role: any) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || '');
    const currentPerms = new Set(role.role_permissions.map((rp: any) => rp.permission_id));
    setSelectedPermissions(currentPerms as Set<string>);
    setFormError(null);
    setModalOpen(true);
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Role name is required.');
      return;
    }
    
    setIsSaving(true);
    try {
      let roleId = editingRole?.id;

      if (editingRole) {
        // Update existing role
        const { error } = await supabase
          .from('roles')
          .update({ name: name.trim(), description: description.trim() })
          .eq('id', roleId);
        if (error) throw error;
      } else {
        // Insert new role
        const { data, error } = await supabase
          .from('roles')
          .insert({ name: name.trim(), description: description.trim() })
          .select()
          .single();
        if (error) throw error;
        roleId = data.id;
      }

      // Re-sync permissions
      // First, delete old ones
      if (editingRole) {
        await supabase.from('role_permissions').delete().eq('role_id', roleId);
      }
      
      // Then insert new ones
      if (selectedPermissions.size > 0) {
        const permsToInsert = Array.from(selectedPermissions).map(permId => ({
          role_id: roleId,
          permission_id: permId
        }));
        const { error: permError } = await supabase.from('role_permissions').insert(permsToInsert);
        if (permError) throw permError;
      }

      setModalOpen(false);
      fetchRolesData();
    } catch (err: any) {
      setFormError(err.message || 'Error saving role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (role: any) => {
    if (role.name === 'Admin') {
      alert('Cannot delete the Admin role.');
      return;
    }
    setRoleToDelete({ id: role.id, name: role.name });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;
    try {
      const { error } = await supabase.from('roles').delete().eq('id', roleToDelete.id);
      if (error) throw error;
      setDeleteModalOpen(false);
      setRoleToDelete(null);
      fetchRolesData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete role.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Role Management</h2>
          <p className="text-sm text-slate-500">Define roles and their system permissions</p>
        </div>
        <button
          onClick={openAddModal}
          disabled={!isAdmin}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          Create Role
        </button>
      </div>

      {/* Roles List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400">No roles found.</div>
        ) : (
          roles.map(role => {
            const rolePermIds = role.role_permissions.map((rp: any) => rp.permission_id);
            const rolePerms = permissions.filter(p => rolePermIds.includes(p.id));
            
            return (
              <div key={role.id} className="bg-white border border-slate-100 rounded-2xl p-6 card-shadow flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <ShieldCheck size={20} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{role.name}</h3>
                      <p className="text-xs text-slate-500">{rolePerms.length} Permissions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <button
                        onClick={() => openEditModal(role)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit3 size={16} />
                      </button>
                    )}
                    {isAdmin && role.name !== 'Admin' && (
                      <button
                        onClick={() => handleDeleteClick(role)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                
                {role.description && (
                  <p className="text-sm text-slate-600 mb-6">{role.description}</p>
                )}

                <div className="mt-auto space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Assigned Permissions</h4>
                  {rolePerms.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No permissions assigned.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {rolePerms.map(p => (
                        <span key={p.id} className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md border border-slate-200">
                          {p.code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Role Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl my-8 card-shadow flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between border-b border-slate-100 p-6 shrink-0">
              <h3 className="text-xl font-bold text-slate-800">
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {formError && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-sm font-semibold text-red-700">{formError}</p>
                </div>
              )}

              <form id="role-form" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Role Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Manager"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Role description..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-800">Permissions Setup</label>
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded-md">
                      {selectedPermissions.size} Selected
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Select the permissions this role should have access to.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {permissions.map((perm) => {
                      const isSelected = selectedPermissions.has(perm.id);
                      return (
                        <div
                          key={perm.id}
                          onClick={() => togglePermission(perm.id)}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-200' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                            isSelected ? 'bg-primary border-primary text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check size={14} strokeWidth={3} />}
                          </div>
                          <div>
                            <p className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-slate-700'}`}>
                              {perm.code}
                            </p>
                            {perm.description && (
                              <p className={`text-xs mt-0.5 ${isSelected ? 'text-blue-600/70' : 'text-slate-500'}`}>
                                {perm.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                form="role-form"
                disabled={isSaving}
                className="px-6 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm shadow-blue-500/20 active:scale-95 disabled:opacity-60 flex items-center gap-2"
              >
                {isSaving ? 'Saving...' : 'Save Role'}
              </button>
            </div>

          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Role"
        message={`Are you sure you want to delete the "${roleToDelete?.name}" role? Users assigned to this role may lose access.`}
        confirmText="Delete Role"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setRoleToDelete(null);
        }}
      />
    </div>
  );
};

export default Roles;
