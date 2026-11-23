// public/app.js
const API = "/api";
const $ = id => document.getElementById(id);

let token = sessionStorage.getItem("edutrack_token");
let students = [];
let results = [];
let marks = [];
let marksOptions = null;
let subjectChart = null;
let passChart = null;

/* ---------------- HELPERS ---------------- */

// Makes text safe to place inside HTML
function esc(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function toNumber(value) {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? null : n;
}

// 84.6 -> "84.6", 423 -> "423", missing -> "-"
function fmt(value, decimals = 2) {
  const n = toNumber(value);
  if (n === null) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

function initials(name) {
  const letters = String(name || "?").trim().split(/\s+/).slice(0, 2)
    .map(word => word[0].toUpperCase()).join("");
  return esc(letters);
}

function toast(message, type = "success") {
  const box = document.createElement("div");
  box.className = `toast ${type}`;
  box.textContent = message;
  $("toasts").appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

// Talks to the server and attaches the login token
async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    }
  });

  let data = {};
  try { data = await response.json(); } catch (e) { /* no JSON body */ }

  if (response.status === 401) {
    logout(false);
    throw new Error(data.error || "Please log in again.");
  }
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

function statusBadge(value) {
  const status = String(value || "").toUpperCase();
  const css = status === "PASS" ? "pass" : status === "FAIL" ? "fail" : "";
  return `<span class="badge ${css}">${esc(status)}</span>`;
}

function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}" class="empty">${text}</td></tr>`;
}

/* ---------------- LOGIN / LOGOUT ---------------- */

function startApp(user) {
  $("login-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("user-name").textContent = user || "admin";
  $("user-avatar").textContent = (user || "A")[0].toUpperCase();
  showPage("dashboard");
}

function showLogin() {
  $("app").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
}

function logout(callServer = true) {
  if (callServer && token) {
    fetch(API + "/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    }).catch(() => {});
  }
  token = null;
  sessionStorage.removeItem("edutrack_token");
  sessionStorage.removeItem("edutrack_user");
  showLogin();
}

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("login-error").textContent = "";

  try {
    const response = await fetch(API + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("login-user").value.trim(),
        password: $("login-pass").value
      })
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not sign in.");

    token = data.token;
    sessionStorage.setItem("edutrack_token", token);
    sessionStorage.setItem("edutrack_user", data.user);
    $("login-pass").value = "";
    startApp(data.user);
  } catch (error) {
    $("login-error").textContent = error.message;
  }
});

$("logout-btn").addEventListener("click", () => logout(true));

/* ---------------- NAVIGATION ---------------- */

const pageInfo = {
  dashboard: ["Dashboard", "Academic overview"],
  students: ["Students", "Student records"],
  marks: ["Marks management", "Subject marks"],
  setup: ["Subjects and exams", "Academic setup"],
  results: ["Results", "Calculated results"],
  report: ["Report card", "Student report"],
  analytics: ["Analytics", "Performance insights"]
};

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  $(`${name}-page`).classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.page === name)
  );

  $("page-title").textContent = pageInfo[name][0];
  $("page-sub").textContent = pageInfo[name][1];

  if (name === "dashboard") loadDashboard();
  if (name === "students") loadStudents();
  if (name === "marks") loadMarksPage();
  if (name === "results") loadResults();
  if (name === "setup") loadSetup();
  if (name === "report") loadReportPage();
  if (name === "analytics") loadAnalytics();
}

document.querySelectorAll(".nav-btn").forEach(btn =>
  btn.addEventListener("click", () => showPage(btn.dataset.page))
);
document.querySelectorAll("[data-goto]").forEach(btn =>
  btn.addEventListener("click", () => showPage(btn.dataset.goto))
);

/* ---------------- DASHBOARD ---------------- */

