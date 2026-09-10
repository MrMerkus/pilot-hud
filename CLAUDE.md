# Pilot HUD

**Bu klasör:** kaynak kod, çalışan iş. Kararlar, açık sorular ve öğrenilenler proje
notlarına yazılır, koda değil.

## Bu proje ne

Titanfall 2'deki Jack Cooper'ın kask HUD'ının gerçek hayatta çalışan hali. Üç aşamalı plan
var, şu an **Aşama 1**: donanım yok, sadece yazılım. Minimap, pusula, konum ve hedef işareti
gösteren çalışan bir arayüz.

Aşama 2 optik birleştiriciyi tezgâhta denemek, Aşama 3 kaskı basıp ikisini içine yerleştirmek.
Aşama 1 bitmeden 2'ye geçilmez; sebebi donanımla başlayan projelerin ekranda hiçbir şey
göremeden ölmesi.

## Çalışma protokolü

- **`AGENTS.md` bu dosyaya symlink'tir.** Codex ve Claude aynı kuralları okur; birini
  değiştirmek ikisini birden değiştirir. Kayma disipline değil dosya sistemine bağlandı;
  symlink'i kopyaya çevirme.
- **Yarım kalan iş `backlog.md`'ye düşer.** Oturum işi bitiremeden kapanıyorsa nerede kaldığı
  ve sıradaki adım oraya tek satır yazılır. Biten satır silinmez, `backlog-log.md`'ye taşınır.
- **Arka plan araştırmaları `reports/` altına yazılır.** Alt ajanlara yaptırılan keşif,
  karşılaştırma ve doküman taraması oraya düşer, doğrudan koda girmez: önce okunur, sonra karar olur.
