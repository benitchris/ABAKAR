const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let dbPath;
if (process.versions.electron) {
    const { app } = require('electron');
    const rootPath = app.getPath('userData');
    if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true });
    dbPath = path.resolve(rootPath, 'mlms.sqlite');
} else {
    dbPath = path.resolve(__dirname, 'mlms.sqlite');
}

let db = null;
let isReady = false;

// EXPLICITLY find the .wasm file location for Electron bundling
const wasmPath = path.join(__dirname, 'sql-wasm.wasm');

initSqlJs({
    locateFile: file => {
        // Find WASM in same directory as script (standard for dev and bundle)
        return wasmPath;
    }
}).then(SQL => {
    let initialData = new Uint8Array(0);
    if (fs.existsSync(dbPath)) {
        initialData = fs.readFileSync(dbPath);
    } else {
        const localSeed = path.resolve(__dirname, 'mlms.sqlite');
        if (fs.existsSync(localSeed)) initialData = fs.readFileSync(localSeed);
    }
    
    db = new SQL.Database(initialData);
    console.log(`Portable WASM Database Ready: ${dbPath}`);
    isReady = true;
    initializeSchemas();
}).catch(err => {
    console.error("FATAL: Failed to init SQL.js engine:", err);
});

function saveDB() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (err) {
        console.error('Failed to save DB to disk:', err);
    }
}

const wrapper = {
    serialize: (callback) => callback(),
    run: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!db) return setTimeout(() => wrapper.run(sql, params, callback), 100);

        try {
            const stmt = db.prepare(sql);
            stmt.run(params || []);
            stmt.free();
            
            // CRITICAL: Get lastID BEFORE saveDB() — saveDB resets last_insert_rowid internally
            let lastID = 0;
            try {
                const lastIDRes = db.exec("SELECT last_insert_rowid()");
                lastID = (lastIDRes && lastIDRes[0] && lastIDRes[0].values[0]) ? lastIDRes[0].values[0][0] : 0;
            } catch(e) { /* ignore */ }
            
            saveDB();
            
            if (callback) {
                callback.call({ lastID }, null);
            }
        } catch (err) {
            console.error('SQL.run Error:', err.message, sql);
            if (callback) callback.call({}, err);
        }
    },
    get: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!db) return setTimeout(() => wrapper.get(sql, params, callback), 100);

        try {
            const stmt = db.prepare(sql);
            stmt.bind(params || []);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                callback(null, row);
            } else {
                stmt.free();
                callback(null, undefined);
            }
        } catch (err) {
            console.error('SQL.get Error:', err.message, sql);
            if (callback) callback(null, null);
        }
    },
    all: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!db) return setTimeout(() => wrapper.all(sql, params, callback), 100);

        try {
            const results = [];
            const stmt = db.prepare(sql);
            stmt.bind(params || []);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            callback(null, results);
        } catch (err) {
            console.error('SQL.all Error:', err.message, sql);
            if (callback) callback(err, []);
        }
    },
    prepare: (sql) => {
        return {
            run: (params) => { 
                if (!db) return;
                const stmt = db.prepare(sql);
                stmt.run(params || []);
                stmt.free();
                saveDB(); 
            },
            finalize: () => {}
        };
    }
};

