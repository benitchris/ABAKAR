import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import { LayoutDashboard, Users, Activity, FileText, DollarSign, LogOut } from 'lucide-react';

import Tests from './pages/Tests';
import Reports from './pages/Reports';
import Billing from './pages/Billing';

const ProtectedRoute = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();

    if (!user) return <Navigate to="/login" replace />;

    let navItems = [
        { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} />, roles: ['Admin', 'Doctor', 'Receptionist', 'Technician', 'Supervisor'] },
        { path: '/patients', label: 'Patients', icon: <Users size={20} />, roles: ['Admin', 'Doctor', 'Receptionist'] },
        { path: '/tests', label: 'Requests Queue', icon: <Activity size={20} />, roles: ['Admin', 'Doctor', 'Receptionist', 'Technician', 'Supervisor'] },
        { path: '/reports', label: 'Reports', icon: <FileText size={20} />, roles: ['Admin', 'Doctor', 'Supervisor', 'Technician', 'Receptionist'] },
        { path: '/billing', label: 'Billing', icon: <DollarSign size={20} />, roles: ['Admin', 'Receptionist', 'Supervisor'] }
    ];
    navItems = navItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 8px' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '8px', borderRadius: '8px' }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Al-Shifa</h3>
                        <p style={{ fontSize: '0.8rem', margin: 0, opacity: 0.8 }}>Laboratory System</p>
                    </div>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {navItems.map(item => (
                        <Link 
                            key={item.path} 
                            to={item.path} 
                            className={`btn ${location.pathname === item.path ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ 
                                justifyContent: 'flex-start', 
                                border: location.pathname === item.path ? 'none' : '1px solid transparent',
                                background: location.pathname === item.path ? 'var(--primary)' : 'transparent',
                                color: location.pathname === item.path ? 'white' : 'var(--secondary)'
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--border)', padding: '24px 8px 8px' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>{user.name}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Role: {user.role}</p>
                    </div>
                    <button onClick={logout} className="btn" style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)', background: 'var(--danger-light)' }}>
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </aside>
            <main className="main-content">
                {children}
            </main>
        </div>
    );
};

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    
                    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/patients" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
                    <Route path="/tests" element={<ProtectedRoute><Tests /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                    <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
