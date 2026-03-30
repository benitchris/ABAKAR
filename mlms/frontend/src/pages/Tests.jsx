import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, CheckCircle, XCircle, Beaker, FileSignature } from 'lucide-react';

export default function Tests() {
    const { user } = useAuth();
    const [requests, setRequests] = useState([]);
    const [testTypes, setTestTypes] = useState([]);
    const [patients, setPatients] = useState([]);
    const [activeTab, setActiveTab] = useState('All');
    
    // Modals state
    const [showNewModal, setShowNewModal] = useState(false);
    const [showResultModal, setShowResultModal] = useState(null); // request object
    const [showValidateModal, setShowValidateModal] = useState(null); // request object

    const [form, setForm] = useState({ patient_id: '', priority: 'Normal', test_types: [] });
    const [resultForm, setResultForm] = useState({ result_value: '' });
    const [validateForm, setValidateForm] = useState({ action: 'Approved', comments: '' });

    const fetchData = () => {
        axios.get('http://localhost:3001/api/requests').then(res => setRequests(res.data)).catch(console.error);
    };

    useEffect(() => {
        fetchData();
        axios.get('http://localhost:3001/api/test_types').then(res => setTestTypes(res.data));
        axios.get('http://localhost:3001/api/patients').then(res => setPatients(res.data));
    }, []);

    const handleCreateRequest = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3001/api/requests', {
                patient_id: form.patient_id,
                priority: form.priority,
                test_type_ids: form.test_types
            });
            setShowNewModal(false);
            setForm({ patient_id: '', priority: 'Normal', test_types: [] });
            fetchData();
        } catch (err) { alert('Failed to create request'); }
    };

    const updateStatus = async (id, status) => {
        try {
            await axios.put(`http://localhost:3001/api/requests/${id}/status`, { status });
            fetchData();
        } catch (err) { alert('Failed to update status'); }
    };

    const submitResult = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3001/api/results', {
                request_id: showResultModal.id,
                test_type_id: 1, // simplified model
                result_value: parseFloat(resultForm.result_value)
            });
            alert('Result saved');
            setShowResultModal(null);
            fetchData();
        } catch (err) { alert('Failed to save result'); }
    };

    const submitValidation = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3001/api/validations', {
                request_id: showValidateModal.id,
                action: validateForm.action,
                comments: validateForm.comments
            });
            setShowValidateModal(null);
            fetchData();
        } catch (err) { alert('Failed to validate'); }
    };

    const renderTabs = () => {
        const tabs = ['All'];
        if (['Doctor', 'Receptionist', 'Admin'].includes(user.role)) tabs.push('Requests');
        if (['Technician', 'Admin'].includes(user.role)) tabs.push('Workspace');
        if (['Supervisor', 'Admin'].includes(user.role)) tabs.push('Validations');
        return tabs;
    };

    const filteredRequests = requests.filter(req => {
        if (activeTab === 'Workspace') return ['Pending', 'Collected', 'Testing'].includes(req.status);
        if (activeTab === 'Validations') return req.status === 'Completed';
        return true;
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>Laboratory Queue</h2>
                {['Doctor', 'Receptionist', 'Admin'].includes(user.role) && (
                    <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
                        <Plus size={18} /> New Request
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                {renderTabs().map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 24px', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', outline: 'none'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '12px' }}>Request ID</th>
                            <th style={{ padding: '12px' }}>Patient</th>
                            <th style={{ padding: '12px' }}>Date</th>
                            <th style={{ padding: '12px' }}>Priority</th>
                            <th style={{ padding: '12px' }}>Status</th>
                            <th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.map(req => (
                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 500 }}>REQ-{req.id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px' }}>{req.first_name} {req.last_name}</td>
                                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(req.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: '12px' }}>
                                    <span className={`badge ${req.priority === 'Urgent' ? 'badge-urgent' : ''}`} style={{ background: req.priority === 'Normal' ? 'var(--primary-light)' : undefined, color: req.priority === 'Normal' ? 'var(--primary)' : undefined }}>
                                        {req.priority}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <span className={`badge badge-${req.status.toLowerCase().replace(' ', '-')}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                                    {['Receptionist', 'Admin', 'Technician'].includes(user.role) && req.status === 'Pending' && (
                                        <button className="btn btn-secondary" onClick={() => updateStatus(req.id, 'Collected')} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Collect Sample</button>
                                    )}
                                    {['Technician', 'Admin'].includes(user.role) && req.status === 'Collected' && (
                                        <button className="btn btn-secondary" onClick={() => updateStatus(req.id, 'Testing')} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Start Testing</button>
                                    )}
                                    {['Technician', 'Admin'].includes(user.role) && req.status === 'Testing' && (
                                        <button className="btn btn-primary" onClick={() => setShowResultModal(req)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}><Beaker size={14}/> Enter Results</button>
                                    )}
                                    {['Supervisor', 'Admin'].includes(user.role) && req.status === 'Completed' && (
                                        <button className="btn btn-primary" onClick={() => setShowValidateModal(req)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}><FileSignature size={14}/> Validate</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredRequests.length === 0 && <p style={{ padding: '24px', textAlign: 'center' }}>No requests in this queue.</p>}
            </div>

            {/* New Request Modal */}
            {showNewModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '500px' }}>
                        <h3 style={{ marginBottom: '16px' }}>New Test Request</h3>
                        <form onSubmit={handleCreateRequest}>
                            <div className="input-group">
                                <label>Select Patient</label>
                                <select required className="input-field" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})}>
                                    <option value="">-- Choose Patient --</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Priority</label>
                                <select className="input-field" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                                    <option>Normal</option>
                                    <option>Urgent</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Tests</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', padding: '8px', borderRadius: '8px' }}>
                                    {testTypes.map(t => (
                                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                            <input type="checkbox" onChange={(e) => {
                                                const checked = e.target.checked;
                                                setForm(prev => ({
                                                    ...prev, 
                                                    test_types: checked ? [...prev.test_types, t.id] : prev.test_types.filter(id => id !== t.id)
                                                }));
                                            }} />
                                            {t.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={form.test_types.length===0}>Create Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Enter Results Modal */}
            {showResultModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '400px' }}>
                        <h3 style={{ marginBottom: '16px' }}>Enter Results</h3>
                        <p style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Entering results for REQ-{showResultModal.id.toString().padStart(4, '0')}</p>
                        <form onSubmit={submitResult}>
                            <div className="input-group">
                                <label>Result Value</label>
                                <input type="number" step="0.01" required className="input-field" value={resultForm.result_value} onChange={e => setResultForm({result_value: e.target.value})} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowResultModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Result & Complete</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Validate Modal */}
            {showValidateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '400px' }}>
                        <h3 style={{ marginBottom: '16px' }}>Validate Results</h3>
                        <form onSubmit={submitValidation}>
                            <div className="input-group">
                                <label>Action</label>
                                <select className="input-field" value={validateForm.action} onChange={e => setValidateForm({...validateForm, action: e.target.value})}>
                                    <option>Approved</option>
                                    <option>Rejected</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Comments</label>
                                <textarea className="input-field" rows="3" value={validateForm.comments} onChange={e => setValidateForm({...validateForm, comments: e.target.value})}></textarea>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowValidateModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary"><CheckCircle size={18}/> Validate</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
