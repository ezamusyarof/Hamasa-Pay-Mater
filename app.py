import os
import sys
import shutil

from pathlib import Path
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


def get_database_path():

    # ==========================================================
    # SAAT SUDAH MENJADI APLIKASI PYINSTALLER
    # ==========================================================

    if getattr(sys, "frozen", False):

        if sys.platform == "darwin":
            # macOS
            data_dir = (
                Path.home()
                / "Library"
                / "Application Support"
                / "Attendance"
            )

        elif sys.platform == "win32":
            # Windows
            data_dir = (
                Path(os.environ.get("APPDATA", Path.home()))
                / "Attendance"
            )

        else:
            # Linux / Unix
            data_dir = (
                Path.home()
                / "Attendance"
            )

        data_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        database_path = data_dir / "absensi.db"

        # Jika database belum ada,
        # copy database awal dari bundle PyInstaller
        if not database_path.exists():

            bundled_database = (
                Path(sys._MEIPASS)
                / "absensi.db"
            )

            if bundled_database.exists():

                shutil.copy2(
                    bundled_database,
                    database_path
                )

    # ==========================================================
    # SAAT DEVELOPMENT
    # ==========================================================

    else:

        database_path = (
            Path(BASE_DIR) / "absensi.db"
        )

    return database_path



def create_app():

    app = Flask(
        __name__,
        template_folder=resource_path("templates"),
        static_folder=resource_path("static"),
    )

    # ==========================================================
    # DATABASE
    # ==========================================================

    database_path = get_database_path()

    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"sqlite:///{database_path}"
    )

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ==========================================================
    # CONFIG
    # ==========================================================

    app.config["SECRET_KEY"] = os.getenv(
        "SECRET_KEY",
        "dev-secret-key"
    )

    app.config["DEVICE_IP"] = os.getenv(
        "DEVICE_IP",
        "192.168.1.201"
    )

    app.config["DEVICE_PORT"] = int(
        os.getenv(
            "DEVICE_PORT",
            "4370"
        )
    )

    app.config["DEVICE_PASSWORD"] = int(
        os.getenv(
            "DEVICE_PASSWORD",
            "12345"
        )
    )

    app.config["ATTENDANCE_DEADLINE"] = os.getenv(
        "ATTENDANCE_DEADLINE",
        "07:13:00"
    )

    app.config["ATTENDANCE_START_TIME"] = os.getenv(
        "ATTENDANCE_START_TIME",
        "00:00:00"
    )

    app.config["ATTENDANCE_END_TIME"] = os.getenv(
        "ATTENDANCE_END_TIME",
        "23:59:00"
    )

    # ==========================================================
    # DATABASE INIT
    # ==========================================================

    db.init_app(app)

    # ==========================================================
    # BLUEPRINT
    # ==========================================================

    from routes.user_routes import user_bp
    from routes.dashboard_routes import dashboard_bp
    from routes.employee_routes import employee_bp
    from routes.attendance_routes import attendance_bp
    from routes.payroll_routes import payroll_bp

    app.register_blueprint(user_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(payroll_bp)

    # ==========================================================
    # CREATE DATABASE
    # ==========================================================

    with app.app_context():
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=False
    )