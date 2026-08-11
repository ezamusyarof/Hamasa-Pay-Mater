import calendar
import datetime
import json
import os
import sys
from logging import log
from pprint import pprint

from flask import Flask, jsonify, redirect, render_template, request, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import extract, func
from sqlalchemy.exc import IntegrityError
from zk import ZK
from zk.exception import ZKErrorResponse, ZKNetworkError

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def resource_path(relative_path):
    if getattr(sys, "frozen", False):
        base_path = sys._MEIPASS
    else:
        base_path = BASE_DIR
    return os.path.join(base_path, relative_path)


app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
    instance_relative_config=True,
)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'absensi.db')}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["DEVICE_IP"] = os.getenv("DEVICE_IP", "192.168.1.201")
app.config["DEVICE_PORT"] = int(os.getenv("DEVICE_PORT", "4370"))
app.config["DEVICE_PASSWORD"] = int(os.getenv("DEVICE_PASSWORD", "12345"))
app.config["ATTENDANCE_DEADLINE"] = os.getenv("ATTENDANCE_DEADLINE", "07:15:00")
app.config["ATTENDANCE_START_TIME"] = os.getenv("ATTENDANCE_START_TIME", "00:00:00")
app.config["ATTENDANCE_END_TIME"] = os.getenv("ATTENDANCE_EN_TIME", "23:59:00")

db = SQLAlchemy(app)


# =========================================================================
# MODEL DATABASE SQLALCHEMY
# =========================================================================


class LogAbsensi(db.Model):
    __tablename__ = "log_absensi"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), nullable=False)  # ID dari mesin
    timestamp = db.Column(db.DateTime, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "timestamp", name="_user_time_uc"),
    )


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), unique=True, nullable=False)  # ID Mesin
    name = db.Column(db.String(100))
    position = db.Column(db.String(100))
    division = db.Column(db.String(100))
    basic_salary = db.Column(db.Float, default=0)
    allowance = db.Column(db.Float, default=0)
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100))
    status = db.Column(db.String(20), default="Aktif")

    # Relasi ke komponen payroll karyawan
    components = db.relationship(
        "EmployeePayrollComponent",
        backref="employee",
        cascade="all, delete-orphan",
    )


class DailyAttendance(db.Model):
    __tablename__ = "daily_attendance"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False)  # ID Karyawan (mesin)
    date = db.Column(db.String(10), nullable=False)  # Format YYYY-MM-DD
    status = db.Column(
        db.String(5), nullable=False
    )  # H (Hadir), T (Terlambat), S (Sakit), A (Alpha), L (Lembur)
    checkin = db.Column(db.String(8), nullable=True)  # HH:MM:SS
    checkout = db.Column(db.String(8), nullable=True)  # HH:MM:SS
    is_manual = db.Column(db.Boolean, default=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "date", name="_user_date_uc"),
    )


# --- DYNAMIC PAYROLL ENGINE MODELS ---


class PayrollTemplate(db.Model):
    """Master Template Komponen Payroll (Universal & Reusable)"""

    __tablename__ = "payroll_templates"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # Nama Komponen
    type = db.Column(
        db.String(20), nullable=False
    )  # 'tunjangan', 'bonus', 'potongan'
    formula = db.Column(
        db.String(255), nullable=False
    )  # Rumus String (Contoh: '(BASIC_SALARY / 30) * A')
    default_nominal = db.Column(db.Float, default=0.0)  # Rate dasar/default

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "formula": self.formula,
            "default_nominal": self.default_nominal,
        }