async function loadDashboard() {
  try {
    const [stats, subjects, resultRows] = await Promise.all([
      api("/dashboard"),
      api("/subjects/averages"),
      api("/results")
    ]);

    $("total-students").textContent = stats.totalStudents ?? 0;
    $("average-percentage").textContent = fmt(stats.averagePercentage ?? 0, 1) + "%";
    $("pass-rate").textContent = fmt(stats.passRate ?? 0, 1) + "%";
    $("total-results").textContent = stats.totalResults ?? 0;

    results = resultRows;
    drawSubjectChart(subjects);
    drawPassChart(resultRows);

    $("recent-results").innerHTML = resultRows.length
      ? resultRows.slice(0, 5).map(r => `
        <tr>
          <td><strong>${esc(r.roll_no)}</strong></td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.exam_name)}</td>
          <td>${percentCell(r.percentage)}</td>
          <td>${statusBadge(r.result)}</td>
        </tr>`).join("")
      : emptyRow(5, "No results yet. Add marks to see results here.");
  } catch (error) {
    if (token) toast("Could not load dashboard: " + error.message, "error");
  }
}

function percentCell(value) {
  const p = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="pct"><span>${fmt(value, 1)}%</span><div class="bar"><i style="width:${p}%"></i></div></div>`;
}

function drawSubjectChart(subjects) {
  if (typeof Chart === "undefined") return;
  if (subjectChart) subjectChart.destroy();

  Chart.defaults.font.family = "'Plus Jakarta Sans', 'Segoe UI', sans-serif";
  Chart.defaults.color = "#657570";

  subjectChart = new Chart($("subject-chart"), {
    type: "bar",
    data: {
      labels: subjects.map(s => s.subject_name),
      datasets: [{
        label: "Average marks",
        data: subjects.map(s => Number(s.average_marks) || 0),
        backgroundColor: "#1f7a6d",
        hoverBackgroundColor: "#e8a317",
        borderRadius: 8,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, suggestedMax: 100, grid: { color: "#e6ebe7" } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawPassChart(rows) {
  if (typeof Chart === "undefined") return;
  if (passChart) passChart.destroy();

  const pass = rows.filter(r => String(r.result).toUpperCase() === "PASS").length;
  const fail = rows.filter(r => String(r.result).toUpperCase() === "FAIL").length;

  passChart = new Chart($("result-pie-chart"), {
    type: "doughnut",
    data: {
      labels: ["Pass", "Fail"],
      datasets: [{
        data: [pass, fail],
        backgroundColor: ["#1f9d6b", "#d64550"],
        borderColor: "#ffffff",
        borderWidth: 4,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, padding: 20 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = pass + fail;
              const share = total ? ((ctx.raw / total) * 100).toFixed(1) : "0.0";
              return `${ctx.label}: ${ctx.raw} (${share}%)`;
            }
          }
        }
      }
    }
  });
}

/* ---------------- STUDENTS ---------------- */

async function loadStudents() {
  try {
    students = await api("/students");
    renderStudents();
  } catch (error) {
    if (token) toast("Could not load students: " + error.message, "error");
  }
}

function renderStudents() {
  const q = $("student-search").value.trim().toLowerCase();
  const rows = students.filter(s =>
    `${s.roll_no} ${s.name} ${s.email || ""} ${s.department || ""}`.toLowerCase().includes(q)
  );

  $("students-count").textContent =
    `${rows.length} of ${students.length} students shown`;

  $("students-table").innerHTML = rows.length
    ? rows.map(s => `
      <tr>
        <td><strong>${esc(s.roll_no)}</strong></td>
        <td><div class="person"><span class="avatar">${initials(s.name)}</span>${esc(s.name)}</div></td>
        <td>${esc(s.email)}</td>
        <td>${esc(s.department)}</td>
        <td>${esc(s.semester)}</td>
        <td class="actions">
          <button class="btn btn-small" data-edit="${Number(s.student_id)}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete="${Number(s.student_id)}">Delete</button>
        </td>
      </tr>`).join("")
    : emptyRow(6, students.length ? "No students match your search." : "No students yet. Select Add student to create the first one.");
}

$("student-search").addEventListener("input", renderStudents);

$("students-table").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.edit) {
    openStudentModal(students.find(s => Number(s.student_id) === Number(button.dataset.edit)));
  }
  if (button.dataset.delete) {
    deleteStudent(Number(button.dataset.delete));
  }
});

/* ----- Add / edit student popup ----- */

function openStudentModal(student) {
  $("student-form").reset();
  $("form-message").textContent = "";
  $("student_id").value = student ? student.student_id : "";
  $("modal-title").textContent = student ? "Edit student" : "Add student";
  $("save-student-btn").textContent = student ? "Save changes" : "Save student";

  if (student) {
    $("roll_no").value = student.roll_no || "";
    $("name").value = student.name || "";
    $("email").value = student.email || "";
    $("department").value = student.department || "";
    $("semester").value = student.semester ?? "";
  }

  $("student-modal").classList.remove("hidden");
  $("roll_no").focus();
}

function closeStudentModal() {
  $("student-modal").classList.add("hidden");
}

$("add-student-btn").addEventListener("click", () => openStudentModal(null));
$("modal-close").addEventListener("click", closeStudentModal);
$("modal-cancel").addEventListener("click", closeStudentModal);
$("student-modal").addEventListener("click", event => {
  if (event.target === $("student-modal")) closeStudentModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeStudentModal();
});

$("student-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("form-message").textContent = "";

  const id = $("student_id").value;
  const body = {
    roll_no: $("roll_no").value.trim(),
    name: $("name").value.trim(),
    email: $("email").value.trim(),
    department: $("department").value.trim(),
    semester: $("semester").value ? Number($("semester").value) : null
  };

  if (!body.roll_no || !body.name) {
    $("form-message").textContent = "Enter the roll number and the student's name.";
    return;
  }

  const button = $("save-student-btn");
  button.disabled = true;

  try {
    const data = await api(id ? `/students/${id}` : "/students", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });

    toast(data.message || "Student saved.");
    closeStudentModal();
    await loadStudents();
  } catch (error) {
    $("form-message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function deleteStudent(id) {
  const student = students.find(s => Number(s.student_id) === id);
  const label = student ? student.name : "this student";

  if (!confirm(`Delete ${label}? Their marks will be deleted too.`)) return;

  try {
    const data = await api(`/students/${id}`, { method: "DELETE" });
    toast(data.message || "Student deleted.");
    await loadStudents();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ---------------- MARKS ---------------- */

async function loadMarksPage() {
  try {
    const [options, markRows] = await Promise.all([
      api("/marks/options"),
      api("/marks")
    ]);
    marksOptions = options;
    marks = markRows;
    fillMarksSelects();
    renderMarks();
  } catch (error) {
    if (token) toast("Could not load marks: " + error.message, "error");
  }
}

function fillMarksSelects() {
  $("marks-student").innerHTML =
    '<option value="">Select student</option>' +
    marksOptions.students.map(s =>
      `<option value="${Number(s.student_id)}">${esc(s.roll_no)} - ${esc(s.name)}</option>`
    ).join("");

  $("marks-subject").innerHTML =
    '<option value="">Select subject</option>' +
    marksOptions.subjects.map(s =>
      `<option value="${Number(s.subject_id)}">${esc(s.subject_name)} (max ${Number(s.max_marks)})</option>`
    ).join("");

  $("marks-exam").innerHTML =
    '<option value="">Select exam</option>' +
    marksOptions.exams.map(e => {
      const date = e.exam_date ? " - " + String(e.exam_date).slice(0, 10) : "";
      return `<option value="${Number(e.exam_id)}">${esc(e.exam_name)}${esc(date).replace(/^-$/, "")}</option>`;
    }).join("");
}

function renderMarks() {
  const q = $("marks-search").value.trim().toLowerCase();
  const rows = marks.filter(m =>
    `${m.roll_no} ${m.name} ${m.subject_name} ${m.exam_name}`.toLowerCase().includes(q)
  );

  $("marks-table").innerHTML = rows.length
    ? rows.map(m => `
      <tr>
        <td><strong>${esc(m.roll_no)}</strong></td>
        <td>${esc(m.name)}</td>
        <td>${esc(m.subject_name)}</td>
        <td>${esc(m.exam_name)}</td>
        <td>${fmt(m.marks_obtained)}</td>
        <td>${fmt(m.max_marks)}</td>
      </tr>`).join("")
    : emptyRow(6, marks.length ? "No marks match your search." : "No marks entered yet. Use the form above to add the first one.");
}

$("marks-search").addEventListener("input", renderMarks);

function updateMarksLimit() {
  const input = $("marks-obtained");
  const subject = marksOptions && marksOptions.subjects.find(
    s => Number(s.subject_id) === Number($("marks-subject").value)
  );

  if (subject) {
    input.max = subject.max_marks;
    $("marks-limit").textContent = `Maximum marks: ${subject.max_marks}`;
  } else {
    input.removeAttribute("max");
    $("marks-limit").textContent = "";
  }
}

$("marks-subject").addEventListener("change", updateMarksLimit);
$("marks-reset").addEventListener("click", () => setTimeout(updateMarksLimit, 0));

$("marks-form").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const data = await api("/marks", {
      method: "POST",
      body: JSON.stringify({
        student_id: $("marks-student").value,
        subject_id: $("marks-subject").value,
        exam_id: $("marks-exam").value,
        marks_obtained: $("marks-obtained").value
      })
    });

    toast(data.message || "Marks saved.");
    $("marks-form").reset();
    updateMarksLimit();
    marks = await api("/marks");
    renderMarks();
  } catch (error) {
    toast(error.message, "error");
  }
});

/* ---------------- RESULTS ---------------- */

async function loadResults() {
  try {
    results = await api("/results");
    renderResults();
  } catch (error) {
    if (token) toast("Could not load results: " + error.message, "error");
  }
}

function renderResults() {
  const q = $("result-search").value.trim().toLowerCase();
  const filter = $("result-filter").value;

  const rows = results.filter(r =>
    (!filter || String(r.result).toUpperCase() === filter) &&
    `${r.roll_no} ${r.name}`.toLowerCase().includes(q)
  );

  $("results-count").textContent =
    `${rows.length} of ${results.length} results shown`;

  $("results-table").innerHTML = rows.length
    ? rows.map(r => `
      <tr>
        <td><strong>${esc(r.roll_no)}</strong></td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.exam_name)}</td>
        <td>${fmt(r.total_marks ?? r.total_obtained)}</td>
        <td>${fmt(r.maximum_marks ?? r.max_marks ?? r.total_max_marks)}</td>
        <td>${percentCell(r.percentage)}</td>
        <td>${gradeTag(gradeFor(Number(r.percentage) || 0))}</td>
        <td>${statusBadge(r.result)}</td>
        <td><button class="btn btn-small" data-report-roll="${esc(r.roll_no)}" data-report-exam="${esc(r.exam_name)}">View</button></td>
      </tr>`).join("")
    : emptyRow(9, results.length ? "No results match your search." : "No results yet. Enter marks to generate results.");
}

$("result-search").addEventListener("input", renderResults);
$("result-filter").addEventListener("change", renderResults);

/* ---------------- GRADES AND CSV EXPORT ---------------- */

function gradeFor(percent) {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B+";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

function gradeTag(grade) {
  return `<span class="grade ${grade === "F" ? "low" : ""}">${esc(grade)}</span>`;
}

// Builds a CSV file in the browser and downloads it (opens in Excel)
function downloadCsv(filename, headers, rows) {
  if (!rows.length) {
    toast("There is nothing to export yet.", "error");
    return;
  }

  const cell = value => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = "'" + text; // stops spreadsheet formulas
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [headers, ...rows].map(row => row.map(cell).join(","));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${filename}`);
}

