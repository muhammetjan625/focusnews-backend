// Node.js 24+ için NeDB uyumluluk yaması
const util = require('util');

if (typeof util.isDate !== 'function') {
    util.isDate = (obj) =>
        Object.prototype.toString.call(obj) === '[object Date]';
}

const express = require('express');
const cors = require('cors');
const Datastore = require('nedb');
const path = require('path');
const https = require('https');
const axios = require('axios');
require('dotenv').config();

const haberleriCekVeKaydet = require('./utils/rssBot');

const app = express();
const PORT = process.env.PORT || 5000;

// Render servisinin adresi
const RENDER_URL =
    process.env.RENDER_URL ||
    'https://focusnews-api.onrender.com/api/haberler?limit=1';

// ==========================================
// ⚙️ YÖNETİM & DİNAMİK AYARLAR (STATE)
// ==========================================
let sistemBakimModunda = false;
let rssDakikaAraligi = 3; // Varsayılan 3 dakika

// Dinamik RSS Kaynakları Listesi
let dinamikRssKaynaklari = [
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', source: 'Anadolu Ajansi', category: 'Gundem' },
    { url: 'https://www.trthaber.com/sondakika_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss', source: 'Haberturk', category: 'Gundem' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=dunya', source: 'Anadolu Ajansi', category: 'Dunya' },
    { url: 'https://www.trthaber.com/dunya_articles.rss', source: 'TRT Haber', category: 'Dunya' },
    { url: 'https://www.haberturk.com/rss/dunya.xml', source: 'Haberturk', category: 'Dunya' },
    { url: 'https://www.haberturk.com/rss/magazin.xml', source: 'Haberturk', category: 'Magazin' },
    { url: 'https://www.trthaber.com/yasam_articles.rss', source: 'TRT Haber', category: 'Magazin' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi', source: 'Anadolu Ajansi', category: 'Ekonomi' },
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', source: 'TRT Haber', category: 'Ekonomi' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', source: 'Haberturk', category: 'Ekonomi' },
    { url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', source: 'TRT Haber', category: 'Teknoloji' },
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'Teknoloji' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', source: 'Anadolu Ajansi', category: 'Spor' },
    { url: 'https://www.trthaber.com/spor_articles.rss', source: 'TRT Haber', category: 'Spor' },
    { url: 'https://www.haberturk.com/rss/spor.xml', source: 'Haberturk', category: 'Spor' }
];

// ==========================================
// 🛡️ CORS VE GÜVENLİK AYARLARI
// ==========================================
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://momonews.web.app',
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('CORS politikası tarafından engellendi.'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: '20kb' }));

// ==========================================
// VERİTABANI
// ==========================================
const dbPath = path.resolve(__dirname, 'haberler.db');
console.log(`📂 Veritabanı dosyası: ${dbPath}`);

global.haberVeritabani = new Datastore({
    filename: dbPath,
    autoload: true
});

global.haberVeritabani.ensureIndex(
    { fieldName: 'link', unique: true },
    (err) => {
        if (err) {
            console.error('⚠️ İndeks oluşturma hatası:', err.message);
        } else {
            console.log('✅ Benzersiz haber bağlantısı indeksi aktif.');
        }
    }
);

// ==========================================
// DİNAMİK RSS TARAMA DÖNGÜSÜ
// ==========================================
let rssIslemDevamEdiyor = false;

async function rssTaramasiBaslat() {
    if (rssIslemDevamEdiyor) return;
    rssIslemDevamEdiyor = true;

    try {
        // Fonksiyona dinamik kaynakları argüman olarak gönderiyoruz
        await haberleriCekVeKaydet(dinamikRssKaynaklari);
    } catch (err) {
        console.error('❌ RSS tarama hatası:', err.message);
    } finally {
        rssIslemDevamEdiyor = false;
    }
}

// Tarama aralığını dinamik olarak yöneten interval mekanizması
let canliTaramaInterval = null;

function taramaZamanlayicisiniGuncelle(dakika) {
    if (canliTaramaInterval) clearInterval(canliTaramaInterval);
    const milisaniye = Number(dakika) * 60 * 1000;
    
    canliTaramaInterval = setInterval(() => {
        rssTaramasiBaslat();
    }, milisaniye);

    console.log(`⏱️ RSS tarama döngüsü güncellendi: Her ${dakika} dakikada bir taranacak.`);
}

