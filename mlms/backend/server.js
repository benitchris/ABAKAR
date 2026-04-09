const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const path = require('path');
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    const { username, password } = req.body;
    console.log(`[AUTH] Login attempt for user: ${username}`);
    
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    
    db.get(`SELECT id, username, full_name, role FROM Users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) {
            console.error('[AUTH] Login query failed:', err.message);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            console.warn(`[AUTH] Failed login for user: ${username} (Incorrect credentials or user not found)`);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        console.log(`[AUTH] Login successful: ${user.full_name} (${user.role})`);
        const token = jwt.sign({ id: user.id, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '12h' });
        logAction(user.id, 'LOGIN', 'User logged in via authentication');
        
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
            const patient_id = this.lastID;
            logAction(req.user.id, 'REGISTER_PATIENT', JSON.stringify({ patient_id }));
            
            // AUTO-BILLING: Create Registration Invoice
            db.run(`INSERT INTO Payments (patient_id, total_amount, status) VALUES (?, 0, 'Unpaid')`, [patient_id]);
            
            res.json({ id: patient_id });
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
        db.get(`SELECT COUNT(*) as tested FROM Test_Requests WHERE status = 'Tested'`, (err, row) => stats.tested = row?.tested || 0);
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
        SELECT r.*, p.first_name, p.last_name, u.full_name as doctor_name, py.status as billing_status 
        FROM Test_Requests r
        JOIN Patients p ON r.patient_id = p.id
        JOIN Users u ON r.doctor_id = u.id
        LEFT JOIN Payments py ON py.request_id = r.id
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
    const { patient_id, test_type_ids, priority } = req.body; 
    if (!patient_id || !test_type_ids || !Array.isArray(test_type_ids) || test_type_ids.length === 0) {
        return res.status(400).json({ error: 'patient_id and a non-empty array of test_type_ids are required' });
    }

    // First, let's get the total cost of all tests
    const ids = test_type_ids.join(',');
    db.get(`SELECT SUM(cost) as total FROM Test_Types WHERE id IN (${ids})`, [], (err, result) => {
        const totalCost = result ? (result.total || 0) : 0;

        db.run(`INSERT INTO Test_Requests (patient_id, doctor_id, priority, status) VALUES (?, ?, ?, 'Pending')`,
            [patient_id, req.user.id, priority || 'Normal'], function(err) {
                if (err) { console.error('[REQ] Failed to insert Test_Request:', err.message); return res.status(500).json({ error: err.message }); }
                
                const rawId = this.lastID;
                
                // Belt-and-suspenders: if WASM lastID is 0, query the real ID directly
                const proceedWithId = (rid) => {
                    console.log(`[REQ] Proceeding with request_id=${rid}. Tests: [${test_type_ids}]`);
                    const barcode = 'MLMS-' + Date.now() + '-' + rid;
                    
                    db.run(`INSERT INTO Samples (request_id, barcode, status) VALUES (?, ?, 'Pending')`, [rid, barcode]);
                    
                    const saveTests = (index) => {
                        if (index >= test_type_ids.length) {
                            db.get(`SELECT COUNT(*) as c FROM Request_Tests WHERE request_id = ?`, [rid], (err, row) => {
                                console.log(`[REQ] ✓ Request_Tests verified: ${row ? row.c : '?'} rows for request_id=${rid}`);
                            });
                            db.run(`INSERT INTO Payments (request_id, patient_id, total_amount, status) VALUES (?, ?, ?, 'Unpaid')`, 
                                [rid, patient_id, totalCost], (err) => {
                                    logAction(req.user.id, 'CREATE_REQUEST', JSON.stringify({ request_id: rid, tests: test_type_ids.length }));
                                    res.json({ request_id: rid, barcode });
                                });
                            return;
                        }
                        const tid = test_type_ids[index];
                        db.run(`INSERT INTO Request_Tests (request_id, test_type_id) VALUES (?, ?)`, 
                            [rid, tid], (err) => {
                                if (err) console.error(`[REQ] ✗ Request_Tests insert failed test_type_id=${tid}:`, err.message);
                                else console.log(`[REQ] ✓ Request_Tests: request_id=${rid}, test_type_id=${tid}`);
                                saveTests(index + 1);
                            });
                    };
                    saveTests(0);
                };

                if (rawId > 0) {
                    proceedWithId(rawId);
                } else {
                    // WASM wrapper returned 0 — query actual ID
                    db.get(`SELECT MAX(id) as id FROM Test_Requests`, [], (err, row) => {
                        const actualId = row ? row.id : 0;
                        console.log(`[REQ] lastID was 0, queried actual id=${actualId}`);
                        proceedWithId(actualId);
                    });
                }
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

app.put('/api/requests/:id/start-testing', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE Test_Requests SET status = 'Testing' WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.id, 'START_TESTING', JSON.stringify({ request_id: id }));
        res.json({ success: true });
    });
});

app.get('/api/requests/:id/params', authenticateToken, (req, res) => {
    const { id } = req.params;
    
    // First check: does this request even have tests assigned?
    db.get(`SELECT COUNT(*) as c FROM Request_Tests WHERE request_id = ?`, [id], (err, countRow) => {
        const testCount = countRow ? countRow.c : 0;
        console.log(`[PARAMS] Request ${id} has ${testCount} rows in Request_Tests`);
        
        const query = `
            SELECT 
                r.id as request_test_id,
                COALESCE(tp.id, t.id * -1) as parameter_id, 
                t.name as test_name, 
                COALESCE(tp.name, 'General Result') as parameter_name, 
                COALESCE(tp.unit, t.unit, '-') as unit, 
                COALESCE(tp.normal_min, t.normal_min, 0) as normal_min, 
                COALESCE(tp.normal_max, t.normal_max, 0) as normal_max,
                t.id as test_type_id,
                res.result_value,
                res.is_abnormal
            FROM Request_Tests r
            JOIN Test_Types t ON r.test_type_id = t.id
            LEFT JOIN Test_Parameters tp ON t.id = tp.test_type_id
            LEFT JOIN Test_Results res ON res.request_test_id = r.id 
                 AND ( (tp.id IS NOT NULL AND res.test_parameter_id = tp.id) 
                       OR (tp.id IS NULL AND res.test_parameter_id IS NULL) )
            WHERE r.request_id = ?
        `;
        db.all(query, [id], (err, rows) => {
            if (err) { console.error('[PARAMS] Query error:', err.message); return res.status(500).json({ error: err.message }); }
            console.log(`[PARAMS] Returned ${rows.length} parameter rows for request ${id}`);
            res.json(rows);
        });
    });
});

// ==========================================
// TEST RESULTS
// ==========================================
app.post('/api/results', authenticateToken, (req, res) => {
    const { request_id, request_test_id, result_value } = req.body;
    const parameter_id = parseInt(req.body.parameter_id);
    
    // Virtual parameters are negative
    const isVirtual = parameter_id < 0;
    const test_type_id = isVirtual ? Math.abs(parameter_id) : null;
    const real_parameter_id = isVirtual ? null : parameter_id;

    const findParamSql = isVirtual 
        ? `SELECT id as test_type_id, normal_min, normal_max FROM Test_Types WHERE id = ?`
        : `SELECT test_type_id, normal_min, normal_max FROM Test_Parameters WHERE id = ?`;
    const findParamId = isVirtual ? test_type_id : real_parameter_id;

    db.get(findParamSql, [findParamId], (err, param) => {
        if (err || !param) return res.status(500).json({ error: 'Test target not found' });
        
        const isAbnormal = result_value < param.normal_min || result_value > param.normal_max;
        
        // UNIQUE CHECK: Use request_test_id + parameter_id
        const checkExistingSql = `SELECT id FROM Test_Results WHERE request_test_id = ? AND COALESCE(test_parameter_id, 0) = COALESCE(?, 0)`;
        const checkExistingParams = [request_test_id, real_parameter_id];

        db.get(checkExistingSql, checkExistingParams, (err, existing) => {
            const query = existing 
                ? `UPDATE Test_Results SET result_value = ?, is_abnormal = ?, technician_id = ?, entered_at = CURRENT_TIMESTAMP WHERE id = ?`
                : `INSERT INTO Test_Results (result_value, is_abnormal, technician_id, request_id, test_type_id, test_parameter_id, request_test_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            const params = existing
                ? [result_value, isAbnormal, req.user.id, existing.id]
                : [result_value, isAbnormal, req.user.id, request_id, param.test_type_id || test_type_id, real_parameter_id, request_test_id];

            db.run(query, params, function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // AUTOMATIC COMPLETION LOGIC (More robust)
                const checkDoneQuery = `
                    SELECT COUNT(*) as missing_count
                    FROM (
                        SELECT tp.id 
                        FROM Request_Tests rt 
                        JOIN Test_Parameters tp ON rt.test_type_id = tp.test_type_id 
                        WHERE rt.request_id = ?
                        EXCEPT
                        SELECT test_parameter_id FROM Test_Results WHERE request_id = ?
                    )
                `;
                db.get(checkDoneQuery, [request_id, request_id], (err, row) => {
                    if (row && row.missing_count === 0) {
                        db.run(`UPDATE Test_Requests SET status = 'Tested' WHERE id = ?`, [request_id]);
                    }
                });
                
                logAction(req.user.id, existing ? 'UPDATE_RESULT' : 'ENTER_RESULT', JSON.stringify({ request_id, parameter_id }));
                res.json({ success: true, is_abnormal: isAbnormal });
            });
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
            SELECT 
                res.*, 
                COALESCE(tp.name, 'Unmapped Parameter') as parameter_name, 
                COALESCE(t.name, 'Unmapped Test') as test_name, 
                COALESCE(tp.unit, t.unit, '') as unit,
                COALESCE(tp.normal_min, t.normal_min, 0) as normal_min,
                COALESCE(tp.normal_max, t.normal_max, 0) as normal_max,
                COALESCE(tech.full_name, 'Unknown Technician') as tech_name
            FROM Test_Results res
            LEFT JOIN Test_Parameters tp ON res.test_parameter_id = tp.id
            LEFT JOIN Test_Types t ON res.test_type_id = t.id
            LEFT JOIN Users tech ON res.technician_id = tech.id
            WHERE res.request_id = ?
            ORDER BY t.name ASC
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
        SELECT p.id as patient_id, p.first_name, p.last_name, py.id, py.request_id, py.total_amount, py.status, py.created_at
        FROM Patients p
        JOIN Payments py ON py.patient_id = p.id
        ORDER BY py.created_at DESC, p.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/billing/:id/pay', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT status FROM Payments WHERE id = ?`, [id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'Invoice not found' });
        const newStatus = row.status === 'Paid' ? 'Unpaid' : 'Paid';
        db.run(`UPDATE Payments SET status = ? WHERE id = ?`, [newStatus, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAction(req.user.id, 'TOGGLE_PAYMENT', JSON.stringify({ payment_id: id, status: newStatus }));
            res.json({ success: true, status: newStatus });
        });
    });
});

// All other requests serve the React App
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