class EmployeePayrollComponent(db.Model):
    """Pemetaan Komponen yang Dipasangkan pada Karyawan"""

    __tablename__ = "employee_payroll_components"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    template_id = db.Column(
        db.Integer,
        db.ForeignKey("payroll_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    custom_nominal = db.Column(
        db.Float, nullable=True
    )  # Override nominal jika khusus (kasbon/jabatan)

    template = db.relationship("PayrollTemplate")


class Payroll(db.Model):
    __tablename__ = "payrolls"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    month = db.Column(db.Integer)
    year = db.Column(db.Integer)
    basic_salary = db.Column(db.Float, default=0)
    allowance = db.Column(db.Float, default=0)
    deductions = db.Column(db.Float, default=0)
    total_salary = db.Column(db.Float, default=0)


# =========================================================================
# HELPER FORMULA EVALUATOR & PAYROLL CALCULATOR
# =========================================================================


def evaluate_formula(formula_str, variables):
    """Evaluasi rumus matematika dinamis dengan konteks variabel terisolasi (Safe Scope)"""
    try:
        safe_dict = {
            "BASIC_SALARY": float(variables.get("BASIC_SALARY", 0)),
            "H": float(variables.get("H", 0)),
            "L": float(variables.get("L", 0)),
            "A": float(variables.get("A", 0)),
            "T": float(variables.get("T", 0)),
            "S": float(variables.get("S", 0)),
            "NOMINAL": float(variables.get("NOMINAL", 0)),
        }
        # Eksekusi evaluasi matematika murni tanpa modul/fungsi built-in berbahaya
        res = eval(formula_str, {"__builtins__": None}, safe_dict)
        return float(res) if res is not None else 0.0
    except Exception as e:
        print(f"Error evaluasi rumus '{formula_str}': {e}")
        return 0.0


def calculate_employee_payroll(employee, periode=None):
    """Mengkalkulasi total rekap presensi dan seluruh rincian payroll karyawan"""
    if not periode:
        periode = datetime.date.today().strftime("%Y-%m")

    # 1. Hitung rekap kehadiran dari tabel DailyAttendance
    attendances = DailyAttendance.query.filter(
        DailyAttendance.user_id == str(employee.user_id),
        DailyAttendance.date.like(f"{periode}-%"),
    ).all()

    att_summary = {"H": 0, "L": 0, "A": 0, "T": 0, "S": 0}
    for att in attendances:
        st = att.status.upper()
        if st in att_summary:
            att_summary[st] += 1

    # 2. Kalkulasi setiap komponen payroll karyawan berdasarkan rumus
    tunjangan_list = []
    bonus_list = []
    potongan_list = []

    for comp in employee.components:
        tmpl = comp.template
        if not tmpl:
            continue

        # Tentukan nominal rate (pakai custom_nominal jika ada, atau default_nominal)
        rate = (
            comp.custom_nominal
            if comp.custom_nominal is not None
            else tmpl.default_nominal
        )

        vars_dict = {
            "BASIC_SALARY": employee.basic_salary or 0,
            "H": att_summary["H"],
            "L": att_summary["L"],
            "A": att_summary["A"],
            "T": att_summary["T"],
            "S": att_summary["S"],
            "NOMINAL": rate,
        }

        calc_amount = round(evaluate_formula(tmpl.formula, vars_dict))

        item_data = {
            "id": comp.id,  # ID relasi employee_payroll_components untuk hapus data
            "template_id": tmpl.id,
            "name": tmpl.name,
            "amount": calc_amount,
            "custom_nominal": rate,
        }

        if tmpl.type == "tunjangan":
            tunjangan_list.append(item_data)
        elif tmpl.type == "bonus":
            bonus_list.append(item_data)
        elif tmpl.type == "potongan":
            potongan_list.append(item_data)

    return {
        "id": employee.id,
        "user_id": employee.user_id,
        "name": employee.name or "-",
        "position": employee.position or "-",
        "division": employee.division or "-",
        "phone": employee.phone or "-",
        "email": employee.email or "-",
        "basic_salary": employee.basic_salary or 0,
        "status": employee.status or "Aktif",
        "tunjanganList": tunjangan_list,
        "bonusList": bonus_list,
        "potonganList": potongan_list,
        "att": att_summary,
    }

def fetch_attendance_from_machine():
    print(f"[{datetime.datetime.now()}] Menghubungkan ke mesin absensi...")
    zk = ZK(
        app.config["DEVICE_IP"],
        port=app.config["DEVICE_PORT"],
        password=app.config["DEVICE_PASSWORD"],
        timeout=10,
    )

    new_records = 0
    try:
        conn = zk.connect()
        conn.disable_device()

        latest_log = LogAbsensi.query.order_by(
            LogAbsensi.timestamp.desc()
        ).first()
        last_timestamp = latest_log.timestamp if latest_log else None

        attendances = conn.get_attendance()
        for record in attendances:
            if last_timestamp and record.timestamp <= last_timestamp:
                continue

            db.session.add(
                LogAbsensi(
                    user_id=str(record.user_id),
                    timestamp=record.timestamp,
                )
            )
            new_records += 1  # <-- Perbaikan baris yang terputus

        db.session.commit()
        conn.enable_device()
        conn.disconnect()
        print(f"[{datetime.datetime.now()}] Berhasil menarik {new_records} log absensi baru.")
        return new_records

    except (ZKNetworkError, ZKErrorResponse, Exception) as e:
        print(f"[{datetime.datetime.now()}] Gagal terhubung ke mesin absensi: {e}")
        db.session.rollback()
        return 0

def process_attendance_recap_incremental(periode=None):
    """
    Kalkulasi dari LogAbsensi ke DailyAttendance.
    - Mengambil tanggal TERAKHIR di DailyAttendance sebagai titik awal (start_date).
    - Menjaga record yang diubah manual (is_manual == True) agar TIDAK tertimpa.
    """
    today = datetime.date.today()
    if not periode:
        periode = today.strftime("%Y-%m")

    year, month = map(int, periode.split("-"))
    days_in_month = calendar.monthrange(year, month)[1]

    # Deadline keterlambatan dari app config (default 08:00:00)
    deadline_str = app.config.get("ATTENDANCE_DEADLINE", "08:00:00")
    deadline = datetime.datetime.strptime(deadline_str, "%H:%M:%S").time()

    # 1. Cari tanggal TERAKHIR secara global di DailyAttendance untuk periode ini
    max_date_str = db.session.query(db.func.max(DailyAttendance.date))\
        .filter(DailyAttendance.date.like(f"{periode}-%")).scalar()

    # Jika DB kosong, mulai dari tanggal 1. Jika ada (misal tgl 11), mulai dari tgl 11.
    if not max_date_str:
        start_date_str = f"{periode}-01"
    else:
        start_date_str = max_date_str

    start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()

    # 2. Ambil LogAbsensi HANYA dari start_date 00:00:00 ke atas (Optimasi Performa)
    logs = LogAbsensi.query.filter(
        LogAbsensi.timestamp >= f"{start_date_str} 00:00:00"
    ).order_by(LogAbsensi.timestamp.asc()).all()

    # Grouping log berdasarkan user_id dan tanggal
    attendance_logs = {}
    for l in logs:
        emp_id = str(l.user_id).strip()
        d_key = l.timestamp.strftime("%Y-%m-%d")
        attendance_logs.setdefault(emp_id, {}).setdefault(d_key, []).append(l.timestamp)

    # 3. Map DailyAttendance yang sudah ada untuk proteksi is_manual
    existing_records = DailyAttendance.query.filter(
        DailyAttendance.date.like(f"{periode}-%")
    ).all()
    db_map = {(r.user_id, r.date): r for r in existing_records}

    employees = Employee.query.all()

    # Tentukan batas akhir hari diproses
    end_day = days_in_month
    if year == today.year and month == today.month:
        end_day = min(days_in_month, today.day)

    for emp in employees:
        emp_id = str(emp.user_id).strip() if emp.user_id else str(emp.id).strip()
        emp_scans = attendance_logs.get(emp_id, {})

        # Process dari start_date.day sampai end_day
        for day in range(start_date.day, end_day + 1):
            curr_date = datetime.date(year, month, day)
            date_str = curr_date.strftime("%Y-%m-%d")
            map_key = (emp_id, date_str)

            # Skip akhir pekan (Sabtu & Minggu) atau tanggal di masa depan
            if curr_date.weekday() >= 5 or curr_date > today:
                continue

            existing = db_map.get(map_key)

            # SKEMA: PROTEKSI DATA MANUAL ADMIN
            if existing and existing.is_manual:
                continue

            scans = sorted(emp_scans.get(date_str, []))
            morning = [t for t in scans if t.time() < datetime.time(15, 0)]
            evening = [t for t in scans if t.time() >= datetime.time(15, 0)]

            checkin_str = morning[0].strftime("%H:%M:%S") if morning else None
            checkout_str = evening[-1].strftime("%H:%M:%S") if evening else None

            if not checkin_str:
                status = "A"
            elif morning[0].time() <= deadline:
                status = "H"
            else:
                status = "T"

            if existing:
                # Update record yang ada (misal scan checkout sore baru masuk)
                existing.status = status
                existing.checkin = checkin_str
                existing.checkout = checkout_str
            else:
                # Tambah record baru
                new_att = DailyAttendance(
                    user_id=emp_id,
                    date=date_str,
                    status=status,
                    checkin=checkin_str,
                    checkout=checkout_str,
                    is_manual=False,
                )
                db.session.add(new_att)

    db.session.commit()
    return True


# =========================================================================
# ROUTES & REST API ENDPOINTS
# =========================================================================


@app.route("/")
def index():
    return redirect(url_for("dashboard_page"))


@app.route("/dashboard")
def dashboard_page():
    return render_template("index.html")


@app.route("/employees")
def employees_page():
    return render_template("index.html")


@app.route("/attendance")
def attendance_page():
    return render_template("index.html")


@app.route("/payroll")
def payroll_page():
    return render_template("index.html")

    
# ---------------- API DETAIL KEHADIRAN MATRIX ----------------


@app.route("/api/attendance/detail", methods=["GET"])
def get_attendance_detail():
    """Mengembalikan data matrik kehadiran harian karyawan dalam satu bulan"""
    periode = request.args.get(
        "periode", datetime.date.today().strftime("%Y-%m")
    )

    employees = Employee.query.filter_by(status="Aktif").all()
    result = []

    for emp in employees:
        # Ambil seluruh record daily_attendance karyawan ini di periode berjalan
        # Memperhitungkan matching ke user_id atau device_user_id (tanpa petik tunggal)
        emp_user_id = str(emp.user_id or "").replace("'", "")

        attendances = DailyAttendance.query.filter(
            DailyAttendance.date.like(f"{periode}-%")
        ).all()

        daily_map = {}
        for att in attendances:
            att_user_id = str(att.user_id or "").replace("'", "")
            if att_user_id == emp_user_id:
                # Ambil digit tanggalnya saja (misal: "2026-08-05" -> "05")
                day_str = att.date.split("-")[2]
                daily_map[day_str] = att.status

        result.append(
            {
                "id": emp.id,
                "user_id": emp.user_id,
                "name": emp.name,
                "division": emp.division or "-",
                "daily_status": daily_map,
            }
        )

    return jsonify({"status": "success", "periode": periode, "data": result})

# ---------------- API MASTER TEMPLATE PAYROLL ----------------


@app.route("/api/payroll-templates", methods=["GET"])
def get_payroll_templates():
    """Mengambil seluruh master template komponen payroll"""
    templates = PayrollTemplate.query.all()
    return jsonify([t.to_dict() for t in templates])


@app.route("/api/payroll-templates", methods=["POST"])
def add_payroll_template():
    """Membuat template komponen payroll baru"""
    data = request.get_json() or {}
    name = data.get("name")
    item_type = data.get("type")
    formula = data.get("formula")
    default_nominal = data.get("default_nominal", 0.0)

    if not name or not item_type or not formula:
        return jsonify({"message": "Nama, Tipe, dan Formula wajib diisi"}), 400

    template = PayrollTemplate(
        name=name,
        type=item_type,
        formula=formula,
        default_nominal=default_nominal,
    )
    db.session.add(template)
    db.session.commit()

    return jsonify(
        {"message": "Template berhasil dibuat", "template": template.to_dict()}
    ), 201


# ---------------- API KOMPONEN PAYROLL KARYAWAN ----------------


@app.route("/api/employee-components", methods=["POST"])
def add_employee_component():
    """Menghubungkan/memasang template komponen ke seorang karyawan"""
    data = request.get_json() or {}
    employee_id = data.get("employee_id")
    template_id = data.get("template_id")
    custom_nominal = data.get("custom_nominal")

    if not employee_id or not template_id:
        return (
            jsonify({"message": "employee_id dan template_id wajib diisi"}),
            400,
        )

    component = EmployeePayrollComponent(
        employee_id=employee_id,
        template_id=template_id,
        custom_nominal=custom_nominal,
    )
    db.session.add(component)
    db.session.commit()

    return jsonify(
        {"message": "Komponen berhasil ditambahkan ke karyawan", "id": component.id}
    ), 201


@app.route("/api/employee-components/<int:id>", methods=["DELETE"])
def delete_employee_component(id):
    """Menghapus komponen dari karyawan berdasarkan ID relasi"""
    comp = EmployeePayrollComponent.query.get_or_404(id)
    db.session.delete(comp)
    db.session.commit()
    return jsonify({"message": "Komponen berhasil dihapus"}), 200


# =========================================================================
# 2. ENDPOINT DASHBOARD & REKAP (MURNI HANYA BACA SQLITE DATABASE LOKAL)
# =========================================================================
@app.route("/api/dashboard", methods=["GET"])
def get_dashboard_data():
    """Mengambil rekapitulasi data dashboard dari SQLite"""
    today = datetime.date.today()
    current_periode = today.strftime("%Y-%m")

    # 1. TAMBAHKAN/PASTIKAN BARIS INI ADA
    total_employees = Employee.query.count()

    # 2. Rekapitulasi Presensi Bulan Ini
    attendances = DailyAttendance.query.filter(
        DailyAttendance.date.like(f"{current_periode}-%")
    ).all()

    att_summary = {"hadir": 0, "late": 0, "sakit": 0, "absen": 0}
    for att in attendances:
        st = (att.status or "").upper()
        if st == "H":
            att_summary["hadir"] += 1
        elif st == "T":
            att_summary["late"] += 1
        elif st == "S":
            att_summary["sakit"] += 1
        elif st == "A":
            att_summary["absen"] += 1

    # 3. Tren Pengeluaran Gaji
    payroll_labels = []
    payroll_values = []
    employees = Employee.query.all()
    total_payroll_this_month = 0

    for i in range(5, -1, -1):
        first_day_this_month = datetime.date(today.year, today.month, 1)
        target_date = first_day_this_month - datetime.timedelta(days=i * 30)
        p_str = target_date.strftime("%Y-%m")

        month_name = target_date.strftime("%b")
        payroll_labels.append(month_name)

        total_payroll_month = 0
        for emp in employees:
            p_details = calculate_employee_payroll(emp, p_str)
            b_sal = p_details.get("basic_salary", 0)
            t_sum = sum(
                x.get("amount", 0) for x in p_details.get("tunjanganList", [])
            )
            b_sum = sum(
                x.get("amount", 0) for x in p_details.get("bonusList", [])
            )
            p_sum = sum(
                x.get("amount", 0) for x in p_details.get("potonganList", [])
            )

            thp = b_sal + t_sum + b_sum - p_sum
            total_payroll_month += max(0, thp)

        payroll_values.append(total_payroll_month)
        if i == 0:
            total_payroll_this_month = total_payroll_month

    # 4. Return JSON
    return jsonify(
        {
            "total_employees": total_employees,  # Variabel ini sekarang sudah terdefinisi
            "total_payroll": total_payroll_this_month,
            "attendance_summary": att_summary,
            "payroll_trend": {
                "labels": payroll_labels,
                "values": payroll_values,
            },
        }
    )

# ---------------- API KARYAWAN ----------------
@app.route("/api/employees", methods=["GET"])
def get_employees():
    """Mengambil daftar karyawan + hasil kalkulasi payroll otomatis"""
    periode = request.args.get("periode")
    employees = Employee.query.all()

    data = [calculate_employee_payroll(emp, periode) for emp in employees]
    return jsonify(data)


@app.route("/api/employees", methods=["POST"])
def add_employee():
    data = request.get_json(silent=True) or {}
    user_id = (data.get("user_id") or "").strip()

    if not user_id:
        return jsonify({"message": "ID Karyawan wajib diisi"}), 400

    if Employee.query.filter_by(user_id=user_id).first():
        return jsonify(
            {"message": f"ID Karyawan '{user_id}' sudah digunakan."}
        ), 409

    new_employee = Employee(
        user_id=user_id,
        name=data.get("name"),
        position=data.get("position"),
        division=data.get("division"),
        phone=data.get("phone"),
        email=data.get("email"),
        basic_salary=data.get("basic_salary", 0),
        allowance=data.get("allowance", 0),
    )
    db.session.add(new_employee)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "Terjadi duplikasi ID Karyawan"}), 409

    return jsonify({"message": "Data karyawan berhasil ditambahkan"}), 201


