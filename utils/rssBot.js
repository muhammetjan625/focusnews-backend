// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
});

async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p').each((index, element) => {
            const metin = $(element).text().trim();
            if (metin.length > 40 && !metin.toLowerCase().includes('telif') && !metin.toLowerCase().includes('tüm hakları')) {
                butunMetin.push(metin);
            }
        });

        return butunMetin.join('\n\n');
    } catch (error) {
        return null;
    }
}

// Lokal test için en stabil, kilitlenmeyen akışlar kanka:
const RSS_KAYNAKLARI = [
    { url: 'https://www.trthaber.com/gundem_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', source: 'TRT Haber', category: 'Ekonomi' },
    { url: 'https://www.haberturk.com/rss/gundem.xml', source: 'Habertürk', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', source: 'Habertürk', category: 'Ekonomi' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 Bot çalıştı: RSS kaynakları taranıyor...');
    
    if (!global.haberVeritabani) {
        console.error("❌ HATA: global.haberVeritabani tanımlı değil!");
        return;
    }

    for (const kaynak of RSS_KAYNAKLARI) {
        console.log(`📡 ${kaynak.source} akışı okunuyor: ${kaynak.url}`);
        try {
            const feed = await parser.parseURL(kaynak.url);
            console.log(`🔍 ${kaynak.source} akışından ${feed.items.length} adet haber yakalandı.`);
            
            for (const item of feed.items) {
                if (!item.link) continue;

                global.haberVeritabani.findOne({ link: item.link }, async (err, varMi) => {
                    if (err) return;
                    
                    if (!varMi) {
                        let resim = '';
                        if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                        else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                        const tamIcerik = await haberIceriginiKaziyici(item.link);
                        const yedekMetin = item.contentSnippet || item.summary || item.title || "Haber içeriği.";
                        const nihaiIcerik = tamIcerik && tamIcerik.length > 50 ? tamIcerik : yedekMetin;

                        const yeniHaber = {
                            title: item.title,
                            link: item.link,
                            pubDate: item.pubDate || new Date().toISOString(),
                            contentSnippet: nihaiIcerik,
                            source: kaynak.source,
                            category: kaynak.category,
                            imageUrl: resim
                        };

                        global.haberVeritabani.insert(yeniHaber, (insertErr, newDoc) => {
                            if (insertErr) {
                                // Artık buraya düşmeyeceğiz inşallah kanka
                                console.error(`❌ Veri yazma hatası (${kaynak.source}):`, insertErr.message);
                            } else {
                                console.log(`💾 BAŞARIYLA YAZILDI -> ${newDoc.title.substring(0, 30)}...`);
                            }
                        });
                    }
                });
            }
        } catch (error) {
            console.error(`❌ ${kaynak.source} RSS okuma hatası:`, error.message);
        }
    }
}

module.exports = haberleriCekVeKaydet;