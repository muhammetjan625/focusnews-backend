const axios = require('axios');

// Railway'deki canlı backend adresiniz
const API_BASE = 'https://worker-backend.up.railway.app';

// 🛡️ Botun ilk açılışında (deploy sonrası) geçmiş haberlerin Telegram'a spam olmasını önleyen bayrak
let ilkAcilisTamamlandi = false;

// Türkiye'nin 81 ili için merkez koordinatları
const iller = [
  { isim: "Adana", lat: 37.0, lon: 35.32 },
  { isim: "Adıyaman", lat: 37.76, lon: 38.27 },
  { isim: "Afyonkarahisar", lat: 38.75, lon: 30.55 },
  { isim: "Ağrı", lat: 39.71, lon: 43.05 },
  { isim: "Amasya", lat: 40.65, lon: 35.83 },
  { isim: "Ankara", lat: 39.93, lon: 32.85 },
  { isim: "Antalya", lat: 36.88, lon: 30.70 },
  { isim: "Artvin", lat: 41.18, lon: 41.82 },
  { isim: "Aydın", lat: 37.84, lon: 27.84 },
  { isim: "Balıkesir", lat: 39.64, lon: 27.88 },
  { isim: "Bilecik", lat: 40.14, lon: 29.97 },
  { isim: "Bingöl", lat: 38.88, lon: 40.49 },
  { isim: "Bitlis", lat: 38.40, lon: 42.10 },
  { isim: "Bolu", lat: 40.73, lon: 31.60 },
  { isim: "Burdur", lat: 37.72, lon: 30.28 },
  { isim: "Bursa", lat: 40.18, lon: 29.06 },
  { isim: "Çanakkale", lat: 40.15, lon: 26.41 },
  { isim: "Çankırı", lat: 40.60, lon: 33.61 },
  { isim: "Çorum", lat: 40.55, lon: 34.95 },
  { isim: "Denizli", lat: 37.77, lon: 29.08 },
  { isim: "Diyarbakır", lat: 37.91, lon: 40.23 },
  { isim: "Edirne", lat: 41.67, lon: 26.55 },
  { isim: "Elazığ", lat: 38.68, lon: 39.22 },
  { isim: "Erzincan", lat: 39.75, lon: 39.50 },
  { isim: "Erzurum", lat: 39.90, lon: 41.27 },
  { isim: "Eskişehir", lat: 39.77, lon: 30.52 },
  { isim: "Gaziantep", lat: 37.06, lon: 37.38 },
  { isim: "Giresun", lat: 40.91, lon: 38.38 },
  { isim: "Gümüşhane", lat: 40.46, lon: 39.48 },
  { isim: "Hakkari", lat: 37.57, lon: 43.73 },
  { isim: "Hatay", lat: 36.20, lon: 36.16 },
  { isim: "Isparta", lat: 37.76, lon: 30.55 },
  { isim: "Mersin", lat: 36.80, lon: 34.63 },
  { isim: "İstanbul", lat: 41.00, lon: 28.97 },
  { isim: "İzmir", lat: 38.41, lon: 27.14 },
  { isim: "Kars", lat: 40.60, lon: 43.09 },
  { isim: "Kastamonu", lat: 41.38, lon: 33.78 },
  { isim: "Kayseri", lat: 38.73, lon: 35.48 },
  { isim: "Kırklareli", lat: 41.73, lon: 27.22 },
  { isim: "Kırşehir", lat: 39.14, lon: 34.16 },
  { isim: "Kocaeli", lat: 40.76, lon: 29.91 },
  { isim: "Konya", lat: 37.86, lon: 32.48 },
  { isim: "Kütahya", lat: 39.42, lon: 29.98 },
  { isim: "Malatya", lat: 38.35, lon: 38.33 },
  { isim: "Manisa", lat: 38.61, lon: 27.42 },
  { isim: "Kahramanmaraş", lat: 37.58, lon: 36.93 },
  { isim: "Mardin", lat: 37.32, lon: 40.74 },
  { isim: "Muğla", lat: 37.21, lon: 28.36 },
  { isim: "Muş", lat: 38.74, lon: 41.49 },
  { isim: "Nevşehir", lat: 38.69, lon: 34.71 },
  { isim: "Niğde", lat: 37.96, lon: 34.68 },
  { isim: "Ordu", lat: 40.98, lon: 37.87 },
  { isim: "Rize", lat: 41.02, lon: 40.52 },
  { isim: "Sakarya", lat: 40.75, lon: 30.40 },
  { isim: "Samsun", lat: 41.28, lon: 36.33 },
  { isim: "Siirt", lat: 37.93, lon: 41.94 },
  { isim: "Sinop", lat: 42.02, lon: 35.15 },
  { isim: "Sivas", lat: 39.75, lon: 37.01 },
  { isim: "Tekirdağ", lat: 40.98, lon: 27.51 },
  { isim: "Tokat", lat: 40.31, lon: 36.55 },
  { isim: "Trabzon", lat: 41.00, lon: 39.72 },
  { isim: "Tunceli", lat: 39.10, lon: 39.54 },
  { isim: "Şanlıurfa", lat: 37.15, lon: 38.79 },
  { isim: "Uşak", lat: 38.68, lon: 29.40 },
  { isim: "Van", lat: 38.50, lon: 43.37 },
  { isim: "Yozgat", lat: 39.81, lon: 34.81 },
  { isim: "Zonguldak", lat: 41.45, lon: 31.79 },
  { isim: "Aksaray", lat: 38.36, lon: 34.03 },
  { isim: "Bayburt", lat: 40.25, lon: 40.22 },
  { isim: "Karaman", lat: 37.17, lon: 33.22 },
  { isim: "Kırıkkale", lat: 39.84, lon: 33.50 },
  { isim: "Batman", lat: 37.88, lon: 41.12 },
  { isim: "Şırnak", lat: 37.51, lon: 42.45 },
  { isim: "Bartın", lat: 41.63, lon: 32.33 },
  { isim: "Ardahan", lat: 41.11, lon: 42.70 },
  { isim: "Iğdır", lat: 39.91, lon: 44.04 },
  { isim: "Yalova", lat: 40.65, lon: 29.38 },
  { isim: "Karabük", lat: 42.20, lon: 32.62 },
  { isim: "Kilis", lat: 36.71, lon: 37.11 },
  { isim: "Osmaniye", lat: 37.07, lon: 36.24 },
  { isim: "Düzce", lat: 40.84, lon: 31.15 }
];