$("export-students").addEventListener("click", () =>
  downloadCsv("students.csv",
    ["Roll no", "Name", "Email", "Department", "Semester"],
    students.map(s => [s.roll_no, s.name, s.email, s.department, s.semester]))
);

$("export-marks").addEventListener("click", () =>
  downloadCsv("marks.csv",
    ["Roll no", "Student", "Subject", "Exam", "Marks obtained", "Maximum marks"],
    marks.map(m => [m.roll_no, m.name, m.subject_name, m.exam_name, m.marks_obtained, m.max_marks]))
);

$("export-results").addEventListener("click", () =>
  downloadCsv("results.csv",
    ["Roll no", "Student", "Exam", "Total marks", "Maximum marks", "Percentage", "Grade", "Result"],
    results.map(r => [
      r.roll_no, r.name, r.exam_name,
      r.total_marks ?? r.total_obtained,
      r.maximum_marks ?? r.max_marks ?? r.total_max_marks,
      r.percentage, gradeFor(Number(r.percentage) || 0), r.result
    ]))
);

/* ---------------- SUBJECTS AND EXAMS ---------------- */

let subjectsList = [];
let examsList = [];

async function loadSetup() {
  try {
    const [subjects, exams] = await Promise.all([api("/subjects"), api("/exams")]);
    subjectsList = subjects;
    examsList = exams;
    renderSubjects();
    renderExams();
  } catch (error) {
    if (token) toast("Could not load subjects and exams: " + error.message, "error");
  }
}

