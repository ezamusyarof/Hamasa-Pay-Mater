import datetime
from sqlite3 import IntegrityError
from flask import Blueprint, jsonify, request
from models import Employee, PayrollItem, PayrollSummary
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
    rate = float(data.get("rate", 0))
    qty = float(data.get("qty", 1))
    amount = float(data.get("amount", 0))

    print("TEST: ",item_type, "-", rate,"-",  qty,"-",  amount)

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
        "summary_id": summary.id,
        "total_tunjangan": total_tunjangan,
        "total_bonus": total_bonus,
        "total_potongan": total_potongan,
        "total_earning": summary.total_earning,
        "total_deduction": summary.total_deduction,
        "thp": summary.thp,
        "pph21": summary.pph21,
        "thp_after_tax": summary.thp_after_tax
    }), 200


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

            # Cek apakah payroll periode tersebut
            # sudah tersedia
            existing_summary = PayrollSummary.query.filter_by(
                employee_id=employee.id,
                periode=periode
            ).first()

            if existing_summary:
                skipped_count += 1
                continue


            basic_salary = float(employee.basic_salary or 0)


            # ==========================================
            # HITUNG PPH 21
            # ==========================================
            pph21 = pph_21(
                basic_salary,
                employee.gender,
                employee.married_status,
                employee.dependents
            )


            thp_after_tax = basic_salary - pph21


            # ==========================================
            # BUAT PAYROLL SUMMARY
            # ==========================================
            new_summary = PayrollSummary(
                employee_id=employee.id,
                periode=periode,

                basic_salary=basic_salary,

                total_earning=basic_salary,
                total_deduction=0,

                thp=basic_salary,

                pph21=pph21,
                thp_after_tax=thp_after_tax,

                status_wa="Pending"
            )

            db.session.add(new_summary)

            created_count += 1


        # ==========================================
        # COMMIT
        # ==========================================
        db.session.commit()


        return jsonify({
            "message": "Payroll berhasil dibuat",
            "periode": periode,
            "total_karyawan": len(employees),
            "created": created_count,
            "skipped": skipped_count
        }), 201


    except IntegrityError:

        db.session.rollback()

        return jsonify({
            "message": "Gagal membuat payroll karena terjadi duplikasi data"
        }), 409


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