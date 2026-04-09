import { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Search } from 'lucide-react';

export default function Reports() {
    const [requests, setRequests] = useState([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        axios.get('http://localhost:3001/api/requests')
            .then(res => {
                setRequests(res.data);
            })
            .catch(console.error);
    }, []);

    const filteredRequests = requests.filter(r => 
        (r.first_name + ' ' + r.last_name).toLowerCase().includes(search.toLowerCase()) ||
        r.id.toString().includes(search)
    );

    const generatePDF = async (id) => {
        try {
            const res = await axios.get(`http://localhost:3001/api/reports/${id}`);
            const data = res.data;

            const doc = new jsPDF();
            doc.setFontSize(22);
            doc.text('Al-Shifa Hospital Laboratory', 105, 20, { align: 'center' });
            doc.setFontSize(16);
            doc.text('Official Test Report', 105, 30, { align: 'center' });

            doc.setFontSize(12);
            doc.text(`Patient: ${data.request.first_name} ${data.request.last_name}`, 14, 45);
            doc.text(`Gender/DOB: ${data.request.gender} / ${new Date(data.request.dob).toLocaleDateString()}`, 14, 52);
            doc.text(`Doctor: ${data.request.doctor_name}`, 14, 59);
            
            doc.text(`Report ID: REQ-${id.toString().padStart(4, '0')}`, 130, 45);
            doc.text(`Date: ${new Date(data.request.created_at).toLocaleDateString()}`, 130, 52);

            const tableData = data.results.map(r => {
                const testDisplay = r.parameter_name === 'Unmapped Parameter' ? r.test_name : r.parameter_name;
                const refRange = r.normal_min === 0 && r.normal_max === 0 
                    ? '—' 
                    : `${r.normal_min} - ${r.normal_max} ${r.unit}`;
                
                return [
                    testDisplay,
                    `${r.result_value} ${r.unit}`,
                    refRange,
                    r.is_abnormal ? 'ABNORMAL' : 'Normal'
                ];
            });

            autoTable(doc, {
                startY: 70,
                head: [['Test / Parameter', 'Result', 'Ref Range', 'Flag']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [30, 58, 138] },
                columnStyles: {
                    0: { cellWidth: 70 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 30 }
                }
            });

            if (data.validation) {
                const finalY = doc.lastAutoTable.finalY || 70;
                doc.text(`Validated By: ${data.validation.supervisor_name}`, 14, finalY + 20);
                doc.text(`Comments: ${data.validation.comments || 'None'}`, 14, finalY + 27);
                doc.text(`Digital Status: APPROVED`, 14, finalY + 34);
            }

            doc.save(`MLMS_Report_REQ${id}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Failed to generate report');
        }
    };

    return (
        <div>
            <h2 style={{ marginBottom: '24px' }}>Lab Reports</h2>

            <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Search size={20} color="var(--text-muted)" />
                <input 
                    type="text" 
                    placeholder="Search by patient name or ID..." 
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
                            <th style={{ padding: '12px' }}>Request ID</th>
                            <th style={{ padding: '12px' }}>Patient</th>
                            <th style={{ padding: '12px' }}>Doctor</th>
                            <th style={{ padding: '12px' }}>Status</th>
                            <th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.map(req => (
                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 500 }}>REQ-{req.id.toString().padStart(4, '0')}</td>
                                <td style={{ padding: '12px' }}>{req.first_name} {req.last_name}</td>
                                <td style={{ padding: '12px' }}>{req.doctor_name}</td>
                                <td style={{ padding: '12px' }}>
                                    <span className={`badge badge-${req.status.toLowerCase()}`} style={{ fontSize: '0.75rem' }}>
                                        {req.status}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <button 
                                        className="btn btn-secondary" 
                                        onClick={() => req.status === 'Approved' && generatePDF(req.id)} 
                                        style={{ 
                                            padding: '6px 12px', fontSize: '0.75rem', 
                                            opacity: req.status === 'Approved' ? 1 : 0.5,
                                            cursor: req.status === 'Approved' ? 'pointer' : 'not-allowed'
                                        }}
                                        disabled={req.status !== 'Approved'}
                                    >
                                        <Download size={14} /> {req.status === 'Approved' ? 'Download PDF' : 'Processing...'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredRequests.length === 0 && <p style={{ padding: '24px', textAlign: 'center' }}>No reports found in this section.</p>}
            </div>
        </div>
    );
}