function renderSubjects() {
  $("subjects-table").innerHTML = subjectsList.length
    ? subjectsList.map(s => `
      <tr>
        <td><strong>${esc(s.subject_name)}</strong></td>
        <td>${fmt(s.max_marks)}</td>
        <td class="actions">
          <button class="btn btn-small" data-edit="${Number(s.subject_id)}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete="${Number(s.subject_id)}">Delete</button>
        </td>
      </tr>`).join("")
    : emptyRow(3, "No subjects yet. Add the first subject above.");
}

function renderExams() {
  $("exams-table").innerHTML = examsList.length
    ? examsList.map(e => `
      <tr>
        <td><strong>${esc(e.exam_name)}</strong></td>
        <td>${esc(e.exam_date)}</td>
        <td class="actions">
          <button class="btn btn-small" data-edit="${Number(e.exam_id)}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete="${Number(e.exam_id)}">Delete</button>
        </td>
      </tr>`).join("")
    : emptyRow(3, "No exams yet. Add the first exam above.");
}

function resetSubjectForm() {
  $("subject-form").reset();
  $("subject_id").value = "";
  $("subject-save").textContent = "Add subject";
  $("subject-cancel").classList.add("hidden");
}

function resetExamForm() {
  $("exam-form").reset();
  $("exam_id").value = "";
  $("exam-save").textContent = "Add exam";
  $("exam-cancel").classList.add("hidden");
}

