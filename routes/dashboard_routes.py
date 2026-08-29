import calendar
import datetime

from flask import Blueprint, json, jsonify, request
from flask import render_template
from flask import redirect
from flask import url_for
from sqlalchemy import case, func
from extensions import db

from models import DailyAttendance, Employee, LogAbsensi, PayrollSummary
from services.helper_service import format_periode
from services.payroll_service import pph_21

from routes.user_routes import login_required

dashboard_bp = Blueprint(
    "dashboard",
    __name__
)

@dashboard_bp.route("/")
def index():
    return redirect(url_for("dashboard.dashboard_page"))

@dashboard_bp.route("/login")
def login_page():
    return render_template("login.html")

@dashboard_bp.route("/dashboard")
@login_required
def dashboard_page():
    today = datetime.date.today()

    # ==========================================================
    # 1. AMBIL PERIODE DARI QUERY PARAMETER (Default: Bulan Ini)
    # ==========================================================
    periode_param = request.args.get("periode", today.strftime("%Y-%m"))

    try:
        current_year, current_month = map(int, periode_param.split("-"))
        periode_raw = periode_param
    except ValueError:
        current_year, current_month = today.year, today.month
        periode_raw = today.strftime("%Y-%m")

    # Hitung total hari dalam bulan terpilih
    total_days = calendar.monthrange(current_year, current_month)[1]
    month = list(range(1, total_days + 1))

    # ==========================================================
    # 1. TOTAL KARYAWAN
    # ==========================================================
    total_employee = db.session.query(
        db.func.count(Employee.id)
    ).scalar() or 0

    # ==========================================================
    # 2. PAYROLL BULAN TERPILIH
    # ==========================================================
    total_payroll = db.session.query(
        db.func.coalesce(
            db.func.sum(PayrollSummary.thp),
            0
        )
    ).filter(
        PayrollSummary.periode == periode_raw
    ).scalar()

    # ==========================================================
    # 3. ABSENSI BULAN TERPILIH
    # ==========================================================
    month_start = f"{periode_raw}-01"
    month_end = f"{periode_raw}-{total_days:02d}"

    attendance_counts = db.session.query(
        DailyAttendance.status,
        db.func.count(DailyAttendance.id)
    ).join(
        Employee,
        Employee.user_id == DailyAttendance.user_id
    ).filter(
        DailyAttendance.date >= month_start,
        DailyAttendance.date <= month_end
    ).group_by(
        DailyAttendance.status
    ).all()

    attendance = {
        "H": 0,
        "T": 0,
        "S": 0,
        "A": 0,
        "L": 0
    }

    for status, count in attendance_counts:
        if status in attendance:
            attendance[status] = count

    total_hadir = attendance["H"]
    total_terlambat = attendance["T"]
    total_sakit = attendance["S"]
    total_alpha = attendance["A"]
    total_lembur = attendance["L"]

    total_attendance = sum(attendance.values())

    # H + T dianggap hadir
    effective_hadir = total_hadir + total_terlambat

    attendance_rate = (
        effective_hadir / total_attendance * 100
        if total_attendance
        else 0
    )

    # ==========================================================
    # 4. ABSENSI HARI INI (Selalu mengambil data tanggal hari ini)
    # ==========================================================
    today_str = today.strftime("%Y-%m-%d")

    today_counts = db.session.query(
        DailyAttendance.status,
        db.func.count(DailyAttendance.id)
    ).join(
        Employee,
        Employee.user_id == DailyAttendance.user_id
    ).filter(
        DailyAttendance.date == today_str
    ).group_by(
        DailyAttendance.status
    ).all()

    today_attendance = {
        "H": 0,
        "T": 0,
        "S": 0,
        "A": 0,
        "L": 0
    }

    for status, count in today_counts:
        if status in today_attendance:
            today_attendance[status] = count

    today_hadir = today_attendance["H"]
    today_terlambat = today_attendance["T"]
    today_sakit = today_attendance["S"]
    today_alpha = today_attendance["A"]
    today_lembur = today_attendance["L"]

    # ==========================================================
    # 5. TREN GAJI 6 BULAN (Mundur 6 bulan dari periode terpilih)
    # ==========================================================
    payroll_chart = []

    for i in range(5, -1, -1):
        # Hitung tahun dan bulan secara presisi
        m = current_month - i
        y = current_year
        while m <= 0:
            m += 12
            y -= 1

        target_periode = f"{y:04d}-{m:02d}"

        total = db.session.query(
            db.func.coalesce(
                db.func.sum(PayrollSummary.thp),
                0
            )
        ).filter(
            PayrollSummary.periode == target_periode
        ).scalar()

        payroll_chart.append({
            "periode": target_periode,
            "total": total
        })

    # ==========================================================
    # 6. RETURN TEMPLATE
    # ==========================================================
    return render_template(
        "dashboard.html",

        # Basic
        total_employee=total_employee,
        total_payroll=total_payroll,

        # Attendance bulan terpilih
        total_hadir=total_hadir,
        total_terlambat=total_terlambat,
        total_sakit=total_sakit,
        total_alpha=total_alpha,
        total_lembur=total_lembur,
        attendance_rate=round(attendance_rate, 1),

        # Attendance hari ini
        today_hadir=today_hadir,
        today_terlambat=today_terlambat,
        today_sakit=today_sakit,
        today_alpha=today_alpha,
        today_lembur=today_lembur,

        # Chart
        payroll_chart=payroll_chart,

        # Calendar & Filter
        month=month,
        year=current_year,
        month_number=f"{current_month:02d}",
        periode_raw=periode_raw,
        periode=format_periode(periode_raw)
    )

