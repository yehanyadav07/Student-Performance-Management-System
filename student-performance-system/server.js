
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Test database connection
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

// Dashboard statistics
app.get("/api/dashboard", async (req, res) => {
    try {
        const [students] = await db.query(
            "SELECT COUNT(*) AS total FROM Students"
        );

        const [results] = await db.query(`
            SELECT
                COUNT(*) AS total_results,
                ROUND(AVG(percentage), 2) AS average_percentage,
                ROUND(
                    100.0 * SUM(result = 'PASS') / COUNT(*), 2
                ) AS pass_rate
            FROM StudentResults
        `);

        res.json({
            totalStudents: students[0].total,
            totalResults: results[0].total_results,
            averagePercentage: results[0].average_percentage,
            passRate: results[0].pass_rate
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get("/api/students", async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT
        student_id,
        roll_no,
        name,
        email,
        department,
        semester
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
    const {
      roll_no,
      name,
      email,
      department,
      semester
    } = req.body;

    if (!roll_no || !name) {
      return res.status(400).json({
        error: "Roll number and student name are required."
      });
    }

    const [result] = await db.query(
      `INSERT INTO Students
       (roll_no, name, email, department, semester)
       VALUES (?, ?, ?, ?, ?)`,
      [
        roll_no.trim(),
        name.trim(),
        email || null,
        department || null,
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

    res.status(500).json({
      error: "Could not add student."
    });
  }
});

// Get student results
app.get("/api/results", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT *
            FROM StudentResults
            ORDER BY percentage DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put("/api/students/:id", async (req, res) => {
  try {
    const { roll_no, name, email, department, semester } = req.body;
    const id = req.params.id;

    if (!roll_no?.trim() || !name?.trim()) {
      return res.status(400).json({
        error: "Roll number and name are required."
      });
    }

    const [result] = await db.query(
      `UPDATE Students
       SET roll_no = ?, name = ?, email = ?,
           department = ?, semester = ?
       WHERE student_id = ?`,
      [
        roll_no.trim(),
        name.trim(),
        email?.trim() || null,
        department?.trim() || null,
        semester || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.query(
        "SELECT student_id FROM Students WHERE student_id = ?",
        [id]
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

    console.error(error);
    res.status(500).json({ error: "Could not update student." });
  }
});

app.delete("/api/students/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM Students WHERE student_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    res.json({ message: "Student deleted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete student." });
  }
});


/* GET data needed for the marks form */
app.get("/api/marks/options", async (req, res) => {
  try {
    const [students] = await db.query(
      "SELECT student_id, roll_no, name FROM Students ORDER BY name"
    );

    const [subjects] = await db.query(
      "SELECT subject_id, subject_name, max_marks FROM Subjects ORDER BY subject_name"
    );

    const [exams] = await db.query(
      "SELECT exam_id, exam_name, exam_date FROM Exams ORDER BY exam_date DESC, exam_id DESC"
    );

    res.json({ students, subjects, exams });
  } catch (error) {
    console.error("Marks options error:", error);
    res.status(500).json({ error: "Could not load marks form options." });
  }
});

/* GET all saved marks */
app.get("/api/marks", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.student_id,
        s.roll_no,
        s.name,
        sub.subject_id,
        sub.subject_name,
        sub.max_marks,
        e.exam_id,
        e.exam_name,
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

/* ADD or update marks */
app.post("/api/marks", async (req, res) => {
  try {
    const { student_id, subject_id, exam_id, marks_obtained } = req.body;

    if (
      student_id == null || subject_id == null || exam_id == null ||
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

    const [result] = await db.query(
      `INSERT INTO Marks
       (student_id, subject_id, exam_id, marks_obtained)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE marks_obtained = ?`,
      [student_id, subject_id, exam_id, marks, marks]
    );

    res.status(200).json({
      message: "Marks saved successfully!"
    });
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

// Start server
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
        res.status(500).json({ error: error.message });
    }
});
