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

function updateTempData(inputElem) {
    const userId = inputElem.dataset.userId;
    const date = inputElem.dataset.date;
    const type = inputElem.dataset.type;
    const value = inputElem.value;

    console.log({
        user_id: userId,
        date: date,
        type: type,
        value: value
    });
}

async function renderTable() {
    const selectElem = document.getElementById("selectPeriode");
    const periode = selectElem ? selectElem.value : "2026-08";

    const [year, month] = periode.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    try {
        const response = await fetch(
            `/api/attendance/time?periode=${periode}`
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

                const status = emp.daily_status?.[dayStr]['status'] || "";
                const checkin = emp.daily_status?.[dayStr]['checkin'].substring(0, 5) || "";
                const checkout = emp.daily_status?.[dayStr]['checkout'].substring(0, 5) || "";

                if (isEditMode) {

                    bodyHTML += `
                        <td class="text-center align-middle p-1">
                            <div class="attendance-time-edit">

                                <input
                                    type="time"
                                    step="60"
                                    class="input-time-edit no-clock status-badge status-${status}"
                                    data-user-id="${emp.user_id}"
                                    data-date="${periode}-${dayStr}"
                                    data-type="checkin"
                                    value="${checkin || ""}"
                                    onchange="updateTempData(this)"
                                >

                                <input
                                    type="time"
                                    step="60"
                                    class="input-time-edit no-clock status-badge status-${status}"
                                    data-user-id="${emp.user_id}"
                                    data-date="${periode}-${dayStr}"
                                    data-type="checkout"
                                    value="${checkout || ""}"
                                    onchange="updateTempData(this)"
                                >

                            </div>
                        </td>
                    `;

                } else {
                    
                    let displayLabel =
                        status === "" ? "-" : status;
                    
                    if (checkin == "" && checkout == ""){
                        displayLabel = status;
                    } else {
                        checkinStr = checkin?.substring(0, 5) || "-"
                        checkoutStr = checkout?.substring(0, 5) || "-";
                        displayLabel = checkinStr + "<br>" + checkoutStr
                    }

                    bodyHTML += `
                        <td class="text-center align-middle p-1">
                            <span
                                class="time-badge status-${status}">
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

    // =========================================================
    // AMBIL SEMUA INPUT CHECKIN & CHECKOUT
    // =========================================================

    const timeInputs = document.querySelectorAll(
        '#attendanceTable .input-time-edit'
    );

    const attendanceMap = {};

    timeInputs.forEach(input => {

        const user_id = input.dataset.userId;
        const date = input.dataset.date;
        const type = input.dataset.type;
        const value = input.value;

        if (!user_id || !date) {
            return;
        }

        const key = `${user_id}_${date}`;

        // Buat object jika belum ada
        if (!attendanceMap[key]) {
            attendanceMap[key] = {
                user_id,
                date,
                checkin: "",
                checkout: ""
            };
        }

        // Masukkan waktu sesuai type
        if (type === "checkin") {
            attendanceMap[key].checkin = value;
        }

        if (type === "checkout") {
            attendanceMap[key].checkout = value;
        }
    });

    // Ubah object menjadi array
    const payload = Object.values(attendanceMap);

    console.log("Data yang dikirim:", payload);

    try {

        const response = await fetch('/api/attendance/save/time', {
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

            if (btnMain) {
                btnMain.disabled = false;
                btnMain.className = "btn btn-primary";

                btnMain.innerHTML = `
                    <i class="fa-solid fa-pen-to-square"></i>
                    Edit Presensi
                `;
            }

            window.location.href = '/attendance/time';

            return;
        }

        // Jika response bukan 2xx
        showToastFailed(
            result.message || "Gagal menyimpan absensi."
        );

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

// ==========================================================
// DOWNLOAD WAKTU KEHADIRAN PDF
// ==========================================================

async function downloadAttendancePDF(periode) {

    const original =
        document.getElementById("tab-detail-kehadiran");

    if (!original) {

        alert(
            "Section waktu kehadiran tidak ditemukan."
        );

        return;
    }

    let clone = null;

    try {

        // ==================================================
        // CLONE SECTION
        // ==================================================

        clone = original.cloneNode(true);

        // ==================================================
        // HILANGKAN TOMBOL AKSI
        // ==================================================

        const actionButtons =
            clone.querySelector(".action-buttons");

        if (actionButtons) {
            actionButtons.remove();
        }

        // ==================================================
        // HILANGKAN TAB MENU
        // ==================================================

        const tabMenu =
            clone.querySelector(".tab-menu");

        if (tabMenu) {
            tabMenu.remove();
        }

        // ==================================================
        // SIAPKAN CLONE
        // ==================================================

        clone.style.position = "absolute";
        clone.style.left = "-99999px";
        clone.style.top = "0";

        clone.style.width = "max-content";
        clone.style.maxWidth = "none";

        clone.style.height = "auto";
        clone.style.maxHeight = "none";

        clone.style.overflow = "visible";

        clone.style.backgroundColor =
            "#ffffff";

        document.body.appendChild(clone);

        // ==================================================
        // PERBAIKI TABLE RESPONSIVE
        // ==================================================

        const tableResponsive =
            clone.querySelector(".table-responsive");

        if (tableResponsive) {

            tableResponsive.style.overflow =
                "visible";

            tableResponsive.style.overflowX =
                "visible";

            tableResponsive.style.overflowY =
                "visible";

            tableResponsive.style.width =
                "max-content";

            tableResponsive.style.maxWidth =
                "none";

            tableResponsive.style.height =
                "auto";

            tableResponsive.style.maxHeight =
                "none";
        }

        // ==================================================
        // PERBAIKI TABLE
        // ==================================================

        const table =
            clone.querySelector("#attendanceTable");

        if (!table) {

            throw new Error(
                "Tabel attendanceTable tidak ditemukan."
            );
        }

        table.style.width =
            "max-content";

        table.style.minWidth =
            "max-content";

        table.style.maxWidth =
            "none";

        // ==================================================
        // TUNGGU RENDER
        // ==================================================

        await new Promise(
            resolve => setTimeout(resolve, 150)
        );

        // ==================================================
        // AMBIL UKURAN TABEL SEBENARNYA
        // ==================================================

        const tableWidth =
            table.scrollWidth;

        const tableHeight =
            table.scrollHeight;

        // ==================================================
        // PAKSA CONTAINER MENGIKUTI TABEL
        // ==================================================

        if (tableResponsive) {

            tableResponsive.style.width =
                `${tableWidth}px`;
        }

        clone.style.width =
            `${tableWidth}px`;

        // ==================================================
        // HTML → CANVAS
        // ==================================================

        const canvas =
            await html2canvas(clone, {

                scale: 2,

                useCORS: true,

                backgroundColor: "#ffffff",

                width: tableWidth,

                height: clone.scrollHeight,

                windowWidth: tableWidth,

                windowHeight: clone.scrollHeight,

                scrollX: 0,

                scrollY: 0
            });

        // ==================================================
        // CANVAS → PNG
        // ==================================================

        const imgData =
            canvas.toDataURL("image/png");

        // ==================================================
        // JS PDF
        // ==================================================

        const { jsPDF } =
            window.jspdf;

        if (!jsPDF) {

            throw new Error(
                "jsPDF tidak tersedia."
            );
        }

        // ==================================================
        // PDF LANDSCAPE
        // ==================================================

        const pdf =
            new jsPDF({

                orientation: "landscape",

                unit: "mm",

                format: "a4"
            });

        // ==================================================
        // UKURAN A4 LANDSCAPE
        // ==================================================

        const pageWidth = 297;
        const pageHeight = 210;

        const margin = 10;

        const availableWidth =
            pageWidth - margin * 2;

        const availableHeight =
            pageHeight - margin * 2;

        // ==================================================
        // RASIO GAMBAR
        // ==================================================

        const imgWidth =
            canvas.width;

        const imgHeight =
            canvas.height;

        const ratio =
            Math.min(
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
            `Waktu Kehadiran ${periode}.pdf`;

        // ==================================================
        // SIMPAN VIA PYWEBVIEW
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
                "PDF waktu kehadiran berhasil disimpan:",
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
            "Gagal membuat PDF kehadiran:",
            error
        );

        alert(
            "Gagal membuat PDF kehadiran.\n\n" +
            error.message
        );

    } finally {

        if (clone) {
            clone.remove();
        }
    }
}
