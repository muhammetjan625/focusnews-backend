// backend/server.js
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

const dbPath = path.join(__dirname, 'haberler.db');
global.haberVeritabani = new Datastore({ filename: dbPath, autoload: true });

// ── 🗑️ ESKİ VERİLERİ TEMİZLEME KATMANI ──
global.haberVeritabani.remove({ source: "Sözcü" }, { multi: true }, (err, num) => {
    if (!err && num > 0) console.log(`🗑️ Veritabanından ${num} adet eski Sözcü haberi silindi.`);
});

global.haberVeritabani.remove({ source: "NTV" }, { multi: true }, (err, num) => {
    if (!err && num > 0) console.log(`🗑️ Veritabanından ${num} adet eski NTV haberi silindi.`);
});

global.haberVeritabani.ensureIndex({ fieldName: 'link', unique: true }, (err) => {
    if (err) console.log("⚠️ İndeks uyarısı (normal):", err.message);
});

// 🔄 Her 15 dakikada bir otomatik tarama
cron.schedule('*/15 * * * *', () => {
    haberleriCekVeKaydet();
});

// 📡 API ENDPOINTS
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
    console.log(`🚀 FocusNews Backend ${PORT} portunda yayında!`);
    setTimeout(haberleriCekVeKaydet, 4000); // İlk açılışta verileri çekmeye başla
});