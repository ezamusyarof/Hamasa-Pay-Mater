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
let activeDeleteState = null; // State hapus item tunjangan/bonus/potongan
let payrollChartInstance = null;
let attendanceChartInstance = null;

function getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`; // Output: "2026-08"
}

// Load master nama dari LocalStorage (atau berikan default awal)
let masterComponentNames = JSON.parse(localStorage.getItem('masterComponentNames')) || [
    "Tunjangan Transport",
    "Tunjangan Uang Makan",
    "Tunjangan Jabatan",
    "BPJS Kesehatan",
    "BPJS Ketenagakerjaan",
    "Bonus Performa",
    "Potongan Keterlambatan",
    "Potongan Kasbon"
];

// 2. Fungsi Helper Ambil Data (Mencegah Error Null/TDZ)
function getMasterComponentNames() {
    if (!Array.isArray(window.masterComponentNames)) {
        window.masterComponentNames = JSON.parse(localStorage.getItem('masterComponentNames')) || [];
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

// ==========================================
// 1. INISIALISASI & ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 [DOM] Halaman selesai dimuat! Memulai inisialisasi aplikasi...");

    // 1. Inisialisasi Sidebar (Isolasi Error)
    try {
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        }
    } catch (err) {
        console.warn("⚠️ Gagal membaca status sidebar:", err);
    }

    // 2. Inisialisasi Route / Halaman Aktif (Isolasi Error)
    try {
        if (typeof activatePageFromRoute === 'function') {
            activatePageFromRoute();
        }
    } catch (err) {
        console.warn("⚠️ Fungsi activatePageFromRoute bermasalah:", err);
    }

    // 3. Penentuan Periode Aktif dengan Fallback Aman
    const selectPeriode = document.getElementById("selectPeriode");
    let activePeriode = "";

    try {
        // Jika getCurrentPeriod() ada, pakai. Jika tidak, pakai bulan saat ini (YYYY-MM)
        const currentPeriod = (typeof getCurrentPeriod === 'function') 
            ? getCurrentPeriod() 
            : new Date().toISOString().slice(0, 7);

        if (selectPeriode && !selectPeriode.value) {
            selectPeriode.value = currentPeriod;
        }
        activePeriode = selectPeriode ? selectPeriode.value : currentPeriod;
    } catch (err) {
        console.warn("⚠️ Gagal menentukan periode, menggunakan fallback saat ini:", err);
        activePeriode = new Date().toISOString().slice(0, 7);
    }

    // 4. Memuat Data Utama Aplikasi secara Paralel (Cepat & Aman)
    try {
        console.log(`📌 Memuat seluruh data untuk periode: ${activePeriode}`);

        // Promise.allSettled memastikan jika 1 fungsi gagal, fungsi lain TETAP BERJALAN!
        await Promise.allSettled([
            loadEmployees(),
            loadAttendanceData(activePeriode),
            typeof loadDashboard === 'function' ? loadDashboard() : Promise.resolve()
        ]);

        console.log("✅ Semua data awal selesai diproses!");

    } catch (e) {
        console.error("❌ Error kritis saat load data awal:", e);
    }

    // 5. Event Listener Pengubah Periode Dropdown
    if (selectPeriode) {
        selectPeriode.addEventListener('change', async (e) => {
            const selectedPeriode = e.target.value;
            console.log(`🔄 Periode diubah ke: ${selectedPeriode}`);

            try {
                // Update rekap SQLite backend terlebih dahulu
                await fetch(`/api/attendance/update?periode=${selectedPeriode}`); 

                // Reload semua data tabel secara serentak
                await Promise.allSettled([
                    loadEmployees(),
                    loadAttendanceData(selectedPeriode),
                    typeof loadDashboard === 'function' ? loadDashboard() : Promise.resolve()
                ]);

                console.log("✅ Data periode baru berhasil diperbarui!");
            } catch (err) {
                console.error("❌ Gagal memperbarui data periode baru:", err);
            }
        });
    }

    renderMasterComponentDatalist();
});

window.addEventListener('popstate', () => {
    activatePageFromRoute();
});

function getRouteForPage(targetView) {
    const routes = {
        'dashboard': '/dashboard',
        'karyawan': '/employees',
        'kehadiran': '/attendance',
        'payroll': '/payroll'
    };
    return routes[targetView] || '/dashboard';
}

function switchNav(element, targetView, pushToHistory = true) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    const activeNav = element || document.querySelector(`.nav-item[data-page="${targetView}"]`);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const targetSection = document.getElementById(`view-${targetView}`);
    if (targetSection) targetSection.classList.add('active');

    const titles = {
        'dashboard': 'Dashboard Utama',
        'karyawan': 'Manajemen Data Karyawan',
        'kehadiran': 'Manajemen Kehadiran Karyawan',
        'payroll': 'Penggajian & Slip Gaji Automasi'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titles[targetView] || 'Dashboard Utama';

    const nextPath = getRouteForPage(targetView);
    if (pushToHistory && window.location.pathname !== nextPath) {
        history.pushState({}, '', nextPath);
    }
}

function activatePageFromRoute() {
    let currentPath = window.location.pathname.replace(/\/$/, "");
    if (currentPath === "") currentPath = "/";

    const pageMap = {
        '/': 'dashboard',
        '/dashboard': 'dashboard',
        '/employees': 'karyawan',
        '/attendance': 'kehadiran',
        '/payroll': 'payroll'
    };

    const page = pageMap[currentPath] || 'dashboard';
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    switchNav(navItem, page, false); 
}

function switchTab(btn, tabId) {
    // Sembunyikan semua tab content
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    // Tampilkan tab yang dipilih
    const activeTab = document.getElementById(tabId);
    if (activeTab) activeTab.style.display = 'block';
    if (btn) btn.classList.add('active');

    // Jika pindah ke Detail Kehadiran, muat data matriknya
    if (tabId === 'tab-detail-kehadiran') {
        const periodeInput = document.getElementById('selectPeriode');
        const currentPeriode = periodeInput ? periodeInput.value : '2026-08';
        loadAttendanceData(currentPeriode);
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
}

async function loadEmployees() {
    const periodeInput = document.getElementById('selectPeriode');
    const periode = periodeInput ? periodeInput.value : '2026-08';

    try {
        console.log(`🔍 [STEP 1] Mengambil data karyawan periode: ${periode}...`);
        const response = await fetch(`/api/employees?periode=${periode}`);
        const result = await response.json();
        console.log("📦 [STEP 2] Response mentah Backend:", result);

        let rawList = [];
        if (Array.isArray(result)) rawList = result;
        else if (Array.isArray(result.data)) rawList = result.data;
        else if (Array.isArray(result.employees)) rawList = result.employees;

        console.log(`📊 [STEP 3] Jumlah data ditemukan: ${rawList.length} orang.`);

        // Normalisasi data sesuai return dari calculate_employee_payroll() Flask
        employees = rawList.map(emp => {
            const attRecap = emp.att || emp.attendance || {};
            return {
                id: emp.id || emp.user_id || '',
                user_id: emp.user_id || emp.id || '-',
                name: emp.name || emp.nama || 'Tanpa Nama',
                position: emp.position || emp.role || emp.jabatan || '-',
                division: emp.division || emp.divisi || '-',
                basic_salary: Number(emp.basic_salary || emp.gapok || 0),
                allowance: Number(emp.allowance || emp.tunjangan || 0),
                phone: emp.phone || emp.wa || '-',
                email: emp.email || '-',
                status: emp.status || 'Aktif',
                tunjanganList: emp.tunjanganList || [],
                bonusList: emp.bonusList || [],
                potonganList: emp.potonganList || [],
                att: {
                    H: attRecap.H ?? 0,
                    T: attRecap.T ?? 0,
                    S: attRecap.S ?? 0,
                    A: attRecap.A ?? 0
                }
            };
        });

        // Muat kompensasi kustom dari LocalStorage jika ada
        if (typeof loadPayrollComponentsFromStorage === 'function') {
            loadPayrollComponentsFromStorage();
        }

        console.log("✅ [STEP 4] Data ter-normalisasi:", employees);
        console.log("🚀 [STEP 5] Memanggil seluruh fungsi render tabel...");

        // Render ketiga tabel
        if (typeof renderEmployeeTable === 'function') renderEmployeeTable();
        if (typeof renderAttendanceTable === 'function') renderAttendanceTable();
        if (typeof renderPayrollTable === 'function') renderPayrollTable();

    } catch (error) {
        console.error("❌ ERROR di loadEmployees:", error);
    }
}

async function loadDashboard() {
    try {
        const response = await fetch("/api/dashboard");
        if (response.ok) {
            dashboardData = await response.json();
            renderDashboardCards();
        }
    } catch (e) {
        console.error("Gagal memuat dashboard:", e);
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

function renderEmployeeTable() {
    const tbody = document.getElementById('employee-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    console.log("EMP",employees)

    employees.forEach(emp => {
        tbody.innerHTML += `
            <tr>
                <td>
                    <b>${emp.name}</b><br>
                    <span class="text-muted" style="font-size:11px;">${getEmployeeDisplayId(emp)}</span>
                </td>
                <td>${emp.position || '-'}<br><span class="text-muted" style="font-size:11px;">${emp.division || emp.divisi || '-'}</span></td>
                <td>${formatRupiah(emp.basic_salary || emp.gapok || 0)}</td>
                <td>${formatRupiah(emp.allowance || emp.tunjangan || 0)}</td>
                <td>${emp.email || '-'}</td>
                <td>${emp.phone || emp.wa || '-'}</td>
                <td>
                    <button class="btn btn-outline" style="padding:4px 8px;" onclick="openEmpModal('${emp.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-outline" style="padding:4px 8px; color:var(--danger);" onclick="deleteEmployee('${emp.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function renderDashboardCards() {
    // 1. Pengaman: Jika data belum ada, hentikan fungsi
    if (!dashboardData) return;

    console.log(dashboardData)

    // ========================================================
    // 📌 TAMBAHKAN KODE PEMBARUAN CARD METRIC DI SINI
    // ========================================================
    const totalEmpEl = document.getElementById('dash-total-emp');
    const totalPayrollEl = document.getElementById('dash-total-payroll');

    // Update Total Karyawan
    if (totalEmpEl) {
        totalEmpEl.innerText = dashboardData.total_employees || 0;
    }

    // Update Estimasi Gaji Bulan Ini
    if (totalPayrollEl) {
        const totalGaji = dashboardData.total_payroll || 0;
        totalPayrollEl.innerText = 'Rp ' + totalGaji.toLocaleString('id-ID');
    }
    // ========================================================

    // 2. Chart Pengeluaran Gaji
    const ctx1El = document.getElementById('payrollChart');
    if (ctx1El) {
        if (payrollChartInstance) {
            payrollChartInstance.destroy();
        }

        const trend = dashboardData.payroll_trend || dashboardData.payrollTrend || {};
        const labels = trend.labels || ['Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus'];
        const values = trend.values || [0, 0, 0, 0, 0, 0];

        payrollChartInstance = new Chart(ctx1El.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Gaji (Rp)',
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    // 3. Chart Status Kehadiran
    const ctx2El = document.getElementById('attendanceChart');
    if (ctx2El) {
        if (attendanceChartInstance) {
            attendanceChartInstance.destroy();
        }

        const attSummary = dashboardData.attendance_summary || dashboardData.attendanceSummary || {};

        attendanceChartInstance = new Chart(ctx2El.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Hadir', 'Terlambat', 'Sakit', 'Absen'],
                datasets: [{
                    data: [
                        attSummary.hadir || 0,
                        attSummary.late || attSummary.terlambat || 0,
                        attSummary.sakit || 0,
                        attSummary.absen || 0
                    ],
                    backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

function calculateEmployeeAttendanceSummary(periode) {
    if (!periode) {
        const selectElem = document.getElementById("selectPeriode");
        periode = selectElem ? selectElem.value : "2026-08";
    }

    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    employees.forEach(emp => {
        let hadir = 0, late = 0, sakit = 0, absen = 0;
        const empKey = getEmpKey(emp);

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = String(day).padStart(2, '0');
            const dataKey = `${empKey}_${periode}-${dayStr}`;
            const item = attendanceData[dataKey];
            const status = item?.status || "";

            if (status === "H") hadir++;
            else if (status === "T") late++;
            else if (status === "S") sakit++;
            else if (status === "A") absen++;
        }

        emp.hadir = hadir;
        emp.late = late;
        emp.sakit = sakit;
        emp.absen = absen;
        emp.att = { H: hadir, T: late, S: sakit, A: absen };
    });
}

async function loadAttendanceData(periode) {
    if (!periode) {
        const dateInput = document.getElementById("selectPeriode");
        periode = dateInput ? dateInput.value : new Date().toISOString().slice(0, 7);
    }

    try {
        const response = await fetch(`/api/attendance/detail?periode=${periode}`);
        const result = await response.json();

        if (!response.ok) {
            console.error("Gagal mengambil data:", result.message);
            return;
        }

        // 1. Jalankan fungsi render detail aslimu
        if (typeof renderDetailAttendanceTable === 'function') {
            renderDetailAttendanceTable(result.data || result, periode);
        }

        // 2. Reset attendanceData
        attendanceData = {};

        // Ambil list data dari Flask
        let listToProcess = [];
        if (Array.isArray(result)) {
            listToProcess = result;
        } else if (result.data && Array.isArray(result.data)) {
            listToProcess = result.data;
        } else if (result.attendance && Array.isArray(result.attendance)) {
            listToProcess = result.attendance;
        } else if (result.detail && Array.isArray(result.detail)) {
            listToProcess = result.detail;
        }

        // 3. Mapping struktur daily_status milik Karyawan
        if (Array.isArray(listToProcess)) {
            listToProcess.forEach(empItem => {
                const uid = String(empItem.user_id || empItem.id || "").trim();
                
                // Ambil objek status harian dari karyawan (bisa daily_status, attendance, atau recap)
                const dailyMap = empItem.daily_status || empItem.attendance || empItem.recap || {};

                // Looping key hari (misal: "03", "04", "05", dll)
                Object.keys(dailyMap).forEach(dayKey => {
                    const statusVal = dailyMap[dayKey];
                    
                    // Ubah format hari (misal "3" atau "03") menjadi tanggal lengkap "2026-08-03"
                    let dt = dayKey;
                    if (!dt.includes('-')) {
                        const paddedDay = String(dayKey).padStart(2, '0');
                        dt = `${periode}-${paddedDay}`;
                    }

                    if (uid && dt) {
                        const key = `${uid}_${dt}`;
                        
                        // Tangani jika statusVal berupa string langsung ("T"/"H") atau objek
                        const statusStr = typeof statusVal === 'object' ? (statusVal.status || "") : (statusVal || "");
                        
                        attendanceData[key] = {
                            status: statusStr,
                            checkin: typeof statusVal === 'object' ? (statusVal.checkin || null) : null,
                            checkout: typeof statusVal === 'object' ? (statusVal.checkout || null) : null,
                            is_manual: typeof statusVal === 'object' ? (statusVal.is_manual || false) : false
                        };
                    }
                });
            });
        }

        console.log("🔑 Daftar Key Final dalam attendanceData:", Object.keys(attendanceData));

        // 4. Render ulang tabel matriks bulanan
        if (typeof renderTable === 'function') {
            renderTable();
        }

    } catch (error) {
        console.error("Error loadAttendanceData:", error);
    }
}

function renderDetailAttendanceTable(data, periode) {
    const headerEl = document.getElementById('tableHeader');
    const bodyEl = document.getElementById('tableBody');
    if (!headerEl || !bodyEl) return;

    // Hitung jumlah hari dalam bulan terpilih (28, 30, atau 31 hari)
    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    // A. Render Header Tanggal (Tanpa pembungkus <tr> tambahan)
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

    // B. Render Baris Data Karyawan
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

        // Rekap Total
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

            // Cek sampel key pertama kali untuk debug
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

function renderAttendanceTable() {
    const tbody = document.getElementById('attendance-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    employees.forEach(emp => {
        // Mendukung berbagai kemungkinan nama properti dari backend
        const att = emp.att || emp.attendance || emp.recap || {};
        
        const hadir     = att.H ?? att.h ?? emp.hadir ?? emp.H ?? 0;
        const terlambat = att.T ?? att.t ?? emp.terlambat ?? emp.T ?? 0;
        const sakit     = att.S ?? att.s ?? emp.sakit ?? emp.S ?? 0;
        const alpha     = att.A ?? att.a ?? emp.alfa ?? emp.alpha ?? emp.A ?? 0;

        tbody.innerHTML += `
            <tr>
                <td><b>${emp.name || emp.nama}</b><br><small class="text-muted">ID: ${getEmpKey(emp)}</small></td>
                <td><span class="status-badge status-present">${hadir} Hari</span></td>
                <td><span class="status-badge ${terlambat > 0 ? 'status-late' : ''}">${terlambat} Hari</span></td>
                <td><span class="status-badge ${sakit > 0 ? 'status-sick' : ''}">${sakit} Hari</span></td>
                <td><span class="status-badge ${alpha > 0 ? 'status-absen' : ''}">${alpha} Hari</span></td>
            </tr>
        `;
    });
}

async function handleAttendanceAction() {
    const btnMain = document.getElementById('btnMainAttendance');
    const btnCancel = document.getElementById('btnCancelEdit');

    if (!isEditMode) {
        isEditMode = true;
        tempAttendanceData = JSON.parse(JSON.stringify(attendanceData));

        btnMain.className = "btn btn-primary";
        btnMain.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Kehadiran`;

        if (btnCancel) btnCancel.classList.remove('d-none');
        renderTable();
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
        btnMain.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
    }

    const payload = [];
    Object.keys(tempAttendanceData).forEach(key => {
        const parts = key.split('_');
        const user_id = parts[0];
        const date = parts[1];
        const status = tempAttendanceData[key].status;
        payload.push({ user_id, date, status });
    });

    try {
        const response = await fetch('/api/attendance/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            showToast(result.message || "Absensi berhasil disimpan!");
            isEditMode = false;
            tempAttendanceData = {};
            resetEditButtons();

            const selectElem = document.getElementById("selectPeriode");
            await loadAttendanceData(selectElem ? selectElem.value : "2026-08");
        } else {
            showToastFailed(result.message || "Gagal menyimpan perubahan.");
            if (btnMain) {
                btnMain.disabled = false;
                btnMain.className = "btn btn-primary";
                btnMain.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Kehadiran`;
            }
        }
    } catch (e) {
        console.error("Error saving attendance:", e);
        showToastFailed("Terjadi kesalahan koneksi ke server.");
        if (btnMain) {
            btnMain.disabled = false;
            btnMain.className = "btn btn-primary";
            btnMain.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Kehadiran`;
        }
    }
}

async function updateAttendance() {
    const btn = document.getElementById('btnUpdateAttendance');
    const originalContent = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghubungkan Mesin...`;
    }

    try {
        const response = await fetch('/api/fingerprint/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok) {
            showToast(result.message || "Data berhasil ditarik dan rekap diperbarui!");
            
            if (typeof loadDashboard === 'function') loadDashboard();
            
            const periodeInput = document.getElementById('selectPeriode');
            if (typeof loadAttendanceData === 'function' && periodeInput) {
                loadAttendanceData(periodeInput.value);
            }
        } else {
            showToastFailed(result.message || "Gagal terhubung ke mesin fingerprint.");
        }
    } catch (error) {
        console.error("Error sync fingerprint:", error);
        showToastFailed("Mesin fingerprint tidak merespon / IP tidak dapat dijangkau.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
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
    renderPayrollTable();
}

function calculateSalaryDetails(emp) {
    const rateLate = 25000;
    const gapok = Number(emp.basic_salary || emp.gapok || 0);
    const tunjanganBase = Number(emp.allowance || emp.tunjangan || 0);
    
    const totalCustomTunjangan = (emp.tunjanganList || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const totalBonus = (emp.bonusList || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const totalCustomPotongan = (emp.potonganList || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);

    const rateAbsenDay = gapok > 0 ? gapok / 22 : 0;
    const potLate = (emp.late || 0) * rateLate;
    const potAbsen = Math.round((emp.absen || 0) * rateAbsenDay);
    
    const totalPotongan = potLate + potAbsen + totalCustomPotongan;
    const totalPendapatan = gapok + tunjanganBase + totalCustomTunjangan + totalBonus;
    const thp = totalPendapatan - totalPotongan;

    return { 
        gapok, 
        tunjangan: tunjanganBase + totalCustomTunjangan, 
        bonus: totalBonus,
        potLate, 
        potAbsen, 
        totalPotongan, 
        totalPendapatan, 
        thp 
    };
}

function renderPayrollTable() {
    const tbody = document.getElementById('payroll-table-body');
    if (!tbody) return;
    tbody.innerHTML = "";

    employees.forEach(emp => {
        const tunjanganList = emp.tunjanganList || [];
        const bonusList = emp.bonusList || [];
        const potonganList = emp.potonganList || [];

        const totalTunjangan = tunjanganList.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        const totalBonus = bonusList.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        const totalPotongan = potonganList.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        const gapok = Number(emp.basic_salary || emp.gapok || 0);
        
        const calc = calculateSalaryDetails(emp);
        const isExpanded = emp.isExpanded ?? true;

        tbody.innerHTML += `
            <tr class="align-top" style="cursor: pointer;" onclick="toggleExpand('${emp.id}')">
                
                <!-- NAMA & KEHADIRAN -->
                <td class="align-top" style="padding: 12px 18px; vertical-align: top !important;">
                    <div class="fw-bold" style="color: #111827; font-size: 13px;">${emp.name}</div>
                    <div class="text-muted" style="font-size: 11px;">${emp.position || '-'}</div>
                    
                    ${isExpanded ? `
                        <div class="mt-3" style="font-size: 12px; line-height: 1.5; color: #374151;">
                            <div style="height: 10px;"></div>
                            <div>Hadir: ${emp.att?.H ?? 0} Hari</div>
                            <div>Sakit: ${emp.att?.S ?? 0} Hari</div>
                            <div>Absen: ${emp.att?.A ?? 0} Hari</div>
                        </div>
                    ` : ''}
                </td>

                <!-- GAJI POKOK -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important;">
                    <div class="fw-bold" style="font-size: 13px;">${formatRupiah(gapok)}</div>
                </td>

                <!-- TUNJANGAN -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important; min-width: 190px;" onclick="event.stopPropagation();">
                    <div class="fw-bold" style="font-size: 13px; color: #111827; margin-bottom: 10px;" onclick="toggleExpand('${emp.id}')">
                        ${formatRupiah(totalTunjangan + (emp.allowance || 0))}
                    </div>
                    
                    ${isExpanded ? `
                        <div style="height: 10px;"></div>
                        <button class="btn btn-success btn-sm" 
                                style="display: block !important; width: 100% !important; text-align: center !important; font-size: 12px; padding: 10px 8px; border-radius: 6px; background-color: #22c55e; border: none; font-weight: 500; margin-bottom: 14px;" 
                                onclick="openKomponenModal('${emp.id}', 'tunjangan')">
                            + Tambah Tunjangan
                        </button>

                        <div style="display: flex; flex-direction: column; gap: 10px; max-width: 100%;">
                            ${tunjanganList.map((item, index) => {
                                const isDeleting = activeDeleteState && 
                                    String(activeDeleteState.empId) === String(emp.id) && 
                                    activeDeleteState.type === 'tunjangan' && 
                                    activeDeleteState.index === index;

                                if (isDeleting) {
                                    return `
                                        <div style="background-color: #ff0000; border: 1px solid #ff0000; padding: 5px 6px; border-radius: 6px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                                            <button type="button" 
                                                    onclick="executeRemoveItem('${emp.id}', 'tunjangan', ${index})"
                                                    style="flex: 1; background-color: #ff0000; color: #ffffff; border: none; padding: 9px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">
                                                Hapus Data
                                            </button>
                                            <button type="button" 
                                                    onclick="cancelDeleteConfirm()"
                                                    style="background-color: rgba(255,255,255,0.25); color: #ffffff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer;">
                                                x
                                            </button>
                                        </div>
                                    `;
                                }

                                return `
                                    <div style="background-color: #f0fdf4; padding: 6px 8px; border-radius: 6px; border: 1px solid #dcfce7; margin-bottom: 6px;">
                                        <div class="text-muted text-truncate" style="font-size: 11px; line-height: 1.2; margin-bottom: 2px;">
                                            ${item.name}
                                        </div>
                                        <div style="display: flex; align-items: center; justify-content: space-between;">
                                            <span class="fw-bold" style="font-size: 13px; white-space: nowrap; color: #166534;">
                                                ${formatRupiah(item.amount)}
                                            </span>
                                            <button type="button" 
                                                    class="btn btn-success btn-sm p-0 d-flex align-items-center justify-content-center" 
                                                    style="width: 18px; height: 18px; min-width: 13px; font-size: 10px; border-radius: 3px; background-color: #22c55e; border: none; flex-shrink: 0;" 
                                                    onclick="setDeleteConfirm('${emp.id}', 'tunjangan', ${index})">-</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                </td>

                <!-- BONUS / INSENTIVE -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important; min-width: 190px;" onclick="event.stopPropagation();">
                    <div class="fw-bold" style="font-size: 13px; color: #111827; margin-bottom: 10px;" onclick="toggleExpand('${emp.id}')">
                        ${formatRupiah(totalBonus)}
                    </div>
                    
                    ${isExpanded ? `
                        <div style="height: 10px;"></div>
                        <button class="btn btn-warning btn-sm" 
                                style="display: block !important; width: 100% !important; text-align: center !important; font-size: 12px; padding: 10px 8px; border-radius: 6px; background-color: #eab308; border: none; font-weight: 500; margin-bottom: 14px; color: #fff;"
                                onclick="openKomponenModal('${emp.id}', 'bonus')">
                            + Tambah Bonus/Insentive
                        </button>

                        <div style="display: flex; flex-direction: column; gap: 10px; max-width: 100%;">
                            ${bonusList.map((item, index) => {
                                const isDeleting = activeDeleteState && 
                                                String(activeDeleteState.empId) === String(emp.id) && 
                                                activeDeleteState.type === 'bonus' && 
                                                activeDeleteState.index === index;

                                if (isDeleting) {
                                    return `
                                        <div style="background-color: #ff0000; border: 1px solid #ff0000; padding: 5px 6px; border-radius: 6px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                                            <button type="button" 
                                                    onclick="executeRemoveItem('${emp.id}', 'bonus', ${index})"
                                                    style="flex: 1; background-color: #ff0000; color: #ffffff; border: none; padding: 9px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">
                                                Hapus Data
                                            </button>
                                            <button type="button" 
                                                    onclick="cancelDeleteConfirm()"
                                                    style="background-color: rgba(255,255,255,0.25); color: #ffffff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer;">
                                                x
                                            </button>
                                        </div>
                                    `;
                                }

                                return `
                                    <div style="background-color: #fefce8; padding: 6px 8px; border-radius: 6px; border: 1px solid #fef08a; margin-bottom: 6px;">
                                        <div class="text-muted text-truncate" style="font-size: 11px; line-height: 1.2; margin-bottom: 2px;">
                                            ${item.name}
                                        </div>
                                        <div style="display: flex; align-items: center; justify-content: space-between;">
                                            <span class="fw-bold" style="font-size: 13px; white-space: nowrap; color: #854d0e;">
                                                ${formatRupiah(item.amount)}
                                            </span>
                                            <button type="button" 
                                                    class="btn btn-warning text-white btn-sm p-0 d-flex align-items-center justify-content-center" 
                                                    style="width: 18px; height: 18px; min-width: 13px; font-size: 10px; border-radius: 3px; background-color: #eab308; border: none; flex-shrink: 0;" 
                                                    onclick="setDeleteConfirm('${emp.id}', 'bonus', ${index})">-</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                </td>

                <!-- POTONGAN -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important; min-width: 190px;" onclick="event.stopPropagation();">
                    <div class="fw-bold" style="font-size: 13px; color: #111827; margin-bottom: 10px;" onclick="toggleExpand('${emp.id}')">
                        -${formatRupiah(calc.totalPotongan)}
                    </div>
                    
                    ${isExpanded ? `
                        <div style="height: 10px;"></div>
                        <button class="btn btn-danger btn-sm" 
                                style="display: block !important; width: 100% !important; text-align: center !important; font-size: 12px; padding: 10px 8px; border-radius: 6px; background-color: #f87171; border: none; font-weight: 500; margin-bottom: 14px;" 
                                onclick="openKomponenModal('${emp.id}', 'potongan')">
                            + Tambah Potongan
                        </button>

                        <div style="display: flex; flex-direction: column; gap: 10px; max-width: 100%;">
                            ${potonganList.map((item, index) => {
                                const isDeleting = activeDeleteState && 
                                                String(activeDeleteState.empId) === String(emp.id) && 
                                                activeDeleteState.type === 'potongan' && 
                                                activeDeleteState.index === index;

                                if (isDeleting) {
                                    return `
                                        <div style="background-color: #ff0000; border: 1px solid #ff0000; padding: 5px 6px; border-radius: 6px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                                            <button type="button" 
                                                    onclick="executeRemoveItem('${emp.id}', 'potongan', ${index})"
                                                    style="flex: 1; background-color: #ff0000; color: #ffffff; border: none; padding: 9px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">
                                                Hapus Data
                                            </button>
                                            <button type="button" 
                                                    onclick="cancelDeleteConfirm()"
                                                    style="background-color: rgba(255,255,255,0.25); color: #ffffff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer;">
                                                x
                                            </button>
                                        </div>
                                    `;
                                }

                                return `
                                    <div style="background-color: #fef2f2; padding: 6px 8px; border-radius: 6px; border: 1px solid #fecaca; margin-bottom: 6px;">
                                        <div class="text-truncate" style="font-size: 11px; line-height: 1.2; color: #ef4444; margin-bottom: 2px;">
                                            ${item.name}
                                        </div>
                                        <div style="display: flex; align-items: center; justify-content: space-between;">
                                            <span class="fw-bold" style="font-size: 13px; white-space: nowrap; color: #ef4444;">
                                                -${formatRupiah(item.amount)}
                                            </span>
                                            <button type="button" 
                                                    class="btn btn-danger btn-sm p-0 d-flex align-items-center justify-content-center" 
                                                    style="width: 18px; height: 18px; min-width: 13px; font-size: 10px; border-radius: 3px; background-color: #f87171; border: none; flex-shrink: 0;" 
                                                    onclick="setDeleteConfirm('${emp.id}', 'potongan', ${index})">-</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                </td>

                <!-- GAJI BERSIH (THP) -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important;">
                    <div class="fw-bold" style="font-size: 13px; color: #111827;">${formatRupiah(calc.thp)}</div>
                </td>

                <!-- AKSI SLIP GAJI -->
                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important;" onclick="event.stopPropagation();">
                    <div class="d-flex gap-1">
                        <button class="btn btn-outline-dark btn-sm d-flex align-items-center gap-1" 
                                style="padding: 4px 8px; font-size: 11px; border-radius: 6px;" 
                                onclick="openSlipModal('${emp.id}')">
                            <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <button class="btn btn-success btn-sm d-flex align-items-center gap-1" 
                                style="padding: 4px 8px; font-size: 11px; border-radius: 6px; background-color: #22c55e; border: none; color:#fff;" 
                                onclick="sendSingleWhatsapp('${emp.id}')">
                            <i class="fa-brands fa-whatsapp"></i> Kirim
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function formatRupiahInput(input) {
    let rawValue = input.value.replace(/\D/g, '');
    if (rawValue) {
        input.value = new Intl.NumberFormat('id-ID').format(rawValue);
    } else {
        input.value = '';
    }
}

function getRawNominal(inputId) {
    const val = document.getElementById(inputId).value;
    return parseFloat(val.replace(/\D/g, '')) || 0;
}

function addTunjanganModal(empId) {
    document.getElementById('tunjanganEmpId').value = empId;
    document.getElementById('namaTunjangan').value = '';
    document.getElementById('nominalTunjangan').value = '';
    document.getElementById('satuanTunjangan').value = '1';

    const modal = document.getElementById('modalTambahTunjangan');
    if (modal) modal.style.display = 'flex';
}

function closeTunjanganModal() {
    const modal = document.getElementById('modalTambahTunjangan');
    if (modal) modal.style.display = 'none';
}

function simpanTunjangan() {
    const empId = document.getElementById('tunjanganEmpId').value;
    const nameInput = document.getElementById('namaTunjangan').value.trim();
    const nominal = getRawNominal('nominalTunjangan');
    const satuan = parseFloat(document.getElementById('satuanTunjangan').value) || 1;

    if (!nameInput) {
        alert("Silakan isi nama tunjangan!");
        return;
    }
    if (nominal <= 0) {
        alert("Nominal tunjangan harus lebih dari 0!");
        return;
    }

    const totalAmount = nominal * satuan;
    const emp = employees.find(e => String(e.id) === String(empId));
    if (emp) {
        if (!emp.tunjanganList) emp.tunjanganList = [];
        emp.tunjanganList.push({
            name: satuan > 1 ? `${nameInput} (${satuan}x)` : nameInput,
            amount: totalAmount
        });

        savePayrollComponentsToStorage(); // <-- SIMPAN KE LOCALSTORAGE
        closeTunjanganModal();
        renderPayrollTable();
    }
}

function addBonusModal(empId) {
    document.getElementById('bonusEmpId').value = empId;
    document.getElementById('namaBonus').value = '';
    document.getElementById('nominalBonus').value = '';
    document.getElementById('satuanBonus').value = '1';

    const modal = document.getElementById('modalTambahBonus');
    if (modal) modal.style.display = 'flex';
}

function closeBonusModal() {
    const modal = document.getElementById('modalTambahBonus');
    if (modal) modal.style.display = 'none';
}

function simpanBonus() {
    const empId = document.getElementById('bonusEmpId').value;
    const nameInput = document.getElementById('namaBonus').value.trim();
    const nominal = getRawNominal('nominalBonus');
    const satuan = parseFloat(document.getElementById('satuanBonus').value) || 1;

    if (!nameInput) {
        alert("Silakan isi nama bonus/insentive!");
        return;
    }
    if (nominal <= 0) {
        alert("Nominal harus lebih dari 0!");
        return;
    }

    const totalAmount = nominal * satuan;
    const emp = employees.find(e => String(e.id) === String(empId));
    if (emp) {
        if (!emp.bonusList) emp.bonusList = [];
        emp.bonusList.push({
            name: satuan > 1 ? `${nameInput} (${satuan}x)` : nameInput,
            amount: totalAmount
        });

        savePayrollComponentsToStorage(); // <-- SIMPAN KE LOCALSTORAGE
        closeBonusModal();
        renderPayrollTable();
    }
}

function addPotonganModal(empId) {
    document.getElementById('potonganEmpId').value = empId;
    document.getElementById('namaPotongan').value = '';
    document.getElementById('nominalPotongan').value = '';
    document.getElementById('satuanPotongan').value = '1';

    const modal = document.getElementById('modalTambahPotongan');
    if (modal) modal.style.display = 'flex';
}

function closePotonganModal() {
    const modal = document.getElementById('modalTambahPotongan');
    if (modal) modal.style.display = 'none';
}

function simpanPotongan() {
    const empId = document.getElementById('potonganEmpId').value;
    const nameInput = document.getElementById('namaPotongan').value.trim();
    const nominal = getRawNominal('nominalPotongan');
    const satuan = parseFloat(document.getElementById('satuanPotongan').value) || 1;

    if (!nameInput) {
        alert("Silakan isi nama potongan!");
        return;
    }
    if (nominal <= 0) {
        alert("Nominal harus lebih dari 0!");
        return;
    }

    const totalAmount = nominal * satuan;
    const emp = employees.find(e => String(e.id) === String(empId));
    if (emp) {
        if (!emp.potonganList) emp.potonganList = [];
        emp.potonganList.push({
            name: satuan > 1 ? `${nameInput} (${satuan}x)` : nameInput,
            amount: totalAmount
        });

        savePayrollComponentsToStorage(); // <-- SIMPAN KE LOCALSTORAGE
        closePotonganModal();
        renderPayrollTable();
    }
}

function setDeleteConfirm(empId, type, index) {
    activeDeleteState = { empId, type, index };
    renderPayrollTable();
}

function cancelDeleteConfirm() {
    activeDeleteState = null;
    renderPayrollTable();
}

function executeRemoveItem(empId, type, index) {
    const emp = employees.find(e => String(e.id) === String(empId));
    if (emp) {
        if (type === 'tunjangan' && emp.tunjanganList) {
            emp.tunjanganList.splice(index, 1);
        } else if (type === 'bonus' && emp.bonusList) {
            emp.bonusList.splice(index, 1);
        } else if (type === 'potongan' && emp.potonganList) {
            emp.potonganList.splice(index, 1);
        }
        savePayrollComponentsToStorage(); // <-- SIMPAN PERUBAHAN HAPUS
    }
    activeDeleteState = null;
    renderPayrollTable();
}

function closeModalOnOverlay(event) {
    if (event.target.id === 'modalTambahTunjangan') closeTunjanganModal();
    else if (event.target.id === 'modalTambahBonus') closeBonusModal();
    else if (event.target.id === 'modalTambahPotongan') closePotonganModal();
}

function openSlipModal(id) {
    activeSlipEmpId = id;
    const emp = employees.find(e => String(e.id) === String(id));
    if (!emp) return;
    
    const calc = calculateSalaryDetails(emp);

    document.getElementById('slip-id').innerText = getEmployeeDisplayId(emp);
    document.getElementById('slip-nama').innerText = emp.name;
    document.getElementById('slip-jabatan').innerText = emp.position || emp.jabatan || '-';
    document.getElementById('slip-divisi').innerText = emp.division || emp.divisi || '-';

    document.getElementById('slip-gapok').innerText = formatRupiah(calc.gapok);
    document.getElementById('slip-tunjangan').innerText = formatRupiah(calc.tunjangan + calc.bonus);

    document.getElementById('slip-late-hours').innerText = emp.late || 0;
    document.getElementById('slip-pot-late').innerText = formatRupiah(calc.potLate);
    document.getElementById('slip-absen-days').innerText = emp.absen || 0;
    document.getElementById('slip-pot-absen').innerText = formatRupiah(calc.potAbsen + (calc.totalPotongan - calc.potLate - calc.potAbsen));

    document.getElementById('slip-thp').innerText = formatRupiah(calc.thp);

    const btnWA = document.getElementById('btn-send-single-wa');
    if (btnWA) btnWA.onclick = () => sendSingleWhatsapp(emp.id);

    document.getElementById('slipModal').classList.add('active');
}

function closeSlipModal() {
    document.getElementById('slipModal').classList.remove('active');
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

function sendSingleWhatsapp(id) {
    const emp = employees.find(e => String(e.id) === String(id));
    if (!emp) return;
    emp.statusWA = 'Terkirim';
    const url = generateWALink(emp);
    window.open(url, '_blank');
    showToast(`Slip Gaji terkirim ke WhatsApp ${emp.name}`);
    renderPayrollTable();
}

function sendAllWhatsapp() {
    if (!employees || employees.length === 0) {
        showToastFailed('Tidak ada data karyawan!');
        return;
    }
    let count = 0;
    employees.forEach(emp => {
        if (emp.phone || emp.wa) {
            const url = generateWALink(emp);
            window.open(url, '_blank');
            emp.statusWA = 'Terkirim';
            count++;
        }
    });
    showToast(`Slip Gaji dikirim ke ${count} karyawan via WhatsApp.`);
    renderPayrollTable();
}

function downloadPDF() {
    const element = document.getElementById('payslip-render-area');
    if (!element) return;
    const opt = {
        margin: 10,
        filename: `Slip_Gaji_${activeSlipEmpId || 'Karyawan'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function downloadPNG() {
    const element = document.getElementById('payslip-render-area');
    if (!element) return;
    html2canvas(element, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Slip_Gaji_${activeSlipEmpId || 'Karyawan'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

// ==========================================
// 7. MODAL CRUD KARYAWAN
// ==========================================
function openEmpModal(id = null) {
    document.getElementById('empForm').reset();
    editingEmployeeId = id || null;

    const divisionSelect = document.getElementById('emp-divisi');

    if (editingEmployeeId) {
        const emp = employees.find(e => String(e.id) === String(editingEmployeeId));
        if (!emp) return;

        document.getElementById('empModalTitle').innerText = 'Edit Data Karyawan';
        document.getElementById('emp-id').value = emp.user_id || emp.id;
        document.getElementById('emp-nama').value = emp.name;
        document.getElementById('emp-jabatan').value = emp.position || emp.jabatan || '';
        document.getElementById('emp-gapok').value = emp.basic_salary || emp.gapok || 0;
        document.getElementById('emp-tunjangan').value = emp.allowance || emp.tunjangan || 0;
        document.getElementById('emp-wa').value = emp.phone || emp.wa || '';
        document.getElementById('emp-email').value = emp.email || '';
        if (divisionSelect) divisionSelect.value = emp.division || emp.divisi || 'Admin';
    } else {
        document.getElementById('empModalTitle').innerText = 'Tambah Karyawan Baru';
        document.getElementById('emp-id').value = '';
    }

    document.getElementById('empModal').classList.add('active');
}

function closeEmpModal() {
    document.getElementById('empModal').classList.remove('active');
    editingEmployeeId = null;
}

async function saveEmployee() {
    const employee = {
        user_id: document.getElementById("emp-id").value,
        name: document.getElementById("emp-nama").value,
        position: document.getElementById("emp-jabatan").value,
        division: document.getElementById("emp-divisi").value,
        phone: document.getElementById("emp-wa").value,
        email: document.getElementById("emp-email").value,
        basic_salary: Number(document.getElementById("emp-gapok").value),
        allowance: Number(document.getElementById("emp-tunjangan").value),
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
        await loadEmployees();
    } catch (e) {
        showToastFailed("Terjadi kesalahan koneksi ke server.");
    }
}

function openDeleteConfirmModal(id) {
    const emp = employees.find(e => String(e.id) === String(id));
    if (!emp) return;

    employeeToDeleteId = id;
    document.getElementById('deleteConfirmName').innerText = emp.name || emp.user_id || 'Karyawan ini';
    document.getElementById('confirmDeleteModal').classList.add('active');
}

function closeDeleteConfirmModal() {
    employeeToDeleteId = null;
    document.getElementById('confirmDeleteModal').classList.remove('active');
}

function deleteEmployee(id) {
    openDeleteConfirmModal(id);
}

// ==========================================
// 8. HELPER UTILS & NOTIFIKASI
// ==========================================
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number || 0);
}

function showToast(message) {
    const toast = document.getElementById('toast-success');
    const msgEl = document.getElementById('toast-message-success');
    if (msgEl) msgEl.innerText = message;
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

function showToastFailed(message) {
    const toast = document.getElementById('toast-failed');
    const msgEl = document.getElementById('toast-message-failed');
    if (msgEl) msgEl.innerText = message;
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// Simpan ke LocalStorage
function savePayrollComponentsToStorage() {
    const customData = {};
    employees.forEach(emp => {
        customData[emp.id] = {
            tunjanganList: emp.tunjanganList || [],
            bonusList: emp.bonusList || [],
            potonganList: emp.potonganList || []
        };
    });
    localStorage.setItem('payroll_components', JSON.stringify(customData));
}

// Muat kembali dari LocalStorage saat loadEmployees()
function loadPayrollComponentsFromStorage() {
    const saved = localStorage.getItem('payroll_components');
    if (!saved) return;
    
    const customData = JSON.parse(saved);
    employees.forEach(emp => {
        if (customData[emp.id]) {
            emp.tunjanganList = customData[emp.id].tunjanganList || [];
            emp.bonusList = customData[emp.id].bonusList || [];
            emp.potonganList = customData[emp.id].potonganList || [];
        }
    });
}

/**
 * Menghitung nilai akhir komponen berdasarkan tipe rumus
 * @param {Object} item - Data komponen (tipe, nilai_dasar, qty)
 * @param {Object} employee - Data karyawan terkait
 * @returns {number} Hasil akhir kalkulasi nominal
 */

function calculateComponentAmount(item, employee) {
    const baseValue = Number(item.nilai_dasar || 0);
    const gapok = Number(employee.basic_salary || 0);
    const totalHadir = Number(employee.att?.H || 0);

    switch (item.tipe) {
        case 'PERCENT_GAPOK':
            // Contoh: 5% dari Gaji Pokok
            return (baseValue / 100) * gapok;

        case 'PER_ATTENDANCE':
            // Contoh: Rp 25.000 x Jumlah Hadir
            return baseValue * totalHadir;

        case 'PER_UNIT':
            // Contoh: Rp 50.000 x 8 Jam Lembur
            return baseValue * Number(item.qty || 1);

        case 'FLAT':
        default:
            // Nominal Tetap
            return baseValue;
    }
}

let selectedEmployeeIdForComp = null; // Menyimpan ID karyawan yang sedang diedit

// 1. Fungsi Mengisi Datalist Autocomplete
function populateDatalist() {
    const datalist = document.getElementById('masterCompList');
    if (!datalist) return;
    
    datalist.innerHTML = masterComponentNames
        .map(name => `<option value="${name}">`)
        .join('');
}

// 2. Tampilkan/Sembunyikan Input Qty & Ubah Label Input
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

    // PAKSA PAKAI INLINE STYLE (Membypass semua aturan CSS eksternal)
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

// ==========================================
// HANDLE SUBMIT FORM MODAL KOMPONEN (FIXED)
// ==========================================
document.getElementById('formAddCompensation').addEventListener('submit', function(e) {
    e.preventDefault();

    const category = document.getElementById('compCategory').value; // tunjanganList / bonusList / potonganList
    const name = document.getElementById('compName').value.trim();
    const type = document.getElementById('compType').value;
    const baseValue = parseFloat(document.getElementById('compBaseValue').value);
    const qty = type === 'PER_UNIT' ? parseFloat(document.getElementById('compQty').value) : 1;

    if (!name || isNaN(baseValue)) return;

    // A. Simpan Nama ke Master Autocomplete
    if (!masterComponentNames.includes(name)) {
        masterComponentNames.push(name);
        localStorage.setItem('masterComponentNames', JSON.stringify(masterComponentNames));
    }

    // B. Cari Karyawan
    const emp = employees.find(e => String(e.id) === String(selectedEmployeeIdForComp) || String(e.user_id) === String(selectedEmployeeIdForComp));
    if (!emp) return alert("Karyawan tidak ditemukan!");

    // C. Hitung Nominal Amount dengan Benar
    const calculatedAmount = calculateComponentAmount({
        tipe: type,
        nilai_dasar: baseValue,
        qty: qty
    }, emp);

    // D. Buat Object Komponen Baru (Gunakan key 'name' & 'amount')
    const newItem = {
        id: 'comp_' + Date.now(),
        name: name,              // Menggunakan 'name' (bukan 'nama')
        amount: calculatedAmount, // Menambahkan nominal hasil kalkulasi
        tipe: type,
        nilai_dasar: baseValue,
        qty: qty
    };

    if (!emp[category]) emp[category] = [];
    emp[category].push(newItem);

    // E. Simpan ke LocalStorage & Render Ulang
    if (typeof savePayrollComponentsToStorage === 'function') {
        savePayrollComponentsToStorage();
    }
    
    if (typeof renderPayrollTable === 'function') {
        renderPayrollTable();
    }

    closeCompModal();
    if (typeof showToast === 'function') {
        showToast(`Berhasil menambahkan ${name}!`);
    } else {
        alert(`Berhasil menambahkan ${name}!`);
    }
});


// ==========================================
// 1. UTILITY HELPERS & FORMATTER
// ==========================================
function formatRupiahInput(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    input.value = val ? parseInt(val, 10).toLocaleString('id-ID') : '';
}

function getRawNominal(elementId) {
    const input = document.getElementById(elementId);
    if (!input) return 0;
    return parseFloat(input.value.replace(/[^0-9]/g, '')) || 0;
}

function closeModalOnOverlay(event) {
    if (event.target.classList.contains('custom-modal-overlay')) {
        event.target.style.display = 'none';
    }
}

// ==========================================
// 2. TOGGLE TAMPILAN FORM DIBERLAKUKAN RUMUS
// ==========================================
function toggleFormInputsByRumus() {
    const tipe = document.getElementById('tipeRumusKomponen').value;
    const containerNominal = document.getElementById('containerNominal');
    const containerSatuan = document.getElementById('containerSatuan');
    const containerPersen = document.getElementById('containerPersen');
    const labelNominal = document.getElementById('labelNominal');

    if (tipe === 'FLAT') {
        containerNominal.style.display = 'block';
        containerSatuan.style.display = 'none';
        containerPersen.style.display = 'none';
        labelNominal.innerText = "Nominal Tetap";
    } else if (tipe === 'PER_UNIT') {
        containerNominal.style.display = 'block';
        containerSatuan.style.display = 'block';
        containerPersen.style.display = 'none';
        labelNominal.innerText = "Nominal per Satuan";
    } else if (tipe === 'PERCENTAGE') {
        containerNominal.style.display = 'none';
        containerSatuan.style.display = 'none';
        containerPersen.style.display = 'block';
    }
}

// ==========================================
// 3. OPEN & CLOSE MODAL CONTROLLER
// ==========================================
function openKomponenModal(empId, defaultCategory = 'tunjangan') {
    document.getElementById('komponenEmpId').value = empId;
    document.getElementById('kategoriKomponen').value = defaultCategory;
    document.getElementById('namaKomponen').value = '';
    document.getElementById('tipeRumusKomponen').value = 'FLAT';
    document.getElementById('nominalKomponen').value = '';
    document.getElementById('satuanKomponen').value = '1';
    document.getElementById('persenKomponen').value = '';

    // Reset Form Display State
    toggleFormInputsByRumus();

    const modal = document.getElementById('modalTambahKomponen');
    if (modal) modal.style.display = 'flex';
}

function closeKomponenModal() {
    const modal = document.getElementById('modalTambahKomponen');
    if (modal) modal.style.display = 'none';
}

// Fungsi untuk memperbarui isi elemen <datalist> di HTML
function renderMasterComponentDatalist() {
    const datalist = document.getElementById('masterComponentList');
    if (!datalist) return;

    datalist.innerHTML = masterComponentNames
        .map(name => `<option value="${name}"></option>`)
        .join('');
}


// ==========================================
// 2. MODIFIKASI FUNGSI SIMPAN KOMPONEN
// ==========================================
function simpanKomponen() {
    const empId = document.getElementById('komponenEmpId').value;
    const category = document.getElementById('kategoriKomponen').value; 
    const tipeRumus = document.getElementById('tipeRumusKomponen').value; 
    const nameInput = document.getElementById('namaKomponen').value.trim();

    if (!nameInput) {
        alert("Silakan isi nama komponen!");
        return;
    }

    const emp = employees.find(e => String(e.id) === String(empId) || String(e.user_id) === String(empId));
    if (!emp) {
        alert("Karyawan tidak ditemukan!");
        return;
    }

    const gajiPokok = parseFloat(emp.gaji_pokok || emp.basic_salary || emp.gajiPokok || 0);

    let totalAmount = 0;
    let labelDetail = nameInput;

    // --- PROSES PERHITUNGAN RUMUS ---
    if (tipeRumus === 'FLAT') {
        const nominal = getRawNominal('nominalKomponen');
        if (nominal <= 0) {
            alert("Nominal harus lebih dari 0!");
            return;
        }
        totalAmount = nominal;
        labelDetail = nameInput;

    } else if (tipeRumus === 'PER_UNIT') {
        const nominal = getRawNominal('nominalKomponen');
        const satuan = parseFloat(document.getElementById('satuanKomponen').value) || 1;
        if (nominal <= 0) {
            alert("Nominal per satuan harus lebih dari 0!");
            return;
        }
        totalAmount = nominal * satuan;
        labelDetail = `${nameInput} (${satuan}x @ Rp ${nominal.toLocaleString('id-ID')})`;

    } else if (tipeRumus === 'PERCENTAGE') {
        const persen = parseFloat(document.getElementById('persenKomponen').value) || 0;
        if (persen <= 0) {
            alert("Persentase harus lebih dari 0%!");
            return;
        }
        if (gajiPokok <= 0) {
            alert("Gaji pokok karyawan bernilai 0 / belum diisi.");
            return;
        }
        totalAmount = (persen / 100) * gajiPokok;
        labelDetail = `${nameInput} (${persen}% dari Gapok)`;
    }

    // --- UPDATE MASTER NAMA (SIMPAN UNTUK DIREUSE KARYAWAN LAIN) ---
    // --- UPDATE MASTER NAMA (SAFE VERSION) ---
    const currentMaster = getMasterComponentNames();
    
    if (!currentMaster.includes(nameInput)) {
        currentMaster.push(nameInput);
        currentMaster.sort(); // Urutkan abjad
        
        // Simpan ke State Global & LocalStorage
        window.masterComponentNames = currentMaster;
        localStorage.setItem('masterComponentNames', JSON.stringify(currentMaster));
        
        // Render Ulang Dropdown
        renderMasterComponentDatalist();
    }

    // --- SIMPAN KE OBJECT KARYAWAN ---
    const listKey = category + 'List';
    if (!emp[listKey]) emp[listKey] = [];

    emp[listKey].push({
        id: 'comp_' + Date.now(),
        name: labelDetail,
        amount: Math.round(totalAmount),
        tipe: tipeRumus,
        rawName: nameInput
    });

    if (typeof savePayrollComponentsToStorage === 'function') {
        savePayrollComponentsToStorage();
    }

    closeKomponenModal();

    if (typeof renderPayrollTable === 'function') {
        renderPayrollTable();
    }
}