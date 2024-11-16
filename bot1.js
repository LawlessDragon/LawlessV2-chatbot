import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import axios from "axios";
import moment from "moment-timezone";
import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';

// Menampilkan banner di terminal
(async () => {
    figlet('lawless Dragon', (err, data) => {
        if (err) {
            console.log('Something went wrong...');
            console.dir(err);
            return;
        }
        console.log(chalk.blue(data));
    });
})();

import { fileURLToPath } from 'url';
import path from 'path';
import * as rimraf from 'rimraf';

// Mendefinisikan __dirname di ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lokasi folder sesi
const sessionFolder = path.join(__dirname, 'session_data');

// Fungsi untuk reset folder sesi
const resetSessionFolder = () => {
    try {
        if (fs.existsSync(sessionFolder)) {
            rimraf.sync(sessionFolder);
            console.log('Folder sesi lama dihapus.');
        }
        fs.mkdirSync(sessionFolder, { recursive: true });
        console.log('Folder sesi baru dibuat.');
    } catch (error) {
        console.error('Error saat reset folder sesi:', error);
    }
};

// Inisialisasi client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionFolder }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote'
        ],
        headless: true,
    }
});

// Event QR Code
client.on('qr', (qr) => {
    console.log('QR code diterima, scan untuk login.');
    qrcode.generate(qr, { small: true });
});

// Event ketika bot siap
client.on('ready', () => {
    console.log('Client siap terhubung!');
});

// Event jika sesi terputus
client.on('disconnected', async (reason) => {
    console.log('Sesi terputus:', reason);
    try {
        console.log('Menutup koneksi...');
        await client.destroy();
        console.log('Mereset sesi...');
        resetSessionFolder();
        console.log('Menginisialisasi ulang...');
        await client.initialize();
    } catch (error) {
        console.error('Error saat reconnect:', error);
    }
});

// Event jika autentikasi gagal
client.on('auth_failure', async () => {
    console.log('Autentikasi gagal, mencoba reset sesi...');
    try {
        await client.destroy();
        resetSessionFolder();
        await client.initialize();
    } catch (error) {
        console.error('Error saat auth failure:', error);
    }
});

// Periodically check every 20 minutes (1200000 ms) for reconnection
setInterval(() => {
    // Check if there's internet connectivity
    if (isInternetAvailable()) {
        // If internet is available, attempt to reconnect
        if (!client.isReady) {
            console.log('Internet available, attempting reconnect...');
            client.initialize();
        }
    }
}, 1200000); // Check every 20 minutes

/**
 * ALL Commands Handler
 */
const myNumber = '6287877383633@c.us';
let sapaStatus = loadSapaStatus();

// Fungsi untuk menyapa pengguna baru
async function sapaPengguna(msg, client) {
    const today = new Date().toISOString().slice(0, 10);
    const userLastSapa = sapaStatus[msg.from];

    if (userLastSapa !== today) {
        sapaStatus[msg.from] = today;
        saveSapaStatus(sapaStatus);

        try {
            await client.sendMessage(
                msg.from,
                "> _Rawrrr! Hai, aku Lawless! Aku di sini buat bantu kamu. Ketik titik (.) di awal pesan kalau mau ngobrol, ya! Kalau mau nunggu pemilikku, silakan kirim pesan biasa. :3_"
            );
        } catch (error) {
            console.error("Gagal mengirim pesan sapaan:", error.message);
        }
    }
}

// Fungsi utama handler untuk semua perintah berbasis titik
async function handler(msg) {
    const command = msg.body.split(" ")[0].substring(1);
    const args = msg.body.split(" ").slice(1);

    try {
        if (command === 'cuaca') {
            const city = args.join(" ") || 'Jakarta';
            const weatherAndForecast = await getWeatherAndForecast(city);
            await msg.reply(weatherAndForecast);
        } else if (command === 'waktu') {
            const city = args.join(" ") || 'Jakarta';
            const currentTime = getCurrentTime(city);
            await msg.reply(currentTime);
        } else if (command === 'jadwal') {
            const hari = args.length > 0 ? args[0] : new Date().toLocaleDateString('id-ID', { weekday: 'long' });
            await kirimJadwalKuliah(msg, hari);
        } else {
            // Panggil Gemini untuk perintah yang tidak dikenal
            const content = msg.body.slice(1).trim(); // Hapus titik di awal
            const response = await getGeminiResponse(content);
            await msg.reply(response);
        }
    } catch (error) {
        console.error("Error in handler:", error);
        await msg.reply(`🛑 *ERROR*: ${error.message}`);
    }
}