@app.route("/api/employees/<int:id>", methods=["PUT"])
def update_employee(id):
    employee = Employee.query.get_or_404(id)
    data = request.get_json(silent=True) or {}

    new_user_id = (data.get("user_id") or employee.user_id or "").strip()
    if not new_user_id:
        return jsonify({"message": "ID Karyawan wajib diisi"}), 400

    if new_user_id != employee.user_id:
        duplicate = Employee.query.filter(
            Employee.user_id == new_user_id, Employee.id != id
        ).first()
        if duplicate:
            return jsonify(
                {"message": f"ID Karyawan '{new_user_id}' sudah digunakan."}
            ), 409

    employee.user_id = new_user_id
    employee.name = data.get("name", employee.name)
    employee.position = data.get("position", employee.position)
    employee.division = data.get("division", employee.division)
    employee.phone = data.get("phone", employee.phone)
    employee.email = data.get("email", employee.email)
    employee.basic_salary = data.get("basic_salary", employee.basic_salary)
    employee.allowance = data.get("allowance", employee.allowance)
    employee.status = data.get("status", employee.status)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "Terjadi error integritas data"}), 409

    return jsonify({"message": "Data karyawan berhasil diupdate"})


@app.route("/api/employees/<int:id>", methods=["DELETE"])
def delete_employee(id):
    employee = Employee.query.get_or_404(id)
    db.session.delete(employee)
    db.session.commit()
    return jsonify({"message": "Data karyawan berhasil dihapus"}), 200