// Başlangıçta 3 dakika olarak başlat
taramaZamanlayicisiniGuncelle(rssDakikaAraligi);

// ==========================================
// ANTI-SLEEP / KEEP-ALIVE
// ==========================================
const keepAliveTimer = setInterval(() => {
    console.log('⚡ Keep-alive isteği gönderiliyor...');

    const request = https.get(RENDER_URL, (res) => {
        console.log(`🌐 Keep-alive HTTP durumu: ${res.statusCode}`);
        res.resume();
    });

    request.setTimeout(15000, () => {
        request.destroy(new Error('Keep-alive isteği zaman aşımına uğradı.'));
    });

    request.on('error', (err) => {
        console.error('⚠️ Keep-alive hatası:', err.message);
    });
}, 5 * 60 * 1000);

// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================
function pozitifTamSayi(value, varsayilan, maksimum) {
    const sayi = Number(value);
    if (!Number.isSafeInteger(sayi) || sayi < 1) {
        return varsayilan;
    }
    return Math.min(sayi, maksimum);
}

function regexIcinKacir(metin) {
    return metin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// API: TÜM HABERLER
// GET /api/haberler
// ==========================================
app.get('/api/haberler', (req, res) => {
    const { search, since } = req.query;

    const limit = pozitifTamSayi(req.query.limit, 50, 100);
    const page = pozitifTamSayi(req.query.page, 1, 1000000);
    const skipAmount = (page - 1) * limit;

    const query = {};

    if (typeof search === 'string' && search.trim()) {
        const arama = new RegExp(regexIcinKacir(search.trim()), 'i');
        query.$or = [
            { title: arama },
            { contentSnippet: arama },
            { source: arama }
        ];
    }

    if (typeof since === 'string' && since.trim()) {
        query.pubDate = { $gte: since.trim() };
    }

    global.haberVeritabani
        .find(query)
        .sort({ pubDate: -1 })
        .skip(skipAmount)
        .limit(limit)
        .exec((err, docs) => {
            if (err) {
                console.error('Haber sorgulama hatası:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Haberler alınırken bir hata oluştu.'
                });
            }

            global.haberVeritabani.count(query, (countErr, total) => {
                if (countErr) {
                    console.error('Haber sayma hatası:', countErr.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Haber sayısı alınamadı.'
                    });
                }

                return res.json({
                    success: true,
                    count: docs.length,
                    totalAmount: total,
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    bakimModu: sistemBakimModunda, // Frontend bakım durumu takibi için
                    data: docs
                });
            });
        });
});

// ==========================================
// API: KATEGORİYE GÖRE HABERLER
// GET /api/haberler/:kategori
// ==========================================
app.get('/api/haberler/:kategori', (req, res) => {
    const kategori = req.params.kategori;

    const limit = pozitifTamSayi(req.query.limit, 50, 100);
    const page = pozitifTamSayi(req.query.page, 1, 1000000);
    const skipAmount = (page - 1) * limit;

    const query = { category: kategori };

    global.haberVeritabani
        .find(query)
        .sort({ pubDate: -1 })
        .skip(skipAmount)
        .limit(limit)
        .exec((err, docs) => {
            if (err) {
                console.error('Kategori sorgulama hatası:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Kategori haberleri alınamadı.'
                });
            }

            global.haberVeritabani.count(query, (countErr, total) => {
                if (countErr) {
                    console.error('Kategori haber sayma hatası:', countErr.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Kategori haber sayısı alınamadı.'
                    });
                }

                return res.json({
                    success: true,
                    count: docs.length,
                    totalAmount: total,
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    bakimModu: sistemBakimModunda,
                    data: docs
                });
            });
        });
});

