# from flask import Blueprint, jsonify, redirect, render_template, request, url_for

# from .extensions import db
# from .models import Employee, LogAbsensi
# from .services.attendance_service import fetch_attendance_from_machine

# main = Blueprint("main", __name__)


# def normalize_log_status(status):
#     if status is None:
#         return "H"

#     if isinstance(status, str):
#         status_text = status.strip().upper()
#         if status_text in ("H", "0"):
#             return "H"
#         if status_text == "T":
#             return "T"
#         if status_text == "S":
#             return "S"
#         return "A"

#     try:
#         status_value = int(status)
#     except (TypeError, ValueError):
#         return "A"

#     if status_value == 0:
#         return "H"
#     if status_value == 1:
#         return "T"
#     if status_value == 2:
#         return "S"
#     return "A"


# @main.route("/")
# def index():
#     return redirect(url_for("main.dashboard_page"))


# @main.route("/dashboard")
# def dashboard_page():
#     return render_template("index.html", active_page="dashboard")


# @main.route("/employees")
# def employees_page():
#     return render_template("index.html", active_page="karyawan")


# @main.route("/attendance")
# def attendance_page():
#     return render_template("index.html", active_page="kehadiran")


# @main.route("/payroll")
# def payroll_page():
#     return render_template("index.html", active_page="payroll")


# @main.route("/api/dashboard")
# def dashboard():
#     total_logs = LogAbsensi.query.count()

#     data = {
#         "summary": {
#             "total_employee": Employee.query.count(),
#             "total_payroll": 85000000,
#             "attendance_rate": 0,
#         },
#         "attendance": {
#             "hadir": total_logs,
#             "terlambat": 0,
#             "sakit": 0,
#             "absen": 0,
#         },
#         "payroll_chart": [0, 0, 0, 0, 0, 0],
#     }
#     return jsonify(data)


# @main.route("/api/employees", methods=["GET"])
# def get_employees():
#     employees = Employee.query.all()
#     return jsonify(
#         [
#             {
#                 "id": e.id,
#                 "employee_code": e.employee_code,
#                 "name": e.name,
#                 "nama": e.name,
#                 "position": e.position,
#                 "jabatan": e.position,
#                 "division": e.division,
#                 "divisi": e.division,
#                 "phone": e.phone,
#                 "wa": e.phone,
#                 "email": e.email,
#                 "basic_salary": e.basic_salary,
#                 "gapok": e.basic_salary,
#                 "allowance": e.allowance,
#                 "tunjangan": e.allowance,
#                 "status": e.status,
#                 "statusWA": "Belum Terkirim",
#                 "hadir": 0,
#                 "late": 0,
#                 "sakit": 0,
#                 "absen": 0,
#             }
#             for e in employees
#         ]
#     )


# @main.route("/api/employees", methods=["POST"])
# def add_employee():
#     data = request.get_json(silent=True) or {}
#     new_employee = Employee(
#         employee_code=data.get("employee_code"),
#         name=data.get("name"),
#         position=data.get("position"),
#         division=data.get("division"),
#         phone=data.get("phone"),
#         email=data.get("email"),
#         basic_salary=data.get("basic_salary", 0),
#         allowance=data.get("allowance", 0),
#     )
#     db.session.add(new_employee)
#     db.session.commit()
#     return jsonify({"message": "Data karyawan berhasil ditambahkan"}), 201


# @main.route("/api/employees/<int:id>", methods=["DELETE"])
# def delete_employee(id):
#     employee = Employee.query.get_or_404(id)
#     db.session.delete(employee)
#     db.session.commit()
#     return jsonify({"message": "Data karyawan berhasil dihapus"}), 200


# @main.route("/api/employees/<int:id>", methods=["PUT"])
# def update_employee(id):
#     employee = Employee.query.get_or_404(id)
#     data = request.get_json(silent=True) or {}
#     employee.employee_code = data.get("employee_code", employee.employee_code)
#     employee.name = data.get("name", employee.name)
#     employee.position = data.get("position", employee.position)
#     employee.division = data.get("division", employee.division)
#     employee.phone = data.get("phone", employee.phone)
#     employee.email = data.get("email", employee.email)
#     employee.basic_salary = data.get("basic_salary", employee.basic_salary)
#     employee.allowance = data.get("allowance", employee.allowance)
#     employee.status = data.get("status", employee.status)

#     db.session.commit()
#     return jsonify({"message": "Data karyawan berhasil diupdate"})


# @main.route("/api/tarik-manual", methods=["POST"])
# def tarik_manual():
#     fetch_attendance_from_machine()
#     return jsonify({"message": "Proses penarikan data selesai"}), 200


# @main.route("/api/logs", methods=["GET"])
# def get_logs():
#     logs = LogAbsensi.query.order_by(LogAbsensi.timestamp.desc()).limit(100).all()
#     data = [
#         {
#             "user_id": log.user_id,
#             "timestamp": log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
#             "status": log.status,
#         }
#         for log in logs
#     ]
#     return jsonify(data)


# @main.route("/api/seed")
# def seed():
#     if Employee.query.count() == 0:
#         db.session.add(
#             Employee(
#                 employee_code="EMP001",
#                 name="Budi",
#                 division="IT",
#                 position="Backend Developer",
#                 basic_salary=6000000,
#                 allowance=500000,
#                 phone="08123456789",
#                 email="budi@email.com",
#                 status="Aktif",
#             )
#         )
#         db.session.add(
#             Employee(
#                 employee_code="EMP002",
#                 name="Siti",
#                 division="HR",
#                 position="HR Staff",
#                 basic_salary=5500000,
#                 allowance=300000,
#                 phone="08111111111",
#                 email="siti@email.com",
#                 status="Aktif",
#             )
#         )
#         db.session.commit()

#     return "OK"


# @main.route("/api/attendance/update")
# def update_attendance():
#     # Tarik data terbaru dari mesin absensi ZKTeco terlebih dahulu
#     new_records = fetch_attendance_from_machine()

#     attendance_data = {}
#     logs = LogAbsensi.query.order_by(LogAbsensi.timestamp.desc()).limit(200).all()
#     for log in logs:
#         key = f"{log.user_id}_{log.timestamp.strftime('%Y-%m-%d')}"
#         attendance_data[key] = normalize_log_status(log.status)

#     print("Jumlah attendance_data:", len(attendance_data))

#     for i, (k, v) in enumerate(attendance_data.items()):
#         print(k, v)

#         if i >= 10:
#             break
#     return jsonify({"data": attendance_data, "new_records": new_records})
