const express = require('express');
const router = express.Router();
const axios = require('axios');
const { sistemLogKaydet } = require('../services/logger');

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

router.get('/haberler', (req, res) => {
    global.haberVeritabani.find({}).sort({ pubDate: -1 }).limit(60).exec((err, docs) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: docs.length, bakimModu: global.sistemBakimModunda || false, data: docs });
    });
});

router.post('/geribildirim', async (req, res) => {
    const { mesaj } = req.body;
    if (!mesaj) return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });

    const webhookUrls = await aktifWebhooksGetir();
    const embedPayload = {
        content: '📩 **MomoNews | Yeni Kullanıcı Geri Bildirimi**',
        embeds: [{ title: 'Görüş / Öneri / Hata', description: mesaj, color: 3447003, timestamp: new Date().toISOString() }]
    };

    for (const url of webhookUrls) {
        try {
            await axios.post(url, embedPayload, {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (1.0)' }
            });
        } catch (e) {}
    }

    sistemLogKaydet('GERIBILDIRIM', 'Yeni geri bildirim Discord kanallarına iletildi.');
    res.json({ success: true });
});

router.get('/test-webhook', async (req, res) => {
    const testZamani = new Date().toISOString();
    sistemLogKaydet('WEBHOOK_TEST', 'Test webhook tetiklendi.', { zaman: testZamani });

    const webhookUrls = await aktifWebhooksGetir();
    const embedPayload = {
        content: '🧪 **MomoNews | Discord Webhook Bağlantı Testi**',
        embeds: [{ title: 'Sistem Durumu: Çevrimiçi', description: `Test başarılı.\nZaman: \`${testZamani}\``, color: 5763719, timestamp: testZamani }]
    };

    for (const url of webhookUrls) {
        try {
            await axios.post(url, embedPayload, {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (1.0)' }
            });
        } catch (e) {}
    }

    res.json({ success: true, message: 'Test webhook tetiklendi!', timestamp: testZamani });
});

// Frontend sistem hata raporlama endpoint'i
router.post('/sistem-hatasi', async (req, res) => {
    const { hataMesaji, konum, zaman } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    sistemLogKaydet('FRONTEND_HATA', `Frontend hatası: ${hataMesaji}`, { konum });

    if (token && channelId) {
        try {
            const mesaj = `🚨 *MomoNews | Frontend Hata Raporu*\n\n📍 *Konum:* ${konum || 'Bilinmiyor'}\n❌ *Hata:* \`${hataMesaji}\`\n🕒 *Zaman:* ${zaman || new Date().toISOString()}`;
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: channelId,
                text: mesaj,
                parse_mode: 'Markdown'
            });
        } catch (err) {}
    }

    res.json({ success: true });
});

module.exports = router;