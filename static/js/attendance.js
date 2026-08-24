// ==========================================
// STATE GLOBAL APLIKASI
// ==========================================
let employees = []; 
let attendanceData = {};
let tempAttendanceData = {};
let dashboardData = null;
let activeSlipEmpId = null;
let editingEmployeeId = null;
let employeeToDeleteId = null;
let isEditMode = false;
let currentPage = 1;
let activeDeleteState = null;
let payrollChartInstance = null;
let attendanceChartInstance = null;

function getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Inisialisasi master komponen default tanpa LocalStorage
let masterComponentNames = [
    "Tunjangan Transport",
    "Tunjangan Uang Makan",
    "Tunjangan Jabatan",
    "BPJS Kesehatan",
    "BPJS Ketenagakerjaan",
    "Bonus Performa",
    "Potongan Keterlambatan",
    "Potongan Kasbon"
];

// 2. Fungsi Helper Ambil Data
function getMasterComponentNames() {
    if (!Array.isArray(window.masterComponentNames)) {
        window.masterComponentNames = [
            "Tunjangan Transport",
            "Tunjangan Uang Makan",
            "Tunjangan Jabatan",
            "BPJS Kesehatan",
            "BPJS Ketenagakerjaan",
            "Bonus Performa",
            "Potongan Keterlambatan",
            "Potongan Kasbon"
        ];
    }
    return window.masterComponentNames;
}

// 3. Fungsi Render Datalist Safe-Mode
function renderMasterComponentDatalist() {
    const datalist = document.getElementById('masterComponentList');
    if (!datalist) return;

    const names = getMasterComponentNames();
    datalist.innerHTML = names
        .map(name => `<option value="${name}"></option>`)
        .join('');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

function getEmpKey(emp) {
    if (!emp) return '';
    const key = emp.user_id !== undefined && emp.user_id !== null && emp.user_id !== '' 
        ? emp.user_id 
        : emp.id;
    return String(key).trim();
}

function getEmployeeDisplayId(emp) {
    return emp?.user_id || emp?.employeeId || emp?.id || '-';
}

function renderDetailAttendanceTable(data, periode) {
    const headerEl = document.getElementById('tableHeader');
    const bodyEl = document.getElementById('tableBody');
    if (!headerEl || !bodyEl) return;

    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    let headerHTML = `
        <th class="align-middle text-nowrap" style="min-width: 180px; position: sticky; left: 0; background: #fff; z-index: 2;">Nama Karyawan</th>
    `;
    for (let d = 1; d <= daysInMonth; d++) {
        headerHTML += `<th class="text-center align-middle" style="min-width: 36px; font-size: 12px; padding: 6px 2px;">${d}</th>`;
    }
    headerHTML += `
        <th class="text-center align-middle bg-light text-success fw-bold" style="width: 40px;">H</th>
        <th class="text-center align-middle bg-light text-warning fw-bold" style="width: 40px;">T</th>
        <th class="text-center align-middle bg-light text-info fw-bold" style="width: 40px;">S</th>
        <th class="text-center align-middle bg-light text-danger fw-bold" style="width: 40px;">A</th>
    `;
    headerEl.innerHTML = headerHTML;

    if (!data || data.length === 0) {
        bodyEl.innerHTML = `
            <tr>
                <td colspan="${daysInMonth + 5}" class="text-center text-muted py-4">
                    Belum ada data kehadiran untuk periode ${periode}
                </td>
            </tr>
        `;
        return;
    }

    let bodyHTML = '';
    data.forEach(emp => {
        bodyHTML += `<tr>`;
        bodyHTML += `<td class="text-nowrap" style="position: sticky; left: 0; background: #fff; z-index: 1; font-weight: 600; font-size: 13px;">${emp.name}</td>`;

        let countH = 0, countT = 0, countS = 0, countA = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = String(d).padStart(2, '0');
            const status = (emp.daily_status && emp.daily_status[dayStr]) ? emp.daily_status[dayStr].toUpperCase() : '-';

            let badgeClass = 'bg-light text-muted';
            if (status === 'H') { badgeClass = 'bg-success text-white'; countH++; }
            else if (status === 'T') { badgeClass = 'bg-warning text-dark'; countT++; }
            else if (status === 'S') { badgeClass = 'bg-info text-dark'; countS++; }
            else if (status === 'A') { badgeClass = 'bg-danger text-white'; countA++; }
            else if (status === 'L') { badgeClass = 'bg-primary text-white'; }

            bodyHTML += `<td class="text-center align-middle p-1" style="font-size: 11px;">
                <span class="badge ${badgeClass}" style="width: 22px; padding: 4px 0; display: inline-block;">${status}</span>
            </td>`;
        }

        bodyHTML += `<td class="text-center align-middle fw-bold text-success" style="background-color: #f8fafc;">${countH}</td>`;
        bodyHTML += `<td class="text-center align-middle fw-bold text-warning" style="background-color: #f8fafc;">${countT}</td>`;
        bodyHTML += `<td class="text-center align-middle fw-bold text-info" style="background-color: #f8fafc;">${countS}</td>`;
        bodyHTML += `<td class="text-center align-middle fw-bold text-danger" style="background-color: #f8fafc;">${countA}</td>`;
        bodyHTML += `</tr>`;
    });

    bodyEl.innerHTML = bodyHTML;
}

