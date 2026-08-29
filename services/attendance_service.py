import calendar
import datetime
from models import DailyAttendance, Employee, LogAbsensi
from flask import current_app
from extensions import db
# from firebase_config import firestore_db

def is_holiday_date(check_date):
    """
    Mengecek apakah tanggal merupakan hari libur nasional Indonesia
    yang tanggalnya tetap setiap tahun.

    Hanya menggunakan bulan dan tanggal, sehingga fungsi ini
    dapat digunakan untuk tahun berapa pun.

    Hari libur dengan tanggal yang berubah setiap tahun
    sengaja tidak dimasukkan.
    """

    fixed_holidays = {
        (1, 1),    # Tahun Baru Masehi
        (5, 1),    # Hari Buruh Internasional
        (6, 1),    # Hari Lahir Pancasila
        (8, 17),   # Hari Kemerdekaan Republik Indonesia
        (12, 25),  # Hari Raya Natal
    }

    return (
        check_date.month,
        check_date.day
    ) in fixed_holidays

def process_attendance_recap_incremental(periode=None):
    """
    Membuat / memperbarui DailyAttendance berdasarkan LogAbsensi
    untuk periode yang dipilih.

    Aturan:
    - Hari kerja:
        Tidak ada scan              -> A
        Ada check-in <= deadline    -> H
        Ada check-in > deadline     -> T
        Check-in NULL + checkout    -> T

    - Hari libur / weekend:
        Tidak ada scan               -> tidak dibuat
        Ada scan                     -> L (Lembur)

    - is_manual=True:
        Tidak pernah ditimpa proses otomatis.

    - Tanggal masa depan:
        Tidak diproses.
    """

    today = datetime.date.today()

    if not periode:
        periode = today.strftime("%Y-%m")

    # ==========================================================
    # 1. VALIDASI PERIODE
    # ==========================================================

    try:
        year, month = map(int, periode.split("-"))
        days_in_month = calendar.monthrange(year, month)[1]

    except (ValueError, AttributeError):
        raise ValueError(
            "Format periode tidak valid. Gunakan YYYY-MM."
        )

    # ==========================================================
    # 2. DEADLINE KETERLAMBATAN
    # ==========================================================

    deadline_str = current_app.config.get(
        "ATTENDANCE_DEADLINE",
        "07:11:00"
    )

    deadline = datetime.datetime.strptime(
        deadline_str,
        "%H:%M:%S"
    ).time()

    # ==========================================================
    # 3. TENTUKAN RANGE TANGGAL
    # ==========================================================

    start_date = datetime.date(
        year,
        month,
        1
    )

    end_date = datetime.date(
        year,
        month,
        days_in_month
    )

    # Jangan memproses tanggal masa depan
    if end_date > today:
        end_date = today

    # Kalau bulan seluruhnya masih di masa depan
    if start_date > today:
        return {
            "created": 0,
            "updated": 0,
            "manual_skipped": 0
        }

    # ==========================================================
    # 4. AMBIL LOG ABSENSI DALAM PERIODE
    # ==========================================================

    start_datetime = datetime.datetime.combine(
        start_date,
        datetime.time.min
    )

    end_datetime = datetime.datetime.combine(
        end_date + datetime.timedelta(days=1),
        datetime.time.min
    )

    logs = LogAbsensi.query.filter(
        LogAbsensi.timestamp >= start_datetime,
        LogAbsensi.timestamp < end_datetime
    ).order_by(
        LogAbsensi.timestamp.asc()
    ).all()

    # ==========================================================
    # 5. GROUPING LOG
    #
    # {
    #     "55": {
    #         "2026-08-03": [
    #             datetime(...),
    #             datetime(...)
    #         ]
    #     }
    # }
    # ==========================================================

    attendance_logs = {}

    for log in logs:

        emp_id = str(
            log.user_id
        ).strip()

        date_key = log.timestamp.strftime(
            "%Y-%m-%d"
        )

        attendance_logs \
            .setdefault(emp_id, {}) \
            .setdefault(date_key, []) \
            .append(log.timestamp)

    # ==========================================================
    # 6. AMBIL DAILY ATTENDANCE YANG SUDAH ADA
    # ==========================================================

    existing_records = DailyAttendance.query.filter(
        DailyAttendance.date >= start_date.strftime("%Y-%m-%d"),
        DailyAttendance.date <= end_date.strftime("%Y-%m-%d")
    ).all()

    db_map = {
        (
            str(record.user_id).strip(),
            record.date
        ): record
        for record in existing_records
    }

    # ==========================================================
    # 7. AMBIL SEMUA EMPLOYEE
    # ==========================================================

    employees = Employee.query.all()

    created_count = 0
    updated_count = 0
    manual_skipped_count = 0

    # ==========================================================
    # 8. LOOP EMPLOYEE
    # ==========================================================

    for employee in employees:

        if not employee.user_id:
            continue

        emp_id = str(
            employee.user_id
        ).strip()

        emp_scans = attendance_logs.get(
            emp_id,
            {}
        )

        current_date = start_date

        # ======================================================
        # LOOP TANGGAL
        # ======================================================

        while current_date <= end_date:

            date_str = current_date.strftime(
                "%Y-%m-%d"
            )

            map_key = (
                emp_id,
                date_str
            )

            existing = db_map.get(map_key)

            # ==================================================
            # PROTEKSI DATA MANUAL
            # ==================================================

            if existing and existing.is_manual:

                manual_skipped_count += 1

                current_date += datetime.timedelta(days=1)
                continue

            # ==================================================
            # AMBIL SCAN HARI INI
            # ==================================================

            scans = sorted(
                emp_scans.get(
                    date_str,
                    []
                )
            )

            # ==================================================
            # CEK HARI
            #
            # weekday():
            # 0 = Senin
            # 1 = Selasa
            # ...
            # 5 = Sabtu
            # 6 = Minggu
            # ==================================================

            is_weekend = current_date.weekday() >= 5

            # ==================================================
            # CEK HARI LIBUR
            #
            # GANTI fungsi ini sesuai sumber hari libur
            # yang digunakan aplikasi kamu.
            # ==================================================

            is_holiday = is_holiday_date(
                current_date
            )

            is_day_off = (
                is_weekend
                or is_holiday
            )

            # ==================================================
            # 9. HARI LIBUR / WEEKEND
            # ==================================================

            if is_day_off:

                # Tidak ada scan:
                # jangan buat DailyAttendance
                if not scans:

                    current_date += datetime.timedelta(days=1)
                    continue

                # Ada scan pada hari libur:
                # dianggap lembur
                status = "L"

                # Untuk lembur:
                # scan pertama = check-in
                # scan terakhir = checkout
                checkin_str = (
                    scans[0].strftime("%H:%M:%S")
                    if scans
                    else None
                )

                checkout_str = (
                    scans[-1].strftime("%H:%M:%S")
                    if len(scans) > 1
                    else None
                )

            # ==================================================
            # 10. HARI KERJA
            # ==================================================

            else:

                morning = [
                    timestamp
                    for timestamp in scans
                    if timestamp.time() < datetime.time(15, 0)
                ]

                evening = [
                    timestamp
                    for timestamp in scans
                    if timestamp.time() >= datetime.time(15, 0)
                ]

                # --------------------------------------------------
                # CHECK-IN
                # --------------------------------------------------

                checkin_str = (
                    morning[0].strftime("%H:%M:%S")
                    if morning
                    else None
                )

                # --------------------------------------------------
                # CHECK-OUT
                # --------------------------------------------------

                checkout_str = (
                    evening[-1].strftime("%H:%M:%S")
                    if evening
                    else None
                )

                # --------------------------------------------------
                # STATUS
                # --------------------------------------------------

                # Tidak ada check-in
                if not checkin_str:

                    # Ada checkout tetapi tidak ada check-in
                    if checkout_str:
                        status = "T"

                    # Tidak ada scan sama sekali
                    else:
                        status = "A"

                # Ada check-in
                elif morning[0].time() <= deadline:

                    status = "H"

                # Check-in terlambat
                else:

                    status = "T"

            # ==================================================
            # 11. UPDATE RECORD YANG SUDAH ADA
            # ==================================================

            if existing:

                existing.status = status
                existing.checkin = checkin_str
                existing.checkout = checkout_str
                existing.updated_at = datetime.datetime.now()

                updated_count += 1

            # ==================================================
            # 12. CREATE RECORD BARU
            # ==================================================

            else:

                new_attendance = DailyAttendance(
                    user_id=emp_id,
                    date=date_str,
                    status=status,
                    checkin=checkin_str,
                    checkout=checkout_str,
                    is_manual=False,
                    updated_at=datetime.datetime.now()
                )

                db.session.add(
                    new_attendance
                )

                created_count += 1

            current_date += datetime.timedelta(days=1)

    # ==========================================================
    # 13. COMMIT
    # ==========================================================

    db.session.commit()

    print(
        f"📊 Rekap {periode} selesai: "
        f"{created_count} dibuat, "
        f"{updated_count} diperbarui, "
        f"{manual_skipped_count} manual dilewati."
    )

    return {
        "created": created_count,
        "updated": updated_count,
        "manual_skipped": manual_skipped_count
    }

