const daftarKomponen = {
    tunjangan: [
        "Tunjangan Jabatan",
        "Tunjangan Perawatan Motor",
        "Tunjangan Transport & Makan",
        "Tunjangan/Subsidi BPJS TK",
        "Tunjangan Hari Raya",
        "Insentive",
        "Insentive Jasa Service",
        "Insentive Kerajinan",
        "Insentive Sewa, Kredit, Cicilan",
        "Bonus Conssumable & Sparepart",
        "Lembur"
    ],

    potongan: [
        "Potongan Tj. Transport & Makan",
        "Potongan BPJS TK",
        "Potongan Kasbon",
        "Potongan Absen",
        "Potongan Terlambat"
    ]
};

const namaKomponen = document.getElementById("namaKomponen");
const dropdownNama = document.getElementById("dropdownNama");

namaKomponen.addEventListener("focus", function () {
    dropdownNama.style.display = "block";
    tampilkanKomponen(this.value);
});

namaKomponen.addEventListener("input", function () {
    const keyword = this.value.toLowerCase();
    const options = dropdownNama.querySelectorAll(".combobox-option");

    options.forEach(option => {
        const nama = option.textContent.toLowerCase();
        option.style.display = nama.includes(keyword) ? "block" : "none";
    });

    dropdownNama.style.display = "block";

    tampilkanKomponen(this.value);
    updateSatuanKomponen(this.value);
    updateNominalKomponen(this.value);
    toggleKasbonFields(this.value);
});

function tampilkanKomponen(keyword) {
    const search = keyword.trim().toLowerCase();
    const hasil = daftarKomponen[currentComponentCategory].filter(item => item.toLowerCase().includes(search) );

    dropdownNama.innerHTML = "";

    hasil.forEach(item => {
        const option = document.createElement("div");

        option.className = "combobox-option";
        option.textContent = item;
        option.dataset.value = item;

        option.addEventListener("mousedown", async function () {
            namaKomponen.value = this.dataset.value;
            dropdownNama.style.display = "none";
            await updateSatuanKomponen();
            await updateNominalKomponen();
            await toggleKasbonFields();
        });

        dropdownNama.appendChild(option);
    });

    // Tampilkan dropdown jika ada hasil
    if (hasil.length > 0) {
        dropdownNama.style.display = "block";
    } else {
        dropdownNama.style.display = "none";
    }
}

async function updateSatuanKomponen() {
    const nama = document.getElementById("namaKomponen").value.trim();
    const satuan = document.getElementById("satuanKomponen");
    const empId = document.getElementById("komponenEmpId").value;

    // Komponen yang mengambil data dari presensi
    const komponenPresensi = [
        "Potongan Absen",
        "Potongan Terlambat",
        "Tunjangan Transport & Makan",
        "Lembur"
    ];

    // Jika bukan komponen presensi
    if (!komponenPresensi.includes(nama)) { satuan.value = 1; return; }

    // Komponen presensi tidak boleh diedit manual
    satuan.value = "Loading...";

    try {
        // Ambil periode aktif
        const periode = document.getElementById("selectPeriode").value;
        const response = await fetch( `/api/attendance/detail?periode=${encodeURIComponent(periode)}` );
        
        if (!response.ok) { throw new Error("Gagal mengambil data absensi"); }
        
        const result = await response.json();

        // Cari karyawan berdasarkan user_id
        const employee = result.data.find( item => String(item.id) === String(empId) );
        console.log(employee)

        if (!employee) { throw new Error("Data karyawan tidak ditemukan"); }

        const dailyStatus = employee.daily_status || {};

        // Hitung status
        let totalHadir = 0;
        let totalTerlambat = 0;
        let totalAbsen = 0;
        let totalLembur = 0;

        Object.values(dailyStatus).forEach(status => {
            switch (status) {
                case "H":
                    totalHadir++;
                    break;
                case "T":
                    totalTerlambat++;
                    break;
                case "A":
                    totalAbsen++;
                    break;
                case "L":
                    totalLembur++;
                    break;
            }
        });

        // Tentukan nilai berdasarkan komponen
        let nilai = 1;

        switch (nama) {
            case "Potongan Absen":
                nilai = totalAbsen;
                break;
            case "Potongan Terlambat":
                nilai = totalTerlambat;
                break;
            case "Tunjangan Transport & Makan":
                nilai = totalHadir + totalTerlambat;
                break;
            case "Lembur":
                nilai = totalLembur;
                break;
        }
        satuan.value = nilai;
    } catch (error) {
        console.error(error);
        satuan.value = 1;
    }
}

