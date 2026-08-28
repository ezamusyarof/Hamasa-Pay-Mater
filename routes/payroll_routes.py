import datetime
import math
from sqlite3 import IntegrityError
from flask import Blueprint, jsonify, request
from models import DailyAttendance, Employee, PayrollItem, PayrollSummary
from services.payroll_service import save_monthly_payroll, pph_21
from extensions import db

payroll_bp = Blueprint(
    "payroll",
    __name__,
    url_prefix="/api"
)

@payroll_bp.route("/payroll/add-item", methods=["POST"])
def add_payroll_item():
    data = request.get_json() or {}

    emp_id = data.get("emp_id")
    periode = data.get("periode")
    item_type = data.get("type")
    name = data.get("name")
    kasbon = data.get("kasbon")
    cicilan = data.get("cicilan")
    rate = float(data.get("rate", 0))
    qty = float(data.get("qty", 1))
    amount = float(data.get("amount", 0))

    print("TEST: ",kasbon,"-",cicilan)

    # Cari employee
    emp = db.session.get(Employee, emp_id)

    if not emp:
        return jsonify({"error": "Karyawan tidak ditemukan"}), 404

    # Cari / buat summary
    summary = PayrollSummary.query.filter_by(
        employee_id=emp_id,
        periode=periode
    ).first()

    if not summary:
        summary = PayrollSummary(
            employee_id=emp_id,
            periode=periode,
            basic_salary=emp.basic_salary or 0,
            total_earning=emp.basic_salary or 0,
            total_deduction=0,
            thp=emp.basic_salary or 0
        )

        db.session.add(summary)
        db.session.flush()

    # Tambahkan item
    new_item = PayrollItem(
        payroll_summary_id=summary.id,
        name=name,
        type=item_type,
        rate=rate,
        qty=qty,
        unit="unit",
        amount=amount
    )

    db.session.add(new_item)
    db.session.flush()

    # Hitung ulang SEMUA komponen
    all_items = summary.items

    total_tunjangan = sum(
        item.amount for item in all_items
        if item.type == "tunjangan"
    )

    total_bonus = sum(
        item.amount for item in all_items
        if item.type == "bonus"
    )

    total_potongan = sum(
        item.amount for item in all_items
        if item.type == "potongan"
    )

    # Update summary
    summary.total_earning = (
        summary.basic_salary
        + total_tunjangan
        + total_bonus
    )

    summary.total_deduction = total_potongan

    summary.thp = (
        summary.total_earning
        - summary.total_deduction
    )

    summary.pph21 = pph_21(
        summary.thp,
        emp.gender,
        emp.married_status,
        emp.dependents
    )

    summary.thp_after_tax = (
        summary.thp - summary.pph21
    )

    summary.kasbon = kasbon
    summary.cicilan = cicilan

    db.session.commit()

    return jsonify({
        "success": True,
        "item_id": new_item.id,
        "total_tunjangan": total_tunjangan,
        "total_bonus": total_bonus,
        "total_potongan": total_potongan,
        "total_earning": summary.total_earning,
        "total_deduction": summary.total_deduction,
        "thp": summary.thp,
        "pph21": summary.pph21,
        "thp_after_tax": summary.thp_after_tax
    }), 200

@payroll_bp.route("/payroll/delete-item", methods=["POST"])
def delete_payroll_item():
    data = request.get_json() or {}

    item_id = data.get("item_id")

    item = db.session.get(PayrollItem, item_id)

    if not item:
        return jsonify({
            "error": "Item payroll tidak ditemukan"
        }), 404

    # Simpan summary sebelum item dihapus
    summary = item.summary

    # Hapus item
    db.session.delete(item)
    db.session.flush()

    # Ambil semua item yang tersisa
    all_items = summary.items

    total_tunjangan = sum(
        i.amount for i in all_items
        if i.type == "tunjangan"
    )

    total_bonus = sum(
        i.amount for i in all_items
        if i.type == "bonus"
    )

    total_potongan = sum(
        i.amount for i in all_items
        if i.type == "potongan"
    )

    # Hitung ulang summary
    summary.total_earning = (
        summary.basic_salary
        + total_tunjangan
        + total_bonus
    )

    summary.thp = (
        summary.total_earning
        - summary.total_deduction
    )

    summary.pph21 = pph_21(
        summary.thp,
        summary.employee.gender,
        summary.employee.married_status,
        summary.employee.dependents
    )

    summary.thp_after_tax = (
        summary.thp - summary.pph21
    )

    summary.total_deduction = total_potongan

    db.session.commit()

    return jsonify({
        "success": True,
        "item_id": item_id,
        "total_penambahan": total_tunjangan,
        "total_potongan": total_potongan,
        "thp": summary.thp,
        "pph21": summary.pph21,
        "thp_after_tax": summary.thp_after_tax
    }), 200

