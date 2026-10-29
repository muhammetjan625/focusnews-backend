// Node.js uyumluluk yaması
const util = require('util');
if (typeof util.isDate !== 'function') {
    util.isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';
}

const express = require('express');
const cors = require('cors');
const Datastore = require('nedb');
const path = require('path');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

const haberleriCekVeKaydet = require('./utils/rssBot');

// 1. ÖNCE APP OLUŞTURULUR
const app = express();
const PORT = process.env.PORT || 5000;

// SSL sertifika doğrulama hatalarını bypass eden özel agent (Admin panelinden testler için)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 10000
});

// ==========================================
// 🛡️ MİDDLEWARE
// ==========================================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50kb' }));

// ==========================================
// 📂 VERİTABANLARI (NeDB)
// ==========================================
global.haberVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'haberler.db'),
    autoload: true
});

global.rssKaynakVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'rss_kaynaklar.db'),
    autoload: true
});

global.logVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'sistem_loglari.db'),
    autoload: true
});

// Yeni Discord Webhook Veritabanı
global.discordWebhookVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'discord_webhooks.db'),
    autoload: true
});

global.haberVeritabani.ensureIndex({ fieldName: 'link', unique: true });
global.rssKaynakVeritabani.ensureIndex({ fieldName: 'url', unique: true });
global.discordWebhookVeritabani.ensureIndex({ fieldName: 'url', unique: true });

// Varsayılan Webhook'ları .env'den yükle (Eğer DB boşsa)
global.discordWebhookVeritabani.count({}, (err, count) => {
    if (count === 0 && process.env.DISCORD_WEBHOOK_URLS) {
        const envUrls = process.env.DISCORD_WEBHOOK_URLS.split(',').map(u => u.trim()).filter(Boolean);
        const defaultHooks = envUrls.map((url, i) => ({
            isim: `Discord Kanalı ${i + 1}`,
            url: url,
            aktif: true,
            eklenmeTarihi: new Date().toISOString()
        }));
        if (defaultHooks.length > 0) {
            global.discordWebhookVeritabani.insert(defaultHooks, () => {
                console.log('✅ Varsayılan Discord webhooklar veritabanına aktarıldı.');
            });
        }
    }
});

// Varsayılan RSS Kaynakları
const varsayilanKaynaklar = [
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

global.rssKaynakVeritabani.count({}, (err, count) => {
    if (count === 0) {
        global.rssKaynakVeritabani.insert(varsayilanKaynaklar, () => {
            console.log('✅ Varsayılan RSS kaynakları DB-ye yüklendi.');
        });
    }
});

function sistemLogKaydet(tip, mesaj, detay = {}) {
    const logKaydi = { tip, mesaj, detay, tarih: new Date().toISOString() };
    global.logVeritabani.insert(logKaydi);
    console.log(`[LOG - ${tip}]: ${mesaj}`);
}

// Aktif webhook'ları dizi olarak getiren yardımcı
const aktifWebhooksGetir = () => {
    return new Promise((resolve) => {
        global.discordWebhookVeritabani.find({ aktif: true }, (err, docs) => {
            resolve(docs ? docs.map(d => d.url) : []);
        });
    });
};

// ==========================================
// ⏱️ OTOMATİK ZAMANLAYICI (Sadece RSS Taraması Yapar)
// ==========================================
global.rssDakikaAraligi = 3;
let canliTaramaInterval = null;

function taramaZamanlayicisiniGuncelle(dakika) {
    if (canliTaramaInterval) clearInterval(canliTaramaInterval);
    canliTaramaInterval = setInterval(() => {
        global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
            if (kaynaklar && kaynaklar.length > 0) await haberleriCekVeKaydet(kaynaklar);
        });
    }, Number(dakika) * 60 * 1000);
}
taramaZamanlayicisiniGuncelle(global.rssDakikaAraligi);

setTimeout(() => {
    global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
        if (kaynaklar && kaynaklar.length > 0) await haberleriCekVeKaydet(kaynaklar);
    });
}, 3000);

// ==========================================
// 🌐 API ENDPOINTLERİ
// ==========================================
app.get('/api/haberler', (req, res) => {
    global.haberVeritabani.find({}).sort({ pubDate: -1 }).limit(60).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, bakimModu: global.sistemBakimModunda || false, data: docs });
    });
});

// 1. Geri Bildirim Endpointi
app.post('/api/geribildirim', async (req, res) => {
    const { mesaj } = req.body;
    if (!mesaj) return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });

    const webhookUrls = await aktifWebhooksGetir();
    const embedPayload = {
        content: '📩 **MomoNews | Yeni Kullanıcı Geri Bildirimi**',
        embeds: [{ title: 'Görüş / Öneri / Hata', description: mesaj, color: 3447003, timestamp: new Date().toISOString() }]
    };

    for (const url of webhookUrls) {
        try { await axios.post(url, embedPayload, { httpsAgent }); } catch (e) {}
    }

    sistemLogKaydet('GERIBILDIRIM', 'Yeni geri bildirim Discord kanallarına iletildi.');
    res.json({ success: true });
});