# def sync_visit_report(periode):

#     try:

#         # ==================================================
#         # PERIODE
#         # ==================================================

#         year, month = map(
#             int,
#             periode.split("-")
#         )

#         start_date = datetime.datetime(
#             year,
#             month,
#             1
#         )

#         if month == 12:

#             end_date = datetime.datetime(
#                 year + 1,
#                 1,
#                 1
#             )

#         else:

#             end_date = datetime.datetime(
#                 year,
#                 month + 1,
#                 1
#             )


#         # ==================================================
#         # FIREBASE REPORTS
#         # ==================================================

#         reports = (
#             firestore_db
#             .collection("reports")
#             .where(
#                 "timestamp",
#                 ">=",
#                 start_date
#             )
#             .where(
#                 "timestamp",
#                 "<",
#                 end_date
#             )
#             .stream()
#         )


#         # ==================================================
#         # TAMPILKAN DATA
#         # ==================================================

#         data_list = []

#         for report in reports:

#             data = report.to_dict()

#             data_list.append({
#                 "id": report.id,
#                 **data
#             })


#         print(
#             "\n========================================"
#         )

#         print(
#             f" FIREBASE REPORTS - {periode}"
#         )

#         print(
#             "========================================"
#         )

#         print(
#             f"Jumlah data: {len(data_list)}"
#         )

