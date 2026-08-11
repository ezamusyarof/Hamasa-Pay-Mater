import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'absensi.db'}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    DEVICE_IP = os.getenv("DEVICE_IP", "192.168.1.201")
    DEVICE_PORT = int(os.getenv("DEVICE_PORT", "4370"))
    DEVICE_PASSWORD = int(os.getenv("DEVICE_PASSWORD", "12345"))
    SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"
    ATTENDANCE_START_TIME = "06:00:00"
    ATTENDANCE_END_TIME = "15:00:00"
    ATTENDANCE_DEADLINE = "07:10:00"