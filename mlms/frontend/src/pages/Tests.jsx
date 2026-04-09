import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, CheckCircle, XCircle, Beaker, FileSignature, Search } from 'lucide-react';

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
    const [search, setSearch] = useState('');
    const [resultForm, setResultForm] = useState({}); // mapping test_id -> value
    const [requestTests, setRequestTests] = useState([]);
    const [isWorksheetLoading, setIsWorksheetLoading] = useState(false);
    const [isWorksheetError, setIsWorksheetError] = useState(false);
    const [validateForm, setValidateForm] = useState({ action: 'Approved', comments: '' });

    const fetchData = () => {
        axios.get('http://localhost:3001/api/requests').then(res => setRequests(res.data)).catch(console.error);
    };

    useEffect(() => {
        fetchData();
        axios.get('http://localhost:3001/api/test_types').then(res => setTestTypes(res.data));
        axios.get('http://localhost:3001/api/patients').then(res => setPatients(res.data));
    }, []);

    const [isRefreshing, setIsRefreshing] = useState(false);

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
            
            // Give the database a moment to flush to disk then refresh
            setIsRefreshing(true);
            setTimeout(() => {
                fetchData();
                setIsRefreshing(false);
            }, 500);
        } catch (err) { alert('Failed to create request'); }
    };

    const updateStatus = async (id, status) => {
        try {
            await axios.put(`http://localhost:3001/api/requests/${id}/status`, { status });
            fetchData();
        } catch (err) { alert('Failed to update status'); }
    };

    const handleStartTesting = async (id) => {
        try {
            await axios.put(`http://localhost:3001/api/requests/${id}/start-testing`);
            fetchData();
        } catch (err) { alert('Failed to start testing'); }
    };

    const openResultModal = (req) => {
        setShowResultModal(req);
        setIsWorksheetLoading(true);
        setIsWorksheetError(false);
        axios.get(`http://localhost:3001/api/requests/${req.id}/params`)
            .then(res => {
                setRequestTests(res.data);
                const initialResults = {};
                res.data.forEach(t => {
                    const key = `${t.request_test_id}_${t.parameter_id}`;
                    if (t.result_value !== null && t.result_value !== undefined) initialResults[key] = t.result_value;
                });
                setResultForm(initialResults);
                setIsWorksheetLoading(false);
            })
            .catch(err => {
                console.error('Worksheet load error:', err);
                setIsWorksheetError(true);
                setIsWorksheetLoading(false);
            });
    };

    const handleLocalChange = (rtId, paramId, val) => {
        setResultForm(prev => ({ ...prev, [`${rtId}_${paramId}`]: val }));
    };

    const submitAllResults = async () => {
        try {
            const promises = Object.keys(resultForm).map(compoundKey => {
                const [requestTestId, parameterId] = compoundKey.split('_');
                const val = resultForm[compoundKey];
                if (val === '' || val === undefined) return null;
                
                return axios.post('http://localhost:3001/api/results', {
                    request_id: showResultModal.id,
                    request_test_id: parseInt(requestTestId),
                    parameter_id: parseInt(parameterId),
                    result_value: typeof val === 'string' && !isNaN(parseFloat(val)) ? parseFloat(val) : val
                });
            }).filter(Boolean);

            if (promises.length === 0) {
                alert('No values entered to save.');
                return;
            }
            
            await Promise.all(promises);
            alert('Results saved successfully.');
            setShowResultModal(null);
            fetchData();
        } catch (err) { 
            console.error(err);
            alert('Failed to save results.'); 
        }
    };

    const openValidateModal = (req) => {
        setShowValidateModal(req);
        setValidateForm({ action: 'Approved', comments: '' });
        axios.get(`http://localhost:3001/api/requests/${req.id}/tests`).then(res => {
            setRequestTests(res.data);
        });
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
        const name = `${req.first_name || ''} ${req.last_name || ''}`.toLowerCase();
        const id = `req-${req.id.toString().padStart(4, '0')}`.toLowerCase();
        const s = search.toLowerCase();
        const matchesSearch = name.includes(s) || id.includes(s);
        
        if (!matchesSearch) return false;
        if (activeTab === 'All') return true;
        if (activeTab === 'Requests' && req.status === 'Pending') return true;
        if (activeTab === 'Workspace' && (req.status === 'Collected' || req.status === 'Testing' || req.status === 'Tested')) return true;
        if (activeTab === 'Validations' && (req.status === 'Tested' || req.status === 'Approved')) return true;
        return false;
    });

    const renderFormByTestType = (testName, params, rtId) => {
        const lowerName = testName.toLowerCase();
        
        // 1. Haematology (CBC) - Professional Grid
        if (lowerName.includes('cbc') || lowerName.includes('blood count')) {
            return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {params.map(p => (
                        <div key={p.parameter_id} className="input-group" style={{ margin: 0, padding: '12px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.parameter_name}</label>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.unit}</span>
                            </div>
                            <input 
                                type="number" step="any" className="input-field" placeholder="0.00"
                                value={resultForm[`${rtId}_${p.parameter_id}`] || ''}
                                onChange={(e) => handleLocalChange(rtId, p.parameter_id, e.target.value)}
                            />
                            <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.6 }}>Range: {p.normal_min}-{p.normal_max}</div>
                        </div>
                    ))}
                </div>
            );
        }

        // 2. Lipid Profile - Grouped Grid
        if (lowerName.includes('lipid')) {
            return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--background)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    {params.map(p => (
                        <div key={p.parameter_id} style={{ padding: '8px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{p.parameter_name}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input 
                                    type="number" step="any" className="input-field" style={{ margin: 0 }}
                                    value={resultForm[`${rtId}_${p.parameter_id}`] || ''}
                                    onChange={(e) => handleLocalChange(rtId, p.parameter_id, e.target.value)}
                                />
                                <span style={{ fontSize: '0.75rem' }}>{p.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // 3. LFT / KFT - List Layout
        if (lowerName.includes('lft') || lowerName.includes('kft') || lowerName.includes('liver') || lowerName.includes('kidney')) {
            return (
                <div style={{ background: 'var(--background)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {params.map((p, idx) => (
                        <div key={p.parameter_id} style={{ 
                            display: 'flex', alignItems: 'center', padding: '12px 16px', 
                            borderBottom: idx === params.length - 1 ? 'none' : '1px solid var(--border)',
                            background: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent'
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.parameter_name}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Ref: {p.normal_min} - {p.normal_max} {p.unit}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input 
                                    type="number" step="any" className="input-field" style={{ width: '100px', margin: 0 }}
                                    value={resultForm[`${rtId}_${p.parameter_id}`] || ''}
                                    onChange={(e) => handleLocalChange(rtId, p.parameter_id, e.target.value)}
                                />
                                <span style={{ fontSize: '0.8rem', width: '40px' }}>{p.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // 4. Urinalysis - Sectioned
        if (lowerName.includes('urinalysis') || lowerName.includes('urine')) {
            const sections = {
                'Physical': params.filter(p => ['Color', 'Appearance', 'Gravity'].some(f => p.parameter_name.includes(f))),
                'Chemical & Microscopy': params.filter(p => !['Color', 'Appearance', 'Gravity'].some(f => p.parameter_name.includes(f)))
            };
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Object.entries(sections).map(([sName, sParams]) => (
                        <div key={sName}>
                            <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '10px', borderBottom: '1px solid var(--primary-light)' }}>{sName} Examination</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {sParams.map(p => (
                                    <div key={p.parameter_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{p.parameter_name}</span>
                                        <input 
                                            type="text" className="input-field" style={{ width: '80px', margin: 0, padding: '4px' }}
                                            value={resultForm[`${rtId}_${p.parameter_id}`] || ''}
                                            onChange={(e) => handleLocalChange(rtId, p.parameter_id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // 5. Default Fallback
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {params.map(p => (
                    <div key={p.parameter_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.parameter_name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Range: {p.normal_min}-{p.normal_max} {p.unit}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                                type={p.parameter_id < 0 ? "text" : "number"} step="any"
                                className="input-field" style={{ width: '120px', margin: 0 }}
                                value={resultForm[`${rtId}_${p.parameter_id}`] || ''}
                                onChange={(e) => handleLocalChange(rtId, p.parameter_id, e.target.value)}
                            />
                            <span style={{ fontSize: '0.75rem', width: '40px' }}>{p.unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

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

            <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center', padding: '12px' }}>
                <Search size={20} color="var(--text-muted)" />
                <input 
                    type="text" placeholder="Search by patient name or ID..." className="input-field" 
                    style={{ flex: 1, margin: 0, border: 'none', background: 'transparent' }}
                    value={search} onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                {renderTabs().map(tab => (
                    <button 
                        key={tab} onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 24px', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', outline: 'none'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '12px' }}>Request ID</th>
                            <th style={{ padding: '12px' }}>Patient</th>
                            <th style={{ padding: '12px' }}>Priority</th>
                            <th style={{ padding: '12px' }}>Status</th>
                            <th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.map(req => (
                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 600 }}>REQ-{req.id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px' }}>{req.first_name} {req.last_name}</td>
                                <td style={{ padding: '12px' }}>
                                    <span className={`badge ${req.priority === 'Urgent' ? 'badge-urgent' : ''}`} style={{ background: req.priority === 'Normal' ? 'var(--primary-light)' : undefined }}>
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
                                        <button className="btn btn-secondary" onClick={() => updateStatus(req.id, 'Collected')} style={{ fontSize: '0.75rem' }}>Collect Sample</button>
                                    )}
                                    {['Technician', 'Admin'].includes(user.role) && req.status === 'Collected' && (
                                        <button className="btn btn-secondary" onClick={() => handleStartTesting(req.id)} style={{ fontSize: '0.75rem', background: 'var(--warning)', color: 'black' }}>Start Testing</button>
                                    )}
                                    {['Technician', 'Admin'].includes(user.role) && (req.status === 'Testing' || req.status === 'Tested') && (
                                        <button className="btn btn-primary" onClick={() => openResultModal(req)} style={{ fontSize: '0.75rem' }}>
                                            <Beaker size={14}/> {req.status === 'Tested' ? 'Edit Results' : 'Enter Results'}
                                        </button>
                                    )}
                                    {['Supervisor', 'Admin'].includes(user.role) && (req.status === 'Tested' || req.status === 'Approved') && (
                                        <button className="btn btn-secondary" onClick={() => openValidateModal(req)} style={{ fontSize: '0.75rem' }}>
                                            <FileSignature size={14}/> Review
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modals are kept below for space */}
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
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px' }}>
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
                                <button type="submit" className="btn btn-primary" disabled={form.test_types.length === 0}>Create Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showResultModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary)', color: 'white' }}>
                            <h3 style={{ color: 'white', margin: 0 }}>Worksheet: {showResultModal.first_name} {showResultModal.last_name}</h3>
                            <button onClick={() => setShowResultModal(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><XCircle /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            {isWorksheetLoading ? <p>Loading worksheet...</p> : isWorksheetError ? <p style={{ color: 'var(--danger)' }}>Failed to load form.</p> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {Object.entries(requestTests.reduce((acc, curr) => {
                                        if (!acc[curr.request_test_id]) acc[curr.request_test_id] = { name: curr.test_name, params: [] };
                                        acc[curr.request_test_id].params.push(curr);
                                        return acc;
                                    }, {})).map(([rtId, group]) => (
                                        <div key={rtId}>
                                            <h4 style={{ marginBottom: '12px', color: 'var(--primary)', borderBottom: '2px solid var(--primary-light)', paddingBottom: '4px' }}>{group.name}</h4>
                                            {renderFormByTestType(group.name, group.params, rtId)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowResultModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={submitAllResults}>Save All Results</button>
                        </div>
                    </div>
                </div>
            )}

            {showValidateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>Review Results: {showValidateModal.first_name} {showValidateModal.last_name}</h3>
                        <div style={{ marginTop: '20px' }}>
                            {requestTests.map(t => (
                                <div key={t.parameter_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                    <span>{t.parameter_name} ({t.test_name})</span>
                                    <span style={{ fontWeight: 700, color: t.is_abnormal ? 'var(--danger)' : 'inherit' }}>{t.result_value} {t.unit}</span>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={submitValidation} style={{ marginTop: '24px' }}>
                            <div className="input-group">
                                <label>Decision</label>
                                <select className="input-field" value={validateForm.action} onChange={e => setValidateForm({...validateForm, action: e.target.value})}>
                                    <option value="Approved">Approve</option>
                                    <option value="Rejected">Reject</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Comments</label>
                                <textarea className="input-field" value={validateForm.comments} onChange={e => setValidateForm({...validateForm, comments: e.target.value})}></textarea>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowValidateModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Submit Record</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
