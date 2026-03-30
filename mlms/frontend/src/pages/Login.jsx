import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Activity } from 'lucide-react';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        axios.get('http://localhost:3001/api/auth/users')
            .then(res => setUsers(res.data))
            .catch(err => console.error(err));
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;
        setLoading(true);
        const success = await login(selectedUser);
        if (success) {
            navigate('/');
        } else {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: 'var(--background)'
        }}>
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
                <p style={{ marginBottom: '32px' }}>Welcome back! Please select your profile to continue.</p>

                <form onSubmit={handleLogin} style={{ textAlign: 'left' }}>
                    <div className="input-group">
                        <label>Select User Role</label>
                        <select 
                            className="input-field" 
                            value={selectedUser} 
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            <option value="">-- Choose User --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.full_name} ({u.role})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '8px', padding: '12px' }}
                        disabled={loading || !selectedUser}
                    >
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
