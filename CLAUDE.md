# Super Sanatan — the phone/desktop front-end of the content planner

- Static page (GitHub Pages, this public repo): `index.html` + `app.js`, no build step, no secrets. It reads and writes **Arcbha/Content-distribution** (private) through the GitHub API with the editor's fine-grained token.
- **The data contract lives in Content-distribution**, not here: `planner/README.md`. Change a file format there first, then the page here, in the same session (attach both repos).
- Writes: `planner/plans.json` (read at the branch head and rewritten in the same commit, so devices don't overwrite each other) and files under `planner/refs/`. Reads: `data/panchang_2026.json`. The festival boost rules and weekday deities in `app.js` mirror `core/strategy_engine.py` there.
- UI: clean SaaS style — Inter only, neutral greys, the logo's orange as the single accent. No decorative fonts.
- Test with Playwright against a mocked api.github.com (route interception) at 390 px and 1280 px wide before shipping; the editor uses it on a phone.
- Git: branch → PR → merge into `main` yourself (Pages serves `main`).
