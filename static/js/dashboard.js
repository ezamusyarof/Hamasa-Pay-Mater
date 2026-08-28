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
// let attendanceChartInstance = null;

function getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

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

function updateTempData(selectElem) {
    const key = selectElem.dataset.key;
    const newStatus = selectElem.value;

    if (!tempAttendanceData[key]) {
        tempAttendanceData[key] = { status: "", checkin: null, checkout: null };
    }
    
    tempAttendanceData[key].status = newStatus;
    selectElem.setAttribute('data-status', newStatus);
}

function renderTable() {
    console.log("--- MENJALANKAN renderTable ---");
    console.log("Jumlah Employees:", employees ? employees.length : "employees belum ada / kosong!");

    const selectElem = document.getElementById("selectPeriode");
    const periode = selectElem ? selectElem.value : "2026-08"; 
    
    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const theadTr = document.getElementById("tableHeader");
    if (theadTr) {
        let headerHTML = `<th class="sticky-col text-center"><b>Nama Karyawan</b></th>`;
        for (let day = 1; day <= daysInMonth; day++) {
            headerHTML += `<th class="text-center">${day}</th>`;
        }
        theadTr.innerHTML = headerHTML;
    } else {
        console.warn("Elemen #tableHeader tidak ditemukan di HTML!");
    }

    const tbody = document.getElementById("tableBody");
    if (!tbody) {
        console.error("GAGAL: Elemen #tableBody tidak ditemukan di HTML!");
        return;
    }
    
    let bodyHTML = "";
    const activeDataset = (typeof isEditMode !== 'undefined' && isEditMode) ? tempAttendanceData : attendanceData;

    if (!employees || employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="32" class="text-center text-muted">Data karyawan kosong.</td></tr>`;
        return;
    }

    employees.forEach(emp => {
        const empName = emp.name || emp.nama || 'Karyawan';
        const empKey = typeof getEmpKey === 'function' ? getEmpKey(emp) : (emp.user_id || emp.id);

        bodyHTML += `<tr>`;
        bodyHTML += `<td class="sticky-col"><b>${empName}</b></td>`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = String(day).padStart(2, '0');
            const dataKey = `${empKey}_${periode}-${dayStr}`;
            const attendance = activeDataset ? activeDataset[dataKey] : null;
            const status = attendance?.status || "";

            if (day === 1) {
                console.log(`Cek DataKey untuk Karyawan [${empName} | Key: ${empKey}]:`, dataKey, "Hasil:", attendance);
            }

            if (typeof isEditMode !== 'undefined' && isEditMode) {
                bodyHTML += `
                    <td class="text-center align-middle p-1">
                        <select class="select-status-edit" 
                                data-status="${status}"
                                data-key="${dataKey}" 
                                onchange="updateTempData(this)">
                            <option value="" ${status === '' ? 'selected' : ''}>-</option>
                            <option value="H" ${status === 'H' ? 'selected' : ''}>H</option>
                            <option value="T" ${status === 'T' ? 'selected' : ''}>T</option>
                            <option value="S" ${status === 'S' ? 'selected' : ''}>S</option>
                            <option value="A" ${status === 'A' ? 'selected' : ''}>A</option>
                            <option value="L" ${status === 'L' ? 'selected' : ''}>L</option>
                        </select>
                    </td>`;
            } else {
                const displayLabel = status === "" ? "-" : status;
                bodyHTML += `
                    <td class="text-center align-middle p-1">
                        <span class="status-badge" data-status="${status}">${displayLabel}</span>
                    </td>`;
            }
        }
        bodyHTML += `</tr>`;
    });

    tbody.innerHTML = bodyHTML;
    console.log("--- RENDER SELESAI ---");
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

let expandedEmpIds = new Set();

function toggleExpand(empId) {
    if (expandedEmpIds.has(empId)) {
        expandedEmpIds.delete(empId);
    } else {
        expandedEmpIds.add(empId);
    }
    renderPayrollTable();
}

function formatRupiahInput(input) {
    const rawValue = input.value.replace(/\D/g, '');

    input.dataset.rawValue = rawValue;

    if (rawValue) {
        input.value = new Intl.NumberFormat('id-ID').format(Number(rawValue));
    } else {
        input.value = '';
    }
}

function calculateComponentAmount(item, employee) {
    const baseValue = Number(item.nilai_dasar || 0);
    const gapok = Number(employee.basic_salary || 0);
    const totalHadir = Number(employee.att?.H || 0);

    switch (item.tipe) {
        case 'PERCENT_GAPOK':
            return (baseValue / 100) * gapok;

        case 'PER_ATTENDANCE':
            return baseValue * totalHadir;

        case 'PER_UNIT':
            return baseValue * Number(item.qty || 1);

        case 'FLAT':
        default:
            return baseValue;
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

function openAddCompModal(employeeId, defaultCategory = 'tunjanganList') {
    selectedEmployeeIdForComp = employeeId;
    
    if (typeof populateDatalist === 'function') populateDatalist();

    const form = document.getElementById('formAddCompensation');
    if (form) form.reset();

    const categorySelect = document.getElementById('compCategory');
    if (categorySelect) categorySelect.value = defaultCategory;

    if (typeof toggleQtyInput === 'function') toggleQtyInput();

    const modal = document.getElementById('modalAddCompensation');
    if (modal) {
        modal.style.setProperty('display', 'flex', 'important');
    }
}

function closeCompModal() {
    const modal = document.getElementById('modalAddCompensation');
    if (modal) {
        modal.style.setProperty('display', 'none', 'important');
    }
}
new Chart(document.getElementById('payrollChart'), {
    type: 'line',
    data: {
        labels: payrollChartData.map(item => item.periode),
        datasets: [{
            label: 'Total Gaji',
            data: payrollChartData.map(item => item.total),
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return 'Rp ' + context.raw.toLocaleString('id-ID');
                    }
                }
            }
        },
        scales: {
            y: {
                ticks: {
                    callback: function(value) {
                        return 'Rp ' + value.toLocaleString('id-ID');
                    }
                }
            }
        }
    }
});

// new Chart(document.getElementById('attendanceChart'), {
//     type: 'doughnut',
//     data: {
//         labels: [
//             'Hadir',
//             'Terlambat',
//             'Sakit',
//             'Alpha'
//         ],
//         datasets: [{
//             data: [
//                 attendanceToday.hadir,
//                 attendanceToday.terlambat,
//                 attendanceToday.sakit,
//                 attendanceToday.alpha
//             ]
//         }]
//     },
//     options: {
//         responsive: true,
//         maintainAspectRatio: false
//     }
// });