# ==============================================================================
# ENDPOINT MAIN: TARIK LOG ABSENSI MESIN -> LOG_ABSENSI -> DAILY_ATTENDANCE
# ==============================================================================
@app.route("/api/fingerprint/sync", methods=["POST"])
def sync_fingerprint():
    # Gunakan kredensial yang SUDAH TERBUKTI BISA di mesinmu:
    ip = "192.168.1.201"
    port = 4370
    password = 12345

    zk = ZK(ip, port=port, password=password, timeout=10)
    conn = None
    logs_added_count = 0

    # 1. PENARIKAN DATA ABSENSI DARI MESIN
    try:
        conn = zk.connect()
        conn.disable_device()

        # METODE KUNCI: conn.get_attendance() untuk mengambil log absensi, BUKAN user
        attendance_records = conn.get_attendance()

        # Ambil timestamp log paling akhir di database lokal agar tidak duplicate
        last_log = LogAbsensi.query.order_by(LogAbsensi.timestamp.desc()).first()
        last_timestamp = last_log.timestamp if last_log else None

        for record in attendance_records:
            # Simpan hanya log yang lebih baru dari timestamp terakhir di DB
            if last_timestamp is None or record.timestamp > last_timestamp:
                new_log = LogAbsensi(
                    user_id=str(record.user_id).strip(),
                    timestamp=record.timestamp
                )
                db.session.add(new_log)
                logs_added_count += 1

        db.session.commit()
        print(f"✅ Berhasil menarik {logs_added_count} data log absensi baru dari mesin.")

    except Exception as e:
        print(f"❌ Error Penarikan Mesin Fingerprint: {e}")
        # Tetap lanjut agar kalkulasi rekap DB lokal tidak terhenti meskipun mesin error
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass

    # 2. PROSES REKAP KE DAILY_ATTENDANCE
    try:
        periode = request.args.get("periode", datetime.date.today().strftime("%Y-%m"))
        process_attendance_recap_incremental(periode)
    except Exception as e:
        print(f"❌ Error saat kalkulasi daily_attendance: {e}")
        return jsonify({
            "status": "error",
            "message": f"Log tersimpan, namun kalkulasi rekap gagal: {str(e)}"
        }), 500

    return jsonify({
        "status": "success",
        "message": f"Berhasil! {logs_added_count} log absensi baru ditarik & rekap presensi harian telah diperbarui."
    })


