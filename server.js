const express = require('express');
const cors = require('cors');
const Datastore = require('nedb');
const Parser = require('rss-parser');
const axios = require('axios');
const cron = require('node-cron');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// Veritabanları (NeDB)
global.haberVeritabani = new Datastore({ filename: './db/haberler.db', autoload: true });
global.discordWebhookVeritabani = new Datastore({ filename: './db/webhooks.db', autoload: true });
global.logVeritabani = new Datastore({ filename: './db/logs.db', autoload: true });
const ayarVeritabani = new Datastore({ filename: './db/ayarlar.db', autoload: true });

// HTTPS Agent
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 20000
});

// RSS Parser
const parser = new Parser({
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
});

// Varsayılan RSS Kaynakları
const varsayilanRssKaynaklari = [
    { url: 'https://www.trthaber.com/xml/sondakika.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.hurriyet.com.tr/rss/anasayfa', source: 'Hürriyet', category: 'Gundem' },
    { url: 'https://www.cnnturk.com/feed/rss/all/news', source: 'CNN Türk', category: 'Gundem' }
];

// Ayarları Yükle / Başlat
let sistemAyarlari = { bakimModu: false, taramaDakika: 3 };
ayarVeritabani.findOne({ _id: 'sistem_ayar' }, (err, doc) => {
    if (!doc) {
        ayarVeritabani.insert({ _id: 'sistem_ayar', ...sistemAyarlari });
    } else {
        sistemAyarlari = doc;
    }
});

function metniTemizle(metin) {
    if (!metin) return '';
    return metin.replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
}

// Aktif Discord Webhook'larını Çek
const getActiveWebhooks = () => {
    return new Promise((resolve) => {
        global.discordWebhookVeritabani.find({ aktif: true }, (err, docs) => {
            if (docs && docs.length > 0) {
                resolve(docs.map(d => d.url));
            } else {
                global.discordWebhookVeritabani.find({}, (errAll, allDocs) => {
                    resolve(allDocs ? allDocs.map(d => d.url) : []);
                });
            }
        });
    });
};

let ilkAcilisTamamlandi = false;

// Discord'a Haber Gönderme
async function discordaHaberGonder(haber) {
    if (!ilkAcilisTamamlandi) return;
    const webhookUrls = await getActiveWebhooks();
    if (webhookUrls.length === 0) return;

    const embedPayload = {
        content: '📰 **MomoNews | Yeni Son Dakika Haberi**',
        embeds: [{
            title: haber.title,
            url: haber.link,
            description: haber.contentSnippet ? haber.contentSnippet.substring(0, 200) + '...' : 'Detaylar için habere tıklayın.',
            color: 3447003,
            fields: [
                { name: 'Kaynak', value: haber.source, inline: true },
                { name: 'Kategori', value: haber.category, inline: true }
            ],
            image: haber.imageUrl ? { url: haber.imageUrl } : undefined,
            timestamp: haber.pubDate
        }]
    };

    for (const url of webhookUrls) {
        try {
            await axios.post(url, embedPayload, { httpsAgent, timeout: 10000 });
            await new Promise(r => setTimeout(r, 2005));
        } catch (err) {}
    }
}

// RSS Tarama Fonksiyonu
async function haberleriCekVeKaydet() {
    console.log("🔄 [RSS] Tarama döngüsü tetiklendi...");
    
    // Kaynakları veritabanından al veya varsayılanları kullan
    ayarVeritabani.findOne({ _id: 'sistem_ayar' }, async (err, ayar) => {
        const kaynaklar = (ayar && ayar.kaynaklar) ? ayar.kaynaklar : varsayilanRssKaynaklari;
        let eklenenCount = 0;

        for (const kaynak of kaynaklar) {
            try {
                const response = await axios.get(kaynak.url, { httpsAgent, timeout: 15000 });
                const feed = await parser.parseString(response.data);

                for (const item of feed.items.slice(0, 5)) {
                    if (!item.link) continue;

                    const varMi = await new Promise((resolve) => {
                        global.haberVeritabani.findOne({ link: item.link }, (err, doc) => resolve(doc));
                    });

                    if (!varMi) {
                        let resim = '';
                        if (item.enclosure?.url) resim = item.enclosure.url;
                        else if (item.content?.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                        const yeniHaber = {
                            title: metniTemizle(item.title),
                            link: item.link,
                            pubDate: new Date(item.isoDate || item.pubDate || Date.now()).toISOString(),
                            contentSnippet: metniTemizle(item.contentSnippet || item.title),
                            source: kaynak.source,
                            category: kaynak.category,
                            imageUrl: resim
                        };

                        await new Promise((resolve) => {
                            global.haberVeritabani.insert(yeniHaber, async (err) => {
                                if (!err) {
                                    eklenenCount++;
                                    await discordaHaberGonder(yeniHaber);
                                }
                                resolve();
                            });
                        });
                    }
                }
            } catch (err) {
                console.error(`❌ RSS Kaynak Hatası [${kaynak.source}]:`, err.message);
            }
        }

        if (!ilkAcilisTamamlandi) {
            ilkAcilisTamamlandi = true;
            console.log("🛡️ [RSS] İlk açılış senkronizasyonu tamamlandı.");
        }
        console.log(`✅ [RSS] Tarama tamamlandı. Yeni eklenen haber: ${eklenenCount}`);
    });
}

// --- API ENDPOINTLERİ ---

app.get('/api/haberler', (req, res) => {
    global.haberVeritabani.find({}).sort({ pubDate: -1 }).limit(30).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: docs });
    });
});

