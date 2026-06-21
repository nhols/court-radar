# Court Radar

An at-a-glance view of live tennis court availability across South London.
It consolidates All Star Tennis, LTA and ClubSpark booking feeds, covering the
six All Star locations plus Clapham Common, Streatham Common, Streatham Vale,
Brockwell Park, Belair Park and Battersea Park.

Live at [court-radar-london.pages.dev](https://court-radar-london.pages.dev/).

## Run

Requires Node.js 20 or newer.

```bash
make run
```

Then open [http://localhost:3000](http://localhost:3000).

For local development with automatic server restarts:

```bash
make dev
```

## Deploy to Cloudflare Pages

The site is split into:

- `public/`: static HTML, CSS and browser JavaScript served by Cloudflare Pages.
- `functions/api/availability.js`: the small Pages Function behind
  `/api/availability`.
- `lib/availability.mjs`: shared availability code used by both the Pages
  Function and the local `server.js`.

In Cloudflare Pages, connect this repository and use:

- Framework preset: None
- Build command: leave blank (or use `exit 0`)
- Build output directory: `public`
- Root directory: repository root

The checked-in `wrangler.jsonc` contains the equivalent configuration. To test
the complete Pages deployment locally:

```bash
make pages
```

To deploy from the command line after authenticating Wrangler:

```bash
make deploy
```

## Test

```bash
make test
```

No packages or API keys are required.