@app.route("/api/attendance/update", methods=["GET", "POST"])
def update_attendance_recap():
    """SATU ENDPOINT UNTUK SEMUA:

    1. Tarik log terbaru dari Mesin Fingerprint -> LogAbsensi
    2. Olah LogAbsensi -> DailyAttendance secara inkremental
    """
    periode = request.args.get("periode", datetime.date.today().strftime("%Y-%m"))
    today = datetime.date.today()

    if not periode:
        periode = today.strftime("%Y-%m")

    # ==========================================
    # STEP 1: TARIK DATA DARI MESIN FINGERPRINT
    # ==========================================
    sync_warning = None
    try:
        # Panggil logika koneksi mesin fingerprint di sini
        # Contoh: pull_logs_from_machine()
        pass 
    except Exception as e:
        # Jika mesin mati/kabel terlepas, tangkap error agar proses rekap DB lokal TETAP BISA JALAN
        sync_warning = f"Mesin fingerprint tidak terjangkau ({str(e)}), merekap data lokal yang ada."

    # ==========================================
    # STEP 2: OLAH DATA REKAP (LOG -> DAILY)
    # ==========================================
    year, month = map(int, periode.split("-"))
    days_in_month = calendar.monthrange(year, month)[1]
    deadline = datetime.datetime.strptime(
        app.config["ATTENDANCE_DEADLINE"], "%H:%M:%S"
    ).time()

    # Cari tanggal TERAKHIR di DailyAttendance untuk periode ini
    max_date_str = db.session.query(db.func.max(DailyAttendance.date))\
        .filter(DailyAttendance.date.like(f"{periode}-%")).scalar()

    start_date_str = max_date_str if max_date_str else f"{periode}-01"
    start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()

    # Ambil LogAbsensi dari start_date
    logs = LogAbsensi.query.filter(
        LogAbsensi.timestamp >= f"{start_date_str} 00:00:00"
    ).order_by(LogAbsensi.timestamp.asc()).all()

    attendance_logs = {}
    for l in logs:
        emp_id = str(l.user_id).strip()
        d_key = l.timestamp.strftime("%Y-%m-%d")
        attendance_logs.setdefault(emp_id, {}).setdefault(d_key, []).append(l.timestamp)

    existing_records = DailyAttendance.query.filter(
        DailyAttendance.date.like(f"{periode}-%")
    ).all()
    db_map = {(r.user_id, r.date): r for r in existing_records}

    employees = Employee.query.all()

    end_day = days_in_month
    if year == today.year and month == today.month:
        end_day = min(days_in_month, today.day)

    for emp in employees:
        emp_id = str(emp.user_id).strip() if emp.user_id else str(emp.id).strip()
        emp_scans = attendance_logs.get(emp_id, {})

        for day in range(start_date.day, end_day + 1):
            curr_date = datetime.date(year, month, day)
            date_str = curr_date.strftime("%Y-%m-%d")
            map_key = (emp_id, date_str)

            if curr_date.weekday() >= 5 or curr_date > today:
                continue

            existing = db_map.get(map_key)

            # Jika sudah diubah MANUAL oleh Admin, ABAIKAN (JANGAN TIMPA)
            if existing and existing.is_manual:
                continue

            scans = sorted(emp_scans.get(date_str, []))
            morning = [t for t in scans if t.time() < datetime.time(15, 0)]
            evening = [t for t in scans if t.time() >= datetime.time(15, 0)]

            checkin_str = morning[0].strftime("%H:%M:%S") if morning else None
            checkout_str = evening[-1].strftime("%H:%M:%S") if evening else None

            if not checkin_str:
                status = "A"
            elif morning[0].time() <= deadline:
                status = "H"
            else:
                status = "T"

            if existing:
                existing.status = status
                existing.checkin = checkin_str
                existing.checkout = checkout_str
            else:
                new_att = DailyAttendance(
                    user_id=emp_id,
                    date=date_str,
                    status=status,
                    checkin=checkin_str,
                    checkout=checkout_str,
                    is_manual=False,
                )
                db.session.add(new_att)

    db.session.commit()

    msg = f"Absensi periode {periode} berhasil diperbarui!"
    if sync_warning:
        msg += f" ({sync_warning})"

    return jsonify({"status": "success", "message": msg})


