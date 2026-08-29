# import os
# import sys
# import firebase_admin
# from firebase_admin import credentials


# def get_base_path():

#     if getattr(sys, "frozen", False):
#         return os.path.dirname(sys.executable)

#     return os.path.dirname(
#         os.path.abspath(__file__)
#     )


# BASE_DIR = get_base_path()

# firebase_json = os.path.join(
#     BASE_DIR,
#     "firebase-service-account.json"
# )


# # ==========================================================
# # INISIALISASI FIREBASE
# # ==========================================================

# if os.path.exists(firebase_json):

#     try:

#         cred = credentials.Certificate(
#             firebase_json
#         )

#         firebase_admin.initialize_app(cred)

#         print("Firebase berhasil diinisialisasi.")

#     except Exception as e:

#         print(
#             f"Gagal menginisialisasi Firebase: {e}"
#         )

# else:

#     print(
#         "firebase-service-account.json tidak ditemukan. "
#         "Firebase dinonaktifkan."
#     )