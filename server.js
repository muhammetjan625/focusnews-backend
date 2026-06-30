// backend/server.js

// 🔥 NODE.JS V24+ UYUMLULUK YAMASI (POLYFILL)
// NeDB'nin patlamasına sebep olan util.isDate hatasını kökten çözer kanka:
const util = require('util');
if (!util.isDate) {
    util.isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';
}

const express = require('express');
const cors = require('cors');
const Datastore = require('nedb');
const path = require('path');
const cron = require('node-cron');
const haberleriCekVeKaydet = require('./utils/rssBot');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Dosya yolunu garantili hale getirdik
const dbPath = path.resolve(__dirname, 'haberler.db');
console.log(`📂 Veritabanı dosyası burada aranıyor: ${dbPath}`);

global.haberVeritabani = new Datastore({ filename: dbPath, autoload: true });

global.haberVeritabani.ensureIndex({ fieldName: 'link', unique: true }, (err) => {
    if (err) console.log("⚠️ İndeks uyarısı:", err.message);
    else console.log("✅ Benzersiz link indeksi aktif.");
});

// Otomatik tarama (15 dakikada bir)
cron.schedule('*/15 * * * *', () => {
    console.log("⏰ Zamanlayıcı çalıştı, bot tetikleniyor...");
    haberleriCekVeKaydet();
});

// API Endpoints
app.get('/api/haberler', (req, res) => {
    global.haberVeritabani.find({}).sort({ pubDate: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, data: docs });
    });
});

app.get('/api/haberler/:kategori', (req, res) => {
    const kategori = req.params.kategori;
    global.haberVeritabani.find({ category: kategori }).sort({ pubDate: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, data: docs });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 FocusNews Backend http://localhost:${PORT} üzerinde yayında!`);
    
    // Sunucu açıldıktan 2 saniye sonra botu kesin olarak tetikliyoruz
    console.log("⏳ İlk veri çekme işlemi 2 saniye içinde başlayacak...");
    setTimeout(() => {
        haberleriCekVeKaydet();
    }, 2000);
});