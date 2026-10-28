const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({
    timeout: 10000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
});

// NeDB veritabanından aktif webhook URL'lerini çeken fonksiyon
const getActiveWebhooks = () => {
    return new Promise((resolve) => {
        if (!global.discordWebhookVeritabani) return resolve([]);
        global.discordWebhookVeritabani.find({ aktif: true }, (err, docs) => {
            if (err || !docs) return resolve([]);
            resolve(docs.map(d => d.url));
        });
    });
};

function metniTemizle(metin) {
    if (!metin) return '';
    return metin.replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function discordaHaberGonder(haber) {
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
            await axios.post(url, embedPayload);
        } catch (err) {
            console.error(`❌ Discord webhook gönderim hatası:`, err.message);
        }
    }
}

async function haberleriCekVeKaydet(rssKaynaklari) {
    let eklenenCount = 0;

    for (const kaynak of rssKaynaklari) {
        try {
            const feed = await parser.parseURL(kaynak.url);

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

                    global.haberVeritabani.insert(yeniHaber, async (err) => {
                        if (!err) {
                            eklenenCount++;
                            await discordaHaberGonder(yeniHaber);
                        }
                    });
                }
            }
        } catch (err) {
            if (global.logVeritabani) {
                global.logVeritabani.insert({
                    tip: 'RSS_PARSE_HATA',
                    mesaj: `Kaynak çekilemedi: ${kaynak.source}`,
                    detay: { url: kaynak.url, error: err.message },
                    tarih: new Date().toISOString()
                });
            }
        }
    }
    console.log(`✅ RSS Tarama Bitti. Eklenen & Gönderilen: ${eklenenCount}`);
}

module.exports = haberleriCekVeKaydet;