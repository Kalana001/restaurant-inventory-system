import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Boxes, 
  ClipboardList, 
  TrendingUp, 
  LogOut,
  Menu,
  X,
  UserCheck,
  Users,
  ShieldCheck,
  Shield,
  Activity,
  ChevronDown
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { user, permissions, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Define grouped navigation
  const mainNavItems = [
    { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, permission: null },
    { 
      label: 'Inventory Master', 
      path: '/inventory', 
      icon: <Boxes size={20} />, 
      permission: 'items:read',
      subItems: [
        { label: 'Categories', path: '/categories', permission: 'items:read' },
        { label: 'Stock Adjustments', path: '/adjustments', permission: 'stock:read' }
      ]
    },
    { 
      label: 'Purchase Orders', 
      path: '/purchase-orders', 
      icon: <ClipboardList size={20} />, 
      permission: 'po:read',
      subItems: [
        { label: 'Receive Goods (GRN)', path: '/grns', permission: 'grn:read' },
        { label: 'Suppliers Catalog', path: '/suppliers', permission: 'suppliers:read' }
      ]
    },
    { 
      label: 'Analytics & Reports', 
      path: '/reports', 
      icon: <TrendingUp size={20} />, 
      permission: 'reports:read',
      subItems: [
        { label: 'Inventory Valuation', path: '/reports/valuation', permission: 'reports:read' },
        { label: 'Expiry Warning', path: '/reports/expiry', permission: 'reports:read' },
        { label: 'Supplier Balances', path: '/reports/outstanding', permission: 'reports:read' },
        { label: 'Stock Movements', path: '/reports/movements', permission: 'reports:read' }
      ]
    },
  ];

  const adminNavItems = [
    { label: 'Activity Log', path: '/activity-log', icon: <Activity size={16} />, permission: 'activity:read' },
    { label: 'User Management', path: '/users',  icon: <Users size={16} />, permission: 'users:manage' },
    { label: 'Role Management', path: '/roles',  icon: <ShieldCheck size={16} />, permission: 'roles:read' },
    { label: 'Security Settings', path: '/settings/security', icon: <Shield size={16} />, permission: 'security:manage' },
  ];

  const filteredAdminNav = adminNavItems.filter(item => !item.permission || permissions.includes(item.permission));

  // Filter based on permissions
  const filteredMainNav = mainNavItems.map(item => {
    if (item.subItems) {
      return {
        ...item,
        subItems: item.subItems.filter(sub => !sub.permission || permissions.includes(sub.permission))
      };
    }
    return item;
  }).filter(item => !item.permission || permissions.includes(item.permission));

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-900 bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 transform lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Sidebar Header branding */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-blue-50/50 shrink-0">
          <div className="flex items-center space-x-2">
            <img src="/logo.png" alt="Sigiri Logo" className="w-8 h-8 rounded-full object-cover" />
            <span className="font-bold text-sm text-gray-800 tracking-tight leading-tight">Sigiri Catering<br/>& Food Centre</span>
          </div>
          <button 
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar Links */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {/* Main Navigation */}
          {filteredMainNav.map((item) => {
            const isParentActive = location.pathname === item.path || (item.path === '/reports' && location.pathname.startsWith('/reports'));
            const isSubActive = item.subItems?.some(sub => location.pathname === sub.path);
            const isExpanded = isParentActive || isSubActive;

            return (
              <div key={item.path} className="space-y-1">
                <Link
                  to={item.subItems ? item.subItems[0].path : item.path}
                  className={`
                    flex items-center space-x-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
                    ${isExpanded
                      ? 'bg-primary text-white shadow-sm shadow-blue-500/20'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
                
                {/* Render sub-items if expanded */}
                {isExpanded && item.subItems && item.subItems.length > 0 && (
                  <div className="pl-11 pr-2 py-1 space-y-1 relative">
                    {/* Vertical connector line */}
                    <div className="absolute left-[1.375rem] top-0 bottom-3 w-px bg-slate-200"></div>
                    
                    {item.subItems.map(sub => {
                      const isActive = location.pathname === sub.path;
                      return (
                        <Link
                          key={sub.path}
                          to={sub.path}
                          className={`
                            block px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 relative
                            ${isActive
                              ? 'bg-blue-50 text-primary'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}
                          `}
                          onClick={() => setSidebarOpen(false)}
                        >
                          {/* Horizontal connector dot */}
                          <div className={`absolute -left-[1.375rem] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-white ${isActive ? 'bg-primary' : 'bg-slate-300'}`}></div>
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header navbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <button 
              className="lg:hidden text-gray-600 hover:text-gray-800"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="font-semibold text-lg text-gray-800 capitalize">
              {location.pathname === '/' ? 'Overview' : location.pathname.substring(1).replace('-', ' ')}
            </h1>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-4">
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full uppercase tracking-wider">LKR</span>
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-sm text-gray-500 font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>

            <div className="h-6 w-px bg-gray-200 hidden md:block" />

            {/* Admin Dropdown */}
            {filteredAdminNav.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => { setAdminOpen(!adminOpen); setProfileOpen(false); }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
                >
                  <ShieldCheck size={18} />
                  <span className="hidden sm:inline">Admin</span>
                  <ChevronDown size={14} className={`transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {adminOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAdminOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-40 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-3 py-2 border-b border-slate-50 bg-slate-50/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Administration</p>
                      </div>
                      {filteredAdminNav.map(item => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setAdminOpen(false)}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                            location.pathname === item.path ? 'bg-blue-50 text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-primary'
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setProfileOpen(!profileOpen); setAdminOpen(false); }}
                className="flex items-center gap-2 focus:outline-none group"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-primary flex items-center justify-center font-bold text-sm ring-2 ring-transparent group-hover:ring-blue-200 transition-all">
                  {user?.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden md:flex flex-col items-start leading-tight">
                  <span className="text-sm font-bold text-slate-700 group-hover:text-primary transition-colors">{user?.username}</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">{user?.role.name}</span>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-40 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-3 border-b border-slate-50">
                      <p className="text-sm font-bold text-slate-800">{user?.username}</p>
                      <span className="inline-flex items-center mt-1 text-[10px] font-bold bg-blue-50 text-primary rounded px-1.5 py-0.5 uppercase tracking-wider">
                        <UserCheck size={10} className="mr-1" />
                        {user?.role.name}
                      </span>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { setProfileOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </header>

        {/* Content Slot */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 gradient-bg relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
export default DashboardLayout;
