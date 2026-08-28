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

// 3. Fungsi Render Datalist Safe-Mode
function renderMasterComponentDatalist() {
    const datalist = document.getElementById('masterComponentList');
    if (!datalist) return;

    const names = getMasterComponentNames();
    datalist.innerHTML = names
        .map(name => `<option value="${name}"></option>`)
        .join('');
}

function getEmpKey(emp) {
    if (!emp) return '';
    const key = emp.user_id !== undefined && emp.user_id !== null && emp.user_id !== '' 
        ? emp.user_id 
        : emp.id;
    return String(key).trim();
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
    const key = selectElem.dataset.key;
    const newStatus = selectElem.value;

    if (!tempAttendanceData[key]) {
        tempAttendanceData[key] = { status: "", checkin: null, checkout: null };
    }
    
    tempAttendanceData[key].status = newStatus;
    selectElem.setAttribute('data-status', newStatus);
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

function generateWALink(emp) {
    const calc = calculateSalaryDetails(emp);
    const phone = emp.phone || emp.wa || '';
    const text = `Halo *${emp.name}*,

Berikut adalah rincian *Slip Gaji* Anda:

- Gaji Pokok: ${formatRupiah(calc.gapok)}
- Tunjangan & Bonus: ${formatRupiah(calc.tunjangan + calc.bonus)}
- Potongan: ${formatRupiah(calc.totalPotongan)}
*Total Gaji Bersih (THP)*: *${formatRupiah(calc.thp)}*

_Terima kasih atas kerja keras Anda!_`;
    
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
}

async function openEmpModal(id = null) {
    document.getElementById('empForm').reset();

    const modal = document.getElementById('empModal');

    if (id) {
        try {
            const response = await fetch(`/api/employees?id=${id}`);

            if (!response.ok) {
                throw new Error('Gagal mengambil data karyawan');
            }

            const data = await response.json();

            if (!data.length) {
                alert('Data karyawan tidak ditemukan');
                return;
            }

            const emp = data[0];

            editingEmployeeId = emp.id;

            document.getElementById('empModalTitle').innerText =
                'Edit Data Karyawan';

            document.getElementById('emp-id').value =
                emp.user_id || '';

            document.getElementById('emp-nama').value =
                emp.name || '';

            document.getElementById('emp-jabatan').value =
                emp.position || '';

            document.getElementById('emp-gapok').value =
                String(emp.basic_salary) || 0;

            document.getElementById('emp-jenis-kelamin').value =
                emp.gender || 0;

            document.getElementById('emp-status-perkawinan').value =
                emp.married_status || 0;

            document.getElementById('emp-jumlah-tanggungan').value =
                emp.dependents || 0;

            document.getElementById('emp-wa').value =
                emp.phone || '';

        } catch (error) {
            console.error(error);
            alert('Gagal mengambil data karyawan');
            return;
        }

    } else {
        editingEmployeeId = null;

        document.getElementById('empModalTitle').innerText =
            'Tambah Karyawan Baru';

        document.getElementById('emp-id').value = '';
    }

    modal.classList.add('active');
}

function closeEmpModal() {
    document.getElementById('empModal').classList.remove('active');
    editingEmployeeId = null;
}

// EMPLOYEES
async function saveEmployee() {
    const employee = {
        user_id: document.getElementById("emp-id").value,
        name: document.getElementById("emp-nama").value,
        position: document.getElementById("emp-jabatan").value,
        phone: document.getElementById("emp-wa").value,
        basic_salary: parseFloat(document.getElementById('emp-gapok').value.replace(/\./g, '')),
        married_status: document.getElementById('emp-status-perkawinan').value,
        gender: document.getElementById('emp-jenis-kelamin').value,
        dependents: document.getElementById('emp-jumlah-tanggungan').value,
    };

    const url = editingEmployeeId ? `/api/employees/${editingEmployeeId}` : "/api/employees";
    const method = editingEmployeeId ? "PUT" : "POST";

    try {
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(employee)
        });

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}));
            showToastFailed(errorResult.message || "Gagal menyimpan data.");
            return;
        }

        const result = await response.json();
        showToast(result.message || "Data karyawan berhasil disimpan");
        closeEmpModal();
        window.location.href = '/employees';
        // await loadEmployees();
    } catch (e) {
        showToastFailed("Terjadi kesalahan koneksi ke server.");
    }
}

function openDeleteConfirmModal(id, name) {
    document.getElementById('deleteConfirmName').innerText =
        name || 'Karyawan ini';

    document.getElementById('confirmDeleteModal').classList.add('active');
}

function closeDeleteConfirmModal() {
    employeeToDeleteId = null;
    document.getElementById('confirmDeleteModal').classList.remove('active');
}

let deleteEmployeeId = null;

function deleteEmployee(id, name) {
    deleteEmployeeId = id;

    document.getElementById('deleteConfirmName').innerText =
        name || 'Karyawan ini';

    document.getElementById('confirmDeleteModal')
        .classList.add('active');
}

async function confirmDeleteEmployee() {
    if (!deleteEmployeeId) return;

    try {
        const response = await fetch(
            `/api/employees/${deleteEmployeeId}`,
            {
                method: 'DELETE'
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || 'Gagal menghapus karyawan'
            );
        }

        closeDeleteConfirmModal();

        window.location.href = '/employees';

    } catch (error) {
        console.error(error);
        alert('Gagal menghapus karyawan: ' + error.message);
    }
}

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number || 0);
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

function closeModalOnOverlay(event) {
    if (event.target.classList.contains('custom-modal-overlay')) {
        event.target.style.display = 'none';
    }
}