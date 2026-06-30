// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 6000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p, .nd-content-column p, .detail-content p, .story-body p').each((index, element) => {
            const metin = $(element).text().trim();
            const kucukMetin = metin.toLowerCase();

            const yasakliMi = 
                kucukMetin.includes('telif') || 
                kucukMetin.includes('tüm hakları') || 
                kucukMetin.includes('izinsiz') || 
                kucukMetin.includes('kopyalanamaz') || 
                kucukMetin.includes('haber ajansı') ||
                kucukMetin.includes('abone ol') ||
                kucukMetin.includes('tıklayın') ||
                kucukMetin.includes('takip edin') ||
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

// 🏛️ %100 KARARLI VE YAZILIMCI DOSTU KAYNAKLAR
const RSS_KAYNAKLARI = [
    // 🌍 TRT HABER
    { url: 'https://www.trthaber.com/gundem_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', source: 'TRT Haber', category: 'Ekonomi' },
    { url: 'https://www.trthaber.com/spor_articles.rss', source: 'TRT Haber', category: 'Spor' },
    { url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', source: 'TRT Haber', category: 'Teknoloji' },

    // 📺 HABERTÜRK
    { url: 'https://www.haberturk.com/rss/gundem.xml', source: 'Habertürk', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', source: 'Habertürk', category: 'Ekonomi' },
    { url: 'https://www.haberturk.com/rss/spor.xml', source: 'Habertürk', category: 'Spor' },
    { url: 'https://www.haberturk.com/rss/kategori/teknoloji.xml', source: 'Habertürk', category: 'Teknoloji' },

    // 🌐 MYNET
    { url: 'https://www.mynet.com/haber/rss/kategori/gundem/', source: 'Mynet', category: 'Gundem' },
    { url: 'https://www.mynet.com/haber/rss/kategori/finans/', source: 'Mynet', category: 'Ekonomi' },
    { url: 'https://www.mynet.com/haber/rss/kategori/spor/', source: 'Mynet', category: 'Spor' },
    { url: 'https://www.mynet.com/haber/rss/kategori/teknoloji/', source: 'Mynet', category: 'Teknoloji' },

    // 📰 T24
    { url: 'https://t24.com.tr/rss/haber/gundem', source: 'T24', category: 'Gundem' },
    { url: 'https://t24.com.tr/rss/haber/ekonomi', source: 'T24', category: 'Ekonomi' },
    { url: 'https://t24.com.tr/rss/haber/spor', source: 'T24', category: 'Spor' },
    { url: 'https://t24.com.tr/rss/haber/bilim-teknoloji', source: 'T24', category: 'Teknoloji' },

    // 📣 İHLAS HABER AJANSI
    { url: 'https://www.iha.com.tr/rss', source: 'İHA', category: 'Gundem' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 Haber havuzu güvenli modda taranıyor...');
    
    for (const kaynak of RSS_KAYNAKLARI) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            for (const item of feed.items) {
                global.haberVeritabani.findOne({ link: item.link }, async (err, varMi) => {
                    if (err || varMi) return;
                    
                    let resim = '';
                    if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                    else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                    const tamIcerik = await haberIceriginiKaziyici(item.link);
                    const yedekMetin = item.contentSnippet || item.summary || item.title || "Haber içeriği yüklenemedi.";

                    // 🚀 GARANTİ KATMANI: Kazıma boş dönerse yedek metni devreye al
                    const nihaiIcerik = tamIcerik && tamIcerik.length > 100 ? tamIcerik : yedekMetin;

                    const yeniHaber = {
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate || new Date().toISOString(),
                        contentSnippet: nihaiIcerik,
                        source: kaynak.source,
                        category: kaynak.category,
                        imageUrl: resim
                    };

                    global.haberVeritabani.insert(yeniHaber, (insertErr) => {
                        if (!insertErr) console.log(`🚀 Başarıyla eklendi (${kaynak.source}): ${item.title.substring(0, 20)}...`);
                    });
                });
            }
        } catch (error) {
            // Hatalı/cevap vermeyen kaynakları es geçiyoruz
        }
    }
}

module.exports = haberleriCekVeKaydet;