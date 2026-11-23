// server.js  (project root: student-performance-system/)
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const db = require("./config/db"); // db.js also loads the .env file

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------
   SIMPLE LOGIN
   Username and password come from your .env file:
     ADMIN_USER=admin
     ADMIN_PASSWORD=admin123
   If they are missing, these same defaults are used.
   After a correct login the server gives the browser a random
   token. The browser sends that token with every request.
------------------------------------------------------------ */
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_TIME = 8 * 60 * 60 * 1000; // 8 hours
const sessions = new Map(); // token -> expiry time

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong username or password." });
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TIME);
  res.json({ token, user: ADMIN_USER });
});

// Health check stays public
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS connected");
    res.json({
      message: "Server and MySQL connected",
      database: rows[0].connected === 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Every route below this line needs a valid login token
function requireLogin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const expires = sessions.get(token);

  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Please log in again." });
  }

  req.token = token;
  next();
}

app.use("/api", requireLogin);

app.post("/api/logout", (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Logged out." });
});

/* ------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------ */
app.get("/api/dashboard", async (req, res) => {
  try {
    const [students] = await db.query("SELECT COUNT(*) AS total FROM Students");

    // COLLATE on both sides avoids "Illegal mix of collations" when the view
    // was created with a different text setting than the connection.
    const [results] = await db.query(`
      SELECT
        COUNT(*) AS total_results,
        ROUND(AVG(percentage), 2) AS average_percentage,
        ROUND(100.0 * SUM(result COLLATE utf8mb4_general_ci = 'PASS' COLLATE utf8mb4_general_ci) / COUNT(*), 2) AS pass_rate
      FROM StudentResults
    `);

    res.json({
      totalStudents: students[0].total,
      totalResults: results[0].total_results,
      averagePercentage: results[0].average_percentage,
      passRate: results[0].pass_rate
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Could not load dashboard." });
  }
});

// Average marks of every subject (used by the bar chart)
app.get("/api/subjects/averages", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        sub.subject_id,
        sub.subject_name,
        ROUND(AVG(m.marks_obtained), 2) AS average_marks
      FROM Subjects sub
      LEFT JOIN Marks m ON sub.subject_id = m.subject_id
      GROUP BY sub.subject_id, sub.subject_name
      ORDER BY sub.subject_name
    `);
    res.json(rows);
  } catch (error) {
    console.error("Averages error:", error);
    res.status(500).json({ error: "Could not load subject averages." });
  }
});

/* ------------------------------------------------------------
   STUDENTS
------------------------------------------------------------ */
app.get("/api/students", async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT student_id, roll_no, name, email, department, semester
      FROM Students
      ORDER BY student_id DESC
    `);
    res.json(students);
  } catch (error) {
    console.error("Get students error:", error);
    res.status(500).json({ error: "Could not load students." });
  }
});

app.post("/api/students", async (req, res) => {
  try {
    const { roll_no, name, email, department, semester } = req.body;
    const roll = String(roll_no || "").trim();
    const fullName = String(name || "").trim();

    if (!roll || !fullName) {
      return res.status(400).json({
        error: "Roll number and student name are required."
      });
    }

    const [result] = await db.query(
      `INSERT INTO Students (roll_no, name, email, department, semester)
       VALUES (?, ?, ?, ?, ?)`,
      [
        roll,
        fullName,
        String(email || "").trim() || null,
        String(department || "").trim() || null,
        semester || null
      ]
    );

    res.status(201).json({
      message: "Student added successfully!",
      student_id: result.insertId
    });
  } catch (error) {
    console.error("Add student error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Roll number or email already exists."
      });
    }
    res.status(500).json({ error: "Could not add student." });
  }
});

app.put("/api/students/:id", async (req, res) => {
  try {
    const { roll_no, name, email, department, semester } = req.body;
    const roll = String(roll_no || "").trim();
    const fullName = String(name || "").trim();

    if (!roll || !fullName) {
      return res.status(400).json({
        error: "Roll number and name are required."
      });
    }

    const [result] = await db.query(
      `UPDATE Students
       SET roll_no = ?, name = ?, email = ?, department = ?, semester = ?
       WHERE student_id = ?`,
      [
        roll,
        fullName,
        String(email || "").trim() || null,
        String(department || "").trim() || null,
        semester || null,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.query(
        "SELECT student_id FROM Students WHERE student_id = ?",
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Student not found." });
      }
    }

    res.json({ message: "Student updated successfully!" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "That roll number or email already exists."
      });
    }
    console.error("Update student error:", error);
    res.status(500).json({ error: "Could not update student." });
  }
});