$("subject-cancel").addEventListener("click", resetSubjectForm);
$("exam-cancel").addEventListener("click", resetExamForm);

$("subject-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("subject-error").textContent = "";
  const id = $("subject_id").value;

  try {
    const data = await api(id ? `/subjects/${id}` : "/subjects", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        subject_name: $("subject_name").value.trim(),
        max_marks: $("subject_max").value
      })
    });
    toast(data.message);
    resetSubjectForm();
    await loadSetup();
  } catch (error) {
    $("subject-error").textContent = error.message;
  }
});

$("exam-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("exam-error").textContent = "";
  const id = $("exam_id").value;

  try {
    const data = await api(id ? `/exams/${id}` : "/exams", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        exam_name: $("exam_name").value.trim(),
        exam_date: $("exam_date").value
      })
    });
    toast(data.message);
    resetExamForm();
    await loadSetup();
  } catch (error) {
    $("exam-error").textContent = error.message;
  }
});

$("subjects-table").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.edit) {
    const s = subjectsList.find(x => Number(x.subject_id) === Number(button.dataset.edit));
    $("subject_id").value = s.subject_id;
    $("subject_name").value = s.subject_name;
    $("subject_max").value = s.max_marks;
    $("subject-save").textContent = "Save changes";
    $("subject-cancel").classList.remove("hidden");
    $("subject_name").focus();
  }

  if (button.dataset.delete) {
    if (!confirm("Delete this subject?")) return;
    try {
      const data = await api(`/subjects/${button.dataset.delete}`, { method: "DELETE" });
      toast(data.message);
      await loadSetup();
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

$("exams-table").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.edit) {
    const e = examsList.find(x => Number(x.exam_id) === Number(button.dataset.edit));
    $("exam_id").value = e.exam_id;
    $("exam_name").value = e.exam_name;
    $("exam_date").value = e.exam_date || "";
    $("exam-save").textContent = "Save changes";
    $("exam-cancel").classList.remove("hidden");
    $("exam_name").focus();
  }

  if (button.dataset.delete) {
    if (!confirm("Delete this exam?")) return;
    try {
      const data = await api(`/exams/${button.dataset.delete}`, { method: "DELETE" });
      toast(data.message);
      await loadSetup();
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

/* ---------------- REPORT CARD ---------------- */

let reportReady = null;

function loadReportPage() {
  reportReady = (async () => {
    try {
      marksOptions = await api("/marks/options");

      $("report-student").innerHTML =
        '<option value="">Select student</option>' +
        marksOptions.students.map(s =>
          `<option value="${Number(s.student_id)}">${esc(s.roll_no)} - ${esc(s.name)}</option>`
        ).join("");

      $("report-exam").innerHTML =
        '<option value="">Select exam</option>' +
        marksOptions.exams.map(e =>
          `<option value="${Number(e.exam_id)}">${esc(e.exam_name)}</option>`
        ).join("");
    } catch (error) {
      if (token) toast("Could not load the report options: " + error.message, "error");
    }
  })();
  return reportReady;
}

async function generateReport() {
  const studentId = $("report-student").value;
  const examId = $("report-exam").value;

  if (!studentId || !examId) {
    toast("Select a student and an exam first.", "error");
    return;
  }

  try {
    const report = await api(`/report/${studentId}/${examId}`);
    renderReport(report);
  } catch (error) {
    $("report-card").classList.add("hidden");
    toast(error.message, "error");
  }
}

function renderReport(r) {
  const rows = r.subjects.map(s => `
    <tr>
      <td>${esc(s.subject_name)}</td>
      <td>${fmt(s.marks_obtained)}</td>
      <td>${fmt(s.max_marks)}</td>
      <td>${gradeTag(s.grade)}</td>
      <td>${statusBadge(s.passed ? "PASS" : "FAIL")}</td>
    </tr>`).join("");

  $("report-card").innerHTML = `
    <div class="report-head">
      <div>
        <h2>EduTrack report card</h2>
        <p class="muted">${esc(r.exam.exam_name)}${r.exam.exam_date ? ", " + esc(r.exam.exam_date) : ""}</p>
      </div>
      ${statusBadge(r.result)}
    </div>

    <div class="report-info">
      <div><span>Student</span><strong>${esc(r.student.name)}</strong></div>
      <div><span>Roll number</span><strong>${esc(r.student.roll_no)}</strong></div>
      <div><span>Department</span><strong>${esc(r.student.department)}</strong></div>
      <div><span>Semester</span><strong>${esc(r.student.semester)}</strong></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Subject</th><th>Marks</th><th>Maximum</th><th>Grade</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="report-summary">
      <div><strong>${fmt(r.total)} / ${fmt(r.maximum)}</strong>Total marks</div>
      <div><strong>${fmt(r.percentage, 1)}%</strong>Percentage</div>
      <div><strong>${esc(r.grade)}</strong>Overall grade</div>
      <div><strong>${esc(r.rank)} of ${esc(r.classSize)}</strong>Rank in exam</div>
    </div>

    <p class="report-note">
      Generated on ${new Date().toLocaleDateString("en-IN")}. A student fails if any subject is below 40 marks.
    </p>`;

  $("report-card").classList.remove("hidden");
}

$("report-view").addEventListener("click", generateReport);
$("report-print").addEventListener("click", () => {
  if ($("report-card").classList.contains("hidden")) {
    toast("View a report card first, then print it.", "error");
    return;
  }
  window.print();
});

// "View" button inside the Results table
$("results-table").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.reportRoll === undefined) return;

  showPage("report");
  await reportReady;

  const student = marksOptions && marksOptions.students.find(
    s => String(s.roll_no) === button.dataset.reportRoll
  );
  const exam = marksOptions && marksOptions.exams.find(
    e => String(e.exam_name) === button.dataset.reportExam
  );

  if (student && exam) {
    $("report-student").value = student.student_id;
    $("report-exam").value = exam.exam_id;
    generateReport();
  }
});