// Event utama untuk menangani pesan masuk
client.on("message_create", async (msg) => {
    const senderId = msg.from;
    const authorId = msg.author || senderId;
    const isGroupMessage = msg.from.includes("@g.us");
    const isPrivateChat = msg.from.endsWith("@c.us");
    const isFromOwner = authorId === myNumber;

    // Sapaan untuk chat pribadi yang bukan dari pemilik
    if (isPrivateChat && !isFromOwner) {
        await sapaPengguna(msg, client);
    }

    // Jika pesan tidak diawali dengan titik, tidak perlu diproses lebih lanjut
    if (!msg.body.startsWith(".")) return;

    // Logika untuk pesan grup - hanya proses jika dari pemilik
    if (isGroupMessage && !isFromOwner) {
        return;
    }

    // Proses pesan dengan handler
    await handler(msg);
});

// Fungsi untuk memuat status sapaan dari penyimpanan
function loadSapaStatus() {
    try {
        if (!fs.existsSync('./sapaStatus.json')) {
            const today = new Date().toISOString().slice(0, 10);
            const initialStatus = { lastCheckedDate: today };
            fs.writeFileSync('./sapaStatus.json', JSON.stringify(initialStatus, null, 2));
            return initialStatus;
        }
        const data = JSON.parse(fs.readFileSync('./sapaStatus.json'));
        
        const today = new Date().toISOString().slice(0, 10);
        if (data.lastCheckedDate !== today) {
            const newStatus = { lastCheckedDate: today };
            fs.writeFileSync('./sapaStatus.json', JSON.stringify(newStatus, null, 2));
            return newStatus;
        }
        
        return data;
    } catch (error) {
        console.error("Gagal memuat status sapaan:", error.message);
        return { lastCheckedDate: new Date().toISOString().slice(0, 10) };
    }
}

// Fungsi untuk menyimpan status sapaan ke penyimpanan
function saveSapaStatus(status) {
    fs.writeFileSync('./sapaStatus.json', JSON.stringify(status, null, 2));
}

import 'moment/locale/id.js'; // Import the Indonesian locale with the .js extension

const getCurrentTime = (city) => {
    const timezoneMap = {
        "Jakarta": "Asia/Jakarta",
        "Bandung": "Asia/Jakarta",
        "Yogyakarta": "Asia/Jakarta",
        "Makassar": "Asia/Makassar",
        "Bali": "Asia/Makassar",
        "Jayapura": "Asia/Jayapura"
    };

    const timezone = timezoneMap[city] || timezoneMap["Jakarta"]; // Default ke Jakarta jika kota tidak ditemukan
    moment.locale('id'); // Set locale to Indonesian

    const date = moment.tz(timezone).format('dddd, D MMMM YYYY');
    const time = moment.tz(timezone).format('hh:mm:ss A'); // Menggunakan format 12 jam

    const zoneAbbr = {
        "Asia/Jakarta": "WIB",
        "Asia/Makassar": "WITA",
        "Asia/Jayapura": "WIT"
    }[timezone];

    const output = `------------------------------
⏳ Waktu Saat Ini
------------------------------
🌍 ${city} (${zoneAbbr})
📅 ${date}
🕒 ${time}
------------------------------`;

    return output;
};

