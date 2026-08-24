document.querySelectorAll('.harga').forEach(el => {
    el.textContent = 'Rp ' + Number(el.textContent).toLocaleString('id-ID');
});

async function updateAttendance() {
    const btn = document.getElementById('btnUpdateAttendance');
    const periodeInput = document.getElementById('selectPeriode');

    const originalContent = btn ? btn.innerHTML : '';
    const periode = periodeInput ? periodeInput.value : '';

    if (!periode) {
        showToastFailed("Silakan pilih periode terlebih dahulu.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Menghubungkan Mesin...
        `;
    }

    try {
        const response = await fetch(
            `/api/fingerprint/sync?periode=${encodeURIComponent(periode)}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const result = await response.json();

        if (response.ok) {

            // Jika fingerprint berhasil
            if (result.sync_success) {
                showToast(
                    result.message ||
                    `Data kehadiran ${periode} berhasil diperbarui.`
                );
            }

            // Jika fingerprint gagal tetapi rekap berhasil
            else {
                showToast(
                    result.message ||
                    `Rekap ${periode} berhasil diperbarui, tetapi mesin fingerprint tidak dapat dihubungi.`
                );
            }

            // Refresh tabel attendance
            showToast(
                result.message ||
                `Data kehadiran ${periode} berhasil diperbarui.`
            );

            setTimeout(() => {
                window.location.reload();
            }, 1000);
            if (
                typeof loadAttendanceData === 'function' &&
                periodeInput
            ) {
                await loadAttendanceData(periodeInput.value);
            }

        } else {
            showToastFailed(
                result.message ||
                "Gagal memperbarui data kehadiran."
            );
        }

    } catch (error) {
        console.error("Error update attendance:", error);

        showToastFailed(
            "Terjadi kesalahan saat memperbarui data kehadiran."
        );

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
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

function loadPageData(page,selectedPeriode) {
    if (!selectedPeriode) return;
    
    window.location.href = `/${page}?periode=${selectedPeriode}`;
}

function openMonthPicker() {
    const input = document.getElementById('selectPeriode');

    if (input.showPicker) {
        input.showPicker();
    } else {
        input.focus();
        input.click();
    }
}

const sidebar = document.getElementById("sidebar");
const toggleIcon = document.getElementById("toggle-icon");

function toggleSidebar() {
    sidebar.classList.toggle("collapsed");

    const isCollapsed = sidebar.classList.contains("collapsed");

    localStorage.setItem(
        "sidebarCollapsed",
        isCollapsed
    );

    updateToggleIcon(isCollapsed);
}

function updateToggleIcon(isCollapsed) {
    if (!toggleIcon) return;
}

document.addEventListener("DOMContentLoaded", function () {

    const isCollapsed =
        localStorage.getItem("sidebarCollapsed") === "true";

    if (isCollapsed) {
        sidebar.classList.add("collapsed");
    }

    updateToggleIcon(isCollapsed);

    // const namaKomponen = document.getElementById("namaKomponen");

    // if (namaKomponen) {
    //     namaKomponen.addEventListener(
    //         "input",
    //         toggleKasbonFields
    //     );
    // }
});

// SLIP GAJI & WHATSAPP LOGIC
function openSlipModal(id) {
    activeSlipEmpId = id;
    const emp = employees.find(e => e.id === id);
    const calc = calculateSalaryDetails(emp);

    document.getElementById('slip-nama').innerText = emp.nama;
    document.getElementById('slip-jabatan').innerText = emp.jabatan;
    document.getElementById('slip-divisi').innerText = emp.divisi;

    document.getElementById('slip-gapok').innerText = formatRupiah(emp.gapok);
    document.getElementById('slip-tunjangan').innerText = formatRupiah(emp.tunjangan);

    document.getElementById('slip-late-hours').innerText = emp.late;
    document.getElementById('slip-pot-late').innerText = formatRupiah(calc.potLate);
    document.getElementById('slip-alpha-days').innerText = emp.alpha;
    document.getElementById('slip-pot-alpha').innerText = formatRupiah(calc.potAlpha);

    document.getElementById('slip-thp').innerText = formatRupiah(calc.thp);

    document.getElementById('btn-send-single-wa').onclick = () => sendSingleWhatsapp(emp.id);

    document.getElementById('slipModal').classList.add('active');
}