@dashboard_bp.route("/api/dashboard")
@login_required
def dashboard():
    total_logs = LogAbsensi.query.count()

    data = {
        "summary": {
            "total_employee": Employee.query.count(),
            "total_payroll": 85000000,
            "attendance_rate": 0,
        },
        "attendance": {
            "hadir": total_logs,
            "terlambat": 0,
            "sakit": 0,
            "absen": 0,
        },
        "payroll_chart": [0, 0, 0, 0, 0, 0],
    }
    return jsonify(data)

@dashboard_bp.route("/employees")
@login_required
def employees_page():
    today = datetime.date.today()
    periode_param = request.args.get("periode", today.strftime("%Y-%m"))
    
    try:
        periode_raw = periode_param
    except ValueError:
        periode_raw = today.strftime("%Y-%m")

    employees = Employee.query.order_by(
        # Employee.position.asc(),
        Employee.name.asc()
    ).all()

    for employee in employees:
        status = "K" if employee.married_status else "TK"
        dependents = min(employee.dependents or 0, 3)
        employee.ptkp = f"{status}/{dependents}"

    return render_template(
        "employees.html",
        employees=employees,
        periode_raw=periode_raw
    )

@dashboard_bp.route("/attendance")
@login_required
def attendance_page():
    today = datetime.date.today()

    # =========================================================
    # 0. AMBIL PERIODE DARI QUERY PARAMETER (Default: Bulan Ini)
    # =========================================================
    periode_param = request.args.get("periode", today.strftime("%Y-%m"))

    try:
        year, month_number = map(int, periode_param.split("-"))
        periode_raw = periode_param
    except ValueError:
        year, month_number = today.year, today.month
        periode_raw = today.strftime("%Y-%m")

    # =========================================================
    # 1. DAFTAR HARI DALAM BULAN TERPILIH
    # =========================================================

    total_days = calendar.monthrange(year, month_number)[1]

    month = list(range(1, total_days + 1))

    start_date = f"{year:04d}-{month_number:02d}-01"
    end_date = f"{year:04d}-{month_number:02d}-{total_days:02d}"

    # =========================================================
    # 2. AMBIL EMPLOYEE + REKAP ATTENDANCE
    # =========================================================

    attendance_summary = (
        db.session.query(
            Employee.id,
            Employee.user_id,
            Employee.name,

            func.sum(
                case(
                    (DailyAttendance.status == "H", 1),
                    else_=0
                )
            ).label("hadir"),

            func.sum(
                case(
                    (DailyAttendance.status == "T", 1),
                    else_=0
                )
            ).label("terlambat"),

            func.sum(
                case(
                    (DailyAttendance.status == "S", 1),
                    else_=0
                )
            ).label("sakit"),

            func.sum(
                case(
                    (DailyAttendance.status == "A", 1),
                    else_=0
                )
            ).label("alpha"),

            func.sum(
                case(
                    (DailyAttendance.status == "L", 1),
                    else_=0
                )
            ).label("lembur"),
        )
        .outerjoin(
            DailyAttendance,
            (
                (Employee.user_id == DailyAttendance.user_id)
                &
                (DailyAttendance.date >= start_date)
                &
                (DailyAttendance.date <= end_date)
            )
        )
        .filter(Employee.status == "Aktif")
        .group_by(
            Employee.id,
            Employee.user_id,
            Employee.name
        )
        .order_by(Employee.name)
        .all()
    )

    # =========================================================
    # 3. BENTUK DATA EMPLOYEES
    # =========================================================

    employees = []

    for row in attendance_summary:
        employees.append({
            "id": row.id,
            "user_id": row.user_id,
            "name": row.name,

            "hadir": row.hadir or 0,
            "terlambat": row.terlambat or 0,
            "sakit": row.sakit or 0,
            "alpha": row.alpha or 0,
            "lembur": row.lembur or 0,
        })

    # =========================================================
    # 4. AMBIL DATA DETAIL ATTENDANCE
    # =========================================================

    attendance_data = (
        DailyAttendance.query
        .filter(
            DailyAttendance.date >= start_date,
            DailyAttendance.date <= end_date
        )
        .all()
    )

    # =========================================================
    # 5. BUAT MATRIX ATTENDANCE
    # =========================================================

    attendance_matrix = {}

    for emp in employees:
        user_id = emp["user_id"]
        attendance_matrix[user_id] = {}
        for day in month:
            attendance_matrix[user_id][day] = "-"

    for att in attendance_data:
        try:
            day = int(att.date.split("-")[2])
        except (ValueError, IndexError):
            continue

        if att.user_id in attendance_matrix:
            attendance_matrix[att.user_id][day] = att.status

    # =========================================================
    # 6. KIRIM KE TEMPLATE
    # =========================================================

    return render_template(
        "attendance.html",
        employees=employees,
        month=month,
        attendance_matrix=attendance_matrix,
        year=year,
        month_number=str(month_number).zfill(2),
        periode_raw=periode_raw,
        periode=format_periode(periode_raw)
    )

