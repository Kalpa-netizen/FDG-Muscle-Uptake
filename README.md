# Muscle FDG Registry — PWA

An installable, offline-capable data-capture app for your study of **FDG-PET muscular uptake in bedridden patients**. Every field from your protocol is included (demographics, clinical status, mobility, metabolic, preparation, labs, imaging/body-composition, per-muscle grading, uptake pattern, and quantitative outcomes), plus the exclusion-criteria checklist and the liver-referenced visual grade scale. Records are pushed straight into a Google Sheet — one row per patient.

No servers, no API keys, no accounts to wire up: the Google Sheet *is* the database, via a small Apps Script endpoint.

---

## 1. Create the Google Sheet backend (one-time, ~3 minutes)

1. Create a new Google Sheet (this becomes your database).
2. **Extensions ▸ Apps Script.**
3. Delete any starter code, paste in the contents of **`apps-script.gs`**, and Save.
4. **Deploy ▸ New deployment.** Click the gear ▸ **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
5. **Deploy**, approve the permission prompt, and copy the **Web app URL** (ends in `/exec`).

> The "Anyone" setting lets the app POST without a login. The URL is effectively a secret write-endpoint — share it only with your data collectors. It can only append rows to this one sheet.

## 2. Connect the app

1. Open the app, tap **⚙** (top right).
2. Paste the `/exec` URL and hit **Send test row** — a `__TEST__` row should appear in your sheet's `Data` tab. Delete that test row afterwards.
3. **Save.** The URL is stored on that device only.

## 3. Host it so it's installable

A PWA needs to be served over HTTPS to install and work offline. Pick one:

- **GitHub Pages** — push this folder to a repo, enable Pages. Free HTTPS.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop this folder.
- **Any hospital/intranet web server** over HTTPS.

Then open the URL on phone/tablet/desktop and **Add to Home Screen / Install**. After the first load it works offline.

> Opening `index.html` directly from the file system (`file://`) works for form entry and sync-when-online, but the service worker (offline caching) and "Install" only activate over http/https.

---

## How data flows

- Each **Save record** sends one JSON record to your Apps Script, which appends a row.
- The **column order** is fixed by the app's schema, so the header row stays stable. If you extend the schema later, new columns are added automatically without breaking existing data.
- **Offline / bad wifi:** records are queued on the device and the badge shows a count. They flush automatically when the connection returns, or tap **⟳** to sync manually.
- **Patient ID** is required before saving; **Operator** and **Scan date** carry over to the next patient to speed up batch entry.

## Column reference (sheet header order)

`record_id`, `submitted_at`, `patient_id`, `scan_date`, `operator`,
exclusion flags (`ex_*`) + `is_excluded`,
demographics, clinical, mobility, metabolic, preparation, labs, imaging/body-comp,
per-muscle grades (`m_deltoid` … `m_soleus`, values 0–3),
`pattern`, `symmetry`, `visual_grade`,
`suvmax`, `suvmean`, `muscle_liver_ratio`, `metabolic_volume`, `n_muscles`, `notes`.

Yes/No fields store `Yes` / `No` / `Unknown`. Blank means not recorded.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app (UI + logic) |
| `manifest.webmanifest` | PWA metadata for install |
| `sw.js` | Service worker (offline app shell) |
| `apps-script.gs` | Paste into Google Apps Script |
| `icons/` | App icons |

## Customising

- **Add / rename fields:** edit the `SECTIONS` array near the top of the `<script>` in `index.html`. Column order follows that array; the sheet updates its header automatically on the next save.
- **Change dose unit** (MBq↔mCi) or any unit: edit the field's `u:` value.
- **Muscle list:** edit the `regions` array in the `muscles` section.