// Son gönderilen haberlerin ID'lerini takip etmek için bellek (Deploy spamini önler)
let gonderilenHaberIdleri = new Set();

async function telegramHaberVeHavaKontrolu() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!token || !channelId) return;

    try {
        // 1. Sunucudaki taze haberleri çek
        const haberRes = await axios.get(`${API_BASE}/api/haberler`).catch(() => null);
        
        if (haberRes && haberRes.data && haberRes.data.success) {
            const haberler = haberRes.data.data;

            // Eğer bu ilk açılış turuysa, mevcut haberleri "gönderildi" olarak işaretle ki deploy anında eski haberler atılmasın!
            if (!ilkAcilisTamamlandi) {
                haberler.forEach(h => gonderilenHaberIdleri.add(h._id));
                ilkAcilisTamamlandi = true;
                console.log("🛡️ [TELEGRAM] İlk açılış senkronizasyonu tamamlandı. Eski haberler filtrelendi.");
            } else {
                // Sadece daha önce gönderilmemiş yepyeni haberleri bul
                const yeniHaberler = haberler.filter(h => !gonderilenHaberIdleri.has(h._id));

                for (const haber of yeniHaberler) {
                    gonderilenHaberIdleri.add(haber._id);

                    // Normal haber formatı (Link yok, sadece başlık, özet, kaynak ve kategori metin olarak var + Resimli)
                    const mesajMetni = 
                        `📰 *MomoNews | Son Dakika*\n\n` +
                        `📌 *${haber.title}*\n\n` +
                        `${haber.contentSnippet ? haber.contentSnippet.substring(0, 250) + '...' : ''}\n\n` +
                        `🏷️ *Kategori:* ${haber.category} | 🏢 *Kaynak:* ${haber.source}`;

                    try {
                        if (haber.imageUrl) {
                            // Resimli haber gönderimi (sendPhoto)
                            await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
                                chat_id: channelId,
                                photo: haber.imageUrl,
                                caption: mesajMetni,
                                parse_mode: 'Markdown'
                            });
                        } else {
                            // Resim yoksa sadece metin gönderimi (sendMessage)
                            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                                chat_id: channelId,
                                text: mesajMetni,
                                parse_mode: 'Markdown'
                            });
                        }
                        await new Promise(r => setTimeout(r, 2000)); // Rate limit koruması
                    } catch (err) {
                        console.error("❌ Telegram haber gönderim hatası:", err.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error("❌ [TELEGRAM] Haber döngüsü hatası:", err.message);
    }
}

// 2. 6 Saatte bir 81 il hava durumu raporunu gönderen fonksiyon
async function telegramHavaDurumunuGonder() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!token || !channelId) return;

    try {
        console.log("🌤️ [TELEGRAM HAVA] 81 il hava durumu verileri toplanıyor...");
        let raporParcalari = ["🌤️ *MomoNews | 6 Saatlik Türkiye Geneli Hava Durumu Raporu*\n"];
        let aktifParca = 0;

        for (const il of iller) {
            try {
                const res = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${il.lat}&longitude=${il.lon}&current_weather=true`, { timeout: 5000 });
                const sicaklik = Math.round(res.data.current_weather.temperature);
                const satir = `📍 *${il.isim}*: ${sicaklik}°C\n`;

                if (raporParcalari[aktifParca].length + satir.length > 3900) {
                    raporParcalari.push("");
                    aktifParca++;
                }
                raporParcalari[aktifParca] += satir;
            } catch (e) {}
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        for (const parca of raporParcalari) {
            try {
                await axios.post(url, { chat_id: channelId, text: parca, parse_mode: 'Markdown' }, { timeout: 10000 });
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {}
        }
        console.log("✅ [TELEGRAM HAVA] 81 il hava durumu raporu kanala iletildi.");
    } catch (err) {}
}

// Zamanlayıcılar:
// Haberleri her 2 dakikada bir kontrol et (Yeni haber varsa anında resimli ve metin olarak atar, eskileri atlamaz)
setTimeout(telegramHaberVeHavaKontrolu, 10000);
setInterval(telegramHaberVeHavaKontrolu, 2 * 60 * 1000);

// Hava durumunu her 6 saatte bir gönder
const ALTI_SAAT = 6 * 60 * 60 * 1000;
setInterval(telegramHavaDurumunuGonder, ALTI_SAAT);