// ==========================================
// API: DİSCORD GERİ BİLDİRİMİ
// POST /api/geribildirim
// ==========================================
app.post('/api/geribildirim', async (req, res) => {
    const mesaj =
        typeof req.body?.mesaj === 'string'
            ? req.body.mesaj.trim()
            : '';

    if (!mesaj) {
        return res.status(400).json({
            success: false,
            error: 'Mesaj boş olamaz.'
        });
    }

    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1564770542521815040/ubPpG7LKSvJ4sA0y1I1L7j_lyj9lmhJpfKewLyov-dNWaFMJgWtgxF3w7V3KK8DhMpJ3';

    try {
        const discordResponse = await axios.post(
            DISCORD_WEBHOOK_URL,
            {
                content: '📩 **MomoNews | Yeni Kullanıcı Geri Bildirimi**',
                embeds: [
                    {
                        title: 'Görüş / Öneri / Hata Bildirimi',
                        description: mesaj,
                        color: 3447003,
                        timestamp: new Date().toISOString()
                    }
                ]
            },
            { timeout: 15000 }
        );

        return res.json({
            success: true,
            message: 'Geri bildirim başarıyla iletildi!',
            discordStatus: discordResponse.status
        });
    } catch (err) {
        console.error('🚨 Discord Webhook Hata Detayı:', err.response?.data || err.message);
        return res.status(err.response?.status || 502).json({
            success: false,
            error: 'Discord webhook isteği reddetti.',
            discordStatusCode: err.response?.status || 502,
            discordErrorDetails: err.response?.data || err.message
        });
    }
});

// ==========================================
// SAĞLIK KONTROLÜ
// GET /
// ==========================================
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'MomoNews API çalışıyor.',
        bakimModu: sistemBakimModunda,
        status: 'online'
    });
});

// ==========================================
// 🔒 GİZLİ YÖNETİCİ KONTROL PANELİ API
// ==========================================
app.get('/api/gizli-yonetim/ayarlar', (req, res) => {
    res.json({
        success: true,
        bakimModu: sistemBakimModunda,
        taramaDakika: rssDakikaAraligi,
        kaynaklar: dinamikRssKaynaklari
    });
});

app.post('/api/gizli-yonetim/guncelle', (req, res) => {
    const { sifre, bakimModu, taramaDakika, kaynaklar } = req.body;
    const GIZLI_ADMIN_SIFRESI = process.env.ADMIN_SECRET || 'momo_gizli_anahtar_123!';

    if (sifre !== GIZLI_ADMIN_SIFRESI) {
        return res.status(403).json({ success: false, error: 'Erişim engellendi.' });
    }

    if (typeof bakimModu === 'boolean') {
        sistemBakimModunda = bakimModu;
    }

    if (taramaDakika && Number(taramaDakika) > 0) {
        rssDakikaAraligi = Number(taramaDakika);
        taramaZamanlayicisiniGuncelle(rssDakikaAraligi);
    }

    if (Array.isArray(kaynaklar)) {
        dinamikRssKaynaklari = kaynaklar;
    }

    return res.json({ success: true, message: 'Yönetim ayarları başarıyla güncellendi!' });
});

app.post('/api/gizli-yonetim', async (req, res) => {
    const { sifre, islem } = req.body;
    const GIZLI_ADMIN_SIFRESI = process.env.ADMIN_SECRET || 'momo_gizli_anahtar_123!';

    if (sifre !== GIZLI_ADMIN_SIFRESI) {
        return res.status(403).json({ success: false, error: 'Erişim engellendi.' });
    }

    if (islem === 'rss-tetikle') {
        try {
            await haberleriCekVeKaydet(dinamikRssKaynaklari);
            return res.json({ success: true, message: 'Manuel RSS taraması başarıyla tetiklendi ve veritabanı güncellendi!' });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(400).json({ success: false, error: 'Geçersiz işlem.' });
});

// ==========================================
// SUNUCUYU BAŞLAT
// ==========================================
const server = app.listen(PORT, () => {
    console.log(`🚀 MomoNews Backend http://localhost:${PORT} adresinde çalışıyor.`);
    console.log('⚡ Dinamik Arka Plan RSS Taraması Aktif.');
});

function sunucuyuKapat() {
    console.log('🛑 Sunucu kapatılıyor...');
    clearInterval(keepAliveTimer);
    if (canliTaramaInterval) clearInterval(canliTaramaInterval);

    server.close(() => {
        console.log('✅ Sunucu kapatıldı.');
        process.exit(0);
    });

    setTimeout(() => {
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', sunucuyuKapat);
process.on('SIGINT', sunucuyuKapat);