/* ---------------- ANALYTICS ---------------- */

let deptChart = null;
let gradeChart = null;

async function loadAnalytics() {
  try {
    const [data, resultRows] = await Promise.all([api("/analytics"), api("/results")]);
    results = resultRows;

    drawDeptChart(data.departments);
    drawGradeChart(resultRows);

    $("toppers-table").innerHTML = data.toppers.length
      ? data.toppers.map(t => `
        <tr>
          <td><strong>#${esc(t.rank_no)}</strong></td>
          <td>${esc(t.roll_no)}</td>
          <td>${esc(t.name)}</td>
          <td>${esc(t.exam_name)}</td>
          <td>${percentCell(t.percentage)}</td>
        </tr>`).join("")
      : emptyRow(5, "No results yet. Enter marks to see the top performers.");

    $("risk-table").innerHTML = data.atRisk.length
      ? data.atRisk.map(a => `
        <tr>
          <td><strong>${esc(a.roll_no)}</strong></td>
          <td>${esc(a.name)}</td>
          <td>${esc(a.exam_name)}</td>
          <td>${esc(a.failed_subjects)}</td>
          <td><span class="badge fail">${esc(a.failed_count)}</span></td>
        </tr>`).join("")
      : emptyRow(5, "Good news: no student is below the pass mark in any subject.");

    $("subject-stats-table").innerHTML = data.subjects.length
      ? data.subjects.map(s => `
        <tr>
          <td><strong>${esc(s.subject_name)}</strong></td>
          <td>${fmt(s.average_marks)}</td>
          <td>${fmt(s.highest)}</td>
          <td>${fmt(s.lowest)}</td>
          <td>${percentCell(s.pass_percent)}</td>
        </tr>`).join("")
      : emptyRow(5, "No marks yet. Enter marks to compare subjects.");
  } catch (error) {
    if (token) toast("Could not load analytics: " + error.message, "error");
  }
}

