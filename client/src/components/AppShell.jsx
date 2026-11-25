import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Boxes, ClipboardList, Factory, FileBarChart, LogOut, ReceiptText, Settings2, ShoppingBasket } from 'lucide-react';
import { useAuth } from '../auth.jsx';

const links = [
  { to: '/dashboard', label: 'Overview', icon: Activity, roles: ['admin', 'salesman', 'production', 'accountant', 'owner'] },
  { to: '/orders', label: 'Orders', icon: ClipboardList, roles: ['admin', 'salesman'] },
  { to: '/production', label: 'Production', icon: Factory, roles: ['admin', 'production'] },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBasket, roles: ['admin', 'production'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: ['admin', 'production', 'accountant', 'owner'] },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText, roles: ['admin', 'accountant', 'owner'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart, roles: ['admin', 'accountant', 'owner'] },
  { to: '/masters', label: 'Masters', icon: Settings2, roles: ['admin'] },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = links.filter((link) => link.roles.includes(user.role));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">U</div>
          <div><strong>udyamflow</strong><span>FACTORY OS</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-status"><span className="status-dot" /> All systems operational</div>
          <div className="user-card">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="user-meta"><strong>{user.name}</strong><span>{user.role}</span></div>
            <button className="icon-button" title="Sign out" onClick={() => { logout(); navigate('/login'); }}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>UdyamFlow</span><span className="breadcrumb-separator">/</span><strong>Operations</strong></div>
          <div className="topbar-right"><span className="today-label">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span><div className="avatar avatar-small">{user.name.slice(0, 1).toUpperCase()}</div></div>
        </header>
        <div className="page-content"><Outlet /></div>
        <footer className="app-footer"><span>UdyamFlow Operations</span><span>Inventory stays in sync · Every movement is traceable</span></footer>
      </main>
    </div>
  );
}