@dashboard_bp.route("/attendance/time")
@login_required
def attendance_time_page():
    today = datetime.date.today()

    # =========================================================
    # 0. AMBIL PERIODE DARI QUERY PARAMETER (Default: Bulan Ini)
    # =========================================================
    periode_param = request.args.get("periode", today.strftime("%Y-%m"))

    try:
        year, month_number = map(int, periode_param.split("-"))
        periode_raw = periode_param
    except ValueError:
        year, month_number = today.year, today.month
        periode_raw = today.strftime("%Y-%m")

    # =========================================================
    # 1. DAFTAR HARI DALAM BULAN TERPILIH
    # =========================================================

    total_days = calendar.monthrange(year, month_number)[1]

    month = list(range(1, total_days + 1))

    start_date = f"{year:04d}-{month_number:02d}-01"
    end_date = f"{year:04d}-{month_number:02d}-{total_days:02d}"

    # =========================================================
    # 2. AMBIL EMPLOYEE + REKAP ATTENDANCE
    # =========================================================

    attendance_summary = (
        db.session.query(
            Employee.id,
            Employee.user_id,
            Employee.name,

            func.sum(
                case(
                    (DailyAttendance.status == "H", 1),
                    else_=0
                )
            ).label("hadir"),

            func.sum(
                case(
                    (DailyAttendance.status == "T", 1),
                    else_=0
                )
            ).label("terlambat"),

            func.sum(
                case(
                    (DailyAttendance.status == "S", 1),
                    else_=0
                )
            ).label("sakit"),

            func.sum(
                case(
                    (DailyAttendance.status == "A", 1),
                    else_=0
                )
            ).label("alpha"),

            func.sum(
                case(
                    (DailyAttendance.status == "L", 1),
                    else_=0
                )
            ).label("lembur"),
        )
        .outerjoin(
            DailyAttendance,
            (
                (Employee.user_id == DailyAttendance.user_id)
                &
                (DailyAttendance.date >= start_date)
                &
                (DailyAttendance.date <= end_date)
            )
        )
        .filter(Employee.status == "Aktif")
        .group_by(
            Employee.id,
            Employee.user_id,
            Employee.name
        )
        .order_by(Employee.name)
        .all()
    )

    # =========================================================
    # 3. BENTUK DATA EMPLOYEES
    # =========================================================

    employees = []

    for row in attendance_summary:
        employees.append({
            "id": row.id,
            "user_id": row.user_id,
            "name": row.name,

            "hadir": row.hadir or 0,
            "terlambat": row.terlambat or 0,
            "sakit": row.sakit or 0,
            "alpha": row.alpha or 0,
            "lembur": row.lembur or 0,
        })

    # =========================================================
    # 4. AMBIL DATA DETAIL ATTENDANCE
    # =========================================================

    attendance_data = (
        DailyAttendance.query
        .filter(
            DailyAttendance.date >= start_date,
            DailyAttendance.date <= end_date
        )
        .all()
    )

    # =========================================================
    # 5. BUAT MATRIX ATTENDANCE (CHECKIN-CHECKOUT)
    # =========================================================

    attendance_matrix = {}

    for emp in employees:
        user_id = emp["user_id"]
        attendance_matrix[user_id] = {}
        for day in month:
            attendance_matrix[user_id][day] = {
                "status": "-",
                "checkin":"00:00",
                "checkout": "00:00"
            }

    for att in attendance_data:
        try:
            day = int(att.date.split("-")[2])
        except (ValueError, IndexError):
            continue

        if att.user_id in attendance_matrix:            
            attendance_matrix[att.user_id][day] = {
                "status": att.status or "-",
                "checkin": att.checkin or "00:00",
                "checkout": att.checkout or "00:00"
            }

    # =========================================================
    # 6. KIRIM KE TEMPLATE
    # =========================================================

    return render_template(
        "attendance_time.html",
        employees=employees,
        month=month,
        attendance_matrix=attendance_matrix,
        year=year,
        month_number=str(month_number).zfill(2),
        periode_raw=periode_raw,
        periode=format_periode(periode_raw),
        tes=attendance_data
    )

