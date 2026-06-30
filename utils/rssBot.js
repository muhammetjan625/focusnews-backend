// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser({
    timeout: 12000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
});

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
                kucukMetin.includes('abone ol') ||
                kucukMetin.includes('tıklayın') ||
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

// 🎯 EN GÜNCEL SON DAKİKA VE AA ODAKLI YENİ LİSTE
const RSS_KAYNAKLARI = [
    // 🚨 EN SEÇKİN SON DAKİKA AKIŞLARI (Her Zaman En Üstte)
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', source: 'Anadolu Ajansı', category: 'Gundem' },
    { url: 'https://www.trthaber.com/sondakika_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss', source: 'Habertürk', category: 'Gundem' },
    { url: 'https://www.sondakika.com/rss/', source: 'SonDakika.com', category: 'Gundem' },
    { url: 'https://rss.haberler.com/rss.asp', source: 'Haberler.com', category: 'Gundem' },

    // 📉 Ekonomi Son Dakika
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', source: 'TRT Haber', category: 'Ekonomi' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', source: 'Habertürk', category: 'Ekonomi' },
    { url: 'https://feeds.reuters.com/news/economy', source: 'Reuters', category: 'Ekonomi' },

    // 💻 Teknoloji & Oyun Son Dakika
    { url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', source: 'TRT Haber', category: 'Teknoloji' },
    { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge', category: 'Teknoloji' },
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'Teknoloji' },
    { url: 'https://www.ign.com/rss', source: 'IGN', category: 'Teknoloji' },

    // ⚽ Spor Son Dakika
    { url: 'https://www.trthaber.com/spor_articles.rss', source: 'TRT Haber', category: 'Spor' },
    { url: 'https://www.haberturk.com/rss/spor.xml', source: 'Habertürk', category: 'Spor' },
    { url: 'https://www.goal.com/feeds/en/news', source: 'Goal.com', category: 'Spor' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 CANLI SON DAKİKA HAVUZU TARANIYOR...');
    
    for (const kaynak of RSS_KAYNAKLARI) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            for (const item of feed.items.slice(0, 15)) {
                if (!item.link) continue;

                const varMi = await new Promise((resolve) => {
                    global.haberVeritabani.findOne({ link: item.link }, (err, doc) => resolve(doc));
                });

                if (!varMi) {
                    let resim = '';
                    if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                    else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                    const tamIcerik = await haberIceriginiKaziyici(item.link);
                    const yedekMetin = item.contentSnippet || item.summary || item.title || "Detaylar kaynak sitede.";
                    const nihaiIcerik = tamIcerik && tamIcerik.length > 50 ? tamIcerik : yedekMetin;

                    // 🎯 ZAMANSAL KİLİT NOKTASI: Tarihi mutlak bir JavaScript Tarih objesine çevirip ISO formatında kaydediyoruz.
                    // Bu sayede .sort({ pubDate: -1 }) kodu %100 kusursuz ve en yeniye göre sıralayacak kanka.
                    const safTarih = item.isoDate || item.pubDate || new Date().toISOString();
                    const standartISOTarih = new Date(safTarih).toISOString();

                    const yeniHaber = {
                        title: item.title,
                        link: item.link,
                        pubDate: standartISOTarih, // Jilet gibi standart zaman stamp'i
                        contentSnippet: nihaiIcerik,
                        source: kaynak.source,
                        category: kaynak.category,
                        imageUrl: resim
                    };

                    global.haberVeritabani.insert(yeniHaber, (err) => {
                        if (!err) console.log(`🔥 SON DAKİKA ALINDI [${kaynak.source}]: ${item.title.substring(0, 25)}...`);
                    });
                }
            }
        } catch (error) {
            // Hatalı akışları sessizce atla
        }
    }
}

module.exports = haberleriCekVeKaydet;