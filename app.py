import os
import sys
from flask import Flask
from extensions import db
from models import *

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def resource_path(relative_path):
    if getattr(sys, "frozen", False):
        base_path = sys._MEIPASS
    else:
        base_path = BASE_DIR
    return os.path.join(base_path, relative_path)

def create_app():
    app = Flask(
        __name__,
        template_folder=resource_path("templates"),
        static_folder=resource_path("static"),
    )

    app.config["SECRET_KEY"] = os.getenv(
        "SECRET_KEY",
        "dev-secret-key"
    )

    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(BASE_DIR,'absensi.db')}"
    )

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    from routes.dashboard_routes import dashboard_bp
    from routes.employee_routes import employee_bp
    from routes.attendance_routes import attendance_bp
    from routes.payroll_routes import payroll_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(payroll_bp)

    with app.app_context():
        db.create_all()

    return app

app = create_app()

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'absensi.db')}")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["DEVICE_IP"] = os.getenv("DEVICE_IP", "192.168.1.201")
app.config["DEVICE_PORT"] = int(os.getenv("DEVICE_PORT", "4370"))
app.config["DEVICE_PASSWORD"] = int(os.getenv("DEVICE_PASSWORD", "12345"))
app.config["ATTENDANCE_DEADLINE"] = os.getenv("ATTENDANCE_DEADLINE", "07:13:00")
app.config["ATTENDANCE_START_TIME"] = os.getenv("ATTENDANCE_START_TIME", "00:00:00")
app.config["ATTENDANCE_END_TIME"] = os.getenv("ATTENDANCE_EN_TIME", "23:59:00")

from routes.dashboard_routes import dashboard_bp
from routes.employee_routes import employee_bp
from routes.attendance_routes import attendance_bp
from routes.payroll_routes import payroll_bp

# app.register_blueprint(dashboard_bp)
# app.register_blueprint(employee_bp)
# app.register_blueprint(attendance_bp)
# app.register_blueprint(payroll_bp)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)