// Deleting a student also deletes their marks first.
// Otherwise MySQL refuses, because Marks still points to the student.
app.delete("/api/students/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      "DELETE FROM Marks WHERE student_id = ?",
      [req.params.id]
    );

    const [result] = await connection.query(
      "DELETE FROM Students WHERE student_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Student not found." });
    }

    await connection.commit();
    res.json({ message: "Student deleted successfully!" });
  } catch (error) {
    await connection.rollback();
    console.error("Delete student error:", error);
    res.status(500).json({ error: "Could not delete student." });
  } finally {
    connection.release();
  }
});

/* ------------------------------------------------------------
   RESULTS (reads the StudentResults view)
------------------------------------------------------------ */
app.get("/api/results", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM StudentResults ORDER BY percentage DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Results error:", error);
    res.status(500).json({ error: "Could not load results." });
  }
});

/* ------------------------------------------------------------
   MARKS
------------------------------------------------------------ */
app.get("/api/marks/options", async (req, res) => {
  try {
    const [students] = await db.query(
      "SELECT student_id, roll_no, name FROM Students ORDER BY name"
    );
    const [subjects] = await db.query(
      "SELECT subject_id, subject_name, max_marks FROM Subjects ORDER BY subject_name"
    );
    const [exams] = await db.query(
      "SELECT exam_id, exam_name, DATE_FORMAT(exam_date, '%Y-%m-%d') AS exam_date FROM Exams ORDER BY exam_date DESC, exam_id DESC"
    );
    res.json({ students, subjects, exams });
  } catch (error) {
    console.error("Marks options error:", error);
    res.status(500).json({ error: "Could not load marks form options." });
  }
});

app.get("/api/marks", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.student_id, s.roll_no, s.name,
        sub.subject_id, sub.subject_name, sub.max_marks,
        e.exam_id, e.exam_name,
        m.marks_obtained
      FROM Marks m
      JOIN Students s ON s.student_id = m.student_id
      JOIN Subjects sub ON sub.subject_id = m.subject_id
      JOIN Exams e ON e.exam_id = m.exam_id
      ORDER BY e.exam_id DESC, s.roll_no, sub.subject_name
    `);
    res.json(rows);
  } catch (error) {
    console.error("Get marks error:", error);
    res.status(500).json({ error: "Could not load marks." });
  }
});

// Add marks, or update them if that student/subject/exam already exists
app.post("/api/marks", async (req, res) => {
  try {
    const { student_id, subject_id, exam_id, marks_obtained } = req.body;

    if (
      !student_id || !subject_id || !exam_id ||
      marks_obtained === "" || marks_obtained == null
    ) {
      return res.status(400).json({
        error: "Please select a student, subject, exam and enter marks."
      });
    }

    const marks = Number(marks_obtained);

    if (!Number.isFinite(marks) || marks < 0) {
      return res.status(400).json({
        error: "Marks must be a valid non-negative number."
      });
    }

    const [subjects] = await db.query(
      "SELECT max_marks FROM Subjects WHERE subject_id = ?",
      [subject_id]
    );

    if (!subjects.length) {
      return res.status(404).json({ error: "Subject not found." });
    }

    if (marks > Number(subjects[0].max_marks)) {
      return res.status(400).json({
        error: `Marks cannot exceed ${subjects[0].max_marks}.`
      });
    }

    await db.query(
      `INSERT INTO Marks (student_id, subject_id, exam_id, marks_obtained)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE marks_obtained = ?`,
      [student_id, subject_id, exam_id, marks, marks]
    );

    res.json({ message: "Marks saved successfully!" });
  } catch (error) {
    console.error("Save marks error:", error);

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        error: "Selected student, subject or exam does not exist."
      });
    }
    res.status(500).json({ error: "Could not save marks." });
  }
});

/* ------------------------------------------------------------
   GRADES  (used by the report card)
   A subject mark below PASS_MARK means the student fails.
------------------------------------------------------------ */
const PASS_MARK = 40;

function gradeFor(percent) {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B+";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

/* ------------------------------------------------------------
   SUBJECTS  (add, edit, delete from the website)
------------------------------------------------------------ */
app.get("/api/subjects", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT subject_id, subject_name, max_marks FROM Subjects ORDER BY subject_name"
    );
    res.json(rows);
  } catch (error) {
    console.error("Get subjects error:", error);
    res.status(500).json({ error: "Could not load subjects." });
  }
});

function readSubject(body) {
  const subject_name = String(body.subject_name || "").trim();
  const max_marks = Number(body.max_marks);

  if (!subject_name) return { error: "Enter the subject name." };
  if (!Number.isFinite(max_marks) || max_marks <= 0) {
    return { error: "Maximum marks must be a number above 0." };
  }
  return { subject_name, max_marks };
}

app.post("/api/subjects", async (req, res) => {
  const data = readSubject(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  try {
    const [result] = await db.query(
      "INSERT INTO Subjects (subject_name, max_marks) VALUES (?, ?)",
      [data.subject_name, data.max_marks]
    );
    res.status(201).json({
      message: "Subject added successfully!",
      subject_id: result.insertId
    });
  } catch (error) {
    console.error("Add subject error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That subject already exists." });
    }
    res.status(500).json({ error: "Could not add subject." });
  }
});

app.put("/api/subjects/:id", async (req, res) => {
  const data = readSubject(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  try {
    const [result] = await db.query(
      "UPDATE Subjects SET subject_name = ?, max_marks = ? WHERE subject_id = ?",
      [data.subject_name, data.max_marks, req.params.id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.query(
        "SELECT subject_id FROM Subjects WHERE subject_id = ?",
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Subject not found." });
      }
    }
    res.json({ message: "Subject updated successfully!" });
  } catch (error) {
    console.error("Update subject error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That subject already exists." });
    }
    res.status(500).json({ error: "Could not update subject." });
  }
});

// A subject that already has marks cannot be deleted (foreign key protects it)
app.delete("/api/subjects/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM Subjects WHERE subject_id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Subject not found." });
    }
    res.json({ message: "Subject deleted successfully!" });
  } catch (error) {
    console.error("Delete subject error:", error);
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: "This subject already has marks, so it cannot be deleted."
      });
    }
    res.status(500).json({ error: "Could not delete subject." });
  }
});

/* ------------------------------------------------------------
   EXAMS  (add, edit, delete from the website)
------------------------------------------------------------ */
app.get("/api/exams", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT exam_id, exam_name, DATE_FORMAT(exam_date, '%Y-%m-%d') AS exam_date
      FROM Exams
      ORDER BY exam_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Get exams error:", error);
    res.status(500).json({ error: "Could not load exams." });
  }
});

function readExam(body) {
  const exam_name = String(body.exam_name || "").trim();
  const exam_date = String(body.exam_date || "").trim() || null;

  if (!exam_name) return { error: "Enter the exam name." };
  if (exam_date && !/^\d{4}-\d{2}-\d{2}$/.test(exam_date)) {
    return { error: "Choose a valid exam date." };
  }
  return { exam_name, exam_date };
}

app.post("/api/exams", async (req, res) => {
  const data = readExam(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  try {
    const [result] = await db.query(
      "INSERT INTO Exams (exam_name, exam_date) VALUES (?, ?)",
      [data.exam_name, data.exam_date]
    );
    res.status(201).json({
      message: "Exam added successfully!",
      exam_id: result.insertId
    });
  } catch (error) {
    console.error("Add exam error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That exam already exists." });
    }
    res.status(500).json({ error: "Could not add exam." });
  }
});

app.put("/api/exams/:id", async (req, res) => {
  const data = readExam(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  try {
    const [result] = await db.query(
      "UPDATE Exams SET exam_name = ?, exam_date = ? WHERE exam_id = ?",
      [data.exam_name, data.exam_date, req.params.id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.query(
        "SELECT exam_id FROM Exams WHERE exam_id = ?",
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Exam not found." });
      }
    }
    res.json({ message: "Exam updated successfully!" });
  } catch (error) {
    console.error("Update exam error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That exam already exists." });
    }
    res.status(500).json({ error: "Could not update exam." });
  }
});

app.delete("/api/exams/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM Exams WHERE exam_id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Exam not found." });
    }
    res.json({ message: "Exam deleted successfully!" });
  } catch (error) {
    console.error("Delete exam error:", error);
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: "This exam already has marks, so it cannot be deleted."
      });
    }
    res.status(500).json({ error: "Could not delete exam." });
  }
});

/* ------------------------------------------------------------
   REPORT CARD  (one student, one exam)
------------------------------------------------------------ */
app.get("/api/report/:studentId/:examId", async (req, res) => {
  try {
    const [students] = await db.query(
      `SELECT student_id, roll_no, name, email, department, semester
       FROM Students WHERE student_id = ?`,
      [req.params.studentId]
    );
    const [exams] = await db.query(
      `SELECT exam_id, exam_name, DATE_FORMAT(exam_date, '%Y-%m-%d') AS exam_date
       FROM Exams WHERE exam_id = ?`,
      [req.params.examId]
    );

    if (!students.length || !exams.length) {
      return res.status(404).json({ error: "Student or exam not found." });
    }

    // JOIN: marks + subject names for this student in this exam
    const [rows] = await db.query(
      `SELECT sub.subject_name, sub.max_marks, m.marks_obtained
       FROM Marks m
       JOIN Subjects sub ON sub.subject_id = m.subject_id
       WHERE m.student_id = ? AND m.exam_id = ?
       ORDER BY sub.subject_name`,
      [req.params.studentId, req.params.examId]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "No marks are recorded for this student in this exam."
      });
    }

    const subjects = rows.map(row => {
      const obtained = Number(row.marks_obtained);
      const maximum = Number(row.max_marks);
      return {
        subject_name: row.subject_name,
        marks_obtained: obtained,
        max_marks: maximum,
        grade: gradeFor((obtained / maximum) * 100),
        passed: obtained >= PASS_MARK
      };
    });

    const total = subjects.reduce((sum, s) => sum + s.marks_obtained, 0);
    const maximum = subjects.reduce((sum, s) => sum + s.max_marks, 0);
    const percentage = Math.round((total / maximum) * 10000) / 100;
    const result = subjects.every(s => s.passed) ? "PASS" : "FAIL";

    // Rank = 1 + number of students in this exam with a higher percentage
    const [rankRows] = await db.query(
      `SELECT COUNT(*) + 1 AS rank_no
       FROM StudentResults
       WHERE exam_name = ? AND percentage > ?`,
      [exams[0].exam_name, percentage]
    );
    const [sizeRows] = await db.query(
      "SELECT COUNT(*) AS class_size FROM StudentResults WHERE exam_name = ?",
      [exams[0].exam_name]
    );

    res.json({
      student: students[0],
      exam: exams[0],
      subjects,
      total,
      maximum,
      percentage,
      grade: gradeFor(percentage),
      result,
      rank: rankRows[0].rank_no,
      classSize: sizeRows[0].class_size
    });
  } catch (error) {
    console.error("Report card error:", error);
    res.status(500).json({ error: "Could not build the report card." });
  }
});

/* ------------------------------------------------------------
   ANALYTICS  (GROUP BY, JOIN, subquery and aggregate functions)
------------------------------------------------------------ */
app.get("/api/analytics", async (req, res) => {
  try {
    // Top 5 results, with rank inside each exam (correlated subquery)
    const [toppers] = await db.query(`
      SELECT r.roll_no, r.name, r.exam_name, r.percentage,
        (SELECT COUNT(*) + 1
         FROM StudentResults r2
         WHERE r2.exam_name = r.exam_name
           AND r2.percentage > r.percentage) AS rank_no
      FROM StudentResults r
      ORDER BY r.percentage DESC
      LIMIT 5
    `);

    // Students who scored below the pass mark, with the subjects they failed
    const [atRisk] = await db.query(
      `SELECT s.roll_no, s.name, e.exam_name,
              COUNT(*) AS failed_count,
              GROUP_CONCAT(sub.subject_name ORDER BY sub.subject_name SEPARATOR ', ') AS failed_subjects
       FROM Marks m
       JOIN Students s ON s.student_id = m.student_id
       JOIN Subjects sub ON sub.subject_id = m.subject_id
       JOIN Exams e ON e.exam_id = m.exam_id
       WHERE m.marks_obtained < ?
       GROUP BY s.student_id, s.roll_no, s.name, e.exam_id, e.exam_name
       ORDER BY failed_count DESC, s.name`,
      [PASS_MARK]
    );

    // Average percentage and pass rate for every department
    const [departments] = await db.query(`
      SELECT COALESCE(s.department, 'Not set') AS department,
             COUNT(*) AS result_count,
             ROUND(AVG(r.percentage), 2) AS average_percentage,
             ROUND(100.0 * SUM(r.result COLLATE utf8mb4_general_ci = 'PASS' COLLATE utf8mb4_general_ci) / COUNT(*), 1) AS pass_rate
      FROM StudentResults r
      JOIN Students s ON s.roll_no = r.roll_no
      GROUP BY COALESCE(s.department, 'Not set')
      ORDER BY average_percentage DESC
    `);

    // How hard is each subject? average, highest, lowest and pass percentage
    const [subjects] = await db.query(
      `SELECT sub.subject_name,
              ROUND(AVG(m.marks_obtained), 2) AS average_marks,
              MAX(m.marks_obtained) AS highest,
              MIN(m.marks_obtained) AS lowest,
              ROUND(100.0 * SUM(m.marks_obtained >= ?) / COUNT(*), 1) AS pass_percent
       FROM Subjects sub
       JOIN Marks m ON m.subject_id = sub.subject_id
       GROUP BY sub.subject_id, sub.subject_name
       ORDER BY pass_percent ASC, sub.subject_name`,
      [PASS_MARK]
    );

    res.json({ toppers, atRisk, departments, subjects });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Could not load analytics." });
  }
});

/* ------------------------------------------------------------
   START SERVER
------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await db.query("SELECT 1");
    console.log("MySQL connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
