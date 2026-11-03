const Parser = require('rss-parser');
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 20000
});

const parser = new Parser({
    timeout: 15000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
});

// 🛡️ Botun ilk açılışında (deploy sonrası) geçmiş haberlerin Discord'a spam olmasını önleyen bayrak
let ilkAcilisTamamlandi = false;

const getActiveWebhooks = () => {
    return new Promise((resolve) => {
        if (!global.discordWebhookVeritabani) return resolve([]);
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

function metniTemizle(metin) {
    if (!metin) return '';
    return metin.replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
}

async function discordaHaberGonder(haber) {
    // Eğer ilk açılış turundaysak ve veritabanından eski haberler yakalandıysa Discord'a bildirim atma!
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
            await axios.post(url, embedPayload, {
                httpsAgent,
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0)'
                }
            });
            await new Promise(r => setTimeout(r, 3005));
        } catch (err) {
            console.error(`❌ Discord webhook gönderim hatası (${haber.source}):`, err.message);
        }
    }
}

async function haberleriCekVeKaydet(rssKaynaklari) {
    let eklenenCount = 0;
    console.log(`🔄 RSS Tarama döngüsü başladı. Toplam kaynak: ${rssKaynaklari.length}`);

    for (const kaynak of rssKaynaklari) {
        try {
            const response = await axios.get(kaynak.url, {
                httpsAgent,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' },
                timeout: 15000
            });

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
                                // Sadece ilk açılış turu bittikten sonra gerçekten yeni gelenler Discord'a gider
                                await discordaHaberGonder(yeniHaber);
                            }
                            resolve();
                        });
                    });
                }
            }
        } catch (err) {
            console.error(`❌ RSS Kaynak Hatası [${kaynak.source}]:`, err.message);
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

    // İlk tarama döngüsü tamamlandıktan sonra bayrağı true yapıyoruz. 
    // Bundan sonra sadece anlık olarak ilk defa yakalanan taze haberler Discord'a düşecek!
    if (!ilkAcilisTamamlandi) {
        ilkAcilisTamamlandi = true;
        console.log(`🛡️ [RSS] İlk açılış senkronizasyonu tamamlandı. Artık sadece yeni haberler Discord'a bildirilecek.`);
    }

    console.log(`✅ RSS Tarama Tamamlandı. Eklenen & Gönderilen Yeni Haber: ${eklenenCount}`);
}

module.exports = haberleriCekVeKaydet;