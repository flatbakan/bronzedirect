# Bronze Direct — Verkefnayfirlit

Innra rekstrarkerfi fyrir **Bronze Direct** — heildsölu á ljósabekkjum, perum og varahlutum, ásamt þjónustu á staðnum (uppsetning, viðgerðir, peruskipti).

Eigandi: Páll. Aðskilið verkefni frá KAI (eigið Supabase-verkefni, eigið GitHub-repo, eigin Cloudflare-dreifing).

Staða: **Í hönnun** (byrjað 2026-07-27).

---

## 1. Ákvarðanir (negldar niður)

- **Notendur:** Aðeins starfsfólk Bronze Direct (einn leigjandi). Viðskiptavinir (sólbaðsstofur) fá **ekki** innskráningu — þeir eru gögn í kerfinu. → Einföld auðkenning, einföld RLS ("innskráður starfsmaður sér gögn").
- **Forgangur:** Þjónusta á staðnum fyrst. Heildsala (vörulisti/pantanir/lager/reikningar) byggð ofan á seinna.
- **Tæknileið A:** Vanilla HTML/CSS/JS + Supabase + Cloudflare, enginn build-step. En strax:
  1. **Margar litlar skrár** per einingu (ekki einn risa-`app.js` eins og í KAI).
  2. **Örugg teikni-hjálp** (`escape` sjálfgefið) svo XSS-flokkur villna verði ómögulegur — lærdómur úr KAI-öryggisúttektinni.
- **Farsíma-fyrst:** Tæknimenn nota kerfið í síma úti á staðnum. PWA (uppsetjanlegt, mobile-first UI). Alvöru offline-samstilling bíður seinni útgáfu; MVP krefst nettengingar.

---

## 2. Tæknilegur grunnur

- **Bakendi:** Nýtt Supabase-verkefni (eigið, ótengt KAI).
  - Auth: netfang + lykilorð. Boðskóði fyrir nýtt starfsfólk (eða Super Admin stofnar).
  - PostgreSQL + RLS. Einn leigjandi ⇒ meginreglan er `auth.uid() is not null` (innskráður starfsmaður) + hlutverkastýring fyrir viðkvæmar aðgerðir.
  - Storage bucket `bronze` — lógó, myndir af verkum/tækjum, undirskriftir.
  - Edge Function `admin-actions` — viðkvæmar aðgerðir sem þurfa `service_role` (breyta lykilorði starfsmanns o.s.frv.). Aldrei leynilyklar í vafra.
- **Dreifing:** GitHub repo → Cloudflare (Connect to Git). Enginn build-step, mörgum skrám þjónað eftir slóð.

---

## 3. Hlutverk (roles)

- `admin` — eigandi/skrifstofa. Sér allt, stýrir starfsfólki, vörum, verðum, reikningum.
- `technician` — tæknimaður. Sér verkbeiðnir sínar/allar, tæki, skráir vinnu/perur/myndir á staðnum.
- (síðar) `office` — pantanir/lager án fullra admin-réttinda.
- `is_super_admin` — tæknilegur ofuraðgangur (Páll).

---

## 4. Gagnalíkan — Þjónusta (MVP, fyrsti áfangi)

**Starfsfólk**
- `profiles` — id=auth.users.id, role, is_super_admin, full_name, phone, email, avatar_path, is_active.

**Viðskiptavinir (sólbaðsstofur)**
- `customers` — id, name, kennitala, phone, email, notes, is_active, created_at.
- `locations` — id, customer_id, name (t.d. "Hamraborg"), address, postal_code, city, access_notes (t.d. lyklaboð/hvar bekkir eru). Viðskiptavinur getur átt margar starfsstöðvar.

**Tæki (ljósabekkir hjá viðskiptavinum)**
- `equipment` — id, customer_id, location_id, model, brand, serial_number, install_date, status (in_service / needs_service / removed), bulb_type, bulb_count, facial_bulb_count, notes, current_bulb_hours (áætlaðar klst frá síðustu peruskiptum). Kjarninn: hvaða bekkur er hvar.
- `bulb_changes` — id, equipment_id, changed_at, changed_by, bulb_product_id, quantity, hours_at_change, notes. Saga peruskipta per bekk (perur endast X klst).

