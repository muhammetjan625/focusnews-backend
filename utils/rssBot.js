// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 7000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p, .nd-content-column p').each((index, element) => {
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
                metin.length < 40;

            if (metin.length > 0 && !yasakliMi) {
                butunMetin.push(metin);
            }
        });

        return butunMetin.join('\n\n');
    } catch (error) {
        return null;
    }
}

// 🏛️ %100 ÇALIŞAN GÜNCEL KAYNAK LİSTESİ (SÖZCÜ VE PATLAK LINKLER İÇERMEZ)
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

    // 🔵 NTV (Güncel Yönlendirmesiz Direkt Linkler - 301 Çözüldü!)
    { url: 'https://www.ntv.com.tr/gundem.rss', source: 'NTV', category: 'Gundem' },
    { url: 'https://www.ntv.com.tr/ekonomi.rss', source: 'NTV', category: 'Ekonomi' },
    { url: 'https://www.ntv.com.tr/spor.rss', source: 'NTV', category: 'Spor' },
    { url: 'https://www.ntv.com.tr/teknoloji.rss', source: 'NTV', category: 'Teknoloji' },

    // 📰 CUMHURİYET (Yeni Stabil Kaynak kanka)
    { url: 'https://www.cumhuriyet.com.tr/rss/gundem', source: 'Cumhuriyet', category: 'Gundem' },
    { url: 'https://www.cumhuriyet.com.tr/rss/ekonomi', source: 'Cumhuriyet', category: 'Ekonomi' },
    { url: 'https://www.cumhuriyet.com.tr/rss/spor', source: 'Cumhuriyet', category: 'Spor' },
    { url: 'https://www.cumhuriyet.com.tr/rss/bilim-teknoloji', source: 'Cumhuriyet', category: 'Teknoloji' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 Güncel haber kaynakları taranıyor...');
    
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

                    // Eğer siteden tam metin kazınamazsa, boşa düşmesin diye RSS özetini (snippet) yedek olarak alıyoruz kanka
                    const yedekMetin = item.contentSnippet || item.summary || item.title;

                    const yeniHaber = {
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate || new Date().toISOString(),
                        contentSnippet: tamIcerik && tamIcerik.length > 50 ? tamIcerik : yedekMetin,
                        source: kaynak.source,
                        category: kaynak.category,
                        imageUrl: resim
                    };

                    global.haberVeritabani.insert(yeniHaber);
                });
            }
        } catch (error) {
            console.error(`❌ ${kaynak.source} (${kaynak.category}) aranırken hata: ${error.message}`);
        }
    }
}

module.exports = haberleriCekVeKaydet;