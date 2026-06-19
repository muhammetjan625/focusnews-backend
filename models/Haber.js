const mongoose = require('mongoose');

const HaberSchema = new mongoose.Schema({
    title: { type: String, required: true },
    link: { type: String, required: true, unique: true }, // Hatasız yapı için benzersiz olmalı
    pubDate: { type: Date, required: true },
    contentSnippet: { type: String }, // Kısa özet
    source: { type: String, required: true }, // Örn: Hürriyet, Sözcü, BBC
    category: { type: String, required: true }, // Örn: Teknoloji, Gündem, Ekonomi
    imageUrl: { type: String, default: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=500' } // Varsayılan görsel
}, { timestamps: true });

module.exports = mongoose.model('Haber', HaberSchema);