@app.route("/api/attendance/save", methods=["POST"])
def save_attendance():
    try:
        payload = request.get_json() or []
        for item in payload:
            emp_id = str(item.get("user_id")).strip()
            date_str = item.get("date")
            new_status = item.get("status", "")

            record = DailyAttendance.query.filter_by(
                user_id=emp_id, date=date_str
            ).first()
            if record:
                record.status = new_status
                record.is_manual = True
            else:
                db.session.add(
                    DailyAttendance(
                        user_id=emp_id,
                        date=date_str,
                        status=new_status,
                        is_manual=True,
                    )
                )

        db.session.commit()
        return jsonify({"message": "Data absensi berhasil disimpan!"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Gagal menyimpan: {str(e)}"}), 500


# ---------------- SEEDER MASTER DATA DEFAULT ----------------


@app.route("/api/seed")
def seed():
    """Mengisi database dengan data master komponen dan data karyawan contoh"""
    # 1. Seed Master Template Komponen
    if PayrollTemplate.query.count() == 0:
        templates = [
            PayrollTemplate(
                name="Tunjangan Jabatan",
                type="tunjangan",
                formula="NOMINAL * 1",
                default_nominal=0,
            ),
            PayrollTemplate(
                name="Tunjangan Perawatan Motor",
                type="tunjangan",
                formula="NOMINAL * 1",
                default_nominal=200000,
            ),
            PayrollTemplate(
                name="Lembur",
                type="tunjangan",
                formula="150000 * L",
                default_nominal=150000,
            ),
            PayrollTemplate(
                name="Tunjangan Transport",
                type="tunjangan",
                formula="NOMINAL * (H + T)",
                default_nominal=20000,
            ),
            PayrollTemplate(
                name="Potongan Absen",
                type="potongan",
                formula="(BASIC_SALARY / 30) * A",
                default_nominal=0,
            ),
            PayrollTemplate(
                name="Potongan Keterlambatan",
                type="potongan",
                formula="25000 * T",
                default_nominal=25000,
            ),
            PayrollTemplate(
                name="Potongan Kasbon",
                type="potongan",
                formula="NOMINAL * 1",
                default_nominal=0,
            ),
            PayrollTemplate(
                name="Potongan BPJS TK",
                type="potongan",
                formula="BASIC_SALARY * 0.02",
                default_nominal=0,
            ),
        ]
        db.session.add_all(templates)
        db.session.commit()

    # 2. Seed Data Karyawan Contoh
    if Employee.query.count() == 0:
        emp1 = Employee(
            user_id="EMP001",
            name="Budi",
            division="IT",
            position="Backend Developer",
            basic_salary=6000000,
            allowance=500000,
            phone="08123456789",
            email="budi@email.com",
            status="Aktif",
        )
        emp2 = Employee(
            user_id="EMP002",
            name="Siti",
            division="HR",
            position="HR Staff",
            basic_salary=5500000,
            allowance=300000,
            phone="08111111111",
            email="siti@email.com",
            status="Aktif",
        )
        db.session.add_all([emp1, emp2])
        db.session.commit()

        # Pasang beberapa komponen awal ke Budi
        tmpl_trans = PayrollTemplate.query.filter_by(
            name="Tunjangan Transport"
        ).first()
        tmpl_bpjs = PayrollTemplate.query.filter_by(
            name="Potongan BPJS TK"
        ).first()
        if tmpl_trans and tmpl_bpjs:
            db.session.add(
                EmployeePayrollComponent(
                    employee_id=emp1.id,
                    template_id=tmpl_trans.id,
                    custom_nominal=20000,
                )
            )
            db.session.add(
                EmployeePayrollComponent(
                    employee_id=emp1.id, template_id=tmpl_bpjs.id
                )
            )
            db.session.commit()

    return jsonify({"message": "Seeding master data berhasil!"})


# Inisialisasi Tabel DB saat Aplikasi Pertama Kali Dijalankan
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)