// Klik di luar combobox → tutup dropdown
document.addEventListener("click", function (event) {
    const wrapper = document.getElementById("wrapperNama");

    if (!wrapper.contains(event.target)) {
        dropdownNama.style.display = "none";
    }
});

async function updateNominalKomponen() {
    const nama = document.getElementById("namaKomponen").value.trim();
    const nominalInput = document.getElementById("nominalKomponen");
    const empId = document.getElementById("komponenEmpId").value;

    // POTONGAN TERLAMBAT
    if (nama === "Potongan Terlambat") {
        nominalInput.value = 25000;
        return;
    }

    // KOMPONEN YANG MENGGUNAKAN BASIC SALARY
    const menggunakanBasicSalary = [
        "Potongan Absen",
        "Potongan BPJS TK"
    ];

    if (!menggunakanBasicSalary.includes(nama)) {
        // Komponen biasa → bisa diinput manual
        nominalInput.value = "";
        return;
    }

    // Pastikan employee ID tersedia
    if (!empId) {
        nominalInput.value = "";
        return;
    }

    // Loading
    nominalInput.value = "Loading...";

    try {
        const response = await fetch(
            `/api/employees?id=${encodeURIComponent(empId)}`
        );
        if (!response.ok) {
            throw new Error("Gagal mengambil data karyawan");
        }
        const result = await response.json();
        // Endpoint mengembalikan array
        const employee = Array.isArray(result)
            ? result[0]
            : result;
        if (!employee) {
            throw new Error("Data karyawan tidak ditemukan");
        }
        const basicSalary = Number(employee.basic_salary) || 0;
        let nominal = 0;

        // =====================================================
        // POTONGAN ABSEN
        // Basic Salary / 30
        // =====================================================
        if (nama === "Potongan Absen") { nominal = Math.round(basicSalary / 30); }

        // =====================================================
        // Potongan BPJS TK
        // Basic Salary * 2%
        // =====================================================
        else if (nama === "Potongan BPJS TK") { nominal = Math.round(basicSalary * 0.02); }

        nominalInput.value = nominal;

    } catch (error) {
        console.error("Gagal mengambil basic salary:", error);
        nominalInput.value = "0";
    }
}

function loadKomponenByCategory(category) {
    const dropdown = document.getElementById("dropdownNama");
    if (!dropdown) return;

    dropdown.innerHTML = "";
    const daftar = daftarKomponen[category] || [];

    daftar.forEach(nama => {
        const option = document.createElement("div");
        option.className = "combobox-option";
        option.dataset.value = nama;
        option.textContent = nama;
        option.addEventListener("mousedown", async function () {
            document.getElementById("namaKomponen").value = nama;
            dropdown.style.display = "none";
            // Update satuan berdasarkan komponen
            if (typeof updateSatuanKomponen === "function") {
                await updateSatuanKomponen();
            }
            // Update nominal berdasarkan komponen
            if (typeof updateNominalKomponen === "function") {
                await updateNominalKomponen();
            }
        });
        dropdown.appendChild(option);
    });
}

function toggleKasbonFields() {

    const namaKomponen = document
        .getElementById("namaKomponen")
        .value
        .trim()
        .toLowerCase();

    const colKasbon = document.getElementById("colJumlahKasbon");
    const colCicilan = document.getElementById("colJumlahCicilan");

    const inputKasbon = document.getElementById("jumlahKasbonKomponen");
    const inputCicilan = document.getElementById("jumlahCicilanKomponen");

    const isKasbon = namaKomponen === "potongan kasbon";

    if (isKasbon) {

        colKasbon.style.setProperty("display", "flex", "important");
        colCicilan.style.setProperty("display", "flex", "important");

    } else {

        colKasbon.style.setProperty("display", "none", "important");
        colCicilan.style.setProperty("display", "none", "important");

        inputKasbon.value = "";
        inputCicilan.value = "";
    }
}