const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'mlms.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeSchemas();
    }
});

function initializeSchemas() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Patients Table
        db.run(`CREATE TABLE IF NOT EXISTS Patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            dob DATE,
            gender TEXT,
            phone TEXT,
            history TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Test_Types Table
        db.run(`CREATE TABLE IF NOT EXISTS Test_Types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            cost REAL NOT NULL,
            normal_min REAL,
            normal_max REAL,
            unit TEXT
        )`);

        // Test_Requests Table
        db.run(`CREATE TABLE IF NOT EXISTS Test_Requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            doctor_id INTEGER,
            priority TEXT DEFAULT 'Normal',
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES Patients(id),
            FOREIGN KEY(doctor_id) REFERENCES Users(id)
        )`);

        // Samples Table
        db.run(`CREATE TABLE IF NOT EXISTS Samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            barcode TEXT UNIQUE,
            collected_at DATETIME,
            status TEXT DEFAULT 'Collected',
            FOREIGN KEY(request_id) REFERENCES Test_Requests(id)
        )`);

        // Test_Results Table
        db.run(`CREATE TABLE IF NOT EXISTS Test_Results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            test_type_id INTEGER,
            technician_id INTEGER,
            result_value REAL,
            is_abnormal BOOLEAN,
            entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(request_id) REFERENCES Test_Requests(id),
            FOREIGN KEY(test_type_id) REFERENCES Test_Types(id),
            FOREIGN KEY(technician_id) REFERENCES Users(id)
        )`);

        // Validations Table
        db.run(`CREATE TABLE IF NOT EXISTS Validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            supervisor_id INTEGER,
            action TEXT,
            comments TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(request_id) REFERENCES Test_Requests(id),
            FOREIGN KEY(supervisor_id) REFERENCES Users(id)
        )`);

        // Payments Table
        db.run(`CREATE TABLE IF NOT EXISTS Payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            total_amount REAL,
            status TEXT DEFAULT 'Unpaid',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(request_id) REFERENCES Test_Requests(id)
        )`);

        // Audit Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS Audit_Logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )`);

        // Seed Users if empty
        db.get("SELECT COUNT(*) as count FROM Users", (err, row) => {
            if (row && row.count === 0) {
                const insertUser = db.prepare(`INSERT INTO Users (username, full_name, role) VALUES (?, ?, ?)`);
                insertUser.run('admin', 'Mahamat Oumar', 'Admin');
                insertUser.run('rec1', 'Fatima Ali', 'Receptionist');
                insertUser.run('dr1', 'Dr. Abakar Idriss', 'Doctor');
                insertUser.run('tech1', 'Moussa Yaya', 'Technician');
                insertUser.run('sup1', 'Zenaba Brahim', 'Supervisor');
                insertUser.finalize();
                console.log('Seeded initial users.');
            }
        });

        // Seed Test Types if empty
        db.get("SELECT COUNT(*) as count FROM Test_Types", (err, row) => {
            if (row && row.count === 0) {
                const insertTest = db.prepare(`INSERT INTO Test_Types (name, description, cost, normal_min, normal_max, unit) VALUES (?, ?, ?, ?, ?, ?)`);
                insertTest.run('Complete Blood Count (CBC)', 'Basic blood test', 50.0, 4.0, 10.0, 'x10^9/L');
                insertTest.run('Fasting Blood Sugar (FBS)', 'Diabetes screening', 30.0, 70.0, 100.0, 'mg/dL');
                insertTest.run('Lipid Profile', 'Cholesterol levels', 80.0, 0.0, 200.0, 'mg/dL');
                insertTest.run('Liver Function Test', 'Liver enzymes', 100.0, 7.0, 56.0, 'U/L');
                insertTest.run('Kidney Function Test', 'Creatinine and Urea', 90.0, 0.6, 1.2, 'mg/dL');
                insertTest.finalize();
                console.log('Seeded initial test types.');
            }
        });
    });
}

module.exports = db;