function updateTempData(selectElem) {
    // const key = selectElem.dataset.key;
    // const newStatus = selectElem.value;

    // if (!tempAttendanceData[key]) {
    //     tempAttendanceData[key] = { status: "", checkin: null, checkout: null };
    // }
    
    // tempAttendanceData[key].status = newStatus;
    // selectElem.setAttribute('data-status', newStatus);
    selectElem.classList.remove(
        "status-H",
        "status-T",
        "status-S",
        "status-A",
        "status-L"
    );

    if (selectElem.value) {
        selectElem.classList.add(`status-${selectElem.value}`);
    }

    // updateTempData(selectElem);
}

async function renderTable() {
    const selectElem = document.getElementById("selectPeriode");
    const periode = selectElem ? selectElem.value : "2026-08";

    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    try {
        const response = await fetch(
            `/api/attendance/detail?periode=${periode}`
        );

        if (!response.ok) {
            throw new Error("Gagal mengambil data absensi");
        }

        const result = await response.json();
        const employees = result.data || [];
        employees.sort((a, b) => a.name.localeCompare(b.name));

        // =========================
        // HEADER
        // =========================

        const thead = document.getElementById("tableHeader");

        let headerHTML = `
            <th class="sticky-col text-center">
                <b>Nama</b>
            </th>
        `;

        for (let day = 1; day <= daysInMonth; day++) {
            headerHTML += `
                <th class="text-center">${day}</th>
            `;
        }

        thead.innerHTML = headerHTML;

        // =========================
        // BODY
        // =========================

        const tbody = document.getElementById("tableBody");

        if (!employees.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${daysInMonth + 1}"
                        class="text-center text-muted">
                        Data karyawan kosong.
                    </td>
                </tr>
            `;
            return;
        }

        let bodyHTML = "";

        employees.forEach(emp => {

            bodyHTML += `
                <tr>
                    <td class="sticky-col">
                        <p>${emp.name || "Karyawan"}</p>
                    </td>
            `;

            for (let day = 1; day <= daysInMonth; day++) {

                const dayStr =
                    String(day).padStart(2, '0');

                const status =
                    emp.daily_status?.[dayStr] || "";

                if (isEditMode) {

                    bodyHTML += `
                        <td class="text-center align-middle p-1">
                            <select
                                class="select-status-edit  status-${status}"
                                data-user-id="${emp.user_id}"
                                data-date="${periode}-${dayStr}"
                                onchange="updateTempData(this)"
                            >
                                <option value=""
                                    ${status === "" ? "selected" : ""}>
                                    -
                                </option>

                                <option value="H"
                                    ${status === "H" ? "selected" : ""}>
                                    H
                                </option>

                                <option value="T"
                                    ${status === "T" ? "selected" : ""}>
                                    T
                                </option>

                                <option value="S"
                                    ${status === "S" ? "selected" : ""}>
                                    S
                                </option>

                                <option value="A"
                                    ${status === "A" ? "selected" : ""}>
                                    A
                                </option>

                                <option value="L"
                                    ${status === "L" ? "selected" : ""}>
                                    L
                                </option>
                            </select>
                        </td>
                    `;

                } else {

                    const displayLabel =
                        status === "" ? "-" : status;

                    bodyHTML += `
                        <td class="text-center align-middle p-1">
                            <span
                                class="status-badge status-${status}">
                                ${displayLabel}
                            </span>
                        </td>
                    `;
                }
            }

            bodyHTML += `</tr>`;
        });

        tbody.innerHTML = bodyHTML;

    } catch (error) {
        console.error(error);

        tbody.innerHTML = `
            <tr>
                <td colspan="${daysInMonth + 1}"
                    class="text-center text-danger">
                    Gagal mengambil data absensi.
                </td>
            </tr>
        `;
    }
}

async function handleAttendanceAction() {
    const btnMain = document.getElementById('btnMainAttendance');
    const btnCancel = document.getElementById('btnCancelEdit');

    if (!isEditMode) {
        isEditMode = true;

        btnMain.className = "btn btn-primary";
        btnMain.innerHTML =
            `<i class="fa-solid fa-floppy-disk"></i> Simpan Kehadiran`;

        if (btnCancel) {
            btnCancel.classList.remove('d-none');
        }

        await renderTable();

    } else {
        await saveAttendance();
    }
}

function cancelEditMode() {
    isEditMode = false;
    tempAttendanceData = {};
    resetEditButtons();
    renderTable();
}

function resetEditButtons() {
    const btnMain = document.getElementById('btnMainAttendance');
    const btnCancel = document.getElementById('btnCancelEdit');

    if (btnMain) {
        btnMain.className = "btn btn-outline-primary";
        btnMain.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Presensi`;
        btnMain.disabled = false;
    }

    if (btnCancel) {
        btnCancel.classList.add('d-none');
    }
}

async function saveAttendance() {
    const btnMain = document.getElementById('btnMainAttendance');

    if (btnMain) {
        btnMain.disabled = true;
        btnMain.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Menyimpan...
        `;
    }

    // Ambil data langsung dari tabel
    const selects = document.querySelectorAll(
        '#attendanceTable .select-status-edit'
    );

    const payload = [];

    selects.forEach(select => {
        const user_id = select.dataset.userId;
        const date = select.dataset.date;
        const status = select.value;

        if (user_id && date) {
            payload.push({
                user_id,
                date,
                status
            });
        }
    });

    console.log("Data yang dikirim:", payload);

    try {
        const response = await fetch('/api/attendance/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            showToast(
                result.message || "Absensi berhasil disimpan!"
            );

            isEditMode = false;
            resetEditButtons();

            // Kembalikan tombol ke mode Edit Presensi
            if (btnMain) {
                btnMain.disabled = false;
                btnMain.className = "btn btn-primary";
                btnMain.innerHTML = `
                    <i class="fa-solid fa-pen-to-square"></i>
                    Edit Presensi
                `;
            }

            window.location.href = '/attendance/detail';

            return;
        }

    } catch (error) {
        console.error("Error saving attendance:", error);

        showToastFailed(
            "Terjadi kesalahan koneksi ke server."
        );

    } finally {
        if (btnMain) {
            btnMain.disabled = false;
            btnMain.className = "btn btn-primary";
            btnMain.innerHTML = `
                <i class="fa-solid fa-floppy-disk"></i>
                Simpan Kehadiran
            `;
        }
    }
}

let expandedEmpIds = new Set();

function toggleExpand(empId) {
    if (expandedEmpIds.has(empId)) {
        expandedEmpIds.delete(empId);
    } else {
        expandedEmpIds.add(empId);
    }
}

let selectedEmployeeIdForComp = null;

function populateDatalist() {
    const datalist = document.getElementById('masterCompList');
    if (!datalist) return;
    
    datalist.innerHTML = masterComponentNames
        .map(name => `<option value="${name}">`)
        .join('');
}

function toggleQtyInput() {
    const type = document.getElementById('compType').value;
    const groupQty = document.getElementById('groupQty');
    const lblNilaiDasar = document.getElementById('lblNilaiDasar');

    if (type === 'PER_UNIT') {
        groupQty.classList.remove('hidden');
    } else {
        groupQty.classList.add('hidden');
    }

    if (type === 'PERCENT_GAPOK') {
        lblNilaiDasar.innerText = "Persentase (%)";
    } else {
        lblNilaiDasar.innerText = "Nilai Dasar (Rp)";
    }
}