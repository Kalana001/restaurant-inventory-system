import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Boxes, 
  Users2, 
  FileSpreadsheet, 
  ClipboardList, 
  ArrowLeftRight, 
  TrendingUp, 
  LogOut,
  Menu,
  X,
  UserCheck,
  FolderOpen,
  Users,
  ShieldCheck,
  Shield
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { user, permissions, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    { label: 'Analytics & Reports', path: '/reports', icon: <TrendingUp size={20} />, permission: 'reports:read' },
  ];

  const adminNavItems = [
    { label: 'User Management', path: '/users',  icon: <Users size={20} /> },
    { label: 'Role Management', path: '/roles',  icon: <ShieldCheck size={20} /> },
  ];

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

  const isAdmin = user?.role?.name?.toLowerCase() === 'admin';

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
            const isParentActive = location.pathname === item.path;
            const isSubActive = item.subItems?.some(sub => location.pathname === sub.path);
            const isExpanded = isParentActive || isSubActive;

            return (
              <div key={item.path} className="space-y-1">
                <Link
                  to={item.path}
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


          {/* Admin Section - only for Admin role */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Administration</p>
              </div>
              <div className="border-t border-gray-100 mb-1" />
              {adminNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      flex items-center space-x-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
                      ${isActive
                        ? 'bg-primary text-white shadow-sm shadow-blue-500/20'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                    `}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>


        {/* User Card & Logout */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-4">
          <div className="flex items-center space-x-3 px-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-primary flex items-center justify-center font-bold">
              {user?.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.username}</p>
              <span className="inline-flex items-center text-[10px] font-medium bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                <UserCheck size={10} className="mr-1" />
                {user?.role.name}
              </span>
            </div>
          </div>
          {/* Security Settings link */}
          <Link
            to="/settings/security"
            onClick={() => setSidebarOpen(false)}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border font-medium text-sm transition-all duration-200 ${
              location.pathname === '/settings/security'
                ? 'border-primary bg-blue-50 text-primary'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Shield size={16} />
            <span>Security Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm transition-all duration-200"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
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
          <div className="flex items-center space-x-4">
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full uppercase tracking-wider">LKR Currency</span>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm text-gray-500 font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </header>

        {/* Content Slot */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 gradient-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
export default DashboardLayout;
