# TODO - Integrasi Mesin Absensi (ZKTeco 192.168.1.201)

## Steps
- [x] 0. Analisa struktur proyek & dependency (pyzk terinstall)
- [x] 1. Edit `app.py`: `/api/attendance/update` memanggil `fetch_attendance_from_machine()` lalu kembalikan data + hitungan `new_records`
- [x] 2. Edit `static/js/app.js`: `updateAttendance()` tambah loading state, sync, handle response baru, render, toast jumlah baru
- [x] 3. Edit `templates/index.html`: tambahkan `id="btnUpdateAttendance"` pada tombol "Update Data Kehadiran"
- [x] 4. Edit `paymaster_app/routes.py` & `attendance_service.py`: sinkronisasi endpoint update agar tarik dari mesin dulu + return count

## Debug Diagnosa (feedback user)
- [x] `app.py`: tambah endpoint `/api/attendance/debug` yang konek ke mesin & kembalikan data mentah (record.user_id, timestamp, status, punch) + error/count
- [x] `static/js/app.js`: `updateAttendance()` kini juga memanggil `/api/attendance/debug` dan menampilkan hasil mentah dari mesin (alert) untuk diagnosa

## Perbaikan Koneksi Mesin (feedback user - program referensi berhasil)
- [x] `app.py`: `ZK()` kini meneruskan `password=DEVICE_PASSWORD` (default 12345) dan `timeout=10` — sesuai program referensi user yang berhasil
- [x] `app.py`: tambah config `DEVICE_PASSWORD` (env `DEVICE_PASSWORD`, default 12345)
- [x] `paymaster_app/config.py`: tambah `DEVICE_PASSWORD`
- [x] `paymaster_app/services/attendance_service.py`: `ZK()` kini menggunakan `password` + `timeout=10`
- [x] Verifikasi: syntax OK, app import OK, route `/api/attendance/update` & `/api/attendance/debug` terdaftar

## UJI LIVE
- [x] Jalankan app, klik tombol "Update Data Kehadiran"
- [x] Lihat alert berisi data mentah dari mesin (user_id, timestamp, status) — berhasil karena password sudah dipakai
- [x] Cek apakah `record.user_id` cocok dengan `id`/`employee_code` karyawan di tabel (untuk mapping nama)

## Mapping Data Karyawan ke Absensi (feedback user)
- [x] `app.py`: tambah kolom `user_id` pada model `Employee` (ID mesin absensi)
- [x] Migrasi DB: `ALTER TABLE employees ADD COLUMN user_id` + backfill `user_id = employee_code`
- [x] `app.py`: expose `user_id` di `/api/employees`; `add_employee`/`update_employee` menerima & mengelola `user_id`
- [x] `static/js/app.js`: `renderTable()` memakai `emp.user_id` → `employee_code` → `id` sebagai key absensi (agar cocok dengan log mesin)
- [x] Verifikasi LIVE: koneksi mesin berhasil (`Berhasil menarik 0 data absensi baru`), `/api/attendance/update` mengembalikan data key machine user_id (mis. `21_2026-08-06`, `31_2026-08-06`, `11_2026-08-06`) yang sesuai dengan karyawan

## Perbaikan Status H/T (feedback user - hanya T yang muncul)
- [x] **Akar masalah:** `status` dari mesin ZKTeco adalah tipe punch (0=check-in, 1=check-out), bukan hadir/terlambat. Kode lama memetakan `status 1 -> T`, sehingga semua scan check-out menjadi "T" dan menimpa "H" check-in.
- [x] **Solusi:** `update_attendance()` di `app.py` kini menentukan H/T berdasarkan **jam scan paling awal** per karyawan per hari dibanding deadline (`ATTENDANCE_DEADLINE`, default `07:10:00`). Jika jam awal <= deadline → `H`, lebih → `T`. Ini mengikuti logika parsing file `.dat` di frontend.
- [x] `app.py`: tambah config `ATTENDANCE_DEADLINE` (env, default `07:10:00`)
- [x] Verifikasi LIVE: `/api/attendance/update` kini mengembalikan **H count: 2639** dan **T count: 2468** (keduanya muncul)
