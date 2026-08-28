from flask import Blueprint, redirect, render_template, request, jsonify, session, url_for
from models import db, User
from models import User
from functools import wraps

user_bp = Blueprint("user", __name__)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):

        if "user_id" not in session:
            return redirect("/login")

        return f(*args, **kwargs)

    return decorated_function

@user_bp.route("/login", methods=["POST"])
def login():

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")

    user = User.query.filter_by(
        username=username
    ).first()

    print(username)
    print(password)

    if not user or not user.check_password(password):
        return render_template("login.html", error="Username atau Password Salah")

    print(user.check_password(password))

    session["user_id"] = user.id
    session["username"] = user.username
    session["role"] = user.role

    return redirect("/")

@user_bp.route("/logout", methods=["GET"])
def logout():
    session.clear()
    return redirect("/login")

# ==========================================================
# GET - Semua user
# ==========================================================

@user_bp.route("/api/users", methods=["GET"])
def get_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify([
        {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at
        }
        for user in users
    ]), 200


# ==========================================================
# POST - Tambah user
# ==========================================================

@user_bp.route("/api/users", methods=["POST"])
def create_user():

    data = request.get_json() or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    role = str(data.get("role", "user")).strip()
    is_active = data.get("is_active", True)

    # Validasi
    if not username:
        return jsonify({
            "error": "Username wajib diisi"
        }), 400

    if not password:
        return jsonify({
            "error": "Password wajib diisi"
        }), 400

    # Cek username
    existing_user = User.query.filter_by(
        username=username
    ).first()

    if existing_user:
        return jsonify({
            "error": "Username sudah digunakan"
        }), 409

    # Buat user
    user = User(
        username=username,
        role=role,
        is_active=bool(is_active)
    )

    # Hash password
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "User berhasil dibuat",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "is_active": user.is_active
        }
    }), 201


# ==========================================================
# PUT - Update user
# ==========================================================

@user_bp.route("/api/user/password", methods=["PUT"])
@login_required
def update_my_password():

    user_id = session.get("user_id")

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User tidak ditemukan"
        }), 404

    data = request.get_json() or {}
    password = data.get("password", "")

    if not password:
        return jsonify({
            "error": "Password tidak boleh kosong"
        }), 400

    user.set_password(password)

    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Password berhasil diperbarui"
    }), 200