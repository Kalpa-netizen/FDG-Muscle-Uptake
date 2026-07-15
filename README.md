# Muscle FDG Registry — PWA

An installable, offline-capable data-capture app for your study of **FDG-PET muscular uptake in bedridden patients**. It captures demographics, clinical status, mobility, metabolic, preparation and lab fields, an exclusion-criteria checklist, per-site **uptake findings** (name the muscle, region, and laterality of uptake), the overall uptake pattern, and quantitative outcomes. Patient-level data goes to a **Data** tab (one row per patient); each muscle finding goes to a **Findings** tab (one row per finding, linked by `record_id`).

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

## 2. Add collaborators (access control)

Only people holding an **active access key** can submit. Keys live in an `Access` tab you control.

1. After pasting the script and reloading the Sheet, use the new **FDG Registry ▸ Add collaborator** menu.
2. Enter the person's name/initials — a key like `K-7F3Q-2ND8` is generated and shown. Send it to them privately.
3. To **revoke** someone, open the `Access` tab and set their `active` cell to anything other than `Yes`. It takes effect immediately — no redeploy.

Every saved record is stamped in the `authorized_as` column with the key's owner, so you always know who entered what.

## 3. Connect the app

1. Open the app, tap **⚙** (top right).
2. Paste the `/exec` URL **and your access key**, then hit **Send test row** — a `__TEST__` row should appear in the `Data` tab. Delete it afterwards.
3. **Save.** Both are stored on that device only.

## 4. Host it so it's installable

A PWA needs to be served over HTTPS to install and work offline. Pick one:

- **GitHub Pages** — push this folder to a repo, enable Pages. Free HTTPS.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop this folder.
- **Any hospital/intranet web server** over HTTPS.

Then open the URL on phone/tablet/desktop and **Add to Home Screen / Install**. After the first load it works offline.

> Opening `index.html` directly from the file system (`file://`) works for form entry and sync-when-online, but the service worker (offline caching) and "Install" only activate over http/https.

---

## How data flows

- Each **Save record** sends one JSON record to your Apps Script, which appends a row.- The **column order** is fixed by the app's schema, so the header row stays stable. If you extend the schema later, new columns are added automatically without breaking existing data.
- **Offline / bad wifi:** records are queued on the device and the badge shows a count. They flush automatically when the connection returns, or tap **⟳** to sync manually.
- **Patient ID** is required before saving; **Operator** and **Scan date** carry over to the next patient to speed up batch entry.

## Editing a record from the app

Tap the **🔍** (top right), enter a Patient / study ID, and pick the record. Its values load back into the form and the app enters **edit mode** (an orange bar names the record; the button becomes **Update record**). Change anything and tap **Update record** — it overwrites that same row in place.

- The original `record_id`, `submitted_at`, and `authorized_as` are preserved. The person who made the edit and the time are recorded in new `updated_by` / `updated_at` columns.
- If more than one record shares an ID, you get a list to choose from.
- Editing needs a live connection (unlike new entries, which queue offline). **Cancel edit** returns you to a fresh blank record.

## Column reference (sheet header order)

`record_id`, `submitted_at`, `patient_id`, `scan_date`, `operator`,
exclusion flags (`ex_*`) + `is_excluded`,
demographics, clinical, mobility, metabolic, preparation, labs,
`findings_count`, `findings_summary`,
`pattern`, `symmetry`, `visual_grade`,
`suvmax`, `suvmean`, `muscle_liver_ratio`, `metabolic_volume`, `n_muscles`, `notes`.

Yes/No fields store `Yes` / `No` / `Unknown`. Blank means not recorded.

**Findings tab** columns: `record_id`, `patient_id`, `region`, `muscle`, `laterality`, `grade`. Pivot this tab by `region` or `muscle` to analyse uptake by site. Laterality is one of Unilateral / Bilateral — symmetric / Bilateral — asymmetric; grade is the optional 0–3 liver reference.

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
