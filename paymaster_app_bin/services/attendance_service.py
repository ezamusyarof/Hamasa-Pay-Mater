# import datetime

# from apscheduler.schedulers.background import BackgroundScheduler
# from zk import ZK
# from zk.exception import ZKErrorResponse, ZKNetworkError

# from ..config import Config
# from ..extensions import db
# from ..models import LogAbsensi


# scheduler = None


# def fetch_attendance_from_machine(app=None):
#     if app is not None:
#         with app.app_context():
#             return _fetch_attendance_from_machine_impl()
#     else:
#         return _fetch_attendance_from_machine_impl()


# def _fetch_attendance_from_machine_impl():
#     print(f"[{datetime.datetime.now()}] Menghubungkan ke mesin absensi...")
#     zk = ZK(
#         Config.DEVICE_IP,
#         port=Config.DEVICE_PORT,
#         password=Config.DEVICE_PASSWORD,
#         timeout=10,
#     )

#     new_records = 0
#     try:
#         conn = zk.connect()
#         conn.disable_device()
#         attendances = conn.get_attendance()

#         for record in attendances:
#             exists = LogAbsensi.query.filter_by(
#                 user_id=str(record.user_id),
#                 timestamp=record.timestamp,
#             ).first()

#             if not exists:
#                 log_baru = LogAbsensi(
#                     user_id=str(record.user_id),
#                     timestamp=record.timestamp,
#                     status=record.status,
#                 )
#                 db.session.add(log_baru)
#                 new_records += 1

#         db.session.commit()
#         print(f"Berhasil menarik {new_records} data absensi baru.")

#         conn.enable_device()
#         conn.disconnect()
#     except (ZKNetworkError, ZKErrorResponse) as e:
#         print(f"Gagal terhubung ke mesin: {e}")
#     except Exception as e:
#         print(f"Error: {e}")

#     return new_records


# def start_scheduler(app):
#     global scheduler
#     if scheduler is not None or not Config.SCHEDULER_ENABLED:
#         return

#     scheduler = BackgroundScheduler(daemon=True)
#     scheduler.add_job(lambda: fetch_attendance_from_machine(app), "interval", minutes=15)
#     scheduler.start()
