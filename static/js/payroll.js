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
        console.log(result)

        updatePayrollAfterDelete(result);

    } catch (error) {
        console.error(error);
        alert("Gagal menghapus komponen: " + error.message);
    }
}

function updatePayrollAfterDelete(result) {

    // Cari elemen yang memiliki itemId
    const deleteButton = document.querySelector(
        `button[onclick="executeRemoveItem('${result.item_id}')"]`
    );

    if (!deleteButton) {
        console.warn(
            `Item ${result.item_id} tidak ditemukan di DOM`
        );
        return;
    }

    // Ambil container card item
    const deleteElement = deleteButton.closest(
        '[id*="-delete-"]'
    );

    if (!deleteElement) return;

    const normalId = deleteElement.id.replace(
        '-delete-',
        '-normal-'
    );

    const normalElement =
        document.getElementById(normalId);

    const row = normalElement
        ? normalElement.closest('tr')
        : null;
        
    // Hapus card item
    if (normalElement) {
        normalElement.remove();
    }

    // Hapus area konfirmasi delete
    deleteElement.remove();


    // ==========================================
    // Update total
    // ==========================================


    if (!row) return;


    const formatRupiah = (value) => {
        return new Intl.NumberFormat('id-ID').format(
            Number(value) || 0
        );
    };


    const totalPenambahanElement =
        row.querySelector('[data-total-penambahan]');

    const totalPotonganElement =
        row.querySelector('[data-total-potongan]');

    const thpElement =
        row.querySelector('[data-thp]');

    const pph21Element =
        row.querySelector('[data-pph21]');

    const thpAfterTaxElement =
        row.querySelector('[data-thp-after-tax]');

    if (totalPenambahanElement) {
        totalPenambahanElement.textContent =
            `Rp ${formatRupiah(result.total_penambahan)}`;
    }

    if (totalPotonganElement) {
        totalPotonganElement.textContent =
            `Rp ${formatRupiah(result.total_potongan)}`;
    }

    if (thpElement) {
        thpElement.textContent =
            `Rp ${formatRupiah(result.thp)}`;
    }

    if (pph21Element) {
        pph21Element.textContent =
            `- Rp ${formatRupiah(result.pph21)}`;
    }

    if (thpAfterTaxElement) {
        thpAfterTaxElement.textContent =
            `Rp ${formatRupiah(result.thp_after_tax)}`;
    }


    // Feedback
    if (typeof showToast === 'function') {
        showToast(
            'Komponen berhasil dihapus'
        );
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

function openDeleteConfirmModal() {
    document.getElementById('deleteConfirmName').innerText = 'Karyawan ini';
    document.getElementById('confirmDeleteModal').classList.add('active');
}

function closeDeletePayrollConfirmModal() {
    document.getElementById('confirmDeletePayrollModal').classList.remove('active');
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

async function downloadPayrollByMonth(periode) {

    try {

        // ==================================================
        // AMBIL FILE EXCEL DARI FLASK
        // ==================================================

        const response = await fetch(
            `/api/payroll/slip/all?periode=${encodeURIComponent(periode)}`
        );

        if (!response.ok) {

            let message =
                "Gagal mengambil data payroll.";

            try {

                const errorData =
                    await response.json();

                if (errorData.error) {
                    message = errorData.error;
                }

            } catch (e) {}

            throw new Error(message);
        }

        // ==================================================
        // PARSE RESPONSE
        // ==================================================

        const result =
            await response.json();

        if (!result.success) {

            throw new Error(
                result.error ||
                "Gagal membuat file payroll."
            );
        }

        // ==================================================
        // NAMA FILE
        // ==================================================

        const filename =
            result.filename ||
            `Payroll_${periode}.xlsx`;

        // ==================================================
        // SIMPAN MELALUI PYWEBVIEW
        // ==================================================

        const saveResult =
            await window.pywebview.api.save_file(
                result.data,
                filename,
                "xlsx"
            );

        // ==================================================
        // HASIL
        // ==================================================

        if (saveResult?.success) {

            console.log(
                "Payroll berhasil disimpan:",
                saveResult.path
            );

        } else if (!saveResult?.cancelled) {

            alert(
                "Gagal menyimpan Payroll.\n\n" +
                (saveResult?.message || "")
            );
        }

    } catch (error) {

        console.error(
            "Gagal download payroll:",
            error
        );

        alert(
            "Gagal mengunduh Payroll.\n\n" +
            error.message
        );
    }
}

async function openSlipModal(employeeId) {

    // ==========================================================
    // AMBIL DATA EMPLOYEE
    // ==========================================================
    const periode = document.getElementById("selectPeriode").value;

    const response = await fetch(
        `/api/payroll/slip/${employeeId}?periode=${periode}`
    );

    const employeesData = (await response.json()).employees_json;


    if (!response.ok) {
        showToastFailed(
            employeesData.error || "Gagal mengambil data slip gaji"
        );
        return;
    }

    console.log("TESS: ",employeesData)
    
    const employeesDataOri = JSON.parse(
        document.getElementById("employees-data").textContent
    );

    console.log("TESS: ",employeesDataOri)

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

    document.getElementById('slipGajiBtnPNG').onclick = () => downloadSlipPNG(employee.name,monthNames[monthIndex]);
    document.getElementById('slipGajiBtnPDF').onclick = () => downloadSlipPDF(employee.name,monthNames[monthIndex]);

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

    const usedItems = new Set();

    daftarKomponen.tunjangan.forEach(
        (namaKomponen, index) => {

            const letter =
                String.fromCharCode(66 + index);

            // Cari SATU item yang belum digunakan
            const itemIndex = (employee.tunjanganList || []).findIndex(
                item =>
                    item.name === namaKomponen &&
                    !usedItems.has(item)
            );

            const item = itemIndex !== -1
                ? employee.tunjanganList[itemIndex]
                : null;

            if (item) {
                usedItems.add(item);
            }

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


    // ==========================================
    // Tambahkan item yang tidak masuk daftar utama
    // atau item duplikat
    // ==========================================

    const remainingItems = (employee.tunjanganList || [])
        .filter(item => !usedItems.has(item));

    remainingItems.forEach((item, index) => {

        const letter =
            String.fromCharCode(
                66 + daftarKomponen.tunjangan.length + index
            );

        const amount =
            Number(item.amount || 0);

        tunjanganContainer.innerHTML += `
            <div class="slip-dynamic-item">

                <span>
                    ${letter}. ${escapeHtml(item.name)}
                </span>

                <b>:</b>

                <span>Rp</span>

                <strong>
                    ${formatRupiah(amount)}
                </strong>

            </div>
        `;
    });


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

    // const usedItems = new Set();

    daftarKomponen.potongan.forEach(
        (namaKomponen, index) => {

            const letter =
                String.fromCharCode(66 + index);

            // Cari SATU item yang belum digunakan
            const itemIndex =
                (employee.potonganList || []).findIndex(
                    item =>
                        item.name === namaKomponen &&
                        !usedItems.has(item)
                );

            const item = itemIndex !== -1
                ? employee.potonganList[itemIndex]
                : null;

            if (item) {
                usedItems.add(item);
            }

            const amount = item
                ? Number(item.amount || 0)
                : 0;
            
            if (namaKomponen == "Potongan Absen" && amount == 0) {
                document.getElementById(
                    "slip-absen"
                ).textContent =
                    `0 Hari`;
            }

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
    // Tambahkan potongan di luar daftarKomponen
    // ke bagian paling bawah
    // ==========================================================

    (employee.potonganList || []).forEach(item => {

        // Lewati item yang sudah ditampilkan
        if (usedItems.has(item)) {
            return;
        }

        const index =
            usedItems.size;

        const letter =
            String.fromCharCode(66 + index);

        potonganContainer.innerHTML += `
            <div class="slip-dynamic-item">

                <span>
                    ${letter}. ${escapeHtml(item.name)}
                </span>

                <b>:</b>

                <span>Rp</span>

                <strong>
                    ${formatRupiah(item.amount)}
                </strong>

            </div>
        `;

        usedItems.add(item);
    });


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

// Create slip gaji
function createSlipExportClone() {
    const slip = document.getElementById("slipPreview");
    if (!slip) {
        console.error("Element #slipPreview tidak ditemukan.");
        return null;
    }
    const clone = slip.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.left = "-99999px";
    clone.style.top = "0";
    clone.style.maxHeight = "none";
    clone.style.height = "auto";
    clone.style.overflow = "visible";
    clone.style.overflowY = "visible";
    clone.style.overflowX = "visible";
    clone.style.width = `${slip.offsetWidth}px`;
    document.body.appendChild(clone);
    return clone;
}

// Membuat slip gaji PNG
async function downloadSlipPNG(name, month) {
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
        // ==================================================
        // PNG → Base64
        // ==================================================
        const dataURL = canvas.toDataURL(
            "image/png"
        );
        const filename =
            `Slip Gaji ${month} - ${name}.png`;

        // ==================================================
        // KIRIM KE PYTHON
        // ==================================================

        const result =
            await window.pywebview.api.save_file(
                dataURL,
                filename,
                "png"
            );

        // ==================================================
        // HASIL
        // ==================================================

        if (result?.success) {
            console.log(
                "PNG berhasil disimpan:",
                result.path
            );
        } else if (!result?.cancelled) {
            alert(
                "Gagal menyimpan PNG.\n\n" +
                (result?.message || "")
            );
        }

    } catch (error) {
        console.error(
            "Gagal membuat PNG:",
            error
        );
        alert(
            "Gagal membuat slip PNG.\n\n" +
            error.message
        );
    } finally {
        clone.remove();
    }
}

// Membuat slip gaji PDF
async function downloadSlipPDF(name, month) {
    const clone = createSlipExportClone();
    if (!clone) {
        return;
    }
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        // ==================================================
        // HTML → CANVAS
        // ==================================================
        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            width: clone.scrollWidth,
            height: clone.scrollHeight,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight

        });
        // ==================================================
        // CANVAS → PNG
        // ==================================================
        const imgData =
            canvas.toDataURL("image/png");
        // ==================================================
        // JS PDF
        // ==================================================
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error(
                "jsPDF tidak tersedia."
            );
        }
        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        // ==================================================
        // UKURAN A4
        // ==================================================

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const availableWidth =
            pageWidth - margin * 2;
        const availableHeight =
            pageHeight - margin * 2;

        // ==================================================
        // RASIO GAMBAR
        // ==================================================

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(
            availableWidth / imgWidth,
            availableHeight / imgHeight
        );
        const finalWidth =
            imgWidth * ratio;
        const finalHeight =
            imgHeight * ratio;
        // ==================================================
        // POSISI
        // ==================================================
        const x =
            (pageWidth - finalWidth) / 2;
        const y =
            (pageHeight - finalHeight) / 2;
        // ==================================================
        // MASUKKAN GAMBAR
        // ==================================================
        pdf.addImage(
            imgData,
            "PNG",
            x,
            y,
            finalWidth,
            finalHeight
        );

        // ==================================================
        // PDF → BASE64
        // ==================================================

        const pdfData =
            pdf.output("datauristring");

        // ==================================================
        // NAMA FILE
        // ==================================================

        const filename =
            `Slip Gaji ${month} - ${name}.pdf`;

        // ==================================================
        // KIRIM KE PYTHON
        // ==================================================

        const result =
            await window.pywebview.api.save_file(
                pdfData,
                filename,
                "pdf"
            );

        // ==================================================
        // HASIL
        // ==================================================

        if (result?.success) {
            console.log(
                "PDF berhasil disimpan:",
                result.path
            );
        } else if (!result?.cancelled) {
            alert(
                "Gagal menyimpan PDF.\n\n" +
                (result?.message || "")
            );
        }

    } catch (error) {
        console.error(
            "Gagal membuat PDF:",
            error
        );
        alert(
            "Gagal membuat slip PDF.\n\n" +
            error.message
        );
    } finally {
        clone.remove();
    }
}

// Membuat Payroll untuk Seluruh Karyawan
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
    location.reload();
    const result = await response.json();
    showToast("Payroll untuk semua karyawan berhasil dibuat")
}

// Membuka modal konfirmasi Hapus Payroll Bulan terpilih
async function openConfirmDeletePayrollModal() {
    document.getElementById('confirmDeletePayrollModal').classList.add('active');
}

// Menghapus Payroll Bulan terpilih
async function confirmDeletePayroll() {
    const periode = document.getElementById("selectPeriode").value;
    if (!periode) { return; }
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
        location.reload();
    } catch (error) {
        console.error(error);
        showToastFailed(error.message);
    }
}

function openWhatsApp(phoneNumber) {
    if (!phoneNumber) {
        alert("Nomor WhatsApp tidak tersedia.");
        return;
    }

    // Bersihkan nomor
    let number = String(phoneNumber)
        .replace(/\D/g, "");

    // Jika nomor Indonesia diawali 0 → ubah menjadi 62
    if (number.startsWith("0")) {
        number = "62" + number.substring(1);
    }

    // Buka WhatsApp Desktop
    window.location.href = `whatsapp://send?phone=${number}`;
}