const express = require('express');
const router = express.Router();
const axios = require('axios');
const haberleriCekVeKaydet = require('../utils/rssBot');
const { sistemLogKaydet } = require('../services/logger');
const { taramaZamanlayicisiniGuncelle } = require('../services/scheduler');

const aktifWebhooksGetir = () => {
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

router.get('/webhooks', (req, res) => {
    global.discordWebhookVeritabani.find({}, (err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, webhooks: docs || [] });
    });
});

router.post('/webhook-ekle', (req, res) => {
    const { isim, url } = req.body;
    if (!url || !isim) return res.status(400).json({ success: false, error: 'İsim ve URL zorunludur.' });

    const yeniHook = { isim, url, aktif: true, eklenmeTarihi: new Date().toISOString() };

    global.discordWebhookVeritabani.insert(yeniHook, (err, doc) => {
        if (err) return res.status(400).json({ success: false, error: 'Bu webhook zaten kayıtlı.' });
        sistemLogKaydet('WEBHOOK', `Yeni Discord webhook eklendi: ${isim}`);
        res.json({ success: true, message: 'Webhook eklendi!', webhook: doc });
    });
});

router.post('/webhook-sil', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID gerekli.' });

    global.discordWebhookVeritabani.remove({ _id: id }, {}, (err, numRemoved) => {
        if (err || numRemoved === 0) return res.status(404).json({ success: false, error: 'Webhook bulunamadı.' });
        sistemLogKaydet('WEBHOOK', `Discord webhook silindi (ID: ${id})`);
        res.json({ success: true, message: 'Webhook silindi.' });
    });
});

router.post('/webhook-test-gonder', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Webhook URL gerekli.' });

    try {
        await axios.post(url, {
            content: '🧪 **MomoNews | Admin Panelinden Canlı Test Mesajı**',
            embeds: [{ title: 'Bağlantı Başarılı!', description: 'Bu webhook admin panelinden başarıyla test edildi.', color: 65280, timestamp: new Date().toISOString() }]
        }, { headers: { 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (1.0)' } });
        sistemLogKaydet('WEBHOOK_TEST', `Admin panelinden manuel test gönderildi.`);
        res.json({ success: true, message: 'Test mesajı gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: `Gönderilemedi: ${err.message}` });
    }
});

router.get('/ayarlar', (req, res) => {
    global.rssKaynakVeritabani.find({}, (err, kaynaklar) => {
        res.json({
            success: true,
            bakimModu: global.sistemBakimModunda || false,
            taramaDakika: global.rssDakikaAraligi || 3,
            kaynaklar: kaynaklar || []
        });
    });
});

router.get('/loglar', (req, res) => {
    global.logVeritabani.find({}).sort({ tarih: -1 }).limit(100).exec((err, loglar) => {
        res.json({ success: true, loglar: loglar || [] });
    });
});

router.post('/loglar-temizle', (req, res) => {
    global.logVeritabani.remove({}, { multi: true }, () => {
        sistemLogKaydet('SISTEM', 'Sistem logları temizlendi.');
        res.json({ success: true, message: 'Loglar temizlendi.' });
    });
});

router.post('/guncelle', (req, res) => {
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

router.post('/', async (req, res) => {
    if (req.body.islem === 'rss-tetiketle' || req.body.islem === 'rss-tetikle') {
        global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
            if (kaynaklar) await haberleriCekVeKaydet(kaynaklar);
        });
        return res.json({ success: true, message: 'Tarama tetiklendi!' });
    }
    res.status(400).json({ success: false });
});

router.post('/telegram-ozel-mesaj', async (req, res) => {
    const { baslik, mesaj } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!token || !channelId) return res.status(400).json({ success: false, error: "Telegram Token veya Kanal ID tanımlı değil." });
    if (!mesaj) return res.status(400).json({ success: false, error: "Mesaj içeriği boş olamaz." });

    try {
        let formatliMesaj = baslik ? `📢 *${baslik}*\n\n${mesaj}` : mesaj;
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: channelId,
            text: formatliMesaj,
            parse_mode: 'Markdown'
        });
        res.json({ success: true, message: "Telegram mesajı gönderildi." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/ozel-mesaj-gonder', async (req, res) => {
    try {
        const { baslik, mesaj, webhookId } = req.body;
        if (!mesaj) return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });

        let hedefUrlLer = [];
        if (webhookId && webhookId !== 'hepsi') {
            let secilenHook = await new Promise((resolve) => {
                global.discordWebhookVeritabani.findOne({ _id: webhookId }, (err, doc) => resolve(doc));
            });
            if (!secilenHook) {
                secilenHook = await new Promise((resolve) => {
                    global.discordWebhookVeritabani.findOne({ url: webhookId }, (err, doc) => resolve(doc));
                });
            }
            if (secilenHook && secilenHook.url) hedefUrlLer.push(secilenHook.url);
            else if (typeof webhookId === 'string' && webhookId.startsWith('http')) hedefUrlLer.push(webhookId);
            else hedefUrlLer = await aktifWebhooksGetir();
        } else {
            hedefUrlLer = await aktifWebhooksGetir();
        }

        if (hedefUrlLer.length === 0) return res.status(400).json({ success: false, error: 'Kayıtlı kanal bulunamadı.' });

        const embedPayload = {
            content: '📢 **MomoNews | Yönetici Özel Duyurusu**',
            embeds: [{ title: baslik || 'Özel Bildirim', description: mesaj, color: 16776960, timestamp: new Date().toISOString() }]
        };

        for (const url of hedefUrlLer) {
            try {
                await axios.post(url, embedPayload, { headers: { 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (1.0)' } });
            } catch (err) {}
        }

        sistemLogKaydet('OZEL_MESAJ', `Özel duyuru gönderildi.`);
        res.json({ success: true, message: 'Özel mesaj iletildi!' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;