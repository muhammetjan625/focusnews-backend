const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser({
    timeout: 10000, 
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8'
    }
});

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1564003986447663107/ut--oCPXhxzq8NlyYWlya09HoLNUmBkidw_SAZMt_1cSeTHsMOx_WawB-CRVCajAOy0n';

function metniTemizle(metin) {
    if (!metin) return '';
    return metin
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

async function discordaHaberGonder(haber) {
    try {
        const siteIciLink = `https://momonews.web.app/?haberUrl=${encodeURIComponent(haber.link)}`;

        const embed = {
            title: haber.title,
            url: siteIciLink, 
            description: haber.contentSnippet ? haber.contentSnippet.substring(0, 220) + '...' : 'Detaylar ve canlı akış için MomoNews platformunu ziyaret edin.',
            color: 2315775, 
            fields: [
                { name: '📰 Kaynak', value: haber.source || 'MomoNews', inline: true },
                { name: '📂 Kategori', value: haber.category || 'Gundem', inline: true },
                { name: '🔗 Orijinal Kaynak', value: `[Git](${haber.link})`, inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        if (haber.imageUrl) {
            embed.image = { url: haber.imageUrl };
        }

        await axios.post(DISCORD_WEBHOOK_URL, {
            content: "🚨 **MomoNews | Yeni Son Dakika Akışı!**",
            embeds: [embed]
        }, { timeout: 8000 });
    } catch (err) {
        console.error("⚠️ Discord bildirim hatası:", err.message);
    }
}

async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 4000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p, .nd-content-column p, .detail-content p, .story-body p').each((index, element) => {
            const metin = $(element).text().trim();
            const kucukMetin = metin.toLowerCase();

            const yasakliMi = 
                kucukMetin.includes('telif') || 
                kucukMetin.includes('tum haklari') || 
                kucukMetin.includes('izinsiz') || 
                kucukMetin.includes('kopyalanamaz') || 
                kucukMetin.includes('abone ol') ||
                kucukMetin.includes('tiklayin') ||
                kucukMetin.includes('takip edin') ||
                kucukMetin.includes('copyright') ||
                metin.length < 35;

            if (metin.length > 0 && !yasakliMi) {
                butunMetin.push(metin);
            }
        });

        return butunMetin.join('\n\n');
    } catch (error) {
        return null;
    }
}

async function haberleriCekVeKaydet(rssKaynaklariListesi) {
    console.log('🔄 RSS KAYNAKLARI TARANIYOR...');
    let eklenenSayisi = 0;
    
    // Eğer dışarıdan liste gönderilmediyse varsayılan bir boş dizi kullan
    const kaynaklar = rssKaynaklariListesi || [];
    
    for (const kaynak of kaynaklar) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            for (const item of feed.items.slice(0, 6)) {
                if (!item.link) continue;

                const varMi = await new Promise((resolve) => {
                    global.haberVeritabani.findOne({ link: item.link }, (err, doc) => resolve(doc));
                });

                if (!varMi) {
                    let resim = '';
                    if (item.enclosure && item.enclosure.url) {
                        resim = item.enclosure.url;
                    } else if (item.content && item.content.match(/src="([^"]+)"/)) {
                        resim = item.content.match(/src="([^"]+)"/)[1];
                    }

                    const yedekMetin = item.contentSnippet || item.summary || item.title || "Detaylar kaynak sitede.";
                    const tamIcerik = await haberIceriginiKaziyici(item.link);
                    const nihaiIcerik = (tamIcerik && tamIcerik.length > 50) ? tamIcerik : yedekMetin;

                    const safTarih = item.isoDate || item.pubDate || new Date().toISOString();
                    const standartISOTarih = new Date(safTarih).toISOString();

                    const yeniHaber = {
                        title: metniTemizle(item.title),
                        link: item.link,
                        pubDate: standartISOTarih,
                        contentSnippet: metniTemizle(nihaiIcerik),
                        source: kaynak.source,
                        category: kaynak.category,
                        imageUrl: resim
                    };

                    await new Promise((resolve) => {
                        global.haberVeritabani.insert(yeniHaber, (err) => {
                            if (!err) {
                                console.log(`🔥 [${kaynak.category}] YENİ HABER [${kaynak.source}]: ${yeniHaber.title.substring(0, 25)}...`);
                                discordaHaberGonder(yeniHaber);
                                eklenenSayisi++;
                            }
                            resolve();
                        });
                    });
                }
            }
        } catch (error) {
            console.error(`⚠️ RSS Kaynak Hatası (${kaynak.source} - ${kaynak.category}):`, error.message);
        }
    }
    console.log(`✅ Tarama tamamlandı. Eklenen yeni haber sayısı: ${eklenenSayisi}`);
}

module.exports = haberleriCekVeKaydet;