def add_payroll_item_internal(
    emp_id,
    periode,
    item_type,
    name,
    rate=0,
    qty=1,
    amount=0
):
    emp = db.session.get(Employee, emp_id)

    if not emp:
        raise ValueError("Karyawan tidak ditemukan")

    summary = PayrollSummary.query.filter_by(
        employee_id=emp_id,
        periode=periode
    ).first()

    if not summary:
        summary = PayrollSummary(
            employee_id=emp_id,
            periode=periode,
            basic_salary=emp.basic_salary or 0,
            total_earning=emp.basic_salary or 0,
            total_deduction=0,
            thp=emp.basic_salary or 0
        )

        db.session.add(summary)
        db.session.flush()

    new_item = PayrollItem(
        payroll_summary_id=summary.id,
        name=name,
        type=item_type,
        rate=float(rate or 0),
        qty=float(qty or 1),
        unit="unit",
        amount=float(amount or 0)
    )

    db.session.add(new_item)
    db.session.flush()

    return new_item

@payroll_bp.route("/payroll/generate", methods=["POST"])
def generate_payroll():
    try:
        data = request.get_json(silent=True) or {}

        periode = (data.get("periode") or "").strip()

        # ==========================================
        # VALIDASI PERIODE
        # ==========================================
        if not periode:
            return jsonify({
                "message": "Bulan/periode wajib dipilih"
            }), 400

        try:
            datetime.datetime.strptime(periode, "%Y-%m")
        except ValueError:
            return jsonify({
                "message": "Format periode harus YYYY-MM"
            }), 400


        # ==========================================
        # AMBIL SEMUA KARYAWAN
        # ==========================================
        employees = Employee.query.all()

        if not employees:
            return jsonify({
                "message": "Tidak ada data karyawan"
            }), 404


        created_count = 0
        skipped_count = 0


        # ==========================================
        # BUAT PAYROLL UNTUK SETIAP KARYAWAN
        # ==========================================
        for employee in employees:

            # ==========================================
            # CEK APAKAH PAYROLL SUDAH ADA
            # ==========================================
            existing_summary = PayrollSummary.query.filter_by(
                employee_id=employee.id,
                periode=periode
            ).first()

            print(employee.name, ": ", existing_summary)

            if existing_summary:
                skipped_count += 1
                continue


            # ==========================================
            # DATA BASIC SALARY
            # ==========================================
            basic_salary = float(employee.basic_salary or 0)

            print("GAPOK -> ", basic_salary)


            # ==========================================
            # BUAT PAYROLL SUMMARY DASAR
            # ==========================================
            new_summary = PayrollSummary(
                employee_id=employee.id,
                periode=periode,
                basic_salary=basic_salary,
                total_earning=basic_salary,
                total_deduction=0,
                thp=basic_salary,
                pph21=0,
                thp_after_tax=basic_salary,
                status_wa="Pending"
            )

            db.session.add(new_summary)
            db.session.flush()


            # ==========================================
            # AMBIL DATA ABSENSI
            # ==========================================
            attendance = DailyAttendance.query.filter(
                DailyAttendance.user_id == employee.user_id,
                DailyAttendance.date.like(f"{periode}-%")
            ).all()

            qty_absen = 0
            qty_terlambat = 0

            for record in attendance:

                if record.status == "A":
                    qty_absen += 1

                elif record.status == "T":
                    qty_terlambat += 1


            print("ABSEN -> ", qty_absen)
            print("TERLAMBAT -> ", qty_terlambat)


            # ==========================================
            # RATE
            # ==========================================
            rate_absen = math.floor(basic_salary / 30)
            rate_terlambat = 25000


            # ==========================================
            # POTONGAN ABSEN
            # ==========================================
            if qty_absen > 0 and rate_absen > 0:

                add_payroll_item_internal(
                    employee.id,
                    periode,
                    "potongan",
                    "Potongan Absen",
                    rate=rate_absen,
                    qty=qty_absen,
                    amount=rate_absen * qty_absen
                )

                print("Potongan absen sudah dihitung")


            # ==========================================
            # POTONGAN TERLAMBAT
            # ==========================================
            if qty_terlambat > 0 and rate_terlambat > 0:

                add_payroll_item_internal(
                    employee.id,
                    periode,
                    "potongan",
                    "Potongan Terlambat",
                    rate=rate_terlambat,
                    qty=qty_terlambat,
                    amount=rate_terlambat * qty_terlambat
                )

                print("Potongan terlambat sudah dihitung")


            # ==========================================
            # HITUNG ULANG DARI PAYROLL ITEM
            # ==========================================
            all_items = new_summary.items

            total_tunjangan = sum(
                item.amount
                for item in all_items
                if item.type == "tunjangan"
            )

            total_bonus = sum(
                item.amount
                for item in all_items
                if item.type == "bonus"
            )

            total_potongan = sum(
                item.amount
                for item in all_items
                if item.type == "potongan"
            )


            # ==========================================
            # TOTAL EARNING
            # ==========================================
            new_summary.total_earning = (
                basic_salary
                + total_tunjangan
                + total_bonus
            )


            # ==========================================
            # TOTAL DEDUCTION
            # ==========================================
            new_summary.total_deduction = total_potongan


            # ==========================================
            # THP
            # ==========================================
            new_summary.thp = (
                new_summary.total_earning
                - new_summary.total_deduction
            )

            print("TOTAL EARNING -> ", new_summary.total_earning)
            print("TOTAL DEDUCTION -> ", new_summary.total_deduction)
            print("THP -> ", new_summary.thp)


            # ==========================================
            # PPH 21
            # ==========================================
            new_summary.pph21 = pph_21(
                new_summary.thp,
                employee.gender,
                employee.married_status,
                employee.dependents
            )

            print("PPH21 -> ", new_summary.pph21)


            # ==========================================
            # THP AFTER TAX
            # ==========================================
            new_summary.thp_after_tax = (
                new_summary.thp
                - new_summary.pph21
            )

            print(
                "THP AFTER TAX -> ",
                new_summary.thp_after_tax
            )


            created_count += 1

        db.session.commit()

        return jsonify({
            "message": "Payroll berhasil dibuat",
            "created": created_count,
            "skipped": skipped_count
        }), 200

    except Exception as e:

        db.session.rollback()

        return jsonify({
            "message": f"Gagal membuat payroll: {str(e)}"
        }), 500