app.get('/api/gizli-yonetim/ayarlar', (req, res) => {
    ayarVeritabani.findOne({ _id: 'sistem_ayar' }, (err, doc) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({
            success: true,
            bakimModu: doc?.bakimModu || false,
            taramaDakika: doc?.taramaDakika || 3,
            kaynaklar: doc?.kaynaklar || varsayilanRssKaynaklari
        });
    });
});

app.post('/api/gizli-yonetim/guncelle', (req, res) => {
    const { bakimModu, taramaDakika, yeniKaynak, silinecekUrl } = req.body;

    ayarVeritabani.findOne({ _id: 'sistem_ayar' }, (err, doc) => {
        if (!doc) return res.status(404).json({ success: false });

        let guncelKaynaklar = doc.kaynaklar || varsayilanRssKaynaklari;
        if (yeniKaynak) guncelKaynaklar.push(yeniKaynak);
        if (silinecekUrl) guncelKaynaklar = guncelKaynaklar.filter(k => k.url !== silinecekUrl);

        const yeniVeri = {
            bakimModu: bakimModu !== undefined ? bakimModu : doc.bakimModu,
            taramaDakika: taramaDakika !== undefined ? taramaDakika : doc.taramaDakika,
            kaynaklar: guncelKaynaklar
        };

        ayarVeritabani.update({ _id: 'sistem_ayar' }, { $set: yeniVeri }, {}, () => {
            res.json({ success: true });
        });
    });
});

app.get('/api/gizli-yonetim/webhooks', (req, res) => {
    global.discordWebhookVeritabani.find({}, (err, docs) => {
        res.json({ success: true, webhooks: docs || [] });
    });
});

app.post('/api/gizli-yonetim/webhook-ekle', (req, res) => {
    const { isim, url } = req.body;
    if (!isim || !url) return res.status(400).json({ success: false, error: "İsim ve URL zorunludur." });

    global.discordWebhookVeritabani.insert({ isim, url, aktif: true }, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/gizli-yonetim/webhook-sil', (req, res) => {
    const { id } = req.body;
    global.discordWebhookVeritabani.remove({ _id: id }, {}, () => {
        res.json({ success: true });
    });
});

app.post('/api/gizli-yonetim/webhook-test-gonder', async (req, res) => {
    const { url } = req.body;
    try {
        await axios.post(url, { content: '🚀 **MomoNews | Test Mesajı Başarılı!**' }, { httpsAgent });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/gizli-yonetim/loglar', (req, res) => {
    global.logVeritabani.find({}).sort({ tarih: -1 }).limit(50).exec((err, docs) => {
        res.json({ success: true, loglar: docs || [] });
    });
});

app.post('/api/gizli-yonetim/loglar-temizle', (req, res) => {
    global.logVeritabani.remove({}, { multi: true }, () => {
        res.json({ success: true });
    });
});

// 📌 TELEGRAM ÖZEL MESAJ ENDPOINTİ (Sözdizimi hatasız, Async Doğru Yapılandırıldı)
app.post('/api/gizli-yonetim/telegram-ozel-mesaj', async (req, res) => {
    const { baslik, mesaj, webhookId } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!token || !channelId) {
        return res.status(400).json({ success: false, error: "Telegram Token veya Kanal ID tanımlı değil." });
    }
    if (!mesaj) {
        return res.status(400).json({ success: false, error: "Mesaj içeriği boş olamaz." });
    }

    try {
        // Hata üretmeyen güvenli async sarmalayıcı mantığı
        let formatliMesaj = "";
        if (baslik) {
            formatliMesaj += `📢 *${baslik}*\n\n`;
        }
        formatliMesaj += mesaj;

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await axios.post(url, {
            chat_id: channelId,
            text: formatliMesaj,
            parse_mode: 'Markdown'
        });

        res.json({ success: true, message: "Telegram özel mesajı başarıyla gönderildi." });
    } catch (err) {
        console.error("❌ Telegram özel mesaj hatası:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/gizli-yonetim', async (req, res) => {
    const { islem } = req.body;
    if (islem === 'rss-tetikle') {
        await haberleriCekVeKaydet();
        return res.json({ success: true });
    }
    res.status(400).json({ success: false, error: "Geçersiz işlem." });
});

// Port Başlatımı
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 MomoNews Backend başarıyla çalışıyor. Port: ${PORT}`);
    setTimeout(haberleriCekVeKaydet, 5000);
    setInterval(haberleriCekVeKaydet, 3 * 60 * 1000); // 3 dakikada bir tarama
});