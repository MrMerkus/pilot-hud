# Pilot HUD

Titanfall 2'deki Jack Cooper'in kask HUD'inin gercek hayatta calisan hali.
Uc asamali planin **Asama 1**'i: donanim yok, sadece yazilim.

## Calistir

```bash
cd ~/ofis/pilot-hud
python3 serve.py
```

Ciktida iki adres verir. Telefondan ikincisini ac.

## Neden HTTPS

Tarayicilar konum ve pusula sensorlerini yalnizca guvenli baglantida veriyor.
Duz HTTP ile acarsan HUD calisir ama sensorler bos kalir. `serve.py` kendinden
imzali sertifika uretip HTTPS sunuyor; telefonda "guvenli degil" uyarisi cikar,
**Gelismis -> Yine de devam et** dedikten sonra calisir. Kendi bilgisayarin, sorun yok.

## Kullanim

| Dugme | Ne yapar |
| --- | --- |
| BAGLAN | Konum ve pusula izni ister, gercek sensorlerle baslar |
| SIMULASYON MODU | Sensor kullanmaz, sahte yuruyus uretir. Masaustunde denemek icin |
| HEDEF KOY | Bulundugun noktayi hedef olarak isaretler |
| TEMIZLE | Hedefi, izi ve toplam mesafeyi sifirlar |
| MENZIL | Minimap menzilini degistirir: 50 / 100 / 250 / 500 / 1000 m |

Ilk denemede **SIMULASYON MODU** ile bak, arayuz calisiyor mu gor.
Sonra disari cikip BAGLAN ile gercek test yap.

## Ekranda ne var

- **Ust serit:** pusula. Kehribar ucgen baktigin yonu gosterir.
- **Sag ust:** minimap. Burun yukari calisir, yani ekranin ustu her zaman
  baktigin yon. Kuzey ayri "K" harfiyle isaretli. Iz gectigin yolu gosterir.
- **Sol ust:** GPS kilidi, bakis acisi, pusula kaynagi (IOS / MAG / GPS / SIM).
- **Sol alt:** enlem, boylam, GPS hassasiyeti.
- **Sag alt:** hiz, rakim, toplam yurunen mesafe.
- **Alt orta:** hedef mesafesi ve hangi tarafta oldugu.

## Dosyalar

```
index.html        HUD yerlesimi
style.css         gorunum
serve.py          HTTPS yerel sunucu
src/geo.js        cografi hesaplar (mesafe, aci) - saf fonksiyonlar
src/sensors.js    GPS, pusula ve simulasyon; hepsi ayni arayuz
src/minimap.js    minimap ve pusula seridi cizimi
src/app.js        durum yonetimi ve ana dongu
```

## Bilinen sinirlar

- Pusula her cihazda ayni hassasiyette degil. Manyetometre kalibrasyonu icin
  telefonu havada sekiz cizerek sallamak gerekebilir.
- Kapali alanda GPS calismaz veya cok saparak calisir.
- Harita altligi yok; minimap simdilik sadece iz, hedef ve yon gosteriyor.
  Gercek harita katmani acik bir karar, projenin beyninde tartisiliyor.

## Tasarim notu

Zemin siyah, bilgi camgobegi. Bu estetik tercih degil: Asama 3'te birlestirici
optikte siyah pikseller seffaf gorunur, sadece parlak olanlar goze ulasir.
Simdiden koyu tasarlamak, sonradan bastan yazmayi onluyor.

---
Projenin karar defteri: `NemesesOS/🏰 İş/pilot-hud/pilot-hud.md`

## Lisans ve ilişki beyanı

MIT — [LICENSE](LICENSE).

Bu bir hayran projesidir. Titanfall, Respawn Entertainment ve Electronic Arts'ın tescilli
markalarıdır; bu proje onlarla ilişkili, onlar tarafından desteklenen veya onaylanan bir iş
değildir. Depoda oyuna ait hiçbir varlık (görsel, ses, model, kod) bulunmaz — arayüz sıfırdan
yazılmıştır.
