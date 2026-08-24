import datetime
from flask import jsonify
from models import Employee, PayrollItem, PayrollSummary
from services.attendance_service import calculate_attendance_summary
from payroll_config import *
from extensions import db

def calculate_employee_payroll(employee, periode=None):

    if not periode:
        periode = datetime.date.today().strftime("%Y-%m")

    att_summary = calculate_attendance_summary(
        employee.user_id,
        periode
    )

    auto_items = generate_auto_items(
        employee,
        att_summary
    )

    tunjangan_list = [
        x for x in auto_items
        if x["type"] == "tunjangan"
    ]

    bonus_list = [
        x for x in auto_items
        if x["type"] == "bonus"
    ]

    potongan_list = [
        x for x in auto_items
        if x["type"] == "potongan"
    ]

    return {
        "id": employee.id,
        "user_id": employee.user_id,
        "name": employee.name,
        "basic_salary": employee.basic_salary,
        "tunjanganList": tunjangan_list,
        "bonusList": bonus_list,
        "potonganList": potongan_list,
        "att": att_summary
    }

def save_monthly_payroll(periode):
    """Menyimpan hasil kalkulasi payroll bulan tertentu ke database 2 tabel baru"""

    try:
        employees = Employee.query.all()
        
        for emp in employees:
            # Hitung payroll karyawan berdasarkan periode
            p_details = calculate_employee_payroll(emp, periode)
            
            b_sal = p_details.get("basic_salary", 0)
            t_list = p_details.get("tunjanganList", [])
            b_list = p_details.get("bonusList", [])
            p_list = p_details.get("potonganList", [])

            total_earning = b_sal + sum(x["amount"] for x in t_list + b_list)
            total_deduction = sum(x["amount"] for x in p_list)
            thp = max(0, total_earning - total_deduction)

            # Cek apakah summary untuk karyawan & periode ini sudah ada
            summary = PayrollSummary.query.filter_by(employee_id=emp.id, periode=periode).first()
            
            if not summary:
                summary = PayrollSummary(
                    employee_id=emp.id,
                    periode=periode,
                    basic_salary=b_sal,
                    total_earning=total_earning,
                    total_deduction=total_deduction,
                    thp=thp
                )
                db.session.add(summary)
                db.session.flush() # Mendapatkan ID summary baru
            else:
                summary.basic_salary = b_sal
                summary.total_earning = total_earning
                summary.total_deduction = total_deduction
                summary.thp = thp
                # Hapus item lama jika ingin di-generate ulang
                PayrollItem.query.filter_by( payroll_summary_id=summary.id, source="auto" ).delete()

            # Masukkan semua komponen item ke payroll_items
            all_components = t_list + b_list + p_list
            for comp in all_components:
                item = PayrollItem(
                    payroll_summary_id=summary.id,
                    name=comp["name"],
                    type=comp["type"],
                    rate=comp["rate"],
                    qty=comp["qty"],
                    unit=comp["unit"],
                    amount=comp["amount"]
                )
                db.session.add(item)

        db.session.commit()
        return jsonify({"status": "success", "message": f"Payroll periode {periode} berhasil disimpan ke database!"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500

def generate_auto_items(employee, att):
    items = []

    hadir = att["H"]
    telat = att["T"]
    alpha = att["A"]
    lembur = att["L"]

    # Transport
    transport = TRANSPORT_RATE * hadir

    if transport > 0:
        items.append({
            "name": "Tunjangan Transport",
            "type": "tunjangan",
            "rate": TRANSPORT_RATE,
            "qty": hadir,
            "unit": "hari",
            "amount": transport
        })

    # Potongan Telat
    late_cut = LATE_PENALTY * telat

    if late_cut > 0:
        items.append({
            "name": "Potongan Terlambat",
            "type": "potongan",
            "rate": LATE_PENALTY,
            "qty": telat,
            "unit": "hari",
            "amount": late_cut
        })

    # BPJS
    bpjs = round(employee.basic_salary * BPJS_RATE)

    items.append({
        "name": "Potongan BPJS",
        "type": "potongan",
        "rate": BPJS_RATE * 100,
        "qty": 1,
        "unit": "%",
        "amount": bpjs
    })

    return items

def recalculate_payroll_summary(summary):

    items = summary.items

    earning = summary.basic_salary

    deduction = 0

    for item in items:

        if item.type in ["tunjangan", "bonus"]:
            earning += item.amount

        elif item.type == "potongan":
            deduction += item.amount

    summary.total_earning = earning
    summary.total_deduction = deduction
    summary.thp = earning - deduction

    return summary

def add_manual_payroll_item(
    employee_id,
    periode,
    item_type,
    name,
    amount
):

    summary = PayrollSummary.query.filter_by(
        employee_id=employee_id,
        periode=periode
    ).first()

    if not summary:

        employee = Employee.query.get(employee_id)

        summary = PayrollSummary(
            employee_id=employee.id,
            periode=periode,
            basic_salary=employee.basic_salary
        )

        db.session.add(summary)
        db.session.flush()

    item = PayrollItem(
        payroll_summary_id=summary.id,
        name=name,
        type=item_type,
        rate=amount,
        qty=1,
        unit="kali",
        amount=amount,
        source="manual"
    )

    db.session.add(item)

    recalculate_payroll_summary(summary)

    db.session.commit()

    return item

def delete_manual_payroll_item(item_id):

    item = PayrollItem.query.get(item_id)

    if not item:
        return False

    summary = item.summary

    db.session.delete(item)

    db.session.flush()

    recalculate_payroll_summary(summary)

    db.session.commit()

    return True

def pph_21(thp, gender: str, married_status, dependents):
    """
    Menghitung potongan PPh 21 bulanan.

    Parameter:
        thp            : Total Take Home Pay sebelum PPh 21 (per bulan)
        married_status : 1 = menikah, 0 = belum menikah
        dependents     : Jumlah tanggungan (maksimal 3)

    Return:
        PPh 21 per bulan
    """

    # Pastikan nilai tidak negatif
    thp = max(float(thp or 0), 0)

    # =========================================================
    # 1. Biaya jabatan
    # =========================================================
    biaya_jabatan = min(thp * 0.05, 500_000)
    print("biaya jabatan: ",biaya_jabatan)

    # =========================================================
    # 2. Jamsostek
    # =========================================================
    jamsostek = thp * 0.03
    print("biaya jamsostek: ",jamsostek)

    # =========================================================
    # 3. Penghasilan setelah biaya jabatan dan jamsostek
    # =========================================================
    penghasilan_netto = thp - biaya_jabatan - jamsostek
    print("penghasilan netto: ",penghasilan_netto)

    # =========================================================
    # 4. PTKP dasar
    #    Rp4.500.000 per bulan
    # =========================================================
    ptkp = 4_500_000

    sisa = penghasilan_netto - ptkp
    print("sisa -4,5jt: ",sisa)

    # Jika belum melewati PTKP
    if sisa <= 0:
        return 0

    # =========================================================
    # 5. Tambahan PTKP untuk tanggungan
    #    Maksimal 3 orang
    # =========================================================
    dependents = max(0, min(int(dependents or 0), 3))

    print("dependents:", dependents)
    print("gender:", repr(gender), type(gender))
    print("married_status:", repr(married_status), type(married_status))

    if married_status == "1" and gender == "Laki-Laki":
        dependents += 1

    print("tanggungan setelah:", dependents)

    # Setiap orang = Rp375.000 / bulan
    ptkp_tambahan = dependents * 375_000
    dependents
    print("ptkp_tambahan: ",ptkp_tambahan)

    # Kurangi PTKP tanggungan/pasangan
    sisa -= ptkp_tambahan

    print("sisa: ",sisa)

    if sisa <= 0:
        return 0

    # =========================================================
    # 6. Annualize
    #    Batas tarif PPh 21 menggunakan penghasilan tahunan
    # =========================================================
    pkp_tahunan = sisa * 12
    print("pkp_tahunan: ",pkp_tahunan)

    # =========================================================
    # 7. Tarif progresif
    # =========================================================
    if pkp_tahunan <= 60_000_000:
        pajak_tahunan = pkp_tahunan * 0.05

    elif pkp_tahunan <= 250_000_000:
        pajak_tahunan = pkp_tahunan * 0.15

    elif pkp_tahunan <= 500_000_000:
        pajak_tahunan = pkp_tahunan * 0.25

    elif pkp_tahunan <= 5_000_000_000:
        pajak_tahunan = pkp_tahunan * 0.30

    else:
        pajak_tahunan = pkp_tahunan * 0.35

    print("pajak_tahunan: ",pajak_tahunan)

    # =========================================================
    # 8. Kembalikan pajak per bulan
    # =========================================================
    return pajak_tahunan / 12