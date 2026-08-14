# eBay Sale Watch — free always-on setup

This runs a small check of your eBay mailbox every ~15 minutes **in GitHub's free cloud**
(not on your Mac), drafts the import-duty note for each *paid* sale, and shows it on a
private phone page — encrypted, so only you can read it with your passphrase.

You need to do this **once**. It takes about 15 minutes of clicking. No coding.

---

## What you'll set

Three secrets (kept hidden by GitHub), plus turning on the page:

| Secret name | Value |
|---|---|
| `IMAP_USER` | `ebay@inmateto.com` |
| `IMAP_PASS` | your mailbox password |
| `APP_PASSPHRASE` | any passphrase you choose — you'll type this on your phone to unlock the sales |

Everything else (mail server, folder, etc.) is already in `config.json`.

---

## Steps

**1. Make a free GitHub account** (skip if you have one): https://github.com/signup

**2. Create a new repository**
- Top-right **+** → **New repository**
- Name: `ebay-sale-watch`  ·  visibility: **Public** *(the data is encrypted, so this is safe and keeps it free)*
- Click **Create repository**

**3. Upload the project files**
- On the new repo page click **“uploading an existing file”**
- Drag in **all the files from this folder** (the `src`, `docs`, `.github` folders and the loose files) — but **not** `node_modules` or `.env`
- Click **Commit changes**

**4. Add your 3 secrets**
- Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
- Add `IMAP_USER`, then `IMAP_PASS`, then `APP_PASSPHRASE` (one at a time)

**5. Turn on the phone page (GitHub Pages)**
- **Settings** → **Pages**
- Source: **Deploy from a branch**  ·  Branch: **main**  ·  Folder: **/docs** → **Save**
- After a minute it shows your page address: `https://YOUR-NAME.github.io/ebay-sale-watch/`

**6. Run it once now**
- **Actions** tab → **eBay Sale Watch** → **Run workflow** → **Run workflow**
- Wait ~1 minute for the green tick

**7. Open it on your phone**
- Go to your Pages address, enter your `APP_PASSPHRASE`, and your paid sales appear.
- Chrome → **⋮ → Add to Home screen** to keep it as an app.

From now on it refreshes itself every ~15 minutes, even with your Mac off.

---

## Local test (optional, on the Mac)
```
npm install
node --env-file=.env src/watch.js --dry   # shows what it finds, writes nothing
```
`.env` holds your secrets for local runs and is never uploaded.