@dashboard_bp.route("/attendance/detail")
@login_required
def attendance_detail_page():
    today = datetime.date.today()

    # =========================================================
    # 0. AMBIL PERIODE DARI QUERY PARAMETER (Default: Bulan Ini)
    # =========================================================
    periode_param = request.args.get("periode", today.strftime("%Y-%m"))

    try:
        year, month_number = map(int, periode_param.split("-"))
        periode_raw = periode_param
    except ValueError:
        year, month_number = today.year, today.month
        periode_raw = today.strftime("%Y-%m")

    # =========================================================
    # 1. DAFTAR HARI DALAM BULAN TERPILIH
    # =========================================================

    total_days = calendar.monthrange(year, month_number)[1]

    month = list(range(1, total_days + 1))

    start_date = f"{year:04d}-{month_number:02d}-01"
    end_date = f"{year:04d}-{month_number:02d}-{total_days:02d}"

    # =========================================================
    # 2. AMBIL EMPLOYEE + REKAP ATTENDANCE
    # =========================================================

    attendance_summary = (
        db.session.query(
            Employee.id,
            Employee.user_id,
            Employee.name,

            func.sum(
                case(
                    (DailyAttendance.status == "H", 1),
                    else_=0
                )
            ).label("hadir"),

            func.sum(
                case(
                    (DailyAttendance.status == "T", 1),
                    else_=0
                )
            ).label("terlambat"),

            func.sum(
                case(
                    (DailyAttendance.status == "S", 1),
                    else_=0
                )
            ).label("sakit"),

            func.sum(
                case(
                    (DailyAttendance.status == "A", 1),
                    else_=0
                )
            ).label("alpha"),

            func.sum(
                case(
                    (DailyAttendance.status == "L", 1),
                    else_=0
                )
            ).label("lembur"),
        )
        .outerjoin(
            DailyAttendance,
            (
                (Employee.user_id == DailyAttendance.user_id)
                &
                (DailyAttendance.date >= start_date)
                &
                (DailyAttendance.date <= end_date)
            )
        )
        .filter(Employee.status == "Aktif")
        .group_by(
            Employee.id,
            Employee.user_id,
            Employee.name
        )
        .order_by(Employee.name)
        .all()
    )

    # =========================================================
    # 3. BENTUK DATA EMPLOYEES
    # =========================================================

    employees = []

    for row in attendance_summary:
        employees.append({
            "id": row.id,
            "user_id": row.user_id,
            "name": row.name,

            "hadir": row.hadir or 0,
            "terlambat": row.terlambat or 0,
            "sakit": row.sakit or 0,
            "alpha": row.alpha or 0,
            "lembur": row.lembur or 0,
        })

    # =========================================================
    # 4. AMBIL DATA DETAIL ATTENDANCE
    # =========================================================

    attendance_data = (
        DailyAttendance.query
        .filter(
            DailyAttendance.date >= start_date,
            DailyAttendance.date <= end_date
        )
        .all()
    )

    # =========================================================
    # 5. BUAT MATRIX ATTENDANCE
    # =========================================================

    attendance_matrix = {}

    for emp in employees:
        user_id = emp["user_id"]
        attendance_matrix[user_id] = {}
        for day in month:
            attendance_matrix[user_id][day] = "-"

    for att in attendance_data:
        try:
            day = int(att.date.split("-")[2])
        except (ValueError, IndexError):
            continue

        if att.user_id in attendance_matrix:
            attendance_matrix[att.user_id][day] = att.status

    # =========================================================
    # 6. KIRIM KE TEMPLATE
    # =========================================================

    return render_template(
        "attendance_detail.html",
        employees=employees,
        month=month,
        attendance_matrix=attendance_matrix,
        year=year,
        month_number=str(month_number).zfill(2),
        periode_raw=periode_raw,
        periode=format_periode(periode_raw),
        tes=attendance_data
    )

