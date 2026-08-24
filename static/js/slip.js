let currentComponentCategory = "tunjangan";

function openKomponenModal(empId, category = 'tunjangan', att = '', periode = '') {
    document.getElementById('komponenEmpId').value = empId;
    document.getElementById('namaKomponen').value = '';
    document.getElementById('nominalKomponen').value = '';
    document.getElementById('satuanKomponen').value = '1';

    currentComponentCategory = category;
    loadKomponenByCategory(category);


    if (typeof att === 'string' && att.trim().startsWith('{')) {
        try {
            // Ubah single quote (') menjadi double quote (") agar valid JSON
            let validJsonString = att.replace(/'/g, '"');
            parsedAtt = JSON.parse(validJsonString);
        } catch (e) {
            console.error("Gagal memparsing data attendance:", e);
            parsedAtt = {}; // Fallback jika gagal parsing
        }
    }

    console.log(att)

    const modal = document.getElementById('modalTambahKomponen');
    if (modal) modal.style.display = 'flex';

    const modalTitle = document.querySelector(
        '#modalTambahKomponen .custom-modal-title'
    );

    const modalBtn = document.querySelector(
        '#modalTambahKomponen .custom-btn-submit'
    );

    modalBtn.onclick = () => simpanKomponen(
        empId,
        category,
        att,
        periode
    );

    if (category == "tunjangan") {
        modalTitle.textContent = 'Tambah Tunjangan/Insentive';
        modalBtn.textContent = '+ Tambah Tunjangan/Insentive';
        modalBtn.className = 'custom-btn-submit btn btn-warning btn-sm';
        modalBtn.style.cssText = `
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            font-size: 12px;
            padding: 10px 8px;
            border-radius: 6px;
            background-color: #10b981;
            border: none;
            font-weight: 500;
            margin-bottom: 14px;
            color: #fff;
        `;

    } else if (category == "bonus") {
        modalTitle.textContent = 'Tambah Bonus/Insentive';
        modalBtn.textContent = '+ Tambah Bonus/Insentive';
        modalBtn.className = 'custom-btn-submit btn btn-warning btn-sm';
        modalBtn.style.cssText = `
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            font-size: 12px;
            padding: 10px 8px;
            border-radius: 6px;
            background-color: #eab308;
            border: none;
            font-weight: 500;
            margin-bottom: 14px;
            color: #fff;
        `;

    } else if (category == "potongan") {
        modalTitle.textContent = 'Tambah Potongan';
        modalBtn.textContent = '+ Tambah Potongan';
        modalBtn.className = 'custom-btn-submit btn btn-warning btn-sm';
        modalBtn.style.cssText = `
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            font-size: 12px;
            padding: 10px 8px;
            border-radius: 6px;
            background-color: #f87171;
            border: none;
            font-weight: 500;
            margin-bottom: 14px;
            color: #fff;
        `;
    }
}

async function simpanKomponen(empId, category, att, periode) {
    const nameInput = document.getElementById('namaKomponen').value.trim();

    const nominalInput =
        parseFloat(
            document.getElementById('nominalKomponen').dataset.rawValue
        ) || document.getElementById('nominalKomponen').value || 0;

    console.log(nominalInput)

    const unitInput =
        document.getElementById('satuanKomponen').value;

    if (!nameInput) {
        showToastFailed("Silakan isi nama komponen!");
        return;
    } else if (!nominalInput) {
        showToastFailed("Silakan isi nominal komponen! ",nominalInput);
        return;
    } else if (!satuanKomponen) {
        showToastFailed("Silakan isi satuan komponen!");
        return;
    }

    let qty = 1;

    if (unitInput === "Total Masuk Kerja") {
        qty = Number(att.H || 0) + Number(att.T || 0);

    } else if (unitInput === "Total Absen") {
        qty = Number(att.A || 0);

    } else if (unitInput === "Total Terlambat") {
        qty = Number(att.T || 0);

    } else if (
        unitInput === "Total Lembar" ||
        unitInput === "Total Lembur"
    ) {
        qty = Number(att.L || 0);

    } else {
        qty = Number(unitInput) || 1;
    }

    const amount = nominalInput * qty;

    try {
        const response = await fetch('/api/payroll/add-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emp_id: empId,
                periode: periode,
                type: category,
                name: nameInput,
                rate: nominalInput,
                qty: qty,
                amount: amount
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || 'Gagal menyimpan komponen'
            );
        }

        window.location.href = '/payroll';

    } catch (error) {
        console.error(error);

        alert(
            "Gagal menyimpan komponen: " +
            error.message
        );
    }
}