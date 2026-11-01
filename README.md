# Court Radar

Live tennis court availability across London in one grid: every court, every
hour, for the venues you pick. Covers the 6 All Star Tennis parks (Mindbody)
and 349 LTA court-booking venues (ClubSpark, read through LTA's feed).

Live: [court-radar-london.pages.dev](https://court-radar-london.pages.dev/).
Installable as a PWA.

For how the data sources behave, how the venue lists were built, and what was
tried and ruled out, read [AGENTS.md](AGENTS.md).

## Run

Node.js 20+. No packages or API keys.

```bash
make run    # http://localhost:3000
make dev    # same, restarting on changes
make test
```

## Deploy

The Cloudflare Pages project `court-radar-london` is a direct-upload project:
the GitHub repo is **not** connected, so pushing does not deploy. Deploy from a
logged-in machine (`npx wrangler login` once):

```bash
make deploy                                            # live site
npx wrangler pages deploy --branch some-test-name      # preview at some-test-name.court-radar-london.pages.dev
```

## Refresh the LTA venue list

```bash
node scripts/find-lta-venues.mjs    # ~20 minutes; rewrites public/shared/lta-venues.js
```

Existing venue codes are kept, so saved choices and shared links keep working.
