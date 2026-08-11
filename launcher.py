import threading
import time
import webview

from waitress import serve
from app import app   # Sesuaikan jika nama file utama bukan app.py

def run_server():
    serve(app, host="127.0.0.1", port=5000)

# Jalankan Flask di background
threading.Thread(target=run_server, daemon=True).start()

# Tunggu sebentar agar server siap
time.sleep(1)

# Buka aplikasi desktop
webview.create_window(
    "Attendance System",
    "http://127.0.0.1:5000",
    width=1400,
    height=850
)

webview.start()