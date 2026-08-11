# from .extensions import db


# class LogAbsensi(db.Model):
#     id = db.Column(db.Integer, primary_key=True)
#     user_id = db.Column(db.String(50), nullable=False)
#     timestamp = db.Column(db.DateTime, nullable=False)
#     status = db.Column(db.Integer)

#     __table_args__ = (db.UniqueConstraint("user_id", "timestamp", name="_user_time_uc"),)


# class Employee(db.Model):
#     __tablename__ = "employees"

#     id = db.Column(db.Integer, primary_key=True)
#     employee_code = db.Column(db.String(20), unique=True)
#     name = db.Column(db.String(100))
#     position = db.Column(db.String(100))
#     division = db.Column(db.String(100))
#     phone = db.Column(db.String(30))
#     email = db.Column(db.String(100))

#     basic_salary = db.Column(db.Float, default=0)
#     allowance = db.Column(db.Float, default=0)

#     status = db.Column(db.String(20), default="Aktif")


# class Attendance(db.Model):
#     __tablename__ = "attendances"

#     id = db.Column(db.Integer, primary_key=True)
#     employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
#     date = db.Column(db.Date)
#     check_in = db.Column(db.Time)
#     check_out = db.Column(db.Time)
#     status = db.Column(db.String(20))

#     late_minutes = db.Column(db.Integer, default=0)
#     overtime_minutes = db.Column(db.Integer, default=0)


# class Payroll(db.Model):
#     __tablename__ = "payrolls"

#     id = db.Column(db.Integer, primary_key=True)
#     employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
#     month = db.Column(db.Integer)
#     year = db.Column(db.Integer)

#     basic_salary = db.Column(db.Float, default=0)
#     allowance = db.Column(db.Float, default=0)
#     deductions = db.Column(db.Float, default=0)
#     total_salary = db.Column(db.Float, default=0)
