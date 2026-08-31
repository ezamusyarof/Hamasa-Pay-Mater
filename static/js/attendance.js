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

function updateTempData(selectElem) {
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
                                <option value="-"
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


document
    .getElementById("attendanceExcelInput")
    ?.addEventListener("change", async function () {

        const file = this.files[0];

        if (!file) {
            return;
        }

        await importAttendanceExcel(file);

        // Reset input agar file yang sama bisa dipilih lagi
        this.value = "";
    });


async function importAttendanceExcel(file) {

    const btn =
        document.getElementById("btnImportAttendance");

    const periodeInput =
        document.getElementById("selectPeriode");

    const periode =
        periodeInput ? periodeInput.value : "";

    if (!periode) {

        showToastFailed(
            "Silakan pilih periode terlebih dahulu."
        );

        return;
    }

    if (!file) {
        return;
    }

    // ==================================================
    // VALIDASI FILE
    // ==================================================

    const extension =
        file.name.split(".").pop().toLowerCase();

    if (!["xlsx", "xls"].includes(extension)) {

        showToastFailed(
            "File harus berupa Excel (.xlsx atau .xls)."
        );

        return;
    }

    const originalContent =
        btn ? btn.innerHTML : "";

    try {

        // ==================================================
        // LOADING
        // ==================================================

        if (btn) {

            btn.disabled = true;

            btn.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Mengimport...
            `;
        }

        // ==================================================
        // FORMDATA
        // ==================================================

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );

        formData.append(
            "periode",
            periode
        );

        // ==================================================
        // KIRIM KE FLASK
        // ==================================================

        const response =
            await fetch(
                "/api/fingerprint/import-excel",
                {
                    method: "POST",
                    body: formData
                }
            );

        const result =
            await response.json();

        // ==================================================
        // HASIL
        // ==================================================

        if (response.ok && result.status === "success") {

            showToast(
                result.message ||
                `Data kehadiran ${periode} berhasil diimport.`
            );

            console.log(
                "Hasil import:",
                result
            );

            // Refresh tabel
            setTimeout(() => {

                window.location.reload();

            }, 1000);

        } else {

            showToastFailed(
                result.message ||
                "Gagal mengimport data kehadiran."
            );
        }

    } catch (error) {

        console.error(
            "Error import attendance:",
            error
        );

        showToastFailed(
            "Terjadi kesalahan saat mengimport file Excel."
        );

    } finally {

        if (btn) {

            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}