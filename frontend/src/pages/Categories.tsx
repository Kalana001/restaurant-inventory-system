import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Pencil, Trash2, AlertCircle, ChevronDown, ChevronRight, Tag, FolderOpen } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

export const Categories: React.FC = () => {
  const { hasPermission } = useAuth();

  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);

  // Subcategory modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [subName, setSubName] = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subParentId, setSubParentId] = useState('');
  const [subError, setSubError] = useState<string | null>(null);
  const [subSaving, setSubSaving] = useState(false);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'category' | 'subcategory' } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: cats }, { data: subs }] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('subcategories').select('*').order('name'),
      ]);
      if (cats) setCategories(cats);
      if (subs) setSubcategories(subs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleExpand = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Category CRUD ──────────────────────────────────────────────────
  const openAddCat = () => {
    setEditingCat(null);
    setCatName('');
    setCatDescription('');
    setCatError(null);
    setCatModalOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatDescription(cat.description || '');
    setCatError(null);
    setCatModalOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) { setCatError('Category name is required.'); return; }
    setCatSaving(true);
    setCatError(null);
    try {
      if (editingCat) {
        const { error } = await supabase.from('categories').update({ name: catName.trim(), description: catDescription.trim() }).eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ name: catName.trim(), description: catDescription.trim() });
        if (error) throw error;
      }
      setCatModalOpen(false);
      fetchData();
    } catch (err: any) {
      setCatError(err.message || 'Failed to save category.');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCatClick = (id: string, name: string) => {
    const hasChildren = subcategories.some(s => s.category_id === id);
    if (hasChildren) { alert(`Cannot delete "${name}" — it has subcategories. Delete the subcategories first.`); return; }
    setDeleteTarget({ id, name, type: 'category' });
    setDeleteModalOpen(true);
  };

  // ── Subcategory CRUD ───────────────────────────────────────────────
  const openAddSub = (parentId?: string) => {
    setEditingSub(null);
    setSubName('');
    setSubDescription('');
    setSubParentId(parentId || categories[0]?.id || '');
    setSubError(null);
    setSubModalOpen(true);
  };

  const openEditSub = (sub: any) => {
    setEditingSub(sub);
    setSubName(sub.name);
    setSubDescription(sub.description || '');
    setSubParentId(sub.category_id);
    setSubError(null);
    setSubModalOpen(true);
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) { setSubError('Subcategory name is required.'); return; }
    if (!subParentId) { setSubError('Please select a parent category.'); return; }
    setSubSaving(true);
    setSubError(null);
    try {
      if (editingSub) {
        const { error } = await supabase.from('subcategories').update({ name: subName.trim(), description: subDescription.trim(), category_id: subParentId }).eq('id', editingSub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subcategories').insert({ name: subName.trim(), description: subDescription.trim(), category_id: subParentId });
        if (error) throw error;
      }
      setSubModalOpen(false);
      fetchData();
    } catch (err: any) {
      setSubError(err.message || 'Failed to save subcategory.');
    } finally {
      setSubSaving(false);
    }
  };

  const handleDeleteSubClick = (id: string, name: string) => {
    setDeleteTarget({ id, name, type: 'subcategory' });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'category') {
        await supabase.from('categories').delete().eq('id', deleteTarget.id);
      } else {
        await supabase.from('subcategories').delete().eq('id', deleteTarget.id);
      }
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to delete item.');
    }
  };

  const canWrite = hasPermission('items:create') || hasPermission('items:update');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Categories</h2>
          <p className="text-sm text-slate-500">Manage inventory categories and subcategories</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => openAddSub()}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
            >
              <Tag size={16} />
              Add Subcategory
            </button>
            <button
              onClick={openAddCat}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              Add Category
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 card-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <FolderOpen size={22} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-slate-800">{categories.length}</p>
            <p className="text-xs text-slate-500 font-medium">Total Categories</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 card-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
            <Tag size={22} className="text-purple-500" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-slate-800">{subcategories.length}</p>
            <p className="text-xs text-slate-500 font-medium">Total Subcategories</p>
          </div>
        </div>
      </div>

      {/* Category tree */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden card-shadow">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-700">Category Tree</h3>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No categories yet. Add your first category!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {categories.map(cat => {
              const subs = subcategories.filter(s => s.category_id === cat.id);
              const isExpanded = expandedCats.has(cat.id);
              return (
                <div key={cat.id}>
                  {/* Category Row */}
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition-colors group">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => toggleExpand(cat.id)}
                        className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <FolderOpen size={17} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{cat.name}</p>
                        {cat.description && <p className="text-xs text-slate-400 truncate">{cat.description}</p>}
                      </div>
                      <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {subs.length} sub
                      </span>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openAddSub(cat.id)}
                          title="Add Subcategory"
                          className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all text-xs flex items-center gap-1"
                        >
                          <Tag size={14} />
                        </button>
                        <button
                          onClick={() => openEditCat(cat)}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteCatClick(cat.id, cat.name)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Subcategory rows */}
                  {isExpanded && (
                    <div className="bg-slate-50/40">
                      {subs.length === 0 ? (
                        <div className="pl-16 pr-6 py-3 text-xs text-slate-400 italic">No subcategories yet.</div>
                      ) : (
                        subs.map(sub => (
                          <div key={sub.id} className="flex items-center justify-between pl-16 pr-6 py-3 hover:bg-slate-100/50 transition-colors group border-t border-slate-100/80">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                                <Tag size={13} className="text-purple-500" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-700 text-sm">{sub.name}</p>
                                {sub.description && <p className="text-xs text-slate-400 truncate">{sub.description}</p>}
                              </div>
                            </div>
                            {canWrite && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditSub(sub)}
                                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubClick(sub.id, sub.name)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Category Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 space-y-5 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">{editingCat ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={() => setCatModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
            </div>

            {catError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-700">{catError}</p>
              </div>
            )}

            <form onSubmit={handleSaveCat} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Category Name *</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="e.g. Beverages, Dry Goods"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Description (Optional)</label>
                <textarea
                  value={catDescription}
                  onChange={e => setCatDescription(e.target.value)}
                  rows={3}
                  placeholder="Short description of this category..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCatModalOpen(false)} className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={catSaving} className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-60">
                  {catSaving ? 'Saving...' : editingCat ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subcategory Modal */}
      {subModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 space-y-5 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">{editingSub ? 'Edit Subcategory' : 'New Subcategory'}</h3>
              <button onClick={() => setSubModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
            </div>

            {subError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-700">{subError}</p>
              </div>
            )}

            <form onSubmit={handleSaveSub} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Parent Category *</label>
                <select
                  value={subParentId}
                  onChange={e => setSubParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Subcategory Name *</label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  placeholder="e.g. Soft Drinks, Spices"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Description (Optional)</label>
                <textarea
                  value={subDescription}
                  onChange={e => setSubDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSubModalOpen(false)} className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={subSaving} className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-60">
                  {subSaving ? 'Saving...' : editingSub ? 'Save Changes' : 'Create Subcategory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title={deleteTarget?.type === 'category' ? 'Delete Category' : 'Delete Subcategory'}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};

export default Categories;
