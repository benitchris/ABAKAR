const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'super_secret_mlms_key_for_local_use';

// Audit Log Helper
function logAction(userId, action, details) {
    db.run(`INSERT INTO Audit_Logs (user_id, action, details) VALUES (?, ?, ?)`, [userId, action, details], (err) => {
        if (err) console.error('Audit Log Error:', err.message);
    });
}

// ==========================================
// AUTHENTICATION (PASSWORDLESS)
// ==========================================
app.get('/api/auth/users', (req, res) => {
    db.all(`SELECT id, username, full_name, role FROM Users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/auth/login', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    db.get(`SELECT id, username, full_name, role FROM Users WHERE id = ?`, [user_id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const token = jwt.sign({ id: user.id, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '12h' });
        logAction(user.id, 'LOGIN', 'User logged in via selective auth');
        
        res.json({ token, user });
    });
});

// Middleware for auth
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// ==========================================
// PATIENTS
// ==========================================
app.get('/api/patients', authenticateToken, (req, res) => {
    const search = req.query.search || '';
    const query = `SELECT * FROM Patients WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? ORDER BY created_at DESC`;
    const params = [`%${search}%`, `%${search}%`, `%${search}%`];
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/patients', authenticateToken, (req, res) => {
    const { first_name, last_name, dob, gender, phone, history } = req.body;
    db.run(`INSERT INTO Patients (first_name, last_name, dob, gender, phone, history) VALUES (?, ?, ?, ?, ?, ?)`,
        [first_name, last_name, dob, gender, phone, history], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.id, 'REGISTER_PATIENT', JSON.stringify({ patient_id: this.lastID }));
            res.json({ id: this.lastID });
    });
});

// ==========================================
// DB STATUS / DASHBOARD
// ==========================================
app.get('/api/dashboard', authenticateToken, (req, res) => {
    // Simple aggregated stats
    const stats = {};
    db.serialize(() => {
        db.get(`SELECT COUNT(*) as cases FROM Test_Requests`, (err, row) => stats.totalCases = row?.cases || 0);
        db.get(`SELECT COUNT(*) as pending FROM Test_Requests WHERE status = 'Pending'`, (err, row) => stats.pending = row?.pending || 0);
        db.get(`SELECT COUNT(*) as completed FROM Test_Requests WHERE status = 'Completed'`, (err, row) => stats.completed = row?.completed || 0);
        db.get(`SELECT COUNT(*) as urgent FROM Test_Requests WHERE priority = 'Urgent'`, (err, row) => {
            stats.urgent = row?.urgent || 0;
            res.json(stats);
        });
    });
});

// ==========================================
// TEST TYPES
// ==========================================
app.get('/api/test_types', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM Test_Types`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// TEST REQUESTS & SAMPLE TRACKING
// ==========================================
app.get('/api/requests', authenticateToken, (req, res) => {
    const status = req.query.status;
    let query = `
        SELECT r.*, p.first_name, p.last_name, u.full_name as doctor_name 
        FROM Test_Requests r
        JOIN Patients p ON r.patient_id = p.id
        JOIN Users u ON r.doctor_id = u.id
    `;
    let params = [];
    if (status) {
        query += ` WHERE r.status = ?`;
        params.push(status);
    }
    query += ` ORDER BY r.created_at DESC`;
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/requests', authenticateToken, (req, res) => {
    const { patient_id, test_type_ids, priority } = req.body; // test_type_ids: array
    if (!patient_id || !test_type_ids || test_type_ids.length === 0) {
        return res.status(400).json({ error: 'patient_id and test_type_ids are required' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO Test_Requests (patient_id, doctor_id, priority, status) VALUES (?, ?, ?, 'Pending')`,
            [patient_id, req.user.id, priority || 'Normal'], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                const requestId = this.lastID;
                const barcode = 'MLMS-' + Date.now() + '-' + requestId;
                
                db.run(`INSERT INTO Samples (request_id, barcode, status) VALUES (?, ?, 'Pending')`,
                    [requestId, barcode]);
                
                // Calculate billing
                let totalCost = 0;
                let processed = 0;
                
                test_type_ids.forEach(test_type_id => {
                    db.get(`SELECT cost FROM Test_Types WHERE id = ?`, [test_type_id], (err, row) => {
                        if (row) totalCost += row.cost;
                        processed++;
                        if (processed === test_type_ids.length) {
                            db.run(`INSERT INTO Payments (request_id, total_amount) VALUES (?, ?)`, [requestId, totalCost]);
                            db.run('COMMIT');
                            logAction(req.user.id, 'CREATE_REQUEST', JSON.stringify({ request_id: requestId }));
                            res.json({ request_id: requestId, barcode });
                        }
                    });
                });
        });
    });
});

app.put('/api/requests/:id/status', authenticateToken, (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    
    db.run(`UPDATE Test_Requests SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        if (status === 'Collected') {
            db.run(`UPDATE Samples SET status = 'Collected', collected_at = CURRENT_TIMESTAMP WHERE request_id = ?`, [id]);
        }
        
        logAction(req.user.id, 'UPDATE_REQUEST_STATUS', JSON.stringify({ request_id: id, status }));
        res.json({ success: true });
    });
});

// ==========================================
// TEST RESULTS
// ==========================================
app.post('/api/results', authenticateToken, (req, res) => {
    const { request_id, test_type_id, result_value } = req.body;
    
    // Check if it's abnormal
    db.get(`SELECT normal_min, normal_max FROM Test_Types WHERE id = ?`, [test_type_id], (err, testType) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const isAbnormal = result_value < testType.normal_min || result_value > testType.normal_max;
        
        db.run(`INSERT INTO Test_Results (request_id, test_type_id, technician_id, result_value, is_abnormal) VALUES (?, ?, ?, ?, ?)`,
            [request_id, test_type_id, req.user.id, result_value, isAbnormal], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                db.run(`UPDATE Test_Requests SET status = 'Completed' WHERE id = ?`, [request_id]);
                logAction(req.user.id, 'ENTER_RESULT', JSON.stringify({ request_id, test_type_id }));
                res.json({ success: true, is_abnormal: isAbnormal });
        });
    });
});

// ==========================================
// VALIDATIONS
// ==========================================
app.post('/api/validations', authenticateToken, (req, res) => {
    const { request_id, action, comments } = req.body; // action: Approved, Rejected
    
    db.run(`INSERT INTO Validations (request_id, supervisor_id, action, comments) VALUES (?, ?, ?, ?)`,
        [request_id, req.user.id, action, comments], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            if (action === 'Approved') {
                db.run(`UPDATE Test_Requests SET status = 'Approved' WHERE id = ?`, [request_id]);
            } else {
                db.run(`UPDATE Test_Requests SET status = 'Testing' WHERE id = ?`, [request_id]);
            }
            logAction(req.user.id, 'VALIDATE_RESULT', JSON.stringify({ request_id, action }));
            res.json({ success: true });
    });
});

// ==========================================
// REPORTS
// ==========================================
app.get('/api/reports/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    
    const query = `
        SELECT r.*, p.first_name, p.last_name, p.dob, p.gender, u.full_name as doctor_name, s.barcode, s.collected_at
        FROM Test_Requests r
        JOIN Patients p ON r.patient_id = p.id
        JOIN Users u ON r.doctor_id = u.id
        LEFT JOIN Samples s ON r.id = s.request_id
        WHERE r.id = ?
    `;
    
    db.get(query, [id], (err, requestInfo) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!requestInfo) return res.status(404).json({ error: 'Request not found' });
        
        db.all(`
            SELECT res.*, t.name, t.unit, t.normal_min, t.normal_max, tech.full_name as tech_name
            FROM Test_Results res
            JOIN Test_Types t ON res.test_type_id = t.id
            JOIN Users tech ON res.technician_id = tech.id
            WHERE res.request_id = ?
        `, [id], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.get(`
                SELECT v.*, sup.full_name as supervisor_name
                FROM Validations v
                JOIN Users sup ON v.supervisor_id = sup.id
                WHERE v.request_id = ? AND v.action = 'Approved'
                ORDER BY v.timestamp DESC LIMIT 1
            `, [id], (err, validation) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    request: requestInfo,
                    results: results,
                    validation: validation || null
                });
            });
        });
    });
});

// ==========================================
// BILLING
// ==========================================
app.get('/api/billing', authenticateToken, (req, res) => {
    db.all(`
        SELECT py.*, r.patient_id, p.first_name, p.last_name 
        FROM Payments py
        JOIN Test_Requests r ON py.request_id = r.id
        JOIN Patients p ON r.patient_id = p.id
        ORDER BY py.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/billing/:id/pay', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE Payments SET status = 'Paid' WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.id, 'PROCESS_PAYMENT', JSON.stringify({ payment_id: id }));
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
