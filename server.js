const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// DB connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "12345", // your MySQL password
  database: "placement_management"
});

db.connect((err) => {
  if (err) console.error("❌ MySQL connection failed:", err);
  else console.log("✅ MySQL Connected!");
});

// ✅ Get all tables' data
app.get("/api/data", (req, res) => {
  const queries = {
    students: `
      SELECT s.*, d.dept_name AS department_name
      FROM Student s
      LEFT JOIN Department d ON s.department_id = d.dept_id`,
    departments: "SELECT * FROM Department",
    companies: "SELECT * FROM Company",
    job_roles: `
      SELECT j.*, c.company_name 
      FROM Job_Roles j
      LEFT JOIN Company c ON j.company_id = c.company_id`,
    placements: `
      SELECT p.*, s.student_name, j.role_title, c.company_name
      FROM Placement p
      LEFT JOIN Student s ON p.student_id = s.student_id
      LEFT JOIN Job_Roles j ON p.jobrole_id = j.jobrole_id
      LEFT JOIN Company c ON j.company_id = c.company_id`
  };

  let results = {};
  let done = 0;
  const total = Object.keys(queries).length;

  for (const key in queries) {
    db.query(queries[key], (err, data) => {
      if (err) {
        console.error(`Error on ${key}:`, err);
        return res.status(500).json({ error: err.message });
      }
      results[key] = data;
      done++;
      if (done === total) res.json(results);
    });
  }
});

// ✅ Add student
app.post("/api/students", (req, res) => {
  const { student_name, roll_no, cgpa, department_id } = req.body;
  db.query(
    "INSERT INTO Student (student_name, roll_no, cgpa, department_id) VALUES (?, ?, ?, ?)",
    [student_name, roll_no, cgpa, department_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "✅ Student added!", id: result.insertId });
    }
  );
});

// ✅ Add department
app.post("/api/departments", (req, res) => {
  const { dept_name } = req.body;
  db.query("INSERT INTO Department (dept_name) VALUES (?)", [dept_name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "✅ Department added!", id: result.insertId });
  });
});

// ✅ Add company
app.post("/api/companies", (req, res) => {
  const { company_name, location, contact_email, website } = req.body;
  db.query(
    "INSERT INTO Company (company_name, location, contact_email, website) VALUES (?, ?, ?, ?)",
    [company_name, location, contact_email, website],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "✅ Company added!", id: result.insertId });
    }
  );
});

// ✅ Add job role
app.post("/api/jobroles", (req, res) => {
  const { company_id, role_title, package_lpa } = req.body;
  db.query(
    "INSERT INTO Job_Roles (company_id, role_title, package_lpa) VALUES (?, ?, ?)",
    [company_id, role_title, package_lpa],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "✅ Job Role added!", id: result.insertId });
    }
  );
});

// ✅ Add placement
app.post("/api/placements", (req, res) => {
  const { student_id, jobrole_id, status } = req.body;
  db.query(
    "INSERT INTO Placement (student_id, jobrole_id, status) VALUES (?, ?, ?)",
    [student_id, jobrole_id, status || 'Applied'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "✅ Placement added!", id: result.insertId });
    }
  );
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

// ============================================
// STORED PROCEDURE ENDPOINTS
// ============================================

// Get placement statistics by department
app.get('/api/placement-stats', (req, res) => {
  db.query('CALL GetPlacementStats()', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || []);
  });
});

// Get eligible students for a job role
app.get('/api/eligible-students/:jobrole_id', (req, res) => {
  const { jobrole_id } = req.params;
  db.query('CALL GetEligibleStudents(?)', [jobrole_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || []);
  });
});

// Get top companies by average package
app.get('/api/top-companies', (req, res) => {
  db.query('CALL GetTopCompaniesByPackage()', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || []);
  });
});

// Apply for a job using stored procedure
app.post('/api/apply-job', (req, res) => {
  const { student_id, jobrole_id } = req.body;
  db.query('CALL ApplyForJob(?, ?, @app_id, @msg)', [student_id, jobrole_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT @app_id AS application_id, @msg AS message', (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        application_id: result[0].application_id,
        message: result[0].message
      });
    });
  });
});

// Record a placement using stored procedure
app.post('/api/record-placement', (req, res) => {
  const { student_id, jobrole_id, status } = req.body;
  db.query('CALL RecordPlacement(?, ?, ?, @place_id, @msg)', [student_id, jobrole_id, status || 'Applied'], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT @place_id AS placement_id, @msg AS message', (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        placement_id: result[0].placement_id,
        message: result[0].message
      });
    });
  });
});

// View: Placement Ready Students
app.get('/api/views/placement-ready', (req, res) => {
  db.query('SELECT * FROM Placement_Ready_Students', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// View: Active Job Openings
app.get('/api/views/active-jobs', (req, res) => {
  db.query('SELECT * FROM Active_Job_Openings', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// View: Student Placement Summary
app.get('/api/views/placement-summary', (req, res) => {
  db.query('SELECT * FROM Student_Placement_Summary', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Get student audit log
app.get('/api/student-audit', (req, res) => {
  db.query('SELECT * FROM Student_Audit ORDER BY action_time DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Debug: list registered routes
app.get('/debug/routes', (req, res) => {
  try {
    const routes = [];
    const stack = app._router && app._router.stack ? app._router.stack : [];
    stack.forEach((middleware) => {
      try {
        if (middleware && middleware.route) {
          const methods = Object.keys(middleware.route.methods || {}).map(m => m.toUpperCase()).join(',');
          routes.push({ path: middleware.route.path, methods });
        } else if (middleware && middleware.name === 'router' && middleware.handle && Array.isArray(middleware.handle.stack)) {
          middleware.handle.stack.forEach((handler) => {
            if (handler && handler.route) {
              const methods = Object.keys(handler.route.methods || {}).map(m => m.toUpperCase()).join(',');
              routes.push({ path: handler.route.path, methods });
            }
          });
        }
      } catch (innerErr) {
        // ignore this middleware
      }
    });
    res.json({ routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
