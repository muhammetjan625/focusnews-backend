const path = require('path');
const Datastore = require('nedb');

// NeDB Veritabanları
global.haberVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'haberler.db'),
    autoload: true
});

global.rssKaynakVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'rss_kaynaklar.db'),
    autoload: true
});

global.logVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'sistem_loglari.db'),
    autoload: true
});

global.discordWebhookVeritabani = new Datastore({
    filename: path.resolve(__dirname, 'discord_webhooks.db'),
    autoload: true
});

// İndeksler
global.haberVeritabani.ensureIndex({ fieldName: 'link', unique: true });
global.rssKaynakVeritabani.ensureIndex({ fieldName: 'url', unique: true });
global.discordWebhookVeritabani.ensureIndex({ fieldName: 'url', unique: true });

// Varsayılan RSS Kaynakları
const varsayilanKaynaklar = [
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', source: 'Anadolu Ajansi', category: 'Gundem' },
    { url: 'https://www.trthaber.com/sondakika_articles.rss', source: 'TRT Haber', category: 'Gundem' },
    { url: 'https://www.haberturk.com/rss', source: 'Haberturk', category: 'Gundem' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=dunya', source: 'Anadolu Ajansi', category: 'Dunya' },
    { url: 'https://www.trthaber.com/dunya_articles.rss', source: 'TRT Haber', category: 'Dunya' },
    { url: 'https://www.haberturk.com/rss/dunya.xml', source: 'Haberturk', category: 'Dunya' },
    { url: 'https://www.haberturk.com/rss/magazin.xml', source: 'Haberturk', category: 'Magazin' },
    { url: 'https://www.trthaber.com/yasam_articles.rss', source: 'TRT Haber', category: 'Magazin' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi', source: 'Anadolu Ajansi', category: 'Ekonomi' },
    { url: 'https://www.trthaber.com/ekonomi_articles.rss', source: 'TRT Haber', category: 'Ekonomi' },
    { url: 'https://www.haberturk.com/rss/ekonomi.xml', source: 'Haberturk', category: 'Ekonomi' },
    { url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', source: 'TRT Haber', category: 'Teknoloji' },
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'Teknoloji' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', source: 'Anadolu Ajansi', category: 'Spor' },
    { url: 'https://www.trthaber.com/spor_articles.rss', source: 'TRT Haber', category: 'Spor' },
    { url: 'https://www.haberturk.com/rss/spor.xml', source: 'Haberturk', category: 'Spor' }
];

module.exports = { varsayilanKaynaklar };