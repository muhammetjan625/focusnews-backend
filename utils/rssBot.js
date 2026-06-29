// backend/utils/rssBot.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

// 💡 SİHİRLİ FONKSİYON: Haberin orijinal sitesine gidip tüm metni kazır
async function haberIceriginiKaziyici(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000 
        });
        const $ = cheerio.load(response.data);
        let butunMetin = [];

        // Haber sitelerindeki ana paragrafları hedef alıyoruz
        $('article p, .haber-metni p, .article-content p, #news-body p').each((index, element) => {
            const metin = $(element).text().trim();
            // Çok kısa veya reklam içeren paragrafları eliyoruz
            if (metin.length > 30 && !metin.includes('tıklayın') && !metin.includes('Takip edin')) {
                butunMetin.push(metin);
            }
        });

        // Paragrafları birleştirip temiz bir metin bloğu haline getiriyoruz
        return butunMetin.join('\n\n');
    } catch (error) {
        console.log(`⚠️ Metin kazınamadı (Özet kullanılacak): ${url}`);
        return null;
    }
}

const RSS_KAYNAKLARI = [
    { url: 'https://www.sozcu.com.tr/rss/gundem.xml', source: 'Sözcü', category: 'Gundem' },
    { url: 'https://www.sozcu.com.tr/rss/ekonomi.xml', source: 'Sözcü', category: 'Ekonomi' },
    { url: 'https://www.sozcu.com.tr/rss/skor.xml', source: 'Sözcü', category: 'Spor' },
    { url: 'https://www.teknolojioku.com/rss', source: 'Teknoloji Oku', category: 'Teknoloji' }
];

async function haberleriCekVeKaydet() {
    console.log('🔄 Haber havuzu taranıyor ve kazıma işlemi başlatıldı...');
    
    for (const kaynak of RSS_KAYNAKLARI) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            
            for (const item of feed.items) {
                // Veritabanında zaten var mı kontrol et
                const varMi = await global.haberVeritabani.findOne({ link: item.link });
                
                if (!varMi) {
                    let resim = '';
                    if (item.enclosure && item.enclosure.url) resim = item.enclosure.url;
                    else if (item.content && item.content.match(/src="([^"]+)"/)) resim = item.content.match(/src="([^"]+)"/)[1];

                    // 🚀 ÖNEMLİ KISIM: Haberin tam içeriğini siteden kazıyoruz
                    console.log(`📝 Kazınan haber: ${item.title}`);
                    const tamIcerik = await haberIceriginiKaziyici(item.link);

                    const yeniHaber = {
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate || new Date().toISOString(),
                        // Eğer kazıma başarılıysa tam metni, başarısızsa eski kısa özeti kaydet
                        contentSnippet: tamIcerik || item.contentSnippet || item.content || 'Haber içeriği bulunamadı.',
                        source: kaynak.source,
                        category: kaynak.category,
                        imageUrl: resim
                    };

                    await global.haberVeritabani.insert(yeniHaber);
                }
            }
        } catch (error) {
            console.error(`❌ ${kaynak.source} aranırken hata oluştu:`, error.message);
        }
    }
    console.log('✅ Haber havuzu en güncel tam metinlerle senkronize edildi!');
}

module.exports = haberleriCekVeKaydet;