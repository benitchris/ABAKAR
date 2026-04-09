import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Activity } from 'lucide-react';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // No need to fetch users for dropdown anymore
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const success = await login(username, password);
        if (success) {
            navigate('/');
        } else {
            setError('Invalid credentials');
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: 'var(--background)', position: 'relative'
        }}>
            {/* User Cheat Sheet for Demo */}
            <div style={{
                position: 'absolute', top: '20px', left: '20px',
                background: 'white', padding: '12px', borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.75rem',
                border: '1px solid var(--border)', zIndex: 50
            }}>
                <h4 style={{ margin: '0 0 8px 0', color: 'var(--primary)' }}>Quick Access Profiles</h4>
                <table style={{ textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '4px 8px' }}>Name</th>
                            <th style={{ padding: '4px 8px' }}>Role</th>
                            <th style={{ padding: '4px 8px' }}>User</th>
                            <th style={{ padding: '4px 8px' }}>Pass</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style={{ padding: '4px 8px' }}>Mahamat Oumar</td><td style={{ padding: '4px 8px' }}>Admin</td><td style={{ padding: '4px 8px' }}><code>admin</code></td><td style={{ padding: '4px 8px' }}>12345</td></tr>
                        <tr><td style={{ padding: '4px 8px' }}>Dr. Abakar Idriss</td><td style={{ padding: '4px 8px' }}>Doctor</td><td style={{ padding: '4px 8px' }}><code>dr1</code></td><td style={{ padding: '4px 8px' }}>12345</td></tr>
                        <tr><td style={{ padding: '4px 8px' }}>Fatima Ali</td><td style={{ padding: '4px 8px' }}>Receptionist</td><td style={{ padding: '4px 8px' }}><code>rec1</code></td><td style={{ padding: '4px 8px' }}>12345</td></tr>
                        <tr><td style={{ padding: '4px 8px' }}>Moussa Yaya</td><td style={{ padding: '4px 8px' }}>Technician</td><td style={{ padding: '4px 8px' }}><code>tech1</code></td><td style={{ padding: '4px 8px' }}>12345</td></tr>
                        <tr><td style={{ padding: '4px 8px' }}>Zenaba Brahim</td><td style={{ padding: '4px 8px' }}>Supervisor</td><td style={{ padding: '4px 8px' }}><code>sup1</code></td><td style={{ padding: '4px 8px' }}>12345</td></tr>
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ width: '400px', textAlign: 'center' }}>
                <div style={{ 
                    width: '64px', height: '64px', borderRadius: '16px',
                    background: 'var(--primary-light)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 24px'
                }}>
                    <Activity size={32} />
                </div>
                <h2 style={{ marginBottom: '8px' }}>Al-Shifa MLMS</h2>
                <p style={{ marginBottom: '32px' }}>Please enter your credentials to access the system.</p>

                {error && <p style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</p>}

                <form onSubmit={handleLogin} style={{ textAlign: 'left' }}>
                    <div className="input-group">
                        <label>Username</label>
                        <input 
                            type="text"
                            required
                            placeholder="Enter username"
                            className="input-field" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input 
                            type="password"
                            required
                            placeholder="•••••"
                            className="input-field" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '8px', padding: '12px' }}
                        disabled={loading || !username || !password}
                    >
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                    <p style={{ marginTop: '24px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        Default password: <strong>12345</strong>
                    </p>
                </form>
            </div>
        </div>
    );
}