const translateWeatherCondition = (condition) => {
    // Kamus terjemahan kondisi cuaca spesifik
    const translations = {
        "Clear": "Cerah",  // Langit cerah tanpa awan
        "Patchy light rain": "hujan ringan lokal",
        "Moderate rain at times": "Hujan sedang sesekali",
        "Patchy light drizzle": "Gerimis Ringan",  // Hujan rintik ringan
        "Partly Cloudy": "Cerah Berawan",  // Langit cerah dengan beberapa awan
        "Light rain shower": "Hujan Gerimis Ringan",  // Hujan gerimis ringan
        "Overcast": "Berawan",  // Langit tertutup awan tebal
        "Rain": "Hujan",  // Hujan umum
        "Thunderstorm": "Badai Petir",  // Badai disertai petir
        "Snow": "Salju",  // Salju turun
        "Fog": "Kabut",  // Kabut tebal mengurangi jarak pandang
        "Mist": "Kabut",  // Kabut ringan
        "Patchy rain nearby": "Hujan Rintik di Dekat",  // Hujan rintik di sekitar
        "Thunderstorm in vicinity": "Badai Petir di Sekitar",  // Badai petir di sekitar
        "Drizzle": "Gerimis",  // Hujan sangat ringan
        "Light rain": "Hujan Ringan",  // Hujan dengan intensitas rendah
        "Heavy rain": "Hujan Deras",  // Hujan dengan intensitas tinggi
        "Sunny": "Cerah dengan Langit Terang",  // Langit cerah tanpa awan
        "Blowing snow": "Salju Berhembus",  // Salju yang tertiup angin
        "Hail": "Hujan Es",  // Hujan disertai butiran es
        "Sleet": "Hujan Salju",  // Campuran salju dan hujan
        "Blizzard": "Badai Salju",  // Badai salju
        "Smoke": "Asap",  // Asap tebal
        "Dust": "Debu",  // Debu berterbangan
        "Sand": "Pasir",  // Pasir berterbangan
        "Freezing rain": "Hujan Beku",  // Hujan dengan suhu di bawah titik beku
        "Light drizzle": "Gerimis Ringan",  // Hujan gerimis ringan
        "Heavy drizzle": "Gerimis Berat",  // Hujan gerimis dengan intensitas lebih tinggi
        "Ice pellets": "Pellet Es",  // Es berbentuk kecil
        "Windy": "Berangin",  // Angin kencang
        "Showers": "Hujan Singkat",  // Hujan singkat namun deras
        "Tornado": "Angin Tornado",  // Puting beliung
        "Haze": "Kabut Tipis",  // Kabut ringan yang mengurangi jarak pandang
        "Light snow": "Salju Ringan",  // Salju dengan intensitas ringan
        "Heavy snow": "Salju Berat",  // Salju dengan intensitas tinggi
        "Scattered showers": "Hujan Lokal",  // Hujan singkat di beberapa area
        "Scattered thunderstorms": "Badai Petir Lokal"  // Badai petir lokal
    };

    // Menghilangkan spasi di awal dan akhir string sebelum diterjemahkan
    const sanitizedCondition = condition.trim();

    // Jika kondisi mengandung kata "Cloudy" atau "cloud"
    if (sanitizedCondition.toLowerCase().includes("cloud")) {
        return "Cerah Berawan"; // Menganggap semua kondisi yang mengandung awan sebagai Cerah Berawan
    }

    // Menerjemahkan kondisi cuaca menggunakan kamus
    return translations[sanitizedCondition] || sanitizedCondition;  // Mengembalikan kondisi yang sudah diterjemahkan
};

const getWeatherData = async (location) => {
    try {
        console.log(`Mengambil data cuaca untuk ${location}...`);
        const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log("Data cuaca berhasil diambil.");
        return data;
    } catch (error) {
        console.error("Terjadi kesalahan saat mengambil data cuaca:", error);
        return null;
    }
};

function getWindArrow(degree) {
    if (degree >= 0 && degree < 45) return "↑";
    else if (degree >= 45 && degree < 90) return "↗";
    else if (degree >= 90 && degree < 135) return "→";
    else if (degree >= 135 && degree < 180) return "↘";
    else if (degree >= 180 && degree < 225) return "↓";
    else if (degree >= 225 && degree < 270) return "↙";
    else if (degree >= 270 && degree < 315) return "←";
    else return "↖";
}

function formatTime(time) {
    const hours = String(time).padStart(2, '0');
    const minutes = String(time).slice(-2);
    return `${hours}:${minutes}`;
}

function getPeriodsByCurrentTime() {
    const currentHour = new Date().getHours();

    if (currentHour >= 6 && currentHour < 12) {
        return ["pagi"];
    } else if (currentHour >= 12 && currentHour < 18) {
        return ["siang"];
    } else if (currentHour >= 18 && currentHour < 21) {
        return ["sore"];
    } else {
        return ["malam"];
    }
}

function processCurrentWeather(data) {
    if (data) {
        const currentCondition = data.current_condition[0];
        const translatedCondition = translateWeatherCondition(currentCondition.weatherDesc[0]?.value || "Tidak Diketahui");

        return {
            condition: translatedCondition,
            temperature: `${currentCondition.temp_C}°C`,
            windSpeed: `${currentCondition.windspeedKmph} km/h`,
            windDirection: getWindArrow(currentCondition.winddirDegree),
            humidity: `${currentCondition.humidity}%`,
            pressure: `${currentCondition.pressure} hPa`,
            sunrise: data.weather[0].astronomy[0].sunrise,
            sunset: data.weather[0].astronomy[0].sunset,
        };
    } else {
        return null;
    }
}

