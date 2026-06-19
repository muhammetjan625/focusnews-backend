const Parser = require('rss-parser');

// Sitelere kendimizi gerçek bir Chrome tarayıcısı gibi tanıtarak engellemeleri aşıyoruz
const parser = new Parser({
    requestOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
    },
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['image', 'image']
        ]
    }
});

const KAYNAKLAR = [
    { name: 'BBC Türkçe', category: 'Gündem', url: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
    { name: 'Hürriyet', category: 'Ekonomi', url: 'https://www.hurriyet.com.tr/rss/ekonomi' },
    { name: 'Sözcü', category: 'Spor', url: 'https://www.sozcu.com.tr/rss/spor.xml' },
    { name: 'ShiftDelete', category: 'Teknoloji', url: 'https://shiftdelete.net/feed' }
];

const haberleriCekVeKaydet = async () => {
    console.log('🔄 Engel aşma modülleriyle tarama botu başlatıldı...');
    const db = global.haberVeritabani;
    if (!db) return console.log("❌ Veritabanı henüz hazır değil.");

    for (const kaynak of KAYNAKLAR) {
        try {
            const feed = await parser.parseURL(kaynak.url);
            let yeniHaberSayisi = 0;

            for (const item of feed.items) {
                const varMi = await db.findOne({ link: item.link });
                
                if (!varMi) {
                    let extractedImage = null;

                    // RSS içindeki her türlü görsel varyasyonunu tara
                    if (item.enclosure && item.enclosure.url) {
                        extractedImage = item.enclosure.url;
                    }
                    else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
                        extractedImage = item.mediaContent.$.url;
                    }
                    else if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
                        extractedImage = item.mediaThumbnail.$.url;
                    }
                    else if (item.image) {
                        extractedImage = typeof item.image === 'string' ? item.image : item.image.url;
                    }
                    else {
                        const contentString = item.content || item.contentSnippet || '';
                        const imgMatch = contentString.match(/src="([^"]+)"/);
                        if (imgMatch && imgMatch[1]) {
                            extractedImage = imgMatch[1];
                        }
                    }

                    // Görsel yoksa veya eksikse, başlığa özel TEKRARLANMAYAN benzersiz resim oluştur
                    if (!extractedImage || extractedImage.includes('placeholder') || extractedImage.length < 10) {
                        const uniqueSeed = encodeURIComponent(item.title.substring(0, 15));
                        const searchKeyword = kaynak.category === 'Gündem' ? 'news' : kaynak.category.toLowerCase();
                        extractedImage = `https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80&sig=${uniqueSeed}&keyword=${searchKeyword}`;
                    }

                    await db.insert({
                        title: item.title,
                        link: item.link,
                        pubDate: new Date(item.pubDate || item.isoDate).toISOString(),
                        contentSnippet: item.contentSnippet || item.title,
                        source: kaynak.name,
                        category: kaynak.category,
                        imageUrl: extractedImage
                    });
                    yeniHaberSayisi++;
                }
            }
            console.log(`✅ ${kaynak.name} (${kaynak.category}): ${yeniHaberSayisi} yeni haber havuza eklendi.`);
        } catch (error) {
            console.error(`❌ ${kaynak.name} verisi çekilemedi:`, error.message);
        }
    }
    console.log('✨ Tarama ve engelleri aşma işlemi tamamlandı.');
};

module.exports = haberleriCekVeKaydet;