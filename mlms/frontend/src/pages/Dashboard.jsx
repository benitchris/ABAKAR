import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Activity, Users, FileText, AlertCircle } from 'lucide-react';

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({ totalCases: 0, pending: 0, tested: 0, urgent: 0 });
    const [recentRequests, setRecentRequests] = useState([]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchData = () => {
        axios.get('http://localhost:3001/api/dashboard')
            .then(res => setStats(res.data))
            .catch(console.error);
        axios.get('http://localhost:3001/api/requests')
            .then(res => setRecentRequests(res.data.slice(0, 5)))
            .catch(console.error);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>Overview Dashboard</h2>
                <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '6px 12px', fontSize: '1rem' }}>
                    Welcome, {user?.name} ({user?.role})
                </span>
            </div>
            
            {['Admin', 'Doctor', 'Supervisor'].includes(user?.role) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                    <StatCard title="Total Cases" value={stats.totalCases} icon={<Activity />} color="var(--primary)" />
                    <StatCard title="Pending" value={stats.pending} icon={<FileText />} color="var(--warning)" />
                    <StatCard title="Tested" value={stats.tested} icon={<Users />} color="var(--primary)" />
                    <StatCard title="Urgent" value={stats.urgent} icon={<AlertCircle />} color="var(--danger)" />
                </div>
            )}

            <div className="card">
                <h3 style={{ marginBottom: '16px' }}>Recent Test Requests</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px' }}>Patient</th>
                                    <th style={{ padding: '12px' }}>Doctor</th>
                                    <th style={{ padding: '12px' }}>Billing</th>
                                    <th style={{ padding: '12px' }}>Priority</th>
                                    <th style={{ padding: '12px' }}>Status</th>
                                    <th style={{ padding: '12px' }}>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentRequests.map(req => (
                                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '12px' }}>{req.first_name} {req.last_name}</td>
                                        <td style={{ padding: '12px' }}>{req.doctor_name}</td>
                                        <td style={{ padding: '12px' }}>
                                            <span className={`badge`} style={{ background: req.billing_status === 'Paid' ? 'var(--success-light)' : 'var(--danger-light)', color: req.billing_status === 'Paid' ? 'var(--success)' : 'var(--danger)', fontSize: '0.7rem' }}>
                                                {req.billing_status || 'Unset'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                        <span className={`badge badge-${req.status.toLowerCase()}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        {new Date(req.created_at).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {recentRequests.length === 0 && <p style={{ padding: '16px', textAlign: 'center' }}>No requests found.</p>}
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color }) {
    return (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: `4px solid ${color}` }}>
            <div style={{ background: `${color}20`, color: color, padding: '16px', borderRadius: '12px', display: 'flex' }}>
                {icon}
            </div>
            <div>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>{title}</p>
                <h2 style={{ margin: '4px 0 0 0', fontSize: '1.8rem', color: 'var(--text-main)' }}>{value}</h2>
            </div>
        </div>
    );
}