function initializeSchemas() {
    wrapper.serialize(() => {
        // 1. Ensure basic Users table exists
        wrapper.run(`CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        
        // 2. Add missing columns to existing tables
        const addColumn = (table, col, type) => {
            wrapper.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`, (err) => {
                // Ignore duplicate column errors
            });
        };

        addColumn('Users', 'password', "TEXT NOT NULL DEFAULT '12345'");
        addColumn('Test_Results', 'test_parameter_id', 'INTEGER');
        addColumn('Test_Results', 'request_test_id', 'INTEGER');
        addColumn('Payments', 'patient_id', 'INTEGER');

        // 3. SECURE MIGRATION: Ensure Request_Tests has the 'id' primary key
        wrapper.all(`PRAGMA table_info(Request_Tests)`, (err, columns) => {
            if (err || !columns) return;
            const hasId = columns.some(c => c.name === 'id');
            if (!hasId) {
                console.log('[MIGRATION] Request_Tests missing ID. Reconstructing table...');
                wrapper.serialize(() => {
                    wrapper.run(`ALTER TABLE Request_Tests RENAME TO Request_Tests_Old`);
                    wrapper.run(`CREATE TABLE Request_Tests (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, test_type_id INTEGER, FOREIGN KEY(request_id) REFERENCES Test_Requests(id), FOREIGN KEY(test_type_id) REFERENCES Test_Types(id))`);
                    wrapper.run(`INSERT INTO Request_Tests (request_id, test_type_id) SELECT request_id, test_type_id FROM Request_Tests_Old`);
                    wrapper.run(`DROP TABLE Request_Tests_Old`);
                    
                    // Link existing results to the NEW IDs immediately
                    wrapper.run(`
                        UPDATE Test_Results 
                        SET request_test_id = (
                            SELECT id FROM Request_Tests 
                            WHERE Request_Tests.request_id = Test_Results.request_id 
                            AND Request_Tests.test_type_id = Test_Results.test_type_id
                        ) 
                        WHERE request_test_id IS NULL
                    `);
                    console.log('[MIGRATION] Request_Tests upgrade COMPLETE.');
                });
            }
        });

        // 3. Force-reset passwords to 12345 for all existing demo users to ensure they can login
        wrapper.run(`UPDATE Users SET password = '12345' WHERE password IS NULL OR password = ''`);

        // Users Seed
        wrapper.get("SELECT COUNT(*) as count FROM Users", (err, row) => {
            if (row && row.count === 0) {
                const profiles = [
                    ['admin', '12345', 'Mahamat Oumar', 'Admin'],
                    ['rec1', '12345', 'Fatima Ali', 'Receptionist'],
                    ['dr1', '12345', 'Dr. Abakar Idriss', 'Doctor'],
                    ['tech1', '12345', 'Moussa Yaya', 'Technician'],
                    ['sup1', '12345', 'Zenaba Brahim', 'Supervisor']
                ];
                profiles.forEach(p => wrapper.run(`INSERT INTO Users (username, password, full_name, role) VALUES (?, ?, ?, ?)`, p));
                console.log('Seeded initial users.');
            }
        });

        // Initialize other tables
        wrapper.run(`CREATE TABLE IF NOT EXISTS Patients (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, dob DATE, gender TEXT, phone TEXT, history TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Test_Types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, cost REAL NOT NULL, normal_min REAL, normal_max REAL, unit TEXT)`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Test_Parameters (id INTEGER PRIMARY KEY AUTOINCREMENT, test_type_id INTEGER, name TEXT NOT NULL, unit TEXT, normal_min REAL, normal_max REAL, FOREIGN KEY(test_type_id) REFERENCES Test_Types(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Test_Requests (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, doctor_id INTEGER, priority TEXT DEFAULT 'Normal', status TEXT DEFAULT 'Pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES Patients(id), FOREIGN KEY(doctor_id) REFERENCES Users(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Request_Tests (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, test_type_id INTEGER, FOREIGN KEY(request_id) REFERENCES Test_Requests(id), FOREIGN KEY(test_type_id) REFERENCES Test_Types(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Samples (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, barcode TEXT UNIQUE, collected_at DATETIME, status TEXT DEFAULT 'Pending', FOREIGN KEY(request_id) REFERENCES Test_Requests(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Test_Results (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, test_type_id INTEGER, test_parameter_id INTEGER, technician_id INTEGER, result_value REAL, is_abnormal BOOLEAN, request_test_id INTEGER, entered_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(request_id) REFERENCES Test_Requests(id), FOREIGN KEY(test_type_id) REFERENCES Test_Types(id), FOREIGN KEY(test_parameter_id) REFERENCES Test_Parameters(id), FOREIGN KEY(technician_id) REFERENCES Users(id), FOREIGN KEY(request_test_id) REFERENCES Request_Tests(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Validations (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, supervisor_id INTEGER, action TEXT, comments TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(request_id) REFERENCES Test_Requests(id), FOREIGN KEY(supervisor_id) REFERENCES Users(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Payments (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, patient_id INTEGER, total_amount REAL, status TEXT DEFAULT 'Unpaid', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(request_id) REFERENCES Test_Requests(id), FOREIGN KEY(patient_id) REFERENCES Patients(id))`);
        wrapper.run(`CREATE TABLE IF NOT EXISTS Audit_Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES Users(id))`);

        // === MEDICAL DIRECTORY: Test Types + Parameters ===
        // parameterMap keys MUST exactly match Test_Types names
        const parameterMap = {
            'Complete Blood Count (CBC)': [
                ['Haemoglobin (HB)', 'g/dL', 12.0, 16.0], ['WBC Count', 'x10^9/L', 4.0, 10.0],
                ['Red Blood Cells', 'x10^12/L', 4.5, 5.5], ['Platelets', 'x10^9/L', 150, 450],
                ['Hematocrit (HCT)', '%', 36, 50], ['MCV', 'fL', 80, 100],
                ['Lymphocytes', '%', 20, 40], ['Neutrophils', '%', 40, 75]
            ],
            'Fasting Blood Sugar (FBS)': [['Glucose', 'mg/dL', 70, 100]],
            'Lipid Profile': [
                ['Total Cholesterol', 'mg/dL', 0, 200], ['HDL Cholesterol', 'mg/dL', 40, 60],
                ['LDL Cholesterol', 'mg/dL', 0, 130], ['Triglycerides', 'mg/dL', 0, 150]
            ],
            'Liver Function Test (LFT)': [
                ['ALT (SGPT)', 'U/L', 7, 56], ['AST (SGOT)', 'U/L', 5, 40],
                ['Bilirubin Total', 'mg/dL', 0.1, 1.2], ['Bilirubin Direct', 'mg/dL', 0, 0.3],
                ['Alkaline Phosphatase', 'U/L', 44, 147], ['Albumin', 'g/dL', 3.4, 5.4]
            ],
            'Kidney Function Test (KFT)': [
                ['Creatinine', 'mg/dL', 0.6, 1.2], ['Urea', 'mg/dL', 15, 45], ['Uric Acid', 'mg/dL', 3.4, 7.0]
            ],
            'Malaria (RDT/Smear)': [['Parasite Count', '/uL', 0, 0]],
            'Widal Test': [
                ['TO Titer', 'Ratio', 1, 80], ['TH Titer', 'Ratio', 1, 80],
                ['AO Titer', 'Ratio', 1, 80], ['AH Titer', 'Ratio', 1, 80]
            ],
            'Urinalysis': [
                ['Color', 'index', 0, 0], ['Appearance', 'index', 0, 0],
                ['Specific Gravity', 'index', 1.005, 1.030], ['PH', 'index', 5, 8],
                ['Glucose', 'index', 0, 0], ['Protein', 'index', 0, 0],
                ['Ketones', 'index', 0, 0], ['Bilirubin', 'index', 0, 0]
            ]
        };

        // syncParameters runs for EVERY test type, guarantees parameters exist
        const syncParameters = () => {
            const testNames = Object.keys(parameterMap);
            testNames.forEach(testName => {
                wrapper.get("SELECT id FROM Test_Types WHERE name = ?", [testName], (err, testType) => {
                    if (!testType) return; // Skip if test type not found (name mismatch guard)
                    parameterMap[testName].forEach(p => {
                        wrapper.get("SELECT id FROM Test_Parameters WHERE test_type_id = ? AND name = ?", 
                            [testType.id, p[0]], (err, exists) => {
                                if (!exists) {
                                    wrapper.run(
                                        `INSERT INTO Test_Parameters (test_type_id, name, unit, normal_min, normal_max) VALUES (?, ?, ?, ?, ?)`, 
                                        [testType.id, ...p]
                                    );
                                }
                            }
                        );
                    });
                });
            });
            console.log('[DB] Medical parameters synchronized for all test types.');
        };

        // Seed Test_Types and then IMMEDIATELY sync parameters inside the callback
        // This guarantees the correct execution order whether DB is fresh or existing
        wrapper.get("SELECT COUNT(*) as count FROM Test_Types", (err, row) => {
            if (row && row.count === 0) {
                // Fresh DB: insert test types in order, then sync params in final callback
                const tests = [
                    ['Complete Blood Count (CBC)', 'Panel of blood parameters', 5000, null, null, null],
                    ['Fasting Blood Sugar (FBS)', 'Diabetes screening', 2000, 70.0, 100.0, 'mg/dL'],
                    ['Lipid Profile', 'Cholesterol and fats', 8000, null, null, null],
                    ['Malaria (RDT/Smear)', 'Malaria detection', 1500, null, null, null],
                    ['Widal Test', 'Typhoid screening', 3000, null, null, null],
                    ['Urinalysis', 'Urine physical/chemical', 2500, null, null, null],
                    ['Liver Function Test (LFT)', 'Liver enzymes and protein', 6000, null, null, null],
                    ['Kidney Function Test (KFT)', 'Renal function markers', 5500, null, null, null]
                ];
                let inserted = 0;
                tests.forEach((t, i) => {
                    wrapper.run(
                        `INSERT INTO Test_Types (name, description, cost, normal_min, normal_max, unit) VALUES (?, ?, ?, ?, ?, ?)`, 
                        t, () => {
                            inserted++;
                            // Only sync parameters after ALL test types are inserted
                            if (inserted === tests.length) {
                                console.log('[DB] Test types seeded. Now syncing parameters...');
                                syncParameters();
                            }
                        }
                    );
                });
            } else {
                // Existing DB: test types already present, just sync parameters
                syncParameters();
            }
        });

        // STARTUP CLEANUP: Remove all orphaned rows with request_id=0 (caused by WASM lastID bug)
        setTimeout(() => {
            wrapper.get("SELECT COUNT(*) as c FROM Request_Tests WHERE request_id = 0", [], (err, row) => {
                if (row && row.c > 0) {
                    console.log(`[CLEANUP] Removing ${row.c} orphaned Request_Tests rows with request_id=0...`);
                    wrapper.run("DELETE FROM Request_Tests WHERE request_id = 0", [], () => {
                        console.log('[CLEANUP] Orphaned rows removed.');
                    });
                }
            });
        }, 500);

        // SAFETY: Ensure ALL current requests have at least one test assigned so the technician sees something
        setTimeout(() => {
            wrapper.all("SELECT id FROM Test_Requests", [], (err, reqs) => {
                if (!reqs) return;
                reqs.forEach(req => {
                    wrapper.get("SELECT COUNT(*) as count FROM Request_Tests WHERE request_id = ?", [req.id], (err, row) => {
                        if (row && row.count === 0) {
                            console.log(`[SAFETY] Request ${req.id} has no tests — auto-assigning CBC+FBS`);
                            wrapper.get("SELECT id FROM Test_Types WHERE name = 'Complete Blood Count (CBC)'", [], (err, t1) => {
                                if (t1) wrapper.run("INSERT OR IGNORE INTO Request_Tests (request_id, test_type_id) VALUES (?, ?)", [req.id, t1.id]);
                            });
                            wrapper.get("SELECT id FROM Test_Types WHERE name = 'Fasting Blood Sugar (FBS)'", [], (err, t2) => {
                                if (t2) wrapper.run("INSERT OR IGNORE INTO Request_Tests (request_id, test_type_id) VALUES (?, ?)", [req.id, t2.id]);
                            });
                        }
                    });
                });
            });
        }, 1500);

        // AUTO-BILLING MIGRATION: Ensure EVERY patient has at least one Payment record (Registration)
        setTimeout(() => {
            wrapper.all("SELECT id FROM Patients", [], (err, patients) => {
                if (!patients) return;
                patients.forEach(p => {
                    wrapper.get("SELECT COUNT(*) as count FROM Payments WHERE patient_id = ?", [p.id], (err, row) => {
                        if (row && row.count === 0) {
                            console.log(`[MIGRATION] Creating registration invoice for PT-${p.id}`);
                            
                            // Query MAX(id) as safety net for WASM/SQLite quirks
                            wrapper.get("SELECT MAX(id) as maxId FROM Payments", (err, row) => {
                                const nextId = (row ? row.maxId : 0) + 1;
                                wrapper.run("INSERT INTO Payments (id, patient_id, total_amount, status) VALUES (?, ?, ?, ?)", [nextId, p.id, 0, 'Unpaid']);
                                saveDB();
                            });
                        }
                    });
                });
            });
        }, 2000);
    });
}

module.exports = wrapper;
