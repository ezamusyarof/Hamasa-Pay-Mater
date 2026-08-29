import threading
import time
import base64
import webview

from waitress import serve
from app import app


# ==========================================================
# PYWEBVIEW API
# ==========================================================

class DesktopAPI:

    def save_file(self, data, filename, file_type):
        """
        Menerima file Base64 dari JavaScript
        lalu menampilkan Save File Dialog native.
        """

        try:

            # ==================================================
            # BUKA SAVE DIALOG
            # ==================================================

            window = webview.active_window()

            if not window:
                return {
                    "success": False,
                    "message": "Window aplikasi tidak ditemukan."
                }

            # ==================================================
            # FILTER FILE
            # ==================================================

            if file_type == "png":

                file_types = (
                    "PNG Image (*.png)",
                    "All files (*.*)"
                )

            elif file_type == "pdf":

                file_types = (
                    "PDF Document (*.pdf)",
                    "All files (*.*)"
                )

            elif file_type == "xlsx":

                file_types = (
                    "Excel Workbook (*.xlsx)",
                    "All files (*.*)"
                )

            else:

                file_types = (
                    "All files (*.*)",
                )

            # ==================================================
            # SAVE FILE DIALOG
            # ==================================================

            result = window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=filename,
                file_types=file_types
            )

            # ==================================================
            # USER CANCEL
            # ==================================================

            if not result:

                return {
                    "success": False,
                    "cancelled": True
                }

            # Pywebview dapat mengembalikan tuple/list
            filepath = (
                result[0]
                if isinstance(result, (tuple, list))
                else result
            )

            # ==================================================
            # HILANGKAN PREFIX BASE64
            # ==================================================

            if "," in data:

                data = data.split(",", 1)[1]

            # ==================================================
            # DECODE BASE64
            # ==================================================

            file_bytes = base64.b64decode(data)

            # ==================================================
            # SIMPAN FILE
            # ==================================================

            with open(filepath, "wb") as f:

                f.write(file_bytes)

            # ==================================================
            # SUCCESS
            # ==================================================

            return {
                "success": True,
                "path": filepath
            }

        except Exception as e:

            print(
                "Gagal menyimpan file:",
                e
            )

            return {
                "success": False,
                "message": str(e)
            }

# ==========================================================
# FLASK SERVER
# ==========================================================

def run_server():

    serve(
        app,
        host="127.0.0.1",
        port=5000
    )


# ==========================================================
# START FLASK
# ==========================================================

threading.Thread(
    target=run_server,
    daemon=True
).start()


# Tunggu Flask siap
time.sleep(1)


# ==========================================================
# CREATE DESKTOP WINDOW
# ==========================================================

api = DesktopAPI()

window = webview.create_window(
    "Attendance System",
    "http://127.0.0.1:5000",

    width=1400,
    height=850,

    js_api=api
)


# ==========================================================
# START WEBVIEW
# ==========================================================

webview.start()