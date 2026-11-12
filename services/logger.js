function sistemLogKaydet(tip, mesaj, detay = {}) {
    const logKaydi = { tip, mesaj, detay, tarih: new Date().toISOString() };
    if (global.logVeritabani) {
        global.logVeritabani.insert(logKaydi);
    }
    console.log(`[LOG - ${tip}]: ${mesaj}`);
}

module.exports = { sistemLogKaydet };