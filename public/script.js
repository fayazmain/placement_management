// Function to load all tables from the backend
async function loadData() {
  try {
    const res = await fetch("/api/data");
    const data = await res.json();

    const fillTable = (id, rows, headers) => {
      const table = document.getElementById(id);
      if (!table) return;

      table.innerHTML = `
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        ${rows.map(r => `
          <tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>
        `).join('')}
      `;
    };

    // Fill each table
    fillTable("students-table", data.students, ["student_id", "student_name", "roll_no", "cgpa", "department_name"]);
    fillTable("departments-table", data.departments, ["dept_id", "dept_name"]);
    fillTable("companies-table", data.companies, ["company_id", "company_name", "location"]);
    fillTable("jobs-table", data.job_roles, ["jobrole_id", "company_name", "role_title", "package_lpa"]);
    fillTable("placements-table", data.placements, ["placement_id", "student_name", "company_name", "role_title", "package_lpa", "status"]);

    // Populate department dropdown in student form
    const deptSelect = document.getElementById("department_id");
    if (deptSelect) {
      deptSelect.innerHTML = data.departments
        .map(d => `<option value="${d.dept_id}">${d.dept_name}</option>`)
        .join('');
    }
  } catch (err) {
    console.error("❌ Error loading data:", err);
  }
}

// Generic helper used by the static HTML pages
// path examples: '/departments', '/companies', '/jobroles', '/placements'
async function loadTable(path, tableId) {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();

    let rows = [];
    if (path === '/departments') rows = data.departments || [];
    else if (path === '/companies') rows = data.companies || [];
    else if (path === '/jobroles') rows = data.job_roles || data.jobroles || [];
    else if (path === '/placements') rows = data.placements || [];
    else if (path === '/students') rows = data.students || [];

    const table = document.getElementById(tableId);
    if (!table) return rows;

    if (!rows || rows.length === 0) {
      table.innerHTML = '<tr><td>No records</td></tr>';
      return rows;
    }

    // use keys of first row as headers
    const headers = Object.keys(rows[0]);
    const headerRow = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const bodyRows = rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`).join('');
    table.innerHTML = headerRow + bodyRows;
    return rows;
  } catch (err) {
    console.error('❌ Error in loadTable:', err);
  }
}

// Generic POST helper used by static pages. Accepts shorthand paths used in HTML
async function postData(path, payload) {
  // map shorthand endpoints to API endpoints
  let url = null;
  const p = path.toLowerCase();
  if (p.includes('department')) url = '/api/departments';
  else if (p.includes('company')) url = '/api/companies';
  else if (p.includes('job')) url = '/api/jobroles';
  else if (p.includes('placement')) url = '/api/placements';
  else url = '/api' + path; // fallback

  // normalize payload keys for specific endpoints
  let body = { ...payload };
  if (url === '/api/companies') {
    if (body.name) { body.company_name = body.name; delete body.name; }
  }
  if (url === '/api/jobroles') {
    if (body.title) { body.role_title = body.title; delete body.title; }
    if (body.salary) { body.package_lpa = body.salary; delete body.salary; }
    if (body.company_id) body.company_id = Number(body.company_id);
  }
  if (url === '/api/placements') {
    if (body.job_id) { body.jobrole_id = body.job_id; delete body.job_id; }
    // remove any fields not in DB schema
    delete body.offer_date;
    delete body.package_lpa;
    delete body.company_id;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // try to parse JSON; if response is HTML or text, return it as an error
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    } else {
      const text = await res.text();
      console.error('Non-JSON response from', url, 'status:', res.status, 'body:', text);
      return { error: 'Non-JSON response from server', status: res.status, body: text };
    }
  } catch (err) {
    console.error('❌ Error in postData:', err);
    return { error: err.message };
  }
}

// Handle adding a new student
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("studentForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const student = {
        student_name: document.getElementById("student_name").value,
        roll_no: document.getElementById("roll_no").value,
        cgpa: document.getElementById("cgpa").value,
        department_id: document.getElementById("department_id").value
      };

      try {
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(student)
        });

        const msg = await res.json();
        alert(msg.message || "✅ Student added!");
        form.reset();
        loadData(); // Refresh data on the page
      } catch (err) {
        console.error("❌ Error adding student:", err);
        alert("Error adding student!");
      }
    });
  }

  // Load all data initially
  loadData();
});
