import datetime
from extensions import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    username = db.Column(
        db.String(50),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    role = db.Column(
        db.String(20),
        nullable=False,
        default="user"
    )

    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.datetime.now,
        nullable=False
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.datetime.now,
        onupdate=datetime.datetime.now,
        nullable=False
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(
            self.password_hash,
            password
        )
    
class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), unique=True, nullable=False)  # ID Mesin
    name = db.Column(db.String(100))
    position = db.Column(db.String(100))
    basic_salary = db.Column(db.Float, default=0)
    gender = db.Column(db.String(50))
    married_status = db.Column(db.Integer)
    dependents = db.Column(db.Integer)
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100))
    status = db.Column(db.String(20), default="Aktif")

class LogAbsensi(db.Model):
    __tablename__ = "log_absensi"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), nullable=False)  # ID dari mesin
    timestamp = db.Column(db.DateTime, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "timestamp", name="_user_time_uc"),
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

class PayrollSummary(db.Model):
    __tablename__ = "payroll_summaries"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    periode = db.Column(db.String(7), nullable=False)  # Format: 'YYYY-MM'
    basic_salary = db.Column(db.Float, default=0)
    total_earning = db.Column(db.Float, default=0)
    total_deduction = db.Column(db.Float, default=0)
    thp = db.Column(db.Float, default=0)
    kasbon = db.Column(db.Float, default=0)
    cicilan = db.Column(db.Float, default=0)
    pph21 = db.Column(db.Float, default=0)
    thp_after_tax = db.Column(db.Float, default=0)
    status_wa = db.Column(db.String(20), default="Pending")

    # --- TAMBAHKAN BARIS INI AGAR ATRIBUT 'employee' TERSEDIA ---
    employee = db.relationship("Employee", backref="payroll_summaries")
    
    # Relasi ke items rincian (pastikan ini juga ada jika diperlukan)
    items = db.relationship("PayrollItem", backref="summary", cascade="all, delete-orphan", lazy=True)

    __table_args__ = (
        db.UniqueConstraint("employee_id", "periode", name="_user_payroll_periode_uc"),
    )

class PayrollItem(db.Model):
    __tablename__ = "payroll_items"

    id = db.Column(db.Integer, primary_key=True)

    payroll_summary_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "payroll_summaries.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    name = db.Column(db.String(100), nullable=False)

    type = db.Column(db.String(20), nullable=False)

    rate = db.Column(db.Float, default=0)

    qty = db.Column(db.Float, default=0)

    unit = db.Column(db.String(50))

    amount = db.Column(db.Float, nullable=False)

    source = db.Column(
        db.String(20),
        default="manual"
    )