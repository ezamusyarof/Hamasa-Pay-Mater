def format_periode(periode_str):
    # Dictionary pemetaan angka bulan ke nama bulan Indonesia
    bulan_dict = {
        "01": "Januari",
        "02": "Februari",
        "03": "Maret",
        "04": "April",
        "05": "Mei",
        "06": "Juni",
        "07": "Juli",
        "08": "Agustus",
        "09": "September",
        "10": "Oktober",
        "11": "November",
        "12": "Desember",
    }

    try:
        tahun, bulan = periode_str.split("-")
        nama_bulan = bulan_dict.get(bulan, "")
        return f"{nama_bulan} {tahun}"
    except ValueError:
        return periode_str  # Mengembalikan teks asli jika format tidak sesuai