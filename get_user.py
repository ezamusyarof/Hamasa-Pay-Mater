from zk import ZK

ip = "192.168.1.201"
port = 4370
password = 12345

zk = ZK(
    ip,
    port=port,
    password=password,
    timeout=10
)

try:
    conn = zk.connect()
    conn.disable_device()

    print("Berhasil terhubung")
    print("=" * 50)

    users = conn.get_users()

    print(f"Jumlah User : {len(users)}")
    print()

    for user in users:
        print(f"UID        : {user.uid}")
        print(f"User ID    : {user.user_id}")
        print(f"Nama       : {user.name}")
        print(f"Privilege  : {user.privilege}")
        print(f"Password   : {user.password}")
        print(f"Card       : {user.card}")
        print("-" * 50)

    conn.enable_device()
    conn.disconnect()

except Exception as e:
    print(e)