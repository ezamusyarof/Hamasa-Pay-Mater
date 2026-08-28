document.querySelectorAll('.harga').forEach(el => {
    el.textContent = 'Rp ' + Number(el.textContent).toLocaleString('id-ID');
});

const sidebar = document.getElementById("sidebar");
const toggleIcon = document.getElementById("toggle-icon");

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

const isCollapsed =
    localStorage.getItem("sidebarCollapsed") === "true";

document.addEventListener("DOMContentLoaded", function () {
    if (isCollapsed) {
        sidebar.classList.add("collapsed");
    }

    updateToggleIcon(isCollapsed);
});


// document.addEventListener("DOMContentLoaded", function () {

//     const isCollapsed =
//         localStorage.getItem("sidebarCollapsed") === "true";

//     if (isCollapsed) {
//         sidebar.classList.add("collapsed");
//     }

//     updateToggleIcon(isCollapsed);
// });

// Membuka modal konfirmasi Logout
async function openModalLogout() {
    document.getElementById('confirmLogoutModal').classList.add('active');
}

function closeLogoutConfirmModal() {
    document.getElementById('confirmLogoutModal').classList.remove('active');
}

// Menghapus Payroll Bulan terpilih
async function confirmLogout() {
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


function openEditPasswordModal(userId) {
    document.getElementById(
        'editPasswordUserId'
    ).value = userId;

    document.getElementById(
        'newPassword'
    ).value = '';

    document.getElementById(
        'confirmNewPassword'
    ).value = '';

    document.getElementById(
        'modalEditPassword'
    ).style.display = 'flex';
    
    const modalEdit = document.getElementById('modalEditPassword');
    if (modalEdit) modalEdit.style.display = 'flex';
}

function closeEditPasswordConfirmModal() {
    document.getElementById('modalEditPassword').style.display = 'none';
}


async function updatePassword() {

    const userId =
        document.getElementById('editPasswordUserId').value;

    const newPassword =
        document.getElementById('newPassword').value;

    const confirmPassword =
        document.getElementById('confirmNewPassword').value;

    
    console.log(userId,newPassword,confirmPassword)

    // Validasi
    if (!newPassword) {
        showToastFailed("Password baru wajib diisi!");
        return;
    }

    if (newPassword !== confirmPassword) {
        showToastFailed("Konfirmasi password tidak sesuai!");
        return;
    }


    try {

        const response = await fetch('/api/user/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: newPassword
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Gagal mengubah password"
            );
        }


        // Tutup modal
        document.getElementById(
            'modalEditPassword'
        ).style.display = 'none';


        // Bersihkan input
        document.getElementById(
            'newPassword'
        ).value = '';

        document.getElementById(
            'confirmNewPassword'
        ).value = '';


        if (typeof showToast === 'function') {
            showToast(
                "Password berhasil diperbarui"
            );
        }

    } catch (error) {

        console.error(error);

        showToastFailed(
            error.message
        );
    }
}