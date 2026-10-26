
const API = "/api";

// -------------------------------
// HELPER: GET DATA FROM SERVER
// -------------------------------
async function getData(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

// -------------------------------
// HELPER: SHOW SAFE TABLE TEXT
// -------------------------------
function safeText(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value).replace(/[&<>"']/g, function (character) {
    const characters = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return characters[character];
  });
}

// -------------------------------
// PAGE NAVIGATION
// -------------------------------
function showPage(pageName) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  const selectedPage = document.getElementById(`${pageName}-page`);

  if (selectedPage) {
    selectedPage.classList.remove("hidden");
  }

  document.querySelectorAll("[data-page]").forEach(link => {
    link.classList.toggle(
      "active",
      link.dataset.page === pageName
    );
  });

  if (pageName === "dashboard") {
    loadDashboard();
  } else if (pageName === "students") {
    loadStudents();
  } else if (pageName === "results") {
    loadResults();
  }
}

// Connect navigation links
document.querySelectorAll("[data-page]").forEach(link => {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    showPage(this.dataset.page);
  });
});

// -------------------------------
// DASHBOARD
// -------------------------------
async function loadDashboard() {
  try {
    const data = await getData(`${API}/dashboard`);

    // Supports either an object or an array response.
    const stats = Array.isArray(data) ? data[0] || {} : data;
    
    setText("total-students",
      stats.totalStudents ?? stats.total_students ?? 0);

    setText("average-percentage",
      formatNumber(
        stats.averagePercentage ??
        stats.average_percentage ??
        stats.averagePercentageOverall ??
        0
      ) + "%");

    setText("pass-rate",
      formatNumber(stats.passRate ?? stats.pass_rate ?? 0) + "%");

    setText("total-results",
      stats.totalResults ?? stats.total_results ?? 0);

    await loadSubjectChart();
    await loadRecentResults();
    loadResultPieChart();
  } catch (error) {
    console.error("Dashboard error:", error);
    showError("Could not load dashboard: " + error.message);
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function formatNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function showError(message) {
  console.error(message);
}

// -------------------------------
// SUBJECT-WISE CHART
// -------------------------------
let subjectChart = null;

async function loadSubjectChart() {
  const canvas = document.getElementById("subject-chart");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  try {
    const subjects = await getData(`${API}/subjects/averages`);

    const labels = subjects.map(subject =>
      subject.subject_name || subject.name || "Unknown"
    );

    const averages = subjects.map(subject =>
      Number(subject.average_marks ?? subject.average ?? 0)
    );

    if (subjectChart) {
      subjectChart.destroy();
    }

    subjectChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Average Marks",
          data: averages,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: "Marks"
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  } catch (error) {
    console.error("Subject chart error:", error);
  }
}

// -------------------------------
// RECENT RESULTS ON DASHBOARD
// -------------------------------
async function loadRecentResults() {
  const table = document.getElementById("recent-results");

  if (!table) {
    return;
  }

  try {
    const results = await getData(`${API}/results`);

    table.innerHTML = results.slice(0, 5).map(result => `
      <tr>
        <td>${safeText(result.roll_no)}</td>
        <td>${safeText(result.name)}</td>
        <td>${safeText(result.exam_name)}</td>
        <td>${formatNumber(result.percentage)}%</td>
        <td>${safeText(result.result)}</td>
      </tr>
    `).join("");

    if (results.length === 0) {
      table.innerHTML = `
        <tr><td colspan="5">No results available.</td></tr>
      `;
    }
  } catch (error) {
    console.error("Recent results error:", error);
  }
}

// -------------------------------
// LOAD ALL STUDENTS
// -------------------------------

async function loadStudents() {
  const table = document.getElementById("students-table");
  if (!table) return;

  try {
    const students = await getData(`${API}/students`);

    table.innerHTML = students.map(student => `
      <tr>
        <td>${safeText(student.roll_no)}</td>
        <td>${safeText(student.name)}</td>
        <td>${safeText(student.email)}</td>
        <td>${safeText(student.department)}</td>
        <td>${safeText(student.semester)}</td>
        <td>
          <button type="button"
            onclick="editStudent(${Number(student.student_id)})">
            Edit
          </button>
          <button type="button"
            onclick="deleteStudent(${Number(student.student_id)})">
            Delete
          </button>
        </td>
      </tr>
    `).join("");

    if (students.length === 0) {
      table.innerHTML =
        `<tr><td colspan="6">No students found.</td></tr>`;
    }
  } catch (error) {
    alert("Could not load students: " + error.message);
  }
}

async function editStudent(id) {
  try {
    const students = await getData(`${API}/students`);
    const student = students.find(s => Number(s.student_id) === id);

    if (!student) {
      alert("Student not found.");
      return;
    }

    const roll_no = prompt("Roll number:", student.roll_no);
    if (roll_no === null) return;

    const name = prompt("Student name:", student.name);
    if (name === null) return;

    const email = prompt("Email:", student.email || "");
    if (email === null) return;

    const department = prompt(
      "Department:", student.department || ""
    );
    if (department === null) return;

    const semester = prompt(
      "Semester:", student.semester ?? ""
    );
    if (semester === null) return;

    const response = await fetch(`${API}/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roll_no,
        name,
        email,
        department,
        semester: semester.trim() ? Number(semester) : null
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Update failed.");
    }

    alert(result.message);
    await loadStudents();
    await loadDashboard();
    await loadResults();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteStudent(id) {
  if (!confirm("Are you sure you want to delete this student?")) {
    return;
  }

  try {
    const response = await fetch(`${API}/students/${id}`, {
      method: "DELETE"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Delete failed.");
    }

    alert(result.message);
    await loadStudents();
    await loadDashboard();
    await loadResults();
  } catch (error) {
    alert(error.message);
  }
}


// -------------------------------
// ADD A STUDENT
// -------------------------------
const studentForm = document.getElementById("student-form");

if (studentForm) {
  studentForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const rollField = document.getElementById("roll_no");
    const nameField = document.getElementById("name");
    const emailField = document.getElementById("email");
    const departmentField = document.getElementById("department");
    const semesterField = document.getElementById("semester");

    if (!rollField || !nameField) {
      alert("The roll number or name input was not found in the form.");
      return;
    }

    const student = {
      roll_no: rollField.value.trim(),
      name: nameField.value.trim(),
      email: emailField ? emailField.value.trim() : "",
      department: departmentField ? departmentField.value.trim() : "",
      semester: semesterField && semesterField.value
        ? Number(semesterField.value)
        : null
    };

    if (!student.roll_no || !student.name) {
      alert("Please enter the roll number and student name.");
      return;
    }

    const submitButton = studentForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch(`${API}/students`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(student)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not add student.");
      }

      alert(result.message || "Student added successfully!");

      studentForm.reset();

      await loadStudents();
      await loadDashboard();

    } catch (error) {
      console.error("Add student error:", error);
      alert(error.message);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

// -------------------------------
// LOAD STUDENT RESULTS
// -------------------------------
async function loadResults() {
  const table = document.getElementById("results-table");

  if (!table) {
    return;
  }

  try {
    const results = await getData(`${API}/results`);

    table.innerHTML = results.map(result => `
      <tr>
        <td>${safeText(result.roll_no)}</td>
        <td>${safeText(result.name)}</td>
        <td>${safeText(result.exam_name)}</td>
        <td>${formatNumber(result.total_marks)}</td>
        <td>${formatNumber(result.maximum_marks)}</td>
        <td>${formatNumber(result.percentage)}%</td>
        <td>${safeText(result.result)}</td>
      </tr>
    `).join("");

    if (results.length === 0) {
      table.innerHTML = `
        <tr><td colspan="7">No results available.</td></tr>
      `;
    }
  } catch (error) {
    console.error("Results error:", error);
    showError("Could not load results: " + error.message);
  }
}

let resultPieChart = null;

async function loadResultPieChart() {
    const canvas = document.getElementById("result-pie-chart");

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    try {
        const response = await fetch("/api/results");

        if (!response.ok) {
            throw new Error("Unable to load results");
        }

        const results = await response.json();

        let passCount = 0;
        let failCount = 0;

        results.forEach((student) => {
            const result = String(student.result || "").toUpperCase();

            if (result === "PASS") {
                passCount++;
            } else if (result === "FAIL") {
                failCount++;
            }
        });

        if (resultPieChart) {
            resultPieChart.destroy();
        }

        resultPieChart = new Chart(canvas, {
            type: "pie",
            data: {
                labels: ["Pass", "Fail"],
                datasets: [{
                    data: [passCount, failCount],
                    backgroundColor: ["#10b981", "#f05266"],
                    borderColor: ["#ffffff", "#ffffff"],
                    borderWidth: 4,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            usePointStyle: true,
                            padding: 22,
                            font: {
                                size: 12,
                                family: "Segoe UI"
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const total = context.dataset.data
                                    .reduce((sum, value) => sum + value, 0);

                                const value = context.raw;
                                const percentage = total
                                    ? ((value / total) * 100).toFixed(1)
                                    : "0.0";

                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Pie chart error:", error);
    }
}


// -------------------------------
// INITIALIZE APP
// -------------------------------
document.addEventListener("DOMContentLoaded", function () {
  loadDashboard();
  loadStudents();
  loadResults();
});

let marksOptions = null;

async function loadMarksOptions() {
  marksOptions = await getData(`${API}/marks/options`);

  const studentSelect = document.getElementById("marks-student");
  const subjectSelect = document.getElementById("marks-subject");
  const examSelect = document.getElementById("marks-exam");

  if (!studentSelect || !subjectSelect || !examSelect) return;

  studentSelect.innerHTML =
    '<option value="">Select student</option>' +
    marksOptions.students.map(s =>
      `<option value="${Number(s.student_id)}">
        ${safeText(s.roll_no)} - ${safeText(s.name)}
      </option>`
    ).join("");

  subjectSelect.innerHTML =
    '<option value="">Select subject</option>' +
    marksOptions.subjects.map(s =>
      `<option value="${Number(s.subject_id)}">
        ${safeText(s.subject_name)} (Max ${Number(s.max_marks)})
      </option>`
    ).join("");

  examSelect.innerHTML =
    '<option value="">Select exam</option>' +
    marksOptions.exams.map(e =>
      `<option value="${Number(e.exam_id)}">
        ${safeText(e.exam_name)}${e.exam_date ? " - " + safeText(String(e.exam_date).slice(0, 10)) : ""}
      </option>`
    ).join("");
}

async function loadMarks() {
  const table = document.getElementById("marks-table");
  if (!table) return;

  try {
    const rows = await getData(`${API}/marks`);

    table.innerHTML = rows.map(m => `
      <tr>
        <td>${safeText(m.roll_no)}</td>
        <td>${safeText(m.name)}</td>
        <td>${safeText(m.subject_name)}</td>
        <td>${safeText(m.exam_name)}</td>
        <td>${formatNumber(m.marks_obtained)}</td>
        <td>${formatNumber(m.max_marks)}</td>
      </tr>
    `).join("");

    if (!rows.length) {
      table.innerHTML =
        '<tr><td colspan="6">No marks entered yet.</td></tr>';
    }
  } catch (error) {
    console.error("Load marks error:", error);
    alert(error.message);
  }
}

const marksSubject = document.getElementById("marks-subject");
const marksInput = document.getElementById("marks-obtained");
const marksLimit = document.getElementById("marks-limit");

function updateMarksLimit() {
  if (!marksOptions || !marksSubject || !marksInput || !marksLimit) return;

  const subject = marksOptions.subjects.find(
    s => Number(s.subject_id) === Number(marksSubject.value)
  );

  if (subject) {
    marksInput.max = subject.max_marks;
    marksLimit.textContent = `Maximum marks: ${subject.max_marks}`;
  } else {
    marksInput.removeAttribute("max");
    marksLimit.textContent = "";
  }
}

if (marksSubject) {
  marksSubject.addEventListener("change", updateMarksLimit);
}

const marksForm = document.getElementById("marks-form");

if (marksForm) {
  marksForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const payload = {
      student_id: document.getElementById("marks-student").value,
      subject_id: document.getElementById("marks-subject").value,
      exam_id: document.getElementById("marks-exam").value,
      marks_obtained: marksInput.value
    };

    try {
      const response = await fetch(`${API}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save marks.");
      }

      alert(result.message);
      marksForm.reset();
      updateMarksLimit();

      await loadMarks();
      await loadResults();
      await loadDashboard();
    } catch (error) {
      alert(error.message);
    }
  });
}

// Load marks when the Marks page is opened.
const originalShowPage = showPage;

showPage = function (pageName) {
  originalShowPage(pageName);

  if (pageName === "marks") {
    loadMarksOptions()
      .then(loadMarks)
      .catch(error => alert("Could not load marks form: " + error.message));
  }
};

// Load marks data on initial page load.
document.addEventListener("DOMContentLoaded", function () {
  loadMarksOptions()
    .then(loadMarks)
    .catch(error => console.error("Marks initialization:", error));
});