**Verkbeiðnir / þjónustuferðir**
- `work_orders` — id, number (hlaupandi), customer_id, location_id, equipment_id (valfrjálst), type (install / repair / bulb_change / maintenance / inspection / other), status (new / scheduled / in_progress / done / invoiced / cancelled), priority, scheduled_at, assigned_to, title, description, resolution, labor_hours, signature_path, created_by, created_at, completed_at.
- `work_order_parts` — id, work_order_id, product_id, description, quantity, unit_price. Varahlutir/perur notaðir í verkið (tenging við vörur).
- `work_order_photos` — id, work_order_id, storage_path, caption, uploaded_by, uploaded_at.

**Vörur (léttur grunnur — þarf vegna varahluta/pera í verkum)**
- `products` — id, sku, name, category (bed / bulb / part / accessory), brand, description, cost_price, sale_price, unit, stock_qty, is_active. Fullur heildsöluhluti byggður ofan á þetta seinna.

**Kerfi**
- `company_settings` — company_name, address, phone, kennitala, logo_path (Bronze Direct sjálft, eitt met).
- `activity_log` (valfrjálst) — óbreytanleg aðgerðaskrá.

---

## 5. Gagnalíkan — Heildsala (seinni áfangi, drög)

- `suppliers` — birgjar (þýskir/erlendir framleiðendur ljósabekkja/pera).
- `purchase_orders` + `purchase_order_lines` — innkaup frá birgjum.
- `sales_orders` + `sales_order_lines` — sölupantanir til viðskiptavina.
- `invoices` / `quotes` — reikningar og tilboð (mögulega tenging við ísl. reikningakerfi seinna).
- `stock_movements` — lagerhreyfingar (inn/út), rekjanleiki birgða.

---

## 6. Einingar (moduler) — MVP

1. **Innskráning / auðkenning** — login, nýskráning með boðskóða, gleymt lykilorð.
2. **Í dag / Dagatal** — verkbeiðnir dagsins fyrir tæknimann (mobile-first), yfirlit viku.
3. **Verkbeiðnir** — listi, stofna, úthluta, tímasetja, opna á staðnum: skrá vinnu, varahluti, perur, myndir, undirskrift, merkja lokið.
4. **Viðskiptavinir** — listi + spjaldskrá per viðskiptavin (starfsstöðvar, tæki, þjónustusaga).
5. **Tæki** — skrá ljósabekki, hvar þeir eru, perutegund/fjöldi, perusaga, þjónustusaga.
6. **Vörur** (léttur) — perur/varahlutir/bekkir til að vísa í úr verkum.
7. **Stjórnun** — starfsfólk, hlutverk, fyrirtækisstillingar.

---

## 7. Skráauppbygging (frontend, engin build-step)

```
index.html            — skel (app shell), hleður inn mátum
styles.css            — allt CSS (mobile-first)
js/
  config.js           — Supabase URL/anon key, fastar
  supabase.js         — Supabase client init
  render.js           — ÖRUGG teikni-hjálp (el/text/escape) — engin ber innerHTML
  auth.js             — innskráning, seta, hlutverk
  router.js           — einföld hash-leiðsögn
  app.js              — ræsir, hliðarvalmynd, sameiginlegt
  modules/
    idag.js
    verkbeidnir.js
    vidskiptavinir.js
    taeki.js
    vorur.js
    stjornun.js
sql/
  01_schema.sql ...    — migrations í röð
supabase/functions/admin-actions/index.ts
```

---

## 8. Öryggi frá degi eitt (lærdómur úr KAI)

- **Engin ber `innerHTML` með notendagögnum.** Öll teikning gegnum `render.js` sem escape-ar sjálfgefið.
- **RLS á öllum töflum** — sjálfgefið læst, opnað markvisst.
- **Leynilyklar aldrei í vafra** — Edge Function fyrir `service_role` aðgerðir.
- **Hlutverkastýring framfylgt í bakenda** (RLS/policies), ekki bara falin í UI.

---

## 9. Óklárað / bíður

- Heildsöluhluti (pantanir, lager, reikningar) — áfangi 2.
- Offline-samstilling fyrir tæknimenn (áfangi 3).
- Tenging við íslenskt reikninga-/bókhaldskerfi.
- Áminningar (perur að klárast m.v. klst, reglubundin þjónusta).
