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
    "Potongan Terlambat",
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
            "Potongan Terlambat",
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
            // await loadAttendanceData(selectElem ? selectElem.value : "2026-08");
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

function setDeleteConfirm(empId, type, index) {
    console.log("TEST")
    const normal = document.getElementById(
        `${type}-normal-${empId}-${index}`
    );
    const deleteConfirm = document.getElementById(
        `${type}-delete-${empId}-${index}`
    );
    if (!normal || !deleteConfirm) return;
    document.querySelectorAll('[id*="-normal-"]').forEach(el => {
        el.style.display = 'block';
    });
    document.querySelectorAll('[id*="-delete-"]').forEach(el => {
        el.style.display = 'none';
    });
    normal.style.display = 'none';
    deleteConfirm.style.display = 'flex';
}

function cancelDeleteConfirm(empId, type, index) {
    const normal = document.getElementById(
        `${type}-normal-${empId}-${index}`
    );
    const deleteConfirm = document.getElementById(
        `${type}-delete-${empId}-${index}`
    );
    if (!normal || !deleteConfirm) return;
    document.querySelectorAll('[id*="-normal-"]').forEach(el => {
        el.style.display = 'block';
    });
    deleteConfirm.style.display = 'none';
}

async function executeRemoveItem(itemId) {
    try {
        const response = await fetch('/api/payroll/delete-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item_id: itemId
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Gagal menghapus item');
        }

        window.location.href = '/payroll';

    } catch (error) {
        console.error(error);
        alert("Gagal menghapus komponen: " + error.message);
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

function openEmpModal(id = null) {
    document.getElementById('empForm').reset();
    editingEmployeeId = id || null;

    if (editingEmployeeId) {
        const emp = employees.find(e => String(e.id) === String(editingEmployeeId));
        if (!emp) return;

        document.getElementById('empModalTitle').innerText = 'Edit Data Karyawan';
        document.getElementById('emp-id').value = emp.user_id || emp.id;
        document.getElementById('emp-nama').value = emp.name;
        document.getElementById('emp-jabatan').value = emp.position || emp.jabatan || '';
        document.getElementById('emp-gapok').value = emp.basic_salary || emp.gapok || 0;
        document.getElementById('emp-wa').value = emp.phone || emp.wa || '';
        document.getElementById('emp-email').value = emp.email || '';
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

function openDeleteConfirmModal(id, name) {
    document.getElementById('deleteConfirmName').innerText =
        name || 'Karyawan ini';

    document.getElementById('confirmDeleteModal').classList.add('active');
}

function closeDeleteConfirmModal() {
    employeeToDeleteId = null;
    document.getElementById('confirmDeleteModal').classList.remove('active');
}

function deleteEmployee(id) {
    openDeleteConfirmModal(id);
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

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openSlipModal(employeeId) {

    // ==========================================================
    // AMBIL DATA EMPLOYEE
    // ==========================================================

    const employeesData = JSON.parse(
        document.getElementById("employees-data").textContent
    );

    const config = JSON.parse(
        document.getElementById("payroll-config").textContent
    );

    const employee = employeesData.find(
        emp => String(emp.id) === String(employeeId)
    );

    console.log(employee)

    if (!employee) {
        console.error("Employee tidak ditemukan:", employeeId);
        return;
    }


    // ==========================================================
    // PERIODE
    // ==========================================================

    const year = Number(config.year);
    const month = Number(config.month);


    // ==========================================================
    // FORMAT RUPIAH
    // ==========================================================

    const formatRupiah = (value) => {

        return new Intl.NumberFormat("id-ID", {
            maximumFractionDigits: 0
        }).format(Number(value || 0));

    };


    // ==========================================================
    // NAMA BULAN
    // ==========================================================

    const monthNames = [
        "JANUARI",
        "FEBRUARI",
        "MARET",
        "APRIL",
        "MEI",
        "JUNI",
        "JULI",
        "AGUSTUS",
        "SEPTEMBER",
        "OKTOBER",
        "NOVEMBER",
        "DESEMBER"
    ];


    // ==========================================================
    // PERIODE TEXT
    // ==========================================================

    const monthIndex = month - 1;

    const totalDays = new Date(
        year,
        month,
        0
    ).getDate();

    const periodeText =
        `1 s/d ${String(totalDays).padStart(2, "0")} ` +
        `${monthNames[monthIndex]} ${year}`;


    // ==========================================================
    // IDENTITAS KARYAWAN
    // ==========================================================

    document.getElementById(
        "slip-no"
    ).textContent = employee.id || "-";

    document.getElementById(
        "slip-name"
    ).textContent = employee.name || "-";

    document.getElementById(
        "slip-position"
    ).textContent = employee.position || "-";

    document.getElementById(
        "slip-periode"
    ).textContent = periodeText;

    document.getElementById(
        "slip-tgl-masuk"
    ).textContent = "-";

    document.getElementById(
        "slip-basic-salary-top"
    ).textContent = formatRupiah(
        employee.basic_salary
    );
    
    document.getElementById(
        "slip-jumlah-kasbon"
    ).textContent = formatRupiah(
        employee.kasbon
    );
    
    document.getElementById(
        "slip-jumlah-cicilan"
    ).textContent = formatRupiah(
        employee.cicilan
    );


    // ==========================================================
    // GAJI POKOK
    // ==========================================================

    document.getElementById(
        "slip-basic-salary"
    ).textContent = formatRupiah(
        employee.basic_salary
    );


    // ==========================================================
    // TUNJANGAN
    // ==========================================================

    const tunjanganContainer =
        document.getElementById(
            "slip-tunjangan-container"
        );

    tunjanganContainer.innerHTML = "";

    daftarKomponen.tunjangan.forEach(
        (namaKomponen, index) => {

            const letter =
                String.fromCharCode(66 + index);

            // Cari komponen yang sudah memiliki data nominal
            const item = (employee.tunjanganList || []).find(
                item => item.name === namaKomponen
            );

            // Jika tidak ada, nominal dianggap 0
            const amount = item
                ? Number(item.amount || 0)
                : 0;

            tunjanganContainer.innerHTML += `
                <div class="slip-dynamic-item">

                    <span>
                        ${letter}. ${escapeHtml(namaKomponen)}
                    </span>

                    <b>:</b>

                    <span>Rp</span>

                    <strong>
                        ${formatRupiah(amount)}
                    </strong>

                </div>
            `;
        }
    );


    // ==========================================================
    // BONUS
    // ==========================================================

    const bonusContainer =
        document.getElementById(
            "slip-bonus-container"
        );

    bonusContainer.innerHTML = "";

    (employee.bonusList || []).forEach(
        (item) => {

            bonusContainer.innerHTML += `
                <div class="slip-dynamic-item">

                    <span>
                        BONUS. ${escapeHtml(item.name)}
                    </span>

                    <b>:</b>

                    <span>Rp</span>

                    <strong>
                        ${formatRupiah(item.amount)}
                    </strong>

                </div>
            `;
        }
    );


    // ==========================================================
    // TOTAL GAJI KOTOR
    // ==========================================================

    const totalTunjangan =
        (employee.tunjanganList || []).reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );

    const totalBonus =
        (employee.bonusList || []).reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );

    const totalEarning =
        Number(employee.basic_salary || 0) +
        totalTunjangan +
        totalBonus;

    document.getElementById(
        "slip-total-earning"
    ).textContent = formatRupiah(
        totalEarning
    );


    // ==========================================================
    // ABSENSI
    // ==========================================================

    const att = employee.att || {};

    document.getElementById(
        "slip-hadir"
    ).textContent =
        `${att.H || 0} Hari`;

    document.getElementById(
        "slip-terlambat"
    ).textContent =
        `${att.T || 0} Hari`;

    document.getElementById(
        "slip-sakit"
    ).textContent =
        `${att.S || 0} Hari`;

    document.getElementById(
        "slip-absen"
    ).textContent =
        `${att.A || 0} Hari`;

    document.getElementById(
        "slip-lembur"
    ).textContent =
        `${att.L || 0} Hari`;

    document.getElementById(
        "slip-work-days"
    ).textContent =
        `${att.H || 0} Hari`;


    // ==========================================================
    // PPH 21
    // ==========================================================

    document.getElementById(
        "slip-pph21"
    ).textContent =
        formatRupiah(employee.pph21);


    // ==========================================================
    // POTONGAN LAIN
    // ==========================================================

    const potonganContainer =
        document.getElementById(
            "slip-potongan-container"
        );

    potonganContainer.innerHTML = "";

        daftarKomponen.potongan.forEach(
            (namaKomponen, index) => {

                const letter =
                    String.fromCharCode(66 + index);

                // Cari data komponen yang sudah tersimpan
                const item = (employee.potonganList || []).find(
                    item => item.name === namaKomponen
                );

                // Jika belum ada, nominal dianggap 0
                const amount = item
                    ? Number(item.amount || 0)
                    : 0;

                potonganContainer.innerHTML += `
                    <div class="slip-dynamic-item">

                        <span>
                            ${letter}. ${escapeHtml(namaKomponen)}
                        </span>

                        <b>:</b>

                        <span>Rp</span>

                        <strong>
                            ${formatRupiah(amount)}
                        </strong>

                    </div>
                `;
            }
        );


    // ==========================================================
    // TOTAL POTONGAN
    // ==========================================================

    const totalPotongan =
        Number(employee.pph21 || 0) +

        (employee.potonganList || []).reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );
    
    const potongan_kasbon =
    (employee.potonganList || []).find(
        item => item.name === "Potongan Kasbon"
    )?.amount || 0;

    document.getElementById(
        "slip-total-deduction"
    ).textContent =
        formatRupiah(totalPotongan);


    // ==========================================================
    // GAJI BERSIH
    // ==========================================================

    document.getElementById(
        "slip-net-salary"
    ).textContent =
        formatRupiah(
            employee.thp_after_tax
        );

    document.getElementById(
        "slip-sisa-kasbon"
    ).textContent =
        formatRupiah(
            employee.kasbon - employee.cicilan - potongan_kasbon
        );


    // ==========================================================
    // TANGGAL DITERIMA
    // ==========================================================

    const today = new Date();

    document.getElementById(
        "slip-received-date"
    ).textContent =
        `${String(today.getDate()).padStart(2, "0")} ` +
        `${monthNames[today.getMonth()]} ` +
        `${today.getFullYear()}`;


    // ==========================================================
    // BUKA MODAL
    // ==========================================================

    document.getElementById(
        "slipModal"
    ).classList.add("show");

    document.body.style.overflow = "hidden";
}

function closeSlipModal() {
    const modal = document.getElementById("slipModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");

    document.body.style.overflow = "";
}

function printSlip() {
    const slip = document.getElementById("slipPreview");

    if (!slip) {
        console.error("Element #slipPreview tidak ditemukan.");
        return;
    }

    // Hapus kontainer lama jika ada
    const oldPrint = document.getElementById("print-slip-container");
    if (oldPrint) {
        oldPrint.remove();
    }

    // Buat kontainer baru
    const printContainer = document.createElement("div");
    printContainer.id = "print-slip-container";

    // Clone elemen slip
    const clonedSlip = slip.cloneNode(true);
    
    // Hapus class scroll/max-height pada clone agar kertas cetak tidak terpotong
    clonedSlip.classList.remove("max-h-[80vh]", "overflow-y-auto");

    printContainer.appendChild(clonedSlip);
    document.body.appendChild(printContainer);

    // Jalankan perintah print
    window.print();

    // Hapus elemen temporary setelah dialihkan ke dialog print
    setTimeout(() => {
        printContainer.remove();
    }, 500);
}

function createSlipExportClone() {
    const slip = document.getElementById("slipPreview");

    if (!slip) {
        console.error("Element #slipPreview tidak ditemukan.");
        return null;
    }

    const clone = slip.cloneNode(true);

    // Posisi di luar layar agar tidak mengganggu UI
    clone.style.position = "absolute";
    clone.style.left = "-99999px";
    clone.style.top = "0";

    // Hilangkan batas scroll
    clone.style.maxHeight = "none";
    clone.style.height = "auto";
    clone.style.overflow = "visible";
    clone.style.overflowY = "visible";
    clone.style.overflowX = "visible";

    // Pastikan lebar mengikuti slip asli
    clone.style.width = `${slip.offsetWidth}px`;

    // Tambahkan ke body agar html2canvas bisa merendernya
    document.body.appendChild(clone);

    return clone;
}
async function downloadSlipPNG() {
    const clone = createSlipExportClone();

    if (!clone) {
        return;
    }

    try {

        // Tunggu layout selesai
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",

            // Paksa mengambil seluruh tinggi clone
            width: clone.scrollWidth,
            height: clone.scrollHeight,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight
        });

        const link = document.createElement("a");

        link.download = "slip-gaji.png";
        link.href = canvas.toDataURL("image/png");

        link.click();

    } catch (error) {

        console.error("Gagal membuat PNG:", error);

    } finally {

        // Hapus clone
        clone.remove();
    }
}