#         for index, data in enumerate(
#             data_list,
#             start=1
#         ):

#             print(
#                 f"\n[{index}]"
#             )

#             print(data)


#         print(
#             "\n========================================\n"
#         )


#         return data_list


#     except Exception as e:

#         print(
#             f"❌ Gagal mengambil data Firebase: {e}"
#         )

#         return []
    
def calculate_attendance_summary(user_id, periode):
    attendances = DailyAttendance.query.filter(
        DailyAttendance.user_id == str(user_id),
        DailyAttendance.date.like(f"{periode}-%")
    ).all()

    summary = {
        "H": 0,
        "T": 0,
        "A": 0,
        "S": 0,
        "L": 0
    }

    for att in attendances:
        status = (att.status or "").upper()

        if status in summary:
            summary[status] += 1

    return summary

def calculate_status_from_time(date_str, checkin):
    """
    Menentukan status berdasarkan tanggal dan waktu check-in.
    Mengikuti aturan process_attendance_recap_incremental().
    """

    if not checkin:
        return "A"

    try:
        check_date = datetime.datetime.strptime(
            date_str,
            "%Y-%m-%d"
        ).date()

        checkin_time = datetime.datetime.strptime(
            checkin,
            "%H:%M"
        ).time()

    except (ValueError, TypeError):
        return "A"

    # ==========================================
    # CEK WEEKEND / HARI LIBUR
    # ==========================================

    is_weekend = check_date.weekday() >= 5

    is_holiday = is_holiday_date(check_date)

    if is_weekend or is_holiday:
        return "L"

    # ==========================================
    # DEADLINE
    # ==========================================

    deadline_str = current_app.config.get(
        "ATTENDANCE_DEADLINE",
        "07:11:00"
    )

    deadline = datetime.datetime.strptime(
        deadline_str,
        "%H:%M:%S"
    ).time()

    # ==========================================
    # STATUS
    # ==========================================

    if checkin_time <= deadline:
        return "H"

    return "T"