@payroll_bp.route("/payroll/delete", methods=["DELETE"])
def delete_payroll():
    try:
        data = request.get_json(silent=True) or {}

        periode = (data.get("periode") or "").strip()

        # ==========================================
        # VALIDASI PERIODE
        # ==========================================
        if not periode:
            return jsonify({
                "message": "Bulan/periode wajib dipilih"
            }), 400

        try:
            datetime.datetime.strptime(periode, "%Y-%m")
        except ValueError:
            return jsonify({
                "message": "Format periode harus YYYY-MM"
            }), 400


        # ==========================================
        # CARI PAYROLL BERDASARKAN PERIODE
        # ==========================================
        payrolls = PayrollSummary.query.filter_by(
            periode=periode
        ).all()

        if not payrolls:
            return jsonify({
                "message": f"Tidak ada payroll untuk periode {periode}"
            }), 404


        jumlah_dihapus = len(payrolls)


        # ==========================================
        # HAPUS PAYROLL
        # ==========================================
        for payroll in payrolls:
            db.session.delete(payroll)


        db.session.commit()


        return jsonify({
            "message": f"Payroll periode {periode} berhasil dihapus",
            "periode": periode,
            "deleted": jumlah_dihapus
        }), 200


    except Exception as e:

        db.session.rollback()

        return jsonify({
            "message": f"Gagal menghapus payroll: {str(e)}"
        }), 500

@payroll_bp.route("/payroll/slip/<int:employee_id>")
def get_payroll_slip(employee_id):

    periode = request.args.get("periode")

    summaries = PayrollSummary.query.filter_by(
        periode=periode
    ).all()

    attendance_records = DailyAttendance.query.filter(
        DailyAttendance.date.like(f"{periode}-%")
    ).all()

    attendance_summary = {}

    for record in attendance_records:

        user_id = str(
            record.user_id
        ).strip()

        if user_id not in attendance_summary:

            attendance_summary[user_id] = {
                "H": 0,
                "T": 0,
                "S": 0,
                "A": 0,
                "L": 0
            }

        if record.status in attendance_summary[user_id]:

            attendance_summary[user_id][
                record.status
            ] += 1

    employees_data = []

    for s in summaries:

        emp = s.employee

        if not emp:
            continue

        # ======================================================
        # LIST PAYROLL ITEMS
        # ======================================================

        tunjangan_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in s.items
            if i.type == "tunjangan"
        ]

        bonus_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in s.items
            if i.type == "bonus"
        ]

        potongan_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in s.items
            if i.type == "potongan"
        ]

        # ======================================================
        # AMBIL REKAP ABSENSI EMPLOYEE
        # ======================================================

        emp_user_id = str(
            emp.user_id
        ).strip()

        att = attendance_summary.get(
            emp_user_id,
            {
                "H": 0,
                "T": 0,
                "S": 0,
                "A": 0,
                "L": 0
            }
        )

        # ======================================================
        # HITUNG PPH 21
        # ======================================================

        # pph21 = pph_21(
        #     s.thp,
        #     emp.married_status,
        #     emp.dependents
        # )

        # thp_after_tax = s.thp - pph21

        # ======================================================
        # DATA EMPLOYEE
        # ======================================================

        employees_data.append({
            "id": str(emp.id),
            "user_id": emp_user_id,
            "name": emp.name or "-",
            "position": emp.position or "-",
            "basic_salary": s.basic_salary,
            "thp": s.thp,
            "pph21": s.pph21,
            "kasbon": s.kasbon,
            "cicilan": s.cicilan,
            "thp_after_tax": s.thp_after_tax,
            "tunjanganList": tunjangan_list,
            "bonusList": bonus_list,
            "potonganList": potongan_list,
            "att": {
                "H": att["H"],
                "T": att["T"],
                "S": att["S"],
                "A": att["A"],
                "L": att["L"]
            }
        })

    
    employees_data.sort(
        key=lambda x: (
            (x["position"] or "-").lower(),
            (x["name"] or "-").lower()
        )
    )

    # ==========================================================
    # 6. RENDER
    # ==========================================================

    return jsonify(
        employees_json=employees_data,
    )