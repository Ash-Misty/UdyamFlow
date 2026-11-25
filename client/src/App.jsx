import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Orders } from './pages/Orders.jsx';
import { Production } from './pages/Production.jsx';
import { Purchases } from './pages/Purchases.jsx';
import { Inventory } from './pages/Inventory.jsx';
import { Invoices } from './pages/Invoices.jsx';
import { Reports } from './pages/Reports.jsx';
import { Masters } from './pages/Masters.jsx';

const all = ['admin', 'salesman', 'production', 'accountant', 'owner'];
const productionRoles = ['admin', 'production'];
const accountingRoles = ['admin', 'accountant', 'owner'];
const inventoryRoles = ['admin', 'production', 'accountant', 'owner'];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute roles={all}><AppShell /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<ProtectedRoute roles={['admin', 'salesman']}><Orders /></ProtectedRoute>} />
        <Route path="/production" element={<ProtectedRoute roles={productionRoles}><Production /></ProtectedRoute>} />
        <Route path="/purchases" element={<ProtectedRoute roles={productionRoles}><Purchases /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute roles={inventoryRoles}><Inventory /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute roles={accountingRoles}><Invoices /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={accountingRoles}><Reports /></ProtectedRoute>} />
        <Route path="/masters" element={<ProtectedRoute roles={['admin']}><Masters /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
