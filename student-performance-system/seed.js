// seed.js  (project root: student-performance-system/)
// Adds 12 students with Mid Semester and End Semester marks.
// Run it with:  node seed.js
// It is safe to run more than once (nothing is duplicated).
const db = require("./config/db");

// Marks are written for 5 subjects out of 100: [mid marks], [end marks]
const students = [
  ["2505", "Ananya Gupta",   "ananya.gupta@edutrack.in",   "CSE", [88, 91, 85, 90, 87], [92, 89, 94, 90, 91]],
  ["2506", "Karan Malhotra", "karan.malhotra@edutrack.in", "CSE", [72, 65, 70, 68, 74], [75, 70, 73, 71, 78]],
  ["2507", "Neha Joshi",     "neha.joshi@edutrack.in",     "IT",  [55, 60, 48, 52, 58], [62, 58, 55, 60, 64]],
  ["2508", "Vikram Rathore", "vikram.rathore@edutrack.in", "ECE", [35, 42, 38, 45, 40], [44, 48, 41, 50, 46]],
  ["2509", "Isha Kapoor",    "isha.kapoor@edutrack.in",    "CSE", [95, 97, 92, 96, 94], [96, 98, 95, 97, 93]],
  ["2510", "Rohit Yadav",    "rohit.yadav@edutrack.in",    "ME",  [60, 58, 64, 55, 62], [57, 61, 59, 63, 60]],
  ["2511", "Simran Kaur",    "simran.kaur@edutrack.in",    "IT",  [78, 82, 75, 80, 77], [81, 85, 79, 83, 80]],
  ["2512", "Deepak Chauhan", "deepak.chauhan@edutrack.in", "ECE", [42, 38, 45, 40, 36], [40, 35, 44, 41, 39]],
  ["2513", "Meera Nair",     "meera.nair@edutrack.in",     "CSE", [68, 72, 65, 70, 66], [74, 76, 70, 73, 71]],
  ["2514", "Harsh Vardhan",  "harsh.vardhan@edutrack.in",  "ME",  [50, 47, 52, 49, 55], [53, 51, 56, 50, 58]],
  ["2515", "Pooja Bansal",   "pooja.bansal@edutrack.in",   "IT",  [82, 79, 85, 88, 80], [76, 80, 78, 84, 79]],
  ["2516", "Sahil Khan",     "sahil.khan@edutrack.in",     "CSE", [62, 45, 58, 41, 66], [65, 48, 60, 44, 69]]
];

const exams = [
  ["Mid Semester", "2026-09-15"],
  ["End Semester", "2026-11-20"]
];

async function getExamId(name, date) {
  const [rows] = await db.query("SELECT exam_id FROM Exams WHERE exam_name = ?", [name]);
  if (rows.length) return rows[0].exam_id;

  const [result] = await db.query(
    "INSERT INTO Exams (exam_name, exam_date) VALUES (?, ?)", [name, date]
  );
  console.log(`  added exam: ${name}`);
  return result.insertId;
}

async function getStudentId(roll, name, email, department) {
  const [rows] = await db.query("SELECT student_id FROM Students WHERE roll_no = ?", [roll]);
  if (rows.length) return { id: rows[0].student_id, added: false };

  const [result] = await db.query(
    "INSERT INTO Students (roll_no, name, email, department, semester) VALUES (?, ?, ?, ?, 3)",
    [roll, name, email, department]
  );
  return { id: result.insertId, added: true };
}

async function main() {
  console.log("Connecting to the database...");
  await db.query("SELECT 1");

  const [subjects] = await db.query(
    "SELECT subject_id, subject_name, max_marks FROM Subjects ORDER BY subject_id LIMIT 5"
  );
  if (subjects.length < 5) {
    throw new Error(`The Subjects table needs 5 subjects, but only ${subjects.length} found.`);
  }
  console.log("Marks will be saved for these subjects, in this order:");
  subjects.forEach((s, i) => console.log(`  ${i + 1}. ${s.subject_name} (max ${s.max_marks})`));

  const examIds = [];
  for (const [name, date] of exams) examIds.push(await getExamId(name, date));

  let newStudents = 0;
  let savedMarks = 0;

  for (const [roll, name, email, department, mid, end] of students) {
    const student = await getStudentId(roll, name, email, department);
    if (student.added) newStudents++;

    for (let examIndex = 0; examIndex < 2; examIndex++) {
      const marks = examIndex === 0 ? mid : end;

      for (let i = 0; i < 5; i++) {
        // scales the mark if a subject's maximum is not 100
        const value = Math.round((marks[i] * Number(subjects[i].max_marks)) / 100);

        await db.query(
          `INSERT INTO Marks (student_id, subject_id, exam_id, marks_obtained)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained)`,
          [student.id, subjects[i].subject_id, examIds[examIndex], value]
        );
        savedMarks++;
      }
    }
  }

  console.log(`\nDone: ${newStudents} new students, ${savedMarks} marks saved.`);

  // Check the same queries the dashboard uses, and show the real error if one fails
  const [count] = await db.query("SELECT COUNT(*) AS total FROM Students");
  console.log(`Students in the database now: ${count[0].total}`);

  try {
    const [r] = await db.query(`
      SELECT COUNT(*) AS total_results,
             ROUND(AVG(percentage), 2) AS average_percentage,
             ROUND(100.0 * SUM(result = 'PASS') / COUNT(*), 2) AS pass_rate
      FROM StudentResults`);
    console.log("Dashboard query works:", r[0]);
  } catch (error) {
    console.log("\nThe dashboard query FAILED. This is the real reason:");
    console.log("  code:   ", error.code);
    console.log("  message:", error.sqlMessage || error.message);
  }
}

main()
  .catch(error => {
    console.error("\nSeed failed:", error.sqlMessage || error.message);
  })
  .finally(() => db.end());
