// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

// 💡 SİHİRLİ FONKSİYON: Haberin orijinal sitesine gidip tüm metni kazır ve filtreler
async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 7000 // Bazı siteler yavaş olabilir
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        // Haber sitelerindeki ana paragrafları hedef alıyoruz (TRT, Habertürk, NTV uyumlu)
        $('article p, .haber-metni p, .article-content p, #news-body p, .content p, .post-content p').each((index, element) => {
            const metin = $(element).text().trim();
            const kucukMetin = metin.toLowerCase();

            // ⚠️ AKILLI TELİF, REKLAM VE AJANS FİLTRESİ
            const yasakliMi = 
                kucukMetin.includes('telif') || 
                kucukMetin.includes('tüm hakları') || 
                kucukMetin.includes('izinsiz') || 
                kucukMetin.includes('kopyalanamaz') || 
                kucukMetin.includes('haber ajansı') ||
                kucukMetin.includes('abone ol') ||
                kucukMetin.includes('tıklayın') ||
                kucukMetin.includes('takip edin') ||
                kucukMetin.length < 40; // Çok kısa satırları atla

            if (metin.length > 0 && !yasakliMi) {
                butunMetin.push(metin);
            }
        });

        // Temiz metin bloğunu birleştir
        return butunMetin.join('\n\n');
    } catch (error) {
        // console.log(`⚠️ Metin kazınamadı: ${url}`); // Çok log birikmemesi için kapattık
        return null;
    }
}

// 🏛️ TEMİZ VE GÜVENİLİR HABER KAYNAKLARI (SÖZCÜ İÇERMEZ)
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

    // 🔴 ATV HABER / SABAH GRUBU
    { url: 'https://www.sabah.com.tr/rss/gundem.xml', source: 'ATV / Sabah', category: 'Gundem' },
    { url: 'https://www.sabah.com.tr/rss/ekonomi.xml', source: 'ATV / Sabah', category: 'Ekonomi' },
    { url: 'https://www.sabah.com.tr/rss/spor.xml', source: 'ATV / Sabah', category: 'Spor' },
    { url: 'https://www.sabah.com.tr/rss/teknoloji.xml', source: 'ATV / Sabah', category: 'Teknoloji' },

    // 🔵 NTV
    { url: 'https://www.ntv.com.tr/gundem.rss', source: 'NTV', category: 'Gundem' },
    { url: 'https://www.ntv.com.tr/ekonomi.rss', source: 'NTV', category: 'Ekonomi' },
    { url: 'https://www.ntv.com.tr/spor.rss', source: 'NTV', category: 'Spor' },
    { url: 'https://www.ntv.com.tr/teknoloji.rss', source: 'NTV', category: 'Teknoloji' },
    
    // 💻 TEKNOLOJİ OKU
    { url: 'https://www.teknolojioku.com/rss', source: 'Teknoloji Oku', category: 'Teknoloji' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 Haber havuzu taranıyor ve tam metin kazıma işlemi başlatıldı...');
    
    for (const kaynak of RSS_KAYNAKLARI) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            for (const item of feed.items) {
                // Linke göre veritabanında zaten var mı kontrol et
                global.haberVeritabani.findOne({ link: item.link }, async (err, varMi) => {
                    if (err) return;
                    
                    if (!varMi) {
                        // Resim bulma mantığı
                        let resim = '';
                        if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                        else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                        // 🚀 ÖNEMLİ: Haberin tam metnini kazıyoruz
                        const tamIcerik = await haberIceriginiKaziyici(item.link);

                        if (tamIcerik && tamIcerik.length > 100) { // Sadece içi dolu haberleri kaydet
                            const yeniHaber = {
                                title: item.title,
                                link: item.link,
                                pubDate: item.pubDate || new Date().toISOString(),
                                contentSnippet: tamIcerik, // Tam metni buraya yazıyoruz
                                source: kaynak.source,
                                category: kaynak.category,
                                imageUrl: resim
                            };

                            global.haberVeritabani.insert(yeniHaber, (insertErr) => {
                                if (!insertErr) console.log(`📝 Yeni Haber eklendi (${kaynak.source}): ${item.title.substring(0, 30)}...`);
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.error(`❌ ${kaynak.source} aranırken hata:`, error.message);
        }
    }
    // console.log('✅ Haber havuzu senkronizasyonu tamamlandı.'); // Log kalabalığını azaltmak için
}

module.exports = haberleriCekVeKaydet;