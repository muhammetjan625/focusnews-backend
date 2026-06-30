// backend/server.js
const express = require('express');
const cors = require('cors');
const Datastore = require('nedb');
const path = require('path');
const cron = require('node-cron');
const haberleriCekVeKaydet = require('./utils/rssBot');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS ayarları - Frontend'in API'ye erişebilmesi için
app.use(cors());
app.use(express.json());

// Veritabanı bağlantısı (nedb)
const dbPath = path.join(__dirname, 'haberler.db');
global.haberVeritabani = new Datastore({ filename: dbPath, autoload: true });

// ── 🗑️ SİHİRLİ TEMİZLİK KODU ──
// Sunucu her başladığında, eski Sözcü haberlerini veritabanından kökten siler.
global.haberVeritabani.remove({ source: "Sözcü" }, { multi: true }, function (err, numRemoved) {
    if (err) console.error("❌ Sözcü temizlenirken hata:", err);
    else console.log(`🗑️ Veritabanı tertemiz: ${numRemoved} adet eski Sözcü haberi silindi!`);
});

// Veritabanı indeksleme (Hızlı sorgu için)
global.haberVeritabani.ensureIndex({ fieldName: 'link', unique: true }, (err) => {
    if (err) console.log("⚠️ İndeksleme uyarısı (normal):", err.message);
});

// 🔄 Otomatik Haber Tarama (Cron Job)
// Her 15 dakikada bir botu tetikler
cron.schedule('*/15 * * * *', () => {
    haberleriCekVeKaydet();
});

// 📡 API Uç Noktaları (Routes)

// 1. Tüm Haberleri Getir (Ana Sayfa)
app.get('/api/haberler', (e, res) => {
    global.haberVeritabani.find({}).sort({ pubDate: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, data: docs });
    });
});

// 2. Kategoriye Göre Haberleri Getir
app.get('/api/haberler/:kategori', (req, res) => {
    const kategori = req.params.kategori;
    global.haberVeritabani.find({ category: kategori }).sort({ pubDate: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, data: docs });
    });
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`🚀 FocusNews Backend ${PORT} portunda yayında!`);
    // Sunucu ilk açıldığında da bir kez tarama yapalım
    setTimeout(haberleriCekVeKaydet, 5000);
});