function drawDeptChart(departments) {
  if (typeof Chart === "undefined") return;
  if (deptChart) deptChart.destroy();

  deptChart = new Chart($("dept-chart"), {
    type: "bar",
    data: {
      labels: departments.map(d => d.department),
      datasets: [{
        label: "Average percentage",
        data: departments.map(d => Number(d.average_percentage) || 0),
        backgroundColor: "#e8a317",
        hoverBackgroundColor: "#1f7a6d",
        borderRadius: 8,
        maxBarThickness: 56
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: "#e6ebe7" } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawGradeChart(rows) {
  if (typeof Chart === "undefined") return;
  if (gradeChart) gradeChart.destroy();

  const grades = ["A+", "A", "B+", "B", "C", "D", "F"];
  const counts = grades.map(g =>
    rows.filter(r => gradeFor(Number(r.percentage) || 0) === g).length
  );

  gradeChart = new Chart($("grade-chart"), {
    type: "bar",
    data: {
      labels: grades,
      datasets: [{
        label: "Results",
        data: counts,
        backgroundColor: ["#137650", "#1f9d6b", "#1f7a6d", "#4a9d93", "#e8a317", "#f0c15a", "#d64550"],
        borderRadius: 8,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#e6ebe7" } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* ---------------- START ---------------- */

if (token) {
  startApp(sessionStorage.getItem("edutrack_user"));
} else {
  showLogin();
}
