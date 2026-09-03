# Deploying Snax Karaoke to Cloudflare

This app is already built on Cloudflare's own stack — `vinext` is Cloudflare's
Vite-based Next.js runtime and the database is D1. Moving off `chatgpt.site`
means pointing it at your own account, not rewriting it.

The only OpenAI-specific pieces have been removed on this branch:
`.openai/hosting.json` and `@openai/sites-vite-plugin`. Bindings now come from
`wrangler.jsonc`.

---

## Steps that need you (three of them)

**1 · Sign in to Cloudflare.** Your account is `jess@hedyverse.com`. I can't sign
in on your behalf — entering passwords is off limits for me. Once you're in, I
can drive the dashboard.

**2 · ~~Create the database.~~ Done.** D1 database `snax-karaoke` exists on the
Snax account and the schema is in it (`rooms`, `queue_items`, and the queue
index, including the `requests_open` and `ends_at` columns). Both ids are
already filled into `wrangler.jsonc`:

    account_id   b0f1589936f87faae686bf430775fa17
    database_id  198080d6-ea54-4ea4-97b6-cb9375064b98

**3 · Set the YouTube key as a secret.** Also yours to run — I don't handle key
values:

    npx wrangler secret put YOUTUBE_API_KEY

Paste the "Snax Bunny Karaoke – YouTube Search" key from Google Cloud
(project 528040454480) when it prompts. It never enters the repo.

---

## The rest

    npm install
    npx wrangler login                       # one-time, opens a browser
    npm run deploy

The schema is already applied, so there is no `d1 execute` step. If you ever
rebuild the database from scratch, the two files in `drizzle/` are the source
of truth.

That last command builds and deploys to Workers. You'll get a
`*.workers.dev` URL immediately.

### Domain: jessaceti.com

Two facts found today, both of which change the plan:

1. **`jessaceti.com` is registered but not attached to this site.** Squarespace →
   Settings → Domains lists only the built-in `jessaceti.squarespace.com`.
   `jessaceti.com` currently serves Squarespace's "We're under construction"
   parking page, so `jessaceti.com/snaxkaraoke` 404s today. Attaching it (Use a
   domain I own) also publishes the whole Jess Aceti portfolio at that address —
   worth deciding on purpose, not as a side effect.

2. **A Workers custom domain requires the DNS zone to be on Cloudflare.** From
   Cloudflare's docs: you need "an active Cloudflare zone", and "you cannot
   create a Custom Domain [...] on a zone you do not own." `jessaceti.com` is on
   Squarespace's nameservers today, so `karaoke.jessaceti.com` can't point at a
   Worker until the zone moves.

So the shape is:

| Address | Served by |
| --- | --- |
| `jessaceti.com/snaxkaraoke` | Squarespace — the front page |
| `karaoke.jessaceti.com` | The Worker — host, singer, TV, privacy, terms |

Steps:

1. Squarespace → Settings → Domains → **Use a domain I own** → attach
   `jessaceti.com` to this site. `/snaxkaraoke` starts working immediately.
2. Add `jessaceti.com` as a site in Cloudflare. It scans the existing records —
   check the four Squarespace A records (`198.185.159.144/145`,
   `198.49.23.144/145`) and the `www` CNAME to `ext-sq.squarespace.com` all came
   across, set **DNS only** (grey cloud) on them so Squarespace keeps serving
   traffic exactly as it does now.
3. Change the nameservers at the registrar to the two Cloudflare gives you.
   Propagation is usually under an hour. The site keeps serving throughout as
   long as step 2's records are right — check them twice.
4. Workers & Pages → the Worker → Settings → Domains & Routes → Add custom
   domain → `karaoke.jessaceti.com`.

**What we are not doing, and why:** serving the app from a path on the apex
(`jessaceti.com/app/...`) would mean proxying Squarespace through Cloudflare —
orange cloud on their records. Squarespace does not support running behind a
third-party CDN, and getting it wrong takes the portfolio down with the karaoke
app. A subdomain costs one DNS record and risks nothing.

### Deploy on every push (optional, better)

Workers & Pages → Create → Workers → Connect a repo → pick
`jaceti/snax-bunny-karaoke`. Build command `npm run build`, and add the D1
binding and the secret in the project's settings. After that, `git push`
deploys.

---

## What else changed on this branch

**The TV crash is fixed.** `?tv=…` white-screened the moment you pressed
"Enable TV playback":

    TypeError: K.current?.playVideo is not a function

The `onReady` handler was calling `playerRef.current`, but YouTube hasn't
finished populating that object at the point `onReady` fires — the ref is set
from the constructor's return value, which hasn't come back yet. It now uses
the ready player YouTube hands to the callback (`event.target`), and the
play/pause effect checks the player is actually ready before calling it.

---

## Still to reconcile

This branch is the repo as it stood at the last push, plus the fixes above. The
live `chatgpt.site` build is ahead of it in a few places: the consent checkbox
on the landing page, the event controls ("Song requests are open", "Save event
settings", "Start a fresh event"), the `/privacy` and `/terms` pages, and the
between-songs interstitial that replaced the old persistent lower-third bar.

That last one matters for the YouTube ToS reply — the interstitial is the fix
for "no overlays in front of the player". Deploying this branch as-is would
undo it. So either export the current source out of the ChatGPT sites project
first, or rebuild those four pieces here before going live.