@dashboard_bp.route("/payroll")
@login_required
def payroll_page():
    # ==========================================================
    # 1. AMBIL PERIODE DARI QUERY PARAMETER (Default: Bulan Ini)
    # ==========================================================
    periode = request.args.get(
        "periode",
        datetime.date.today().strftime("%Y-%m")
    )

    # Ekstrak year dan month_number dari variabel `periode`
    try:
        year, month_number = map(int, periode.split("-"))
    except ValueError:
        today = datetime.date.today()
        year, month_number = today.year, today.month
        periode = today.strftime("%Y-%m")

    # =========================================================
    # 2. DAFTAR HARI DALAM BULAN (Sesuai Periode Terpilih)
    # =========================================================
    total_days = calendar.monthrange(year, month_number)[1]
    month = list(range(1, total_days + 1))

    # ==========================================================
    # 3. AMBIL PAYROLL SUMMARY
    # ==========================================================
    summaries = PayrollSummary.query.filter_by(
        periode=periode
    ).all()

    # ==========================================================
    # 4. AMBIL SEMUA DAILY ATTENDANCE PERIODE INI
    # ==========================================================
    attendance_records = DailyAttendance.query.filter(
        DailyAttendance.date.like(f"{periode}-%")
    ).all()

    # ==========================================================
    # 4. GROUPING ABSENSI PER USER
    #
    # {
    #     "55": {
    #         "H": 10,
    #         "T": 2,
    #         "S": 0,
    #         "A": 1
    #     }
    # }
    # ==========================================================

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

    # ==========================================================
    # 5. BUAT DATA UNTUK TEMPLATE
    # ==========================================================

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
            "phone": emp.phone or "",
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
            # (x["position"] or "-").lower(),
            (x["name"] or "-").lower()
        )
    )

    # ==========================================================
    # 6. RENDER
    # ==========================================================

    return render_template(
        "payroll.html",
        employees_json=employees_data,
        periode=periode,
        month=month,
        year=year,
        month_number=str(month_number).zfill(2),
    )