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
                
                <td class="align-top" style="padding: 12px 18px; vertical-align: top !important;">
                    <div class="fw-bold" style="color: #111827; font-size: 13px;">${emp.name}</div>
                    <div class="text-muted" style="font-size: 11px;">${emp.position || '-'}</div>
                    
                    ${isExpanded ? `
                        <div class="mt-3" style="font-size: 12px; line-height: 1.5; color: #374151;">
                            <div style="height: 10px;"></div>
                            <div>Hadir: ${emp.att?.H ?? 0} Hari</div>
                            <div>Terlambat: ${emp.att?.T ?? 0} Hari</div>
                            <div>Sakit: ${emp.att?.S ?? 0} Hari</div>
                            <div>Absen: ${emp.att?.A ?? 0} Hari</div>
                        </div>
                    ` : ''}
                </td>

                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important;">
                    <div class="fw-bold" style="font-size: 13px;">${formatRupiah(gapok)}</div>
                </td>

                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important; min-width: 190px;" onclick="event.stopPropagation();">
                    <div class="fw-bold" style="font-size: 13px; color: #111827; margin-bottom: 10px;" onclick="toggleExpand('${emp.id}')">
                    </div>
                    
                    ${isExpanded ? `
                        <div style="height: 10px;"></div>
                        <button class="btn btn-success btn-sm" 
                                style="display: block !important; width: 100% !important; text-align: center !important; font-size: 12px; padding: 10px 8px; border-radius: 6px; background-color: #22c55e; border: none; font-weight: 500; margin-bottom: 14px;" 
                                onclick="openKomponenModal('${emp.id}', 'tunjangan')">
                            + Tambah Komponen
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

                <td class="align-top" style="padding: 12px 8px; vertical-align: top !important;">
                    <div class="fw-bold" style="font-size: 13px; color: #111827;">${formatRupiah(calc.thp)}</div>
                </td>

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