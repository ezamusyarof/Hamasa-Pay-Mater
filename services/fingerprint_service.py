import datetime
from zk import ZK
from models import LogAbsensi
from zk.exception import ZKErrorResponse, ZKNetworkError
from flask import current_app, jsonify, request
from extensions import db
from services.attendance_service import process_attendance_recap_incremental

def fetch_attendance_from_machine():
    print(f"[{datetime.datetime.now()}] Menghubungkan ke mesin absensi...")
    zk = ZK(
        current_app.config["DEVICE_IP"],
        port=current_app.config["DEVICE_PORT"],
        password=current_app.config["DEVICE_PASSWORD"],
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