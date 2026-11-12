// Node.js uyumluluk yaması
const util = require('util');
if (typeof util.isDate !== 'function') {
    util.isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';
}

const express = require('express');
const cors = require('cors');
const https = require('https');
require('dotenv').config();

// Modüler bileşenleri içeri aktar
const { varsayilanKaynaklar } = require('./db');
const { taramaZamanlayicisiniGuncelle, renderSistemiBaslat } = require('./services/scheduler');
const { baslatHavaDurumuZamanlayicisi } = require('./weatherCron');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Custom HTTPS Agent
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 15000
});

// ==========================================
// 🛡️ MİDDLEWARE
// ==========================================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50kb' }));

// ==========================================
// 🌐 ROTALAR (ROUTES)
// ==========================================
app.use('/api', apiRoutes);
app.use('/api/gizli-yonetim', adminRoutes);

// ==========================================
// ⏱️ BAŞLATMA MİMARİSİ
// ==========================================
taramaZamanlayicisiniGuncelle(global.rssDakikaAraligi);
setTimeout(() => renderSistemiBaslat(varsayilanKaynaklar), 2000);

// SUNUCUYU BAŞLAT
app.listen(PORT, () => {
    console.log(`🚀 MomoNews Backend başarıyla çalışıyor: http://localhost:${PORT}`);
    baslatHavaDurumuZamanlayicisi(httpsAgent);
});