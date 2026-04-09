import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, DollarSign, CheckCircle } from 'lucide-react';

export default function Billing() {
    const [bills, setBills] = useState([]);
    const [search, setSearch] = useState('');

    const fetchBills = () => {
        axios.get('http://localhost:3001/api/billing')
            .then(res => setBills(res.data))
            .catch(console.error);
    };

    useEffect(() => {
        fetchBills();
    }, []);

    const handlePay = async (id) => {
        try {
            await axios.post(`http://localhost:3001/api/billing/${id}/pay`);
            alert('Payment processed and invoice marked as Paid.');
            fetchBills();
        } catch (err) { alert('Failed to process payment'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>Billing & Invoices</h2>
                <div className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '6px 12px' }}>
                    Total Pending: {bills.filter(b => b.status === 'Unpaid').length}
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Search size={20} color="var(--text-muted)" />
                <input 
                    type="text" 
                    placeholder="Search patients by name or PT ID..." 
                    className="input-field" 
                    style={{ flex: 1, margin: 0, border: 'none', background: 'transparent' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--background)' }}>
                            <th style={{ padding: '16px' }}>Invoice ID</th>
                            <th style={{ padding: '16px' }}>Patient</th>
                            <th style={{ padding: '16px' }}>Date</th>
                            <th style={{ padding: '16px' }}>Total Amount</th>
                            <th style={{ padding: '16px' }}>Status</th>
                            <th style={{ padding: '16px' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.filter(b => 
                            (b.first_name + ' ' + b.last_name).toLowerCase().includes(search.toLowerCase()) || 
                            b.patient_id?.toString().includes(search) ||
                            b.id?.toString().includes(search)
                        ).map((b, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', transition: 'var(--transition)' }} className="table-row-hover">
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--primary)' }}>INV-{b.id?.toString().padStart(4, '0')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {b.request_id ? `REQ-${b.request_id.toString().padStart(4, '0')}` : 'Registration Fee'}
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PT-{b.patient_id?.toString().padStart(4, '0')}</div>
                                </td>
                                <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '16px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                                    {b.total_amount === 0 ? '—' : b.total_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </td>
                                <td style={{ padding: '16px' }}>
                                    {b.status ? (
                                        <span className="badge" style={{ 
                                            background: b.status === 'Paid' ? 'var(--success-light)' : 'var(--danger-light)', 
                                            color: b.status === 'Paid' ? 'var(--success)' : 'var(--danger)',
                                            fontSize: '0.7rem'
                                        }}>
                                            {b.status}
                                        </span>
                                    ) : (
                                        <span className="badge" style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                            No Activity
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '16px' }}>
                                    {b.id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <label className="switch" title={b.status === 'Paid' ? 'Mark as Unpaid' : 'Mark as Paid'}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={b.status === 'Paid'} 
                                                    onChange={() => handlePay(b.id)}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: b.status === 'Paid' ? 'var(--success)' : 'var(--text-muted)' }}>
                                                {b.status === 'Paid' ? 'Paid' : 'Unpaid'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>Pending Request</div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {bills.length === 0 && (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        <div style={{ marginBottom: '12px' }}><DollarSign size={48} color="var(--border)" /></div>
                        <p>No billing records found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
