import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import GRNs from './pages/GRNs';
import Adjustments from './pages/Adjustments';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Unauthorized from './pages/Unauthorized';
import SecuritySettings from './pages/SecuritySettings';
import ActivityLog from './pages/ActivityLog';
import DailyUsageSheet from './pages/DailyUsageSheet';
import { DailyPurchases } from './pages/DailyPurchases';
import { Transportation } from './pages/Transportation';
import { Expenses } from './pages/Expenses';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
          <Route element={<DashboardLayout />}>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="items:read" />}>
              <Route path="/inventory" element={<Inventory />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="items:read" />}>
              <Route path="/categories" element={<Categories />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="suppliers:read" />}>
              <Route path="/suppliers" element={<Suppliers />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="po:read" />}>
              <Route path="/purchase-orders" element={<PurchaseOrders />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="grn:read" />}>
              <Route path="/grns" element={<GRNs />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="stock:read" />}>
              <Route path="/adjustments" element={<Adjustments />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/daily-purchases" element={<DailyPurchases />} />
              <Route path="/transportation" element={<Transportation />} />
              <Route path="/expenses" element={<Expenses />} />
            </Route>

            <Route element={<ProtectedRoute requiredPermission="reports:read" />}>
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:type" element={<Reports />} />
            </Route>

            {/* System Admin Routes - Admin role only */}
            <Route element={<ProtectedRoute requiredRole="Admin, Owner" />}>
              <Route path="/users" element={<Users />} />
              <Route path="/roles" element={<Roles />} />
              <Route path="/activity-log" element={<ActivityLog />} />
              <Route path="/settings/security" element={<SecuritySettings />} />
              <Route path="/daily-usage-sheet" element={<DailyUsageSheet />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
