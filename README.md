# Super Sanatan

The content planner for Super Sanatan: a 4-day calendar in IST with panchang observances, festival boosts and weekday deities, plus plans with reference art, Midjourney prompts and briefs for Claude Code.

- Static page on GitHub Pages: `index.html` + `app.js`, no build step, no secrets.
- It talks only to `api.github.com`, using a fine-grained token you paste once (Contents: Read and write on **Arcbha/Content-distribution** only). The token is kept in that browser's `localStorage` and sent only as the `Authorization` header to GitHub. **Forget token** removes it.
- Everything is stored in Content-distribution: plans in `planner/plans.json`, reference files in `planner/refs/`. The format is in `planner/README.md` there.
- `noindex` and `no-referrer` are set.

## Install on a phone

- **Android (Chrome):** open the page → menu ⋮ → *Add to Home screen* / *Install*. Super Sanatan then appears in every app's Share menu: Instagram → Share → Super Sanatan opens a new plan with the link as a reference.
- **iPhone (Safari):** open the page → Share → *Add to Home Screen*. iOS doesn't let web pages join the Share menu, so a Shortcut does it once: Shortcuts → **+** → *Receive* **URLs** *from* **Share Sheet** → add **URL Encode** (Shortcut Input) → add **Open URLs** with `https://arcbha.github.io/super-sanatan-app/?url=` followed by the *URL Encoded Text* variable → name it **Send to Super Sanatan**.
- The page reads `?url=`, `?text=` or `?title=`.

## Using it

- **+ Add plan** on any day opens the side panel: title, type, deity, status, date, platforms, notes, references and Midjourney.
- **References:** upload, drop or paste images (resized to 2000 px), MP4/MOV/WebM or PDF, and add written references. Files upload to the repo when you save.
- **Status badge** on a plan moves it Idea → Making → Ready → Posted.
- **Copy MJ prompt / Imagine ↗ / Open generation ↗** for Midjourney (it has no public API, so prompts are copied across).
- **Copy brief for Claude** copies the plan with its reference file paths, to paste into Claude Code in Content-distribution.