// 2. Test Webhook Endpointi (Artık sadece manuel tetiklendiğinde çalışır)
app.get('/api/test-webhook', async (req, res) => {
    const testZamani = new Date().toISOString();
    sistemLogKaydet('WEBHOOK_TEST', 'Test webhook tetiklendi.', { zaman: testZamani });

    const webhookUrls = await aktifWebhooksGetir();
    const embedPayload = {
        content: '🧪 **MomoNews | Discord Webhook Bağlantı Testi**',
        embeds: [{ title: 'Sistem Durumu: Çevrimiçi', description: `Test başarılı.\nZaman: \`${testZamani}\``, color: 5763719, timestamp: testZamani }]
    };

    for (const url of webhookUrls) {
        try { await axios.post(url, embedPayload, { httpsAgent }); } catch (e) {}
    }

    res.json({ success: true, message: 'Test webhook tetiklendi!', timestamp: testZamani });
});

// ==========================================
// 🛠️ YÖNETİM PANELİ (WEBHOOK & RSS CRUD)
// ==========================================

app.get('/api/gizli-yonetim/webhooks', (req, res) => {
    global.discordWebhookVeritabani.find({}, (err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, webhooks: docs || [] });
    });
});

app.post('/api/gizli-yonetim/webhook-ekle', (req, res) => {
    const { isim, url } = req.body;
    if (!url || !isim) return res.status(400).json({ success: false, error: 'İsim ve URL zorunludur.' });

    global.discordWebhookVeritabani.insert({ isim, url, aktif: true, eklenmeTarihi: new Date().toISOString() }, (err) => {
        if (err) return res.status(400).json({ success: false, error: 'Bu webhook zaten kayıtlı.' });
        sistemLogKaydet('WEBHOOK', `Yeni Discord webhook eklendi: ${isim}`);
        res.json({ success: true, message: 'Webhook başarıyla eklendi!' });
    });
});

app.post('/api/gizli-yonetim/webhook-sil', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID gerekli.' });

    global.discordWebhookVeritabani.remove({ _id: id }, {}, (err, numRemoved) => {
        if (err || numRemoved === 0) return res.status(404).json({ success: false, error: 'Webhook bulunamadı.' });
        sistemLogKaydet('WEBHOOK', `Discord webhook silindi (ID: ${id})`);
        res.json({ success: true, message: 'Webhook silindi.' });
    });
});

app.post('/api/gizli-yonetim/webhook-test-gonder', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Webhook URL gerekli.' });

    try {
        await axios.post(url, {
            content: '🧪 **MomoNews | Admin Panelinden Canlı Test Mesajı**',
            embeds: [{ title: 'Bağlantı Başarılı!', description: 'Bu webhook admin panelinden başarıyla test edildi.', color: 65280, timestamp: new Date().toISOString() }]
        }, { httpsAgent });
        sistemLogKaydet('WEBHOOK_TEST', `Admin panelinden manuel test gönderildi: ${url.substring(0, 30)}...`);
        res.json({ success: true, message: 'Test mesajı Discord kanalına gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: `Gönderilemedi: ${err.message}` });
    }
});

app.get('/api/gizli-yonetim/ayarlar', (req, res) => {
    global.rssKaynakVeritabani.find({}, (err, kaynaklar) => {
        res.json({
            success: true,
            bakimModu: global.sistemBakimModunda || false,
            taramaDakika: global.rssDakikaAraligi || 3,
            kaynaklar: kaynaklar || []
        });
    });
});

app.get('/api/gizli-yonetim/loglar', (req, res) => {
    global.logVeritabani.find({}).sort({ tarih: -1 }).limit(100).exec((err, loglar) => {
        res.json({ success: true, loglar: loglar || [] });
    });
});

app.post('/api/gizli-yonetim/loglar-temizle', (req, res) => {
    global.logVeritabani.remove({}, { multi: true }, () => {
        sistemLogKaydet('SISTEM', 'Sistem logları temizlendi.');
        res.json({ success: true, message: 'Loglar temizlendi.' });
    });
});

app.post('/api/gizli-yonetim/guncelle', (req, res) => {
    const { bakimModu, taramaDakika, yeniKaynak, silinecekUrl } = req.body;
    if (typeof bakimModu === 'boolean') global.sistemBakimModunda = bakimModu;
    if (taramaDakika) {
        global.rssDakikaAraligi = Number(taramaDakika);
        taramaZamanlayicisiniGuncelle(global.rssDakikaAraligi);
    }
    if (yeniKaynak && yeniKaynak.url) global.rssKaynakVeritabani.insert(yeniKaynak, () => {});
    if (silinecekUrl) global.rssKaynakVeritabani.remove({ url: silinecekUrl }, {}, () => {});
    res.json({ success: true, message: 'Güncellendi!' });
});

app.post('/api/gizli-yonetim', async (req, res) => {
    if (req.body.islem === 'rss-tetiketle' || req.body.islem === 'rss-tetikle') {
        global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
            if (kaynaklar) await haberleriCekVeKaydet(kaynaklar);
        });
        return res.json({ success: true, message: 'Tarama tetiklendi!' });
    }
    res.status(400).json({ success: false });
});

// SUNUCUYU BAŞLAT
app.listen(PORT, () => {
    console.log(`🚀 MomoNews Backend başarıyla çalışıyor: http://localhost:${PORT}`);
});