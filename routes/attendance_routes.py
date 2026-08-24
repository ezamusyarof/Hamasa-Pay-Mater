import calendar
import datetime
from flask import Blueprint, jsonify, request, current_app
from zk import ZK
from models import DailyAttendance, Employee, LogAbsensi, PayrollSummary
from services.attendance_service import process_attendance_recap_incremental
from extensions import db

attendance_bp = Blueprint(
    "attendance",
    __name__,
    url_prefix="/api"
)

@attendance_bp.route("/attendance/detail", methods=["GET"])
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
                "daily_status": daily_map,
            }
        )

    return jsonify({"status": "success", "periode": periode, "data": result})

@attendance_bp.route("/attendance/update", methods=["GET", "POST"])
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
        current_app.config["ATTENDANCE_DEADLINE"], "%H:%M:%S"
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

@attendance_bp.route("/attendance/save", methods=["POST"])
def save_attendance():
    try:
        payload = request.get_json() or []

        for item in payload:
            user_id = str(item.get("user_id") or "").strip()
            date_str = item.get("date")
            new_status = (item.get("status") or "").strip().upper()

            # Data wajib
            if not user_id or not date_str:
                continue

            record = DailyAttendance.query.filter_by(
                user_id=user_id,
                date=date_str
            ).first()

            # ==========================================
            # STATUS KOSONG
            # ==========================================
            if not new_status:
                if record:
                    db.session.delete(record)

                continue

            # ==========================================
            # UPDATE / INSERT
            # ==========================================

            if record:

                # Hanya dianggap manual jika status berubah
                if record.status != new_status:
                    record.status = new_status
                    record.is_manual = True

                # Jika status sama:
                # - status tidak diubah
                # - is_manual tetap seperti sebelumnya

            else:

                # Record baru → karena dibuat dari proses manual
                db.session.add(
                    DailyAttendance(
                        user_id=user_id,
                        date=date_str,
                        status=new_status,
                        is_manual=True
                    )
                )

        db.session.commit()

        return jsonify({
            "message": "Data absensi berhasil disimpan!"
        }), 200

    except Exception as e:
        db.session.rollback()

        return jsonify({
            "message": f"Gagal menyimpan: {str(e)}"
        }), 500

def update_payroll_summary(employee, periode):
    summary = PayrollSummary.query.filter_by(
        employee_id=employee.id,
        periode=periode
    ).first()

    if not summary:
        summary = PayrollSummary(
            employee_id=employee.id,
            periode=periode,
            basic_salary=employee.basic_salary or 0,
            total_earning=employee.basic_salary or 0,
            total_deduction=0,
            thp=employee.basic_salary or 0,
            status_wa="Pending"
        )

        db.session.add(summary)
        db.session.flush()

    # Ambil semua item payroll
    items = summary.items

    total_tunjangan = sum(
        i.amount for i in items
        if i.type == "tunjangan"
    )

    total_bonus = sum(
        i.amount for i in items
        if i.type == "bonus"
    )

    total_potongan = sum(
        i.amount for i in items
        if i.type == "potongan"
    )

    summary.total_earning = (
        summary.basic_salary
        + total_tunjangan
        + total_bonus
    )

    summary.total_deduction = total_potongan

    summary.thp = (
        summary.total_earning
        - summary.total_deduction
    )

    return summary

@attendance_bp.route("/fingerprint/sync", methods=["POST"])
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
        update_payroll_summary(employee=Employee, periode=periode)
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