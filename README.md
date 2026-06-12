# FitRank OS

Fitness takip uygulamasi. Bu klasor artik iki sekilde calisir:

- Yerelde: `python server.py`
- Internette: Cloudflare Pages + Pages Functions + D1

Cloudflare surumunde bilgisayarin acik kalmasi gerekmez. Telefon, bilgisayar ve Telegram ayni hesaba internetten baglanir.

## Cloudflare Pages Ile Yayinlama

### 1. Cloudflare hesabi ac

Cloudflare Dashboard'a gir:

```text
https://dash.cloudflare.com
```

### 2. Projeyi GitHub'a yukle

Bu klasoru bir GitHub reposuna koy. Cloudflare Pages GitHub reposundan deploy edecektir.

Klasor:

```text
C:\Users\furka\Documents\Codex\2026-06-12\imdi-geli-tirmek-istedi-im-bir\outputs\fitness-rank-app
```

Not: `fitrank.db` yerel test veritabanidir. `.gitignore` icine alindi, GitHub'a yukleme.

### 3. D1 veritabani olustur

Bilgisayarda Wrangler kullanacaksan:

```powershell
npm install -g wrangler
wrangler login
wrangler d1 create fitrank-db
```

Komut sana bir `database_id` verir. `wrangler.toml` icindeki su satiri degistir:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

### 4. D1 tablolarini kur

```powershell
wrangler d1 execute fitrank-db --file=./schema.sql --remote
```

### 5. Cloudflare Pages projesi olustur

Cloudflare Dashboard:

```text
Workers & Pages -> Create -> Pages -> Connect to Git
```

Ayarlar:

```text
Framework preset: None
Build command: bos birak
Build output directory: .
Root directory: /
```

Eger repo icinde bu klasor alt klasorse, Root directory olarak:

```text
outputs/fitness-rank-app
```

### 6. D1 binding ekle

Pages projesinde:

```text
Settings -> Functions -> D1 database bindings
```

Binding name:

```text
DB
```

Database:

```text
fitrank-db
```

### 7. Deploy et

Deploy bitince Cloudflare sana su tarz bir link verir:

```text
https://fitrank-os.pages.dev
```

Artik telefon farkli internette olsa bile buradan acilir.

## Telegram Webhook

Cloudflare Pages deploy edildikten sonra BotFather'dan token al.

Cloudflare Pages projesinde secret ekle:

```text
Settings -> Environment variables -> Add variable
```

Name:

```text
TELEGRAM_BOT_TOKEN
```

Value:

```text
BotFather tokenin
```

Sonra webhook'u Telegram'a tanit:

```text
https://api.telegram.org/botBOT_TOKEN/setWebhook?url=https://SENIN-PAGES-LINKIN.pages.dev/api/telegram/webhook
```

Telegram komutlari:

```text
/start
/login email sifre
/rank
/kilo 82.4
/yemek 200g tavuk 1 kase pilav
/antrenman bench press 60kg 4x10
```

Telegram verileri ayni web hesabina yazilir.

## Yerelde Calistirma

Cloudflare'a cikmadan bilgisayarda test etmek icin:

```powershell
cd C:\Users\furka\Documents\Codex\2026-06-12\imdi-geli-tirmek-istedi-im-bir\outputs\fitness-rank-app
python server.py
```

Sonra:

```text
http://127.0.0.1:8080
```

## Dosya Yapisi

```text
index.html
styles.css
app.js
functions/
  _lib.js
  api/
    auth/
      login.js
      register.js
    state.js
    telegram/
      webhook.js
schema.sql
wrangler.toml
server.py
telegram-bot.py
```

## Notlar

- Cloudflare Pages Python `server.py` calistirmaz; onun yerine `functions/` altindaki JavaScript Pages Functions calisir.
- D1, Cloudflare'in SQLite uyumlu serverless veritabanidir.
- `server.py` sadece yerel test icin kaldi.
- `telegram-bot.py` de yerel alternatif olarak kaldi; Cloudflare'da asil Telegram yolu webhook'tur.
