let currentComponentCategory = "tunjangan";

function openKomponenModal(empId, category = 'tunjangan', att = '', periode = '') {
    document.getElementById('komponenEmpId').value = empId;
    document.getElementById('namaKomponen').value = '';
    document.getElementById('nominalKomponen').value = '';
    document.getElementById('satuanKomponen').value = '1';
    document.getElementById('jumlahKasbonKomponen').value = '';
    document.getElementById('jumlahCicilanKomponen').value = '';

    toggleKasbonFields();

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
        
    const jumlahKasbonInput =
        parseFloat(
            document.getElementById('jumlahKasbonKomponen').dataset.rawValue
        ) || document.getElementById('jumlahKasbonKomponen').value || 0;
        
    const jumlahCicilanInput =
        parseFloat(
            document.getElementById('jumlahCicilanKomponen').dataset.rawValue
        ) || document.getElementById('jumlahCicilanKomponen').value || 0;

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
                kasbon: jumlahKasbonInput,
                cicilan: jumlahCicilanInput,
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

        const modal = document.getElementById('modalTambahKomponen');

        if (modal) {
            modal.style.display = 'none';
        }
        updatePayrollRow(empId, category, {
            id: result.item_id,
            name: nameInput,
            rate: nominalInput,
            qty: qty,
            amount: amount,

            total_penambahan: result.total_tunjangan,
            total_bonus: result.total_bonus,
            total_potongan: result.total_potongan,
            total_earning: result.total_earning,
            total_deduction: result.total_deduction,
            thp: result.thp,
            pph21: result.pph21,
            thp_after_tax: result.thp_after_tax
        });

    } catch (error) {
        console.error(error);

        alert(
            "Gagal menyimpan komponen: " +
            error.message
        );
    }
}

function updatePayrollRow(empId, category, item) {

    const container = document.getElementById(
        `${category}-container-${empId}`
    );

    if (!container) {
        console.error(
            `Container ${category}-container-${empId} tidak ditemukan`
        );
        return;
    }

    // ==========================================
    // 1. Tentukan index item baru
    // ==========================================

    const existingItems = container.querySelectorAll(
        `[id^="${category}-normal-${empId}-"]`
    );

    const index = existingItems.length;


    // ==========================================
    // 2. Format Rupiah
    // ==========================================

    const formatRupiah = (value) => {
        return new Intl.NumberFormat('id-ID').format(
            Number(value) || 0
        );
    };


    // ==========================================
    // 3. Style berdasarkan kategori
    // ==========================================

    const isPotongan = category === 'potongan';

    const backgroundColor = isPotongan
        ? '#fef2f2'
        : '#D8F9E8';

    const borderColor = isPotongan
        ? '#fecaca'
        : '#6fe6a8';

    const textColor = isPotongan
        ? '#ef4444'
        : '#166534';

    const buttonColor = isPotongan
        ? '#f87171'
        : '#0d9d6d';


    // ==========================================
    // 4. Buat element baru
    // ==========================================

    const itemElement = document.createElement('div');

    itemElement.id =
        `${category}-normal-${empId}-${index}`;

    itemElement.style.cssText = `
        background-color: ${backgroundColor};
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid ${borderColor};
        margin-bottom: 6px;
        margin-top: 2px;
    `;


    // ==========================================
    // 5. Isi HTML item
    // ==========================================

    itemElement.innerHTML = `
        <div
            class="${isPotongan ? '' : 'text-muted'} text-truncate"
            style="
                font-size: 11px;
                line-height: 1.2;
                margin-bottom: 2px;
                ${isPotongan
                    ? `color: ${textColor};`
                    : ''
                }
            "
        >
            ${escapeHtml(item.name)}
        </div>

        <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
        ">

            <span
                class="fw-bold"
                style="
                    font-size: 13px;
                    white-space: nowrap;
                    color: ${textColor};
                "
            >
                ${isPotongan ? '-' : ''}
                <span class="harga">
                    Rp ${formatRupiah(item.amount)}
                </span>
            </span>

            <button
                type="button"
                class="btn btn-sm p-0 d-flex
                       align-items-center
                       justify-content-center"
                style="
                    width: 18px;
                    height: 18px;
                    min-width: 13px;
                    font-size: 10px;
                    border-radius: 3px;
                    background-color: ${buttonColor};
                    border: none;
                    flex-shrink: 0;
                    color: #fff;
                "
                onclick="setDeleteConfirm(
                    '${empId}',
                    '${category}',
                    '${index}'
                )"
            >
                -
            </button>

        </div>
    `;


    // ==========================================
    // 6. Tambahkan ke halaman
    // ==========================================

    container.appendChild(itemElement);

    // Tambahkan area konfirmasi hapus
    const deleteElement = document.createElement('div');

    deleteElement.id =
        `${category}-delete-${empId}-${index}`;

    deleteElement.style.cssText = `
        background-color: #ff0000;
        border: 1px solid #ff0000;
        padding: 5px 6px;
        border-radius: 6px;
        margin-bottom: 6px;
        margin-top: 4px;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    `;

    deleteElement.innerHTML = `
        <button
            type="button"
            onclick="executeRemoveItem('${item.id}')"
            style="
                flex: 1;
                background-color: #ff0000;
                color: #ffffff;
                border: none;
                padding: 9px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            "
        >
            Hapus Data
        </button>

        <button
            type="button"
            onclick="cancelDeleteConfirm('${empId}', '${category}', '${index}')"
            style="
                background-color: rgba(255,255,255,0.25);
                color: #ffffff;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
            "
        >
            x
        </button>
    `;

    container.appendChild(deleteElement);


    // ==========================================
    // 7. Update total payroll
    // ==========================================

    const row = itemElement.closest('tr');

    if (!row) {
        console.error(
            `Baris employee ${empId} tidak ditemukan`
        );
        return;
    }


    // ------------------------------------------
    // Cari semua elemen .harga di row
    // ------------------------------------------
    const hargaElements =
        row.querySelectorAll('.harga');


    // ------------------------------------------
    // Update berdasarkan posisi elemen
    // ------------------------------------------
    //
    // Dari HTML yang kamu kirim:
    //
    // total earning  -> Rp 8.925.000
    // deduction      -> Rp 148.050
    // THP            -> Rp 8.776.950
    //
    // Kita akan menggunakan selector khusus
    // jika nanti ID sudah dipasang.
    // ------------------------------------------

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
            `Rp ${formatRupiah(item.total_penambahan)}`;
    }

    if (totalPotonganElement) {
        totalPotonganElement.textContent =
            `Rp ${formatRupiah(item.total_potongan)}`;
    }

    if (thpElement) {
        thpElement.textContent =
            `Rp ${formatRupiah(item.thp)}`;
    }
    
    if (pph21Element) {
        pph21Element.textContent =
            `- Rp ${formatRupiah(item.pph21)}`;
    }
    
    if (thpAfterTaxElement) {
        thpAfterTaxElement.textContent =
            `Rp ${formatRupiah(item.thp_after_tax)}`;
    }


    // ==========================================
    // 8. Beri feedback
    // ==========================================

    if (typeof showToast === 'function') {
        showToast(
            'Komponen berhasil ditambahkan'
        );
    }
}