function processForecastWithPeriods(data) {
    if (!data) return null;

    const periods = getPeriodsByCurrentTime();
    const periodEmojis = {
        pagi: "🌅",
        siang: "🌄",
        sore: "🌇",
        malam: "🌃"
    };
    const forecasts = {};

    // Menentukan periode waktu yang harus diambil berdasarkan periode yang saat ini aktif
    const timeRanges = {
        pagi: [6, 12],
        siang: [12, 18],
        sore: [18, 21],
        malam: [21, 24]
    };

    // Menentukan periode ramalan yang akan ditampilkan
    let activePeriods = [];
    if (periods.includes("pagi")) activePeriods = ["pagi", "siang", "sore", "malam"];
    else if (periods.includes("siang")) activePeriods = ["siang", "sore", "malam"];
    else if (periods.includes("sore")) activePeriods = ["sore", "malam"];
    else if (periods.includes("malam")) activePeriods = ["malam"];

    // Proses ramalan untuk periode yang aktif
    activePeriods.forEach(period => {
        const timeRange = timeRanges[period];
        const forecast = data.weather[0].hourly.find(hourly => {
            const hour = parseInt(hourly.time) / 100;
            return hour >= timeRange[0] && hour < timeRange[1];
        });

        if (forecast) {
            forecasts[period] = {
                emoji: periodEmojis[period],
                time: formatTime(forecast.time),
                condition: translateWeatherCondition(forecast.weatherDesc[0]?.value || "Tidak Diketahui"),
                temperature: forecast.tempC !== undefined ? `${forecast.tempC}°C` : "N/A"
            };
        }
    });

    return forecasts;
}

const getWeatherAndForecast = async (city) => {
    try {
        const weatherData = await getWeatherData(city);

        if (weatherData) {
            const currentWeather = processCurrentWeather(weatherData);
            const forecast = processForecastWithPeriods(weatherData);

            if (!currentWeather || !forecast) {
                return 'Terjadi kesalahan dalam mendapatkan informasi cuaca atau ramalan.';
            }

            let forecastMessage = "";
            for (const period in forecast) {
                const forecastData = forecast[period];
                forecastMessage += `\n${forecastData.emoji} ${period.charAt(0).toUpperCase() + period.slice(1)}: ${forecastData.condition}: ${forecastData.temperature}`;
            }

            const weatherMessage = `
🌤️ Cuaca Saat Ini di ${city} 🌤️
---------------------------------------
🌫 Kondisi Cuaca: ${currentWeather.condition}
🌡️ Suhu: ${currentWeather.temperature}
💨 Kecepatan Angin: ${currentWeather.windSpeed} ${currentWeather.windDirection}
💧 Kelembapan: ${currentWeather.humidity}
🌬️ Tekanan Atmosfer: ${currentWeather.pressure}
🌅 Waktu Matahari Terbit: ${currentWeather.sunrise}
🌇 Waktu Matahari Terbenam: ${currentWeather.sunset}
---------------------------------------
🌤️ Ramalan Cuaca di ${city} Hari Ini 🌤️
---------------------------------------${forecastMessage}
---------------------------------------`.trim();

            return weatherMessage;
        } else {
            return 'Terjadi kesalahan saat mendapatkan cuaca. Pastikan nama kota benar dan coba lagi.';
        }
    } catch (error) {
        console.error("Terjadi kesalahan dalam pengolahan data:", error);
        return 'Terjadi kesalahan dalam pengolahan data cuaca dan ramalan.';
    }
};

moment.locale('id');  // Set to Indonesian locale

// Fungsi untuk membaca file JSON (sama seperti sebelumnya, kita anggap file JSON sudah tersedia)
function getJadwalKuliah() {
    const data = fs.readFileSync('MATKUL.json', 'utf8'); // Ganti dengan path file yang sesuai
    return JSON.parse(data); // Membaca file JSON dan mengonversinya menjadi objek
}

// Fungsi untuk mengirim jadwal kuliah
async function kirimJadwalKuliah(msg, hari) {
    const jadwalKuliah = getJadwalKuliah();
    const jadwalHari = jadwalKuliah.filter(kuliah => kuliah.hari.toLowerCase() === hari.toLowerCase());

    if (jadwalHari.length > 0) {
        let tanggalHari = moment().isoWeekday(hari).add(1, 'week').format('dddd, D MMMM YYYY'); // Dapatkan tanggal minggu depan
        let pesan = `🎓 *Jadwal Kuliah Hari ${tanggalHari}:*\n`;
        pesan += `━━━━━━━━━━━━━━━━━━\n`; // Garis pemisah di awal

        let pertemuanKe = 8; // Memulai dari pertemuan ke-8 minggu depan
        jadwalHari.forEach((kuliah, index) => {
            pesan += `📚 *Mata Kuliah:* ${kuliah.mataKuliah}\n`;
            pesan += `👨‍🏫 *Pengajar:* ${kuliah.pengajar}\n`;
            pesan += `⏰ *Waktu:* ${kuliah.waktu}\n`;
            pesan += `🏫 *Ruang:* ${kuliah.ruang}\n`;
            pesan += `📅 *Pelaksanaan:* ${kuliah.pelaksanaan}\n`;
            pesan += `📝 *Pertemuan ke:* ${pertemuanKe}\n`;

            // Tambahkan garis pemisah hanya jika ada lebih dari satu mata kuliah
            if (index < jadwalHari.length - 1) {
                pesan += `-----------------------------------\n`; // Baris baru sebelum garis pemisah
            }
        });

        // Garis pemisah akhir tanpa spasi setelahnya
        pesan += `━━━━━━━━━━━━━━━━━━`; 

        await msg.reply(pesan);
    } else {
        await msg.reply(`❌ Tidak ada jadwal kuliah untuk hari ${hari}.`);
    }
}

// Inisialisasi variabel yang diperlukan
let messageHistory = {};
const MAX_HISTORY = 25;  
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; 
const chattedUsers = new Set();

async function getGeminiResponse(prompt) {
    if (!prompt) return "Gak ada perintah yang diberikan.";

    const conversationalPrompt = `
Kamu adalah Lawless si Naga Biru, teman ngobrol yang santai, bisa dipercaya, dan tahu cara menjaga suasana tetap ringan. Kamu juga punya kemampuan untuk mencari dan memberikan informasi yang dibutuhkan, tapi kamu nggak harus selalu pakai data baku atau jawaban kaku. Coba jawab dengan cara yang lebih fleksibel dan natural, dan sesuaikan dengan obrolan yang lagi berlangsung.
Kalau ada yang tanya soal hal tertentu, kamu bisa berbagi pengetahuan dengan cara yang mudah dipahami, tanpa kesan terlalu serius atau formal. Kamu bisa berbicara tentang apapun, mulai dari topik ringan sampai yang lebih dalam, dan pastikan selalu menjaga nuansa obrolan tetap enak.
Jadi, meski kamu seorang naga biru yang misterius, kamu tetap asik diajak ngobrol, nggak cuma soal fakta, tapi juga tentang hal-hal santai. Tapi kalau ada pertanyaan yang lebih serius atau butuh informasi, kamu juga bisa langsung kasih penjelasan yang tepat, dengan cara yang tetap nyaman didenger.
${prompt}
`;

    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyD2JTY0nxLyyHbjH2gdSYXPYXZvx44Y3Fo";

    try {
        const response = await axios.post(apiUrl, { contents: [{ parts: [{ text: conversationalPrompt }] }] }, { headers: { "Content-Type": "application/json" } });
        const chatResponse = response.data.candidates?.[0].content.parts?.[0].text || "Tidak ada respons dari Gemini.";
        return chatResponse;
    } catch (error) {
        console.error("Error:", error.message);
        return "Terjadi kesalahan saat menghubungi Gemini.";
    }
}

function saveMessageHistory(senderId, msg) {
    if (!messageHistory[senderId]) {
        messageHistory[senderId] = [];
    }

    messageHistory[senderId].push({
        timestamp: Date.now(),
        message: msg
    });

    if (messageHistory[senderId].length > MAX_HISTORY) {
        messageHistory[senderId].shift();
    }
}

function checkMessageInactivity() {
    const now = Date.now();
    
    for (let senderId in messageHistory) {
        const history = messageHistory[senderId];
        const lastMessage = history[history.length - 1];

        if (now - lastMessage.timestamp > INACTIVITY_TIMEOUT) {
            delete messageHistory[senderId];
        }
    }
}

setInterval(checkMessageInactivity, 60 * 1000);

const resetChattedUsers = () => {
    const now = moment().tz("Asia/Jakarta");
    const resetTime = now.clone().set({ hour: 23, minute: 59, second: 0, millisecond: 0 });

    if (now.isAfter(resetTime)) {
        chattedUsers.clear();
        console.log("Sapaan pengguna telah direset.");
    }
};

setInterval(resetChattedUsers, 60000);

client.initialize();