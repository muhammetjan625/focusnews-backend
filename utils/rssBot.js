// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// Botun kilitlenmemesi için zaman aşımı ve tarayıcı taklidi (User-Agent) eklendi
const parser = new Parser({
    timeout: 12000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

// 💡 DÜNYA STANDARTLARINDA KAZIYICI (Scraper)
async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 7000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        // Yabancı ve Yerel tüm medya devlerinin paragraf yapılarına uyumlu geniş seçici
        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p, .nd-content-column p, .detail-content p, .story-body p, .article__body p, .body-description p, .speakable p, .RichTextStoryBody p').each((index, element) => {
            const metin = $(element).text().trim();
            const kucukMetin = metin.toLowerCase();

            // Telif ve reklam metinlerini havuzdan uzak tutan akıllı filtre
            const yasakliMi = 
                kucukMetin.includes('telif') || 
                kucukMetin.includes('tüm hakları') || 
                kucukMetin.includes('izinsiz') || 
                kucukMetin.includes('kopyalanamaz') || 
                kucukMetin.includes('abone ol') ||
                kucukMetin.includes('tıklayın') ||
                kucukMetin.includes('takip edin') ||
                kucukMetin.includes('copyright') ||
                kucukMetin.includes('all rights reserved') ||
                metin.length < 35;

            if (metin.length > 0 && !yasakliMi) {
                butunMetin.push(metin);
            }
        });

        return butunMetin.join('\n\n');
    } catch (error) {
        // Site engellerse veya yanıt vermezse sessizce null dön (Yedek metin devreye girecek)
        return null;
    }
}

// 🏛️ DEVASE MEDYA HAVUZU (Frontend Kategorilerine %100 Uyumlu: Gundem, Ekonomi, Spor, Teknoloji)
const RSS_KAYNAKLARI = [
    // 🇹🇷 Türkiye Gündemi
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', source: 'Anadolu Ajansı', category: 'Gundem' },
    { url: 'https://www.trthaber.com/sondakika_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss/gundem.xml', source: 'Habertürk', category: 'Gundem' },
    { url: 'https://rss.haberler.com/rss.asp', source: 'Haberler.com', category: 'Gundem' },
    { url: 'https://www.haber7.com/rss', source: 'Haber7', category: 'Gundem' },
    { url: 'https://www.sabah.com.tr/rss/anasayfa.xml', source: 'Sabah', category: 'Gundem' },
    { url: 'https://www.star.com.tr/rss/rss.asp?cat=1', source: 'Star', category: 'Gundem' },
    { url: 'https://www.cumhuriyet.com.tr/rss/1.xml', source: 'Cumhuriyet', category: 'Gundem' },
    { url: 'https://t24.com.tr/rss/haberler', source: 'T24', category: 'Gundem' },
    { url: 'https://www.sondakika.com/rss/', source: 'SonDakika.com', category: 'Gundem' },
    { url: 'https://www.haber3.com/rss', source: 'Haber3', category: 'Gundem' },
    { url: 'https://www.gazetevatan.com/rss/gundem.xml', source: 'Vatan', category: 'Gundem' },
    { url: 'https://www.egehaber.com/feed', source: 'Ege Haber', category: 'Gundem' },
    { url: 'https://61saat.com/rss', source: '61Saat', category: 'Gundem' },
    { url: 'https://bianet.org/system/Rss', source: 'Bianet', category: 'Gundem' },

    // 🌍 Dünya Gündemi
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', source: 'BBC News', category: 'Gundem' },
    { url: 'https://rss.cnn.com/rss/edition.rss', source: 'CNN World', category: 'Gundem' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', source: 'New York Times', category: 'Gundem' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', category: 'Gundem' },
    { url: 'https://feeds.skynews.com/feeds/rss/home.xml', source: 'Sky News', category: 'Gundem' },
    { url: 'https://www.theguardian.com/world/rss', source: 'The Guardian', category: 'Gundem' },
    { url: 'https://www.npr.org/rss/rss.php?id=1001', source: 'NPR', category: 'Gundem' },
    { url: 'https://www.france24.com/en/rss', source: 'France 24', category: 'Gundem' },
    { url: 'https://www.euronews.com/rss', source: 'EuroNews', category: 'Gundem' },
    { url: 'https://www.cbsnews.com/latest/rss/main', source: 'CBS News', category: 'Gundem' },
    { url: 'https://abcnews.go.com/abcnews/topstories', source: 'ABC News', category: 'Gundem' },
    { url: 'https://www.dw.com/rss', source: 'Deutsche Welle', category: 'Gundem' },

    // 💻 Teknoloji & Bilim
    { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge', category: 'Teknoloji' },
    { url: 'https://feeds.arstechnica.com/arstechnica/index', source: 'Ars Technica', category: 'Teknoloji' },
    { url: 'https://www.wired.com/feed/rss', source: 'Wired', category: 'Teknoloji' },
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'Teknoloji' },
    { url: 'https://www.engadget.com/rss.xml', source: 'Engadget', category: 'Teknoloji' },
    { url: 'https://www.tomshardware.com/feeds/all', source: 'Tom\'s Hardware', category: 'Teknoloji' },
    { url: 'https://www.zdnet.com/news/rss.xml', source: 'ZDNet', category: 'Teknoloji' },
    { url: 'https://www.xda-developers.com/feed/', source: 'XDA Developers', category: 'Teknoloji' },
    { url: 'https://9to5mac.com/feed/', source: '9to5Mac', category: 'Teknoloji' },
    { url: 'https://www.androidauthority.com/feed/', source: 'Android Authority', category: 'Teknoloji' },

    // 🎮 Oyun Dünyası (Frontend'de kategori sekmesi kirlenmesin diye Teknolojiye akıyor)
    { url: 'https://www.ign.com/rss', source: 'IGN', category: 'Teknoloji' },
    { url: 'https://kotaku.com/rss', source: 'Kotaku', category: 'Teknoloji' },
    { url: 'https://www.pcgamer.com/rss/', source: 'PC Gamer', category: 'Teknoloji' },
    { url: 'https://www.gamespot.com/feeds/news/', source: 'GameSpot', category: 'Teknoloji' },

    // ⚽ Spor
    { url: 'https://www.espn.com/espn/rss/news', source: 'ESPN', category: 'Spor' },
    { url: 'https://www.skysports.com/rss/12040', source: 'Sky Sports', category: 'Spor' },
    { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC Sport', category: 'Spor' },
    { url: 'https://www.goal.com/feeds/en/news', source: 'Goal.com', category: 'Spor' },

    // 📉 Ekonomi
    { url: 'https://feeds.reuters.com/news/economy', source: 'Reuters', category: 'Ekonomi' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC Finans', category: 'Ekonomi' },
    { url: 'https://www.marketwatch.com/rss/topstories', source: 'MarketWatch', category: 'Ekonomi' },
    { url: 'https://www.ft.com/rss/home', source: 'Financial Times', category: 'Ekonomi' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 BÜYÜK MEDYA HAVUZU TARAMASI BAŞLADI...');
    
    if (!global.haberVeritabani) {
        console.error("❌ HATA: Veritabanı tanımlı değil!");
        return;
    }

    for (const kaynak of RSS_KAYNAKLARI) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            // Performans için kaynaktan gelen son 15 haberi alıyoruz (Veritabanı şişmesin)
            const sinirliHaberler = feed.items.slice(0, 15);
            
            for (const item of sinirliHaberler) {
                if (!item.link) continue;

                // Veritabanı sorgusu kilitlenmesin diye Promise yapısına çevrildi
                const varMi = await new Promise((resolve) => {
                    global.haberVeritabani.findOne({ link: item.link }, (err, doc) => {
                        resolve(doc);
                    });
                });

                if (!varMi) {
                    let resim = '';
                    if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                    else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                    // İçeriği kazı, kazıyamazsan RSS içindeki özeti (snippet) kullan. ASLA BOŞ BIRAKMA.
                    const tamIcerik = await haberIceriginiKaziyici(item.link);
                    const yedekMetin = item.contentSnippet || item.summary || item.title || "Haberin detaylarına kaynak siteden ulaşabilirsiniz.";
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

                    global.haberVeritabani.insert(yeniHaber, (err) => {
                        if (!err) console.log(`🌍 Akışa Alındı [${kaynak.category}] (${kaynak.source}): ${item.title.substring(0, 30)}...`);
                    });
                }
            }
        } catch (error) {
            // Bir kaynak patlarsa botu durdurma, sadece logla ve diğer kaynağa geç!
            console.log(`⚠️ Uyarı: ${kaynak.source} şu an yanıt vermiyor, atlanıyor.`);
        }
    }
    console.log('✅ TARAMA TURU TAMAMLANDI. Bot uyku moduna geçiyor...');
}

module.exports = haberleriCekVeKaydet;