import { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, CheckCircle } from 'lucide-react';

export default function Billing() {
    const [bills, setBills] = useState([]);

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
            fetchBills();
        } catch (err) { alert('Failed to process payment'); }
    };

    return (
        <div>
            <h2 style={{ marginBottom: '24px' }}>Billing & Invoices</h2>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '12px' }}>Invoice ID</th>
                            <th style={{ padding: '12px' }}>Request ID</th>
                            <th style={{ padding: '12px' }}>Patient</th>
                            <th style={{ padding: '12px' }}>Total Amount</th>
                            <th style={{ padding: '12px' }}>Status</th>
                            <th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map(b => (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 500 }}>INV-{b.id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px' }}>REQ-{b.request_id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px' }}>{b.first_name} {b.last_name}</td>
                                <td style={{ padding: '12px', fontWeight: 600 }}>${b.total_amount.toFixed(2)}</td>
                                <td style={{ padding: '12px' }}>
                                    <span className={`badge`} style={{ background: b.status === 'Paid' ? '#d1fae5' : '#fee2e2', color: b.status === 'Paid' ? '#047857' : '#b91c1c' }}>
                                        {b.status}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    {b.status === 'Unpaid' && (
                                        <button className="btn btn-primary" onClick={() => handlePay(b.id)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                                            <DollarSign size={14} /> Mark as Paid
                                        </button>
                                    )}
                                    {b.status === 'Paid' && (
                                        <span style={{ fontSize: '0.85rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <CheckCircle size={14}/> Cleared
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {bills.length === 0 && <p style={{ padding: '24px', textAlign: 'center' }}>No billing records found.</p>}
            </div>
        </div>
    );
}
