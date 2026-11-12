const haberleriCekVeKaydet = require('../utils/rssBot');
const { sistemLogKaydet } = require('./logger');

global.rssDakikaAraligi = 3;
let canliTaramaInterval = null;

function taramaZamanlayicisiniGuncelle(dakika) {
    if (canliTaramaInterval) clearInterval(canliTaramaInterval);
    canliTaramaInterval = setInterval(() => {
        global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
            if (kaynaklar && kaynaklar.length > 0) {
                await haberleriCekVeKaydet(kaynaklar);
            }
        });
    }, Number(dakika) * 60 * 1000);
}

function renderSistemiBaslat(varsayilanKaynaklar) {
    global.discordWebhookVeritabani.count({}, (err, count) => {
        if (count === 0 && process.env.DISCORD_WEBHOOK_URLS) {
            const envUrls = process.env.DISCORD_WEBHOOK_URLS.split(',').map(u => u.trim()).filter(Boolean);
            const defaultHooks = envUrls.map((url, i) => ({
                isim: `Discord Kanalı ${i + 1}`,
                url: url,
                aktif: true,
                eklenmeTarihi: new Date().toISOString()
            }));
            if (defaultHooks.length > 0) {
                global.discordWebhookVeritabani.insert(defaultHooks, () => {
                    console.log('✅ Varsayılan Discord webhooklar yüklendi.');
                });
            }
        }
    });

    global.rssKaynakVeritabani.count({}, (err, count) => {
        if (count === 0) {
            global.rssKaynakVeritabani.insert(varsayilanKaynaklar, (err) => {
                if (!err) {
                    console.log('✅ Varsayılan RSS kaynakları DB-ye yazıldı.');
                    ilkTaramayiCalistir();
                }
            });
        } else {
            console.log('✅ RSS kaynakları veritabanında hazır.');
            ilkTaramayiCalistir();
        }
    });
}

function ilkTaramayiCalistir() {
    global.rssKaynakVeritabani.find({}, async (err, kaynaklar) => {
        if (kaynaklar && kaynaklar.length > 0) {
            console.log(`🚀 Railway sunucusu ilk RSS taramasını tetikliyor...`);
            await haberleriCekVeKaydet(kaynaklar);
        }
    });
}

module.exports = { taramaZamanlayicisiniGuncelle, renderSistemiBaslat };