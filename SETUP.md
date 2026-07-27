# Bronze Direct — Uppsetning

## 1. Búa til Supabase verkefni
1. Farðu á [supabase.com](https://supabase.com) → **New project** (aðskilið frá KAI).
2. Veldu svæði (t.d. EU/Frankfurt) og settu sterkt gagnagrunns-lykilorð.

## 2. Keyra SQL (í réttri röð)
Supabase → **SQL Editor** → keyrðu skrárnar:
1. `sql/01_schema.sql` — töflur, RLS, öryggisföll.
2. Stofnaðu Storage bucket **áður** en þú keyrir næstu skrá:
   - **Storage** → **New bucket** → nafn: `bronze`, **Private**.
3. `sql/02_storage.sql` — storage-reglur.

## 3. Tengja frontend
Supabase → **Project Settings → API**, afritaðu:
- **Project URL** → settu í `js/config.js` sem `SUPABASE_URL`.
- **anon public key** → settu í `js/config.js` sem `SUPABASE_ANON_KEY`.

(anon key er öruggt í vafra — RLS ver gögnin.)

## 4. Fyrsti aðgangur (þú sjálfur)
1. Opnaðu kerfið, veldu **Nýr aðgangur**, stofnaðu þinn aðgang.
2. Í Supabase SQL Editor, gerðu þig að stjórnanda:
   ```sql
   update public.profiles
     set role = 'admin', is_super_admin = true
     where email = 'NETFANGIÐ_ÞITT';
   ```
3. Skráðu þig inn — nú sérðu alla valmyndina.

> Ath.: Í MVP getur hver sem er stofnað aðgang. Þegar starfsfólk er komið inn geturðu hert
> þetta (t.d. slökkt á opinni nýskráningu í Supabase Auth, eða krafist boðskóða) — látum
> það bíða þar til grunnurinn er prófaður.

## 5. Keyra staðbundið (þróun)
ES-mátar hlaðast ekki af `file://`. Keyrðu einfaldan þjón:
```bash
cd bronze-direct
python3 -m http.server 8000
```
Opnaðu `http://localhost:8000`.

## 6. Dreifing (Cloudflare)
Eins og KAI: GitHub repo → Cloudflare **Connect to Git**. Enginn build-step; mörgum
skrám þjónað eftir slóð. Settu `js/config.js` með réttum gildum áður en þú ýtir upp.

## Skráayfirlit
```
index.html            skel
styles.css            útlit (mobile-first)
js/config.js          ← SETTU INN Supabase URL + anon key
js/{supabase,render,auth,router,ui,db,fmt,state}.js   grunnur
js/app.js             ræsir + skel + leiðsögn
js/modules/*.js       idag, verkbeidnir, vidskiptavinir, taeki, vorur, reikningar, stjornun, signature
sql/01_schema.sql     gagnagrunnur + RLS
sql/02_storage.sql    storage reglur
```
