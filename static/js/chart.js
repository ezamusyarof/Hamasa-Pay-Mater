let payrollChart = null;
let attendanceChart = null;

// CHART PENGELUARAN GAJI
const payrollCanvas = document.getElementById("payrollChart");

if (payrollCanvas) {
    const payrollData = JSON.parse(
        document.getElementById("payrollChartData").textContent );

    if (payrollChart) { payrollChart.destroy(); }
    
    payrollChart = new Chart(payrollCanvas, {
        type: "bar",
        data: {
            labels: payrollData.map(item => item.periode),
            datasets: [{
                label: "Pengeluaran Gaji",
                data: payrollData.map(item => item.total),
                backgroundColor: 'rgba(16, 185, 129, 0.5)', // Warna isi batang (bisa pakai HEX, RGB, atau RGBA)
                borderColor: '#10b981',       // Warna garis tepi batang
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// CHART STATUS KEHADIRAN BULAN INI
const attendanceCanvas = document.getElementById("attendanceChart");

if (attendanceCanvas) {
    const attendanceElement = document.getElementById("attendanceChartData");
    if (attendanceElement) {
        const attendanceData = JSON.parse( attendanceElement.textContent );
        console.log("ATTENDANCE DATA:", attendanceData);
        if (attendanceChart) {
            attendanceChart.destroy();
        }
        attendanceChart = new Chart(attendanceCanvas, {
            type: "doughnut",
            data: {
                labels: [
                    "Hadir",
                    "Terlambat",
                    "Sakit",
                    "Absen",
                    "Lembur"
                ],
                datasets: [{
                    data: [
                        attendanceData.hadir || 0,
                        attendanceData.terlambat || 0,
                        attendanceData.sakit || 0,
                        attendanceData.absen || 0,
                        attendanceData.lembur || 0
                    ],
                    backgroundColor: [
                        '#10b981', // Hijau untuk Hadir
                        '#f59e0b', // Kuning untuk Terlambat
                        '#3b82f6', // Biru untuk Sakit
                        '#ef4444', // Merah untuk Absen
                        '#8b5cf6'  // Ungu untuk Lembur
                    ],
                    borderColor: '#ffffff', // Warna garis pemisah antar potongan donat
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "55%",
                plugins: {
                    legend: {
                        position: "bottom"
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const values =
                                    context.dataset.data;
                                const total = values.reduce(
                                    (sum, value) => sum + value,
                                    0
                                );
                                const value = context.raw;
                                const percentage = total > 0
                                    ? ((value / total) * 100).toFixed(1)
                                    : 0;
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// FORMAT BULAN
function formatMonth(periode) {

    const bulan = [
        "Jan", "Feb", "Mar", "Apr",
        "Mei", "Jun", "Jul", "Agu",
        "Sep", "Okt", "Nov", "Des"
    ];

    return bulan[
        parseInt(periode.split("-")[1]) - 1
    ];
}