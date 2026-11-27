# Super Sanatan

The content planner for Super Sanatan: a 4-day calendar in IST with panchang observances, festival boosts and weekday deities, plus plans with reference art, Midjourney prompts and briefs for Claude Code.

- Static page on GitHub Pages: `index.html` + `app.js`, no build step, no secrets.
- It talks only to `api.github.com`, using a fine-grained token you paste once (Contents: Read and write on **Arcbha/Content-distribution** only). The token is kept in that browser's `localStorage` and sent only as the `Authorization` header to GitHub. **Forget token** removes it.
- Everything is stored in Content-distribution: plans in `planner/plans.json`, reference files in `planner/refs/`. The format is in `planner/README.md` there.
- `noindex` and `no-referrer` are set.

## Install on a phone

- **Android (Chrome):** open the page → menu ⋮ → *Add to Home screen* / *Install*. Super Sanatan then appears in every app's Share menu: Instagram → Share → Super Sanatan saves the link to Bookmarks.
- **iPhone (Safari):** open the page → Share → *Add to Home Screen*. iOS doesn't let web pages join the Share menu, so a Shortcut does it once: Shortcuts → **+** → *Receive* **URLs** *from* **Share Sheet** → add **URL Encode** (Shortcut Input) → add **Open URLs** with `https://arcbha.github.io/super-sanatan-app/?url=` followed by the *URL Encoded Text* variable → name it **Send to Super Sanatan**.
- Shared links land in **Bookmarks**, ready to save with one tap. The page reads `?url=`, `?text=` or `?title=`.

## Using it

- **+ Add plan** on any day opens the side panel: title, type, deity, status, date, platforms, notes, references and Midjourney.
- **References:** upload, drop or paste images (resized to 2000 px), MP4/MOV/WebM or PDF, and add written references. Files upload to the repo when you save.
- **Status badge** on a plan moves it Idea → Making → Ready → Posted.
- **Write with Claude** (editor → Midjourney prompt) saves the plan and asks Claude to write the prompt from its references. A GitHub Action in Content-distribution (`planner-ai-prompt.yml`, running Claude Code on your Claude Pro plan via the `claude setup-token` token saved as a secret there — no API credits) does the work and writes the prompt back, usually within a minute; the plan card shows *Claude is writing…* meanwhile. If the plan already had a prompt, Claude's version appears as a suggestion with **Use this prompt**.
- **Copy MJ prompt / Imagine ↗ / Open generation ↗** for Midjourney (it has no public API, so prompts are copied across).
- **Copy brief for Claude** copies the plan with its reference file paths, to paste into Claude Code in Content-distribution.

## Bookmarks

A plain shelf for artform videos and posts you want to remember (top bar → **Bookmarks**, or `#bookmarks`). Not references: nothing here is sent to Claude.

- Paste a link (or tap **Paste**), and/or add a screenshot: **Screenshot**, drag it in, or paste it anywhere on the page. Add a note if you like, then **Save** (Enter works too).
- Tracking bits are removed from links (`igsh`, `utm_…`, `si`, …); a link already saved is refused with the date it was saved.
- Cards show the screenshot, or the YouTube thumbnail, or the site name; **Open ↗**, **Copy link**, **Delete** (tap twice).
- Stored in Content-distribution as `planner/bookmarks.json` + screenshots in `planner/bookmarks/` (format in `planner/README.md`).

## If it won't connect

When connecting (or opening) fails, the app checks GitHub step by step and shows which step broke, with the fix: token not accepted (mistyped, expired or revoked), token can't see Content-distribution, token can read but not write (needs Contents: Read and write), branch not found, or no network. **Reconnect with a new token** appears on the banner if a saved token stops working. If the browser won't keep the token (private/incognito window or an in-app browser), the setup screen says so.

## Artwork

A static library of artwork you like (top bar → **Artwork**, or `#artwork`). Choose, paste or drop one or more images, optionally set the deity, a source link and a note, then **Save artwork**. **Get MJ prompt** on a card opens Create with that piece picked. Stored as `planner/artworks.json` + `planner/artworks/` in Content-distribution.

## Create (Midjourney prompts)

Images are made in **Midjourney**; Claude only writes the prompt (top bar → **Create**, or `#create`):

1. **Reference work:** choose, paste or drop the images that inspired you (up to 6), each with an optional note on what to take from it, and/or type written inspiration. You can also add pieces from your saved Artwork.
2. Pick the deity and date if you like, describe what you want, choose **4:5**, **1:1**, **9:16** or **16:9**, and whether to leave space for a verse.
3. **Get Midjourney prompt.** Content-distribution's `planner-create.yml` Action runs Claude Code on your Claude Pro plan: Claude Opus studies the reference work and writes one prompt plus two alternatives (close and bolder), usually within a minute.

Each card has **Copy** and **Copy & open Midjourney ↗** for every prompt, a note on what Claude carried over, **Revise** (tell Claude what Midjourney got wrong; the old prompt moves to *Earlier prompts*) and **Delete**. Stored as `planner/creations.json` + the uploaded reference work in `planner/creations/<id>/refs/`.

## Quotes

Quote-based inspiration you want to keep (top bar → **Quotes**, or `#quotes`): the quote in any script, plus optional translation, source, deity, tags, link, note and a screenshot (pick one or paste it on the page). Search across everything, tap a tag to filter, **Copy** copies quote + translation + source, **Mark used** once posted (and **Hide used**). Never sent to Claude. Stored as `planner/quotes.json` + `planner/quotes/`.
