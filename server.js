// backend/server.js
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const Datastore = require('nedb-promises');

const haberleriCekVeKaydet = require('./utils/rssBot');

const app = express();

// CORS Ayarı: Firebase'deki frontend sitemizin buluttaki backend'e erişebilmesi için şarttır
app.use(cors());
app.use(express.json());

// ⚠️ PORT AYARI GÜNCELLENDİ: Bulut sunucu port atarsa onu kullanır, lokaldeysen 5000'i açar
const PORT = process.env.PORT || 5000;

// Lokal Veritabanı Dosyasını Başlat
const db = Datastore.create({ filename: './haberler.db', autoload: true });
global.haberVeritabani = db;

// API: Haberleri getir ve tarihe göre en yeni en üstte olacak şekilde sırala
app.get('/api/haberler', async (req, res) => {
    try {
        const { kategori } = req.query;
        let sorgu = {};
        
        if (kategori && kategori !== 'Tümü') {
            sorgu.category = kategori;
        }

        const haberler = await db.find(sorgu).sort({ pubDate: -1 });

        res.json({
            success: true,
            data: haberler
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Sunucuyu Başlat (0.0.0.0 dinlemesi bulut sunucuların dış dünyaya kapı açması için kritiktir)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🖥️ Canlı Sunucu ${PORT} portu üzerinde başarıyla ayağa kalktı.`);
    haberleriCekVeKaydet(); // Sunucu ilk açıldığında bot hemen çalışıp havuzu doldurur
});

// Cron Job: Her 10 dakikada bir arka planda otomatik tara
cron.schedule('*/10 * * * *', () => {
    haberleriCekVeKaydet();
});