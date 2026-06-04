import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import GRNs from './pages/GRNs';
import Adjustments from './pages/Adjustments';
import Reports from './pages/Reports';
import Unauthorized from './pages/Unauthorized';

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

            <Route element={<ProtectedRoute requiredPermission="reports:read" />}>
              <Route path="/reports" element={<Reports />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