async function downloadSlipPDF() {
    const clone = createSlipExportClone();

    if (!clone) {
        return;
    }

    try {

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",

            width: clone.scrollWidth,
            height: clone.scrollHeight,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight
        });

        const imgData = canvas.toDataURL("image/png");

        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        const pageWidth = 210;
        const pageHeight = 297;

        const margin = 10;

        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - margin * 2;

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        const ratio = Math.min(
            availableWidth / imgWidth,
            availableHeight / imgHeight
        );

        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;

        const x = (pageWidth - finalWidth) / 2;
        const y = margin;

        pdf.addImage(
            imgData,
            "PNG",
            x,
            y,
            finalWidth,
            finalHeight
        );

        pdf.save("slip-gaji.pdf");

    } catch (error) {

        console.error("Gagal membuat PDF:", error);

    } finally {

        clone.remove();
    }
}

async function createAllPayrollByMonth() {
    const periode = document.getElementById("selectPeriode").value;

    const response = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            periode: periode
        })
    });

    // Refresh halaman / data payroll
    location.reload();

    const result = await response.json();

    console.log(result);
}

async function deleteAllPayrollByMonth() {
    const periode = document.getElementById("selectPeriode").value;

    if (!periode) {
        return;
    }

    const yakin = confirm(
        `Apakah Anda yakin ingin menghapus seluruh payroll periode ${periode}?`
    );

    if (!yakin) {
        return;
    }

    try {

        const response = await fetch(
            "/api/payroll/delete",
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    periode: periode
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            showToastFailed(
                result.message || "Gagal menghapus payroll"
            );
        }

        showToast(result.message);

        // Refresh halaman / data payroll
        location.reload();

    } catch (error) {

        console.error(error);

        showToastFailed(error.message);

    }
}