import datetime
from sqlite3 import IntegrityError
from models import Employee, PayrollItem, PayrollSummary
from flask import Blueprint, jsonify, request
from routes.user_routes import login_required
from services.attendance_service import process_attendance_recap_incremental
from services.payroll_service import calculate_employee_payroll, pph_21
from extensions import db

employee_bp = Blueprint(
    "employee",
    __name__,
    url_prefix="/api/employees"
)

@employee_bp.route("", methods=["GET"])
@login_required
def get_employees():
    periode = request.args.get(
        "periode",
        datetime.date.today().strftime("%Y-%m")
    )

    employee_id = request.args.get("id")

    if employee_id:
        employees = Employee.query.filter_by(id=employee_id).all()
    else:
        employees = Employee.query.all()

    data = []

    for emp in employees:
        calc_result = calculate_employee_payroll(emp, periode)

        summary = PayrollSummary.query.filter_by(
            employee_id=emp.id,
            periode=periode
        ).first()

        tunjangan_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in summary.items
            if i.type == "tunjangan"
        ] if summary else []

        bonus_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in summary.items
            if i.type == "bonus"
        ] if summary else []

        potongan_list = [
            {
                "id": i.id,
                "name": i.name,
                "amount": i.amount
            }
            for i in summary.items
            if i.type == "potongan"
        ] if summary else []

        emp_data = {
            "id": str(emp.id),
            "user_id": str(getattr(emp, "user_id", emp.id)),
            "name": emp.name or "-",
            "position": emp.position or "-",
            "phone": getattr(emp, "phone", "") or "",
            "email": getattr(emp, "email", "") or "",
            "gender": getattr(emp, "gender", "") or "",
            "married_status": getattr(emp, "married_status", "") or "",
            "dependents": getattr(emp, "dependents", "") or "",
            "basic_salary": getattr(emp, "basic_salary", "") or "",
            # "basic_salary": getattr(
            #     calc_result,
            #     "basic_salary",
            #     getattr(emp, "basic_salary", 0)
            # ),
            "thp": getattr(calc_result, "thp", 0),

            "tunjanganList": tunjangan_list,
            "bonusList": bonus_list,
            "potonganList": potongan_list,

            "att": {
                "H": getattr(emp, "hadir", 0),
                "T": getattr(emp, "terlambat", 0),
                "S": getattr(emp, "sakit", 0),
                "A": getattr(emp, "alpha", 0)
            }
        }

        data.append(emp_data)

    return jsonify(data)

@employee_bp.route("", methods=["POST"])
@login_required
def add_employee():
    data = request.get_json(silent=True) or {}
    user_id = (data.get("user_id") or "").strip()

    if not user_id:
        return jsonify({
            "message": "ID Karyawan wajib diisi"
        }), 400

    if Employee.query.filter_by(user_id=user_id).first():
        return jsonify({
            "message": f"ID Karyawan '{user_id}' sudah digunakan."
        }), 409

    basic_salary = float(data.get("basic_salary", 0)) or 0

    periode = datetime.date.today().strftime("%Y-%m")

    new_employee = Employee(
        user_id=user_id,
        name=data.get("name"),
        position=data.get("position"),
        gender=data.get("gender"),
        married_status=data.get("married_status"),
        dependents=data.get("dependents"),
        phone=data.get("phone"),
        email=data.get("email"),
        basic_salary=basic_salary,
    )

    db.session.add(new_employee)

    try:
        db.session.flush()

        pph21 = pph_21(
            new_employee.basic_salary,
            new_employee.gender,
            new_employee.married_status,
            new_employee.dependents
        )

        thp_after_tax = basic_salary - pph21

        # Buat payroll summary awal
        new_summary = PayrollSummary(
            employee_id=new_employee.id,
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

        db.session.commit()

        # ==============================
        # REKAP ABSENSI KARYAWAN BARU
        # ==============================
        process_attendance_recap_incremental(periode)

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "message": "Terjadi duplikasi ID Karyawan"
        }), 409

    except Exception as e:
        db.session.rollback()

        return jsonify({
            "message": f"Karyawan berhasil dibuat, tetapi rekap absensi gagal: {str(e)}"
        }), 500

    return jsonify({
        "message": "Data karyawan, payroll, dan absensi berhasil dibuat",
        "employee_id": new_employee.id,
        "periode": periode
    }), 201

@employee_bp.route("/<int:id>", methods=["PUT"])
@login_required
def update_employee(id):

    employee = Employee.query.get_or_404(id)
    data = request.get_json(silent=True) or {}

    # ==========================================================
    # USER ID TIDAK BOLEH DIUBAH
    # ==========================================================

    user_id = employee.user_id

    # ==========================================================
    # CEK PERUBAHAN GAJI
    # ==========================================================

    old_basic_salary = employee.basic_salary or 0

    new_basic_salary = data.get(
        "basic_salary",
        old_basic_salary
    ) or 0

    try:
        new_basic_salary = float(new_basic_salary)

    except (ValueError, TypeError):

        return jsonify({
            "message": "Gaji pokok harus berupa angka."
        }), 400


    try:

        # ======================================================
        # UPDATE DATA EMPLOYEE
        # ======================================================

        employee.name = data.get(
            "name",
            employee.name
        )

        employee.position = data.get(
            "position",
            employee.position
        )

        employee.phone = data.get(
            "phone",
            employee.phone
        )

        employee.gender = data.get(
            "gender",
            employee.gender
        )

        employee.married_status = data.get(
            "married_status",
            employee.married_status
        )

        employee.dependents = data.get(
            "dependents",
            employee.dependents
        )

        employee.email = data.get(
            "email",
            employee.email
        )

        employee.status = data.get(
            "status",
            employee.status
        )

        employee.basic_salary = new_basic_salary


        # ======================================================
        # HAPUS PAYROLL PERIODE BERJALAN
        # ======================================================

        periode = datetime.date.today().strftime("%Y-%m")

        summary = PayrollSummary.query.filter_by(
            employee_id=employee.id,
            periode=periode
        ).first()

        if summary:

            # Hapus semua item payroll lama
            PayrollItem.query.filter_by(
                payroll_summary_id=summary.id
            ).delete(
                synchronize_session=False
            )

            # Hapus summary lama
            db.session.delete(summary)

            db.session.flush()


        # ======================================================
        # BUAT PAYROLL BARU
        # ======================================================

        summary = PayrollSummary(
            employee_id=employee.id,
            periode=periode,
            basic_salary=new_basic_salary,
            total_earning=new_basic_salary,
            total_deduction=0,
            thp=new_basic_salary,
            status_wa="Pending"
        )

        summary.pph21 = pph_21(
            summary.thp,
            employee.gender,
            employee.married_status,
            employee.dependents
        )

        summary.thp_after_tax = (
            summary.thp - summary.pph21
        )

        db.session.add(summary)


        # ======================================================
        # SIMPAN
        # ======================================================

        db.session.commit()

        return jsonify({
            "message": "Data karyawan berhasil diupdate dan payroll direset."
        }), 200


    except IntegrityError:

        db.session.rollback()

        return jsonify({
            "message": "Terjadi error integritas data."
        }), 409


    except Exception as e:

        db.session.rollback()

        return jsonify({
            "message": f"Gagal mengupdate data karyawan: {str(e)}"
        }), 500


@employee_bp.route("/<int:id>", methods=["DELETE"])
@login_required
def delete_employee(id):
    employee = Employee.query.get_or_404(id)

    # Hapus payroll items melalui summary
    summaries = PayrollSummary.query.filter_by(
        employee_id=employee.id
    ).all()

    for summary in summaries:
        PayrollItem.query.filter_by(
            payroll_summary_id=summary.id
        ).delete()

        db.session.delete(summary)

    # Hapus employee
    db.session.delete(employee)

    db.session.commit()

    return jsonify({
        "message": "Data karyawan dan payroll berhasil dihapus"
    }), 200