import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus } from 'lucide-react';

export default function Patients() {
    const [patients, setPatients] = useState([]);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    
    // Form state
    const [form, setForm] = useState({ first_name: '', last_name: '', dob: '', gender: 'Male', phone: '', history: '' });

    const fetchPatients = () => {
        axios.get(`http://localhost:3001/api/patients?search=${search}`)
            .then(res => setPatients(res.data))
            .catch(console.error);
    };

    useEffect(() => {
        fetchPatients();
    }, [search]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3001/api/patients', form);
            setShowModal(false);
            setForm({ first_name: '', last_name: '', dob: '', gender: 'Male', phone: '', history: '' });
            fetchPatients();
        } catch (err) {
            alert('Failed to register patient');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>Patients Directory</h2>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> Add Patient
                </button>
            </div>

            <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Search size={20} color="var(--text-muted)" />
                <input 
                    type="text" 
                    placeholder="Search by name or phone..." 
                    className="input-field" 
                    style={{ flex: 1, margin: 0, border: 'none', background: 'transparent' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '12px' }}>ID</th>
                            <th style={{ padding: '12px' }}>Name</th>
                            <th style={{ padding: '12px' }}>Gender</th>
                            <th style={{ padding: '12px' }}>DOB</th>
                            <th style={{ padding: '12px' }}>Phone</th>
                            <th style={{ padding: '12px' }}>History</th>
                        </tr>
                    </thead>
                    <tbody>
                        {patients.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px' }}>PT-{p.id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px', fontWeight: 500 }}>{p.first_name} {p.last_name}</td>
                                <td style={{ padding: '12px' }}>{p.gender}</td>
                                <td style={{ padding: '12px' }}>{p.dob}</td>
                                <td style={{ padding: '12px' }}>{p.phone}</td>
                                <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.history || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {patients.length === 0 && <p style={{ padding: '24px', textAlign: 'center' }}>No patients found.</p>}
            </div>

            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div className="card" style={{ width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ marginBottom: '16px' }}>Register New Patient</h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="input-group">
                                    <label>First Name</label>
                                    <input required className="input-field" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label>Last Name</label>
                                    <input required className="input-field" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="input-group">
                                    <label>Date of Birth</label>
                                    <input type="date" required className="input-field" value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label>Gender</label>
                                    <select className="input-field" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                                        <option>Male</option>
                                        <option>Female</option>
                                    </select>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Phone</label>
                                <input required className="input-field" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                            </div>
                            <div className="input-group">
                                <label>Medical History / Notes</label>
                                <textarea className="input-field" rows="3" value={form.history} onChange={e => setForm({...form, history: e.target.value})}></textarea>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Patient</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
