# Spooky Wheel — September 28, 2026

Separate host control; the existing Wheel remains unchanged. `WheelState.theme`
is stored in the existing wheel JSON and defaults to classic for older clients.
Both modes share the existing atomic selection and queue handoff. No QR URLs,
credentials, YouTube search settings, daily reset, or Snax picks were changed.

All between-song name cards use the Halloween look and supplied music clips.
The spooky winner reveal also uses supplied music; classic retains Bumbersnax.
Music stops on host pause, wheel opening, card dismissal, or TV unmount. Browsers
may still require the existing one-time audio activation; no autoplay restrictions
are bypassed. Drumroll/cymbal/wow timing is unchanged.

## Assets

`public/spooky-music/manifest.json` maps each of the 27 source files supplied in
Desktop/SpookyWheel/Music to a 14-second mono MP3 excerpt starting at 8 seconds,
normalized to -20 LUFS. Only the current and next clip are decoded. The shuffled
bag uses every track before repeating and avoids an adjacent repeat at rollover.
Source files were not modified. Rebuild with `scripts/prepare-spooky-music.mjs`.

Creepster is self-hosted with its OFL license in `public/spooky-font-license.txt`.
Skeleton and bat UI icons are SVG. The mascot is saved in
`public/snax-spooky-bunny.png`, generated with the built-in image tool from
Desktop/SpookyWheel/LookInspo.jpg. Prompt:

> Extract/recreate ONLY the stitched SNAX bunny from the upper right of the
> reference poster as a standalone illustration. Preserve long floppy ears,
> dark oval eyes, sewn seam marks, smiling muzzle, and SNAX shirt. Waist-up,
> arms open, centered, ears and hands in frame. Vintage Halloween ink drawing,
> warm ivory/bone and charcoal, irregular hand-drawn outlines and sparse
> hatching. Transparent background; no poster, titles, skeletons, coffin,
> border or extra text.

## Verification

`node --test tests/*.test.mjs`, `npx tsc --noEmit`, and `npm run build`.
`node scripts/serve-spooky-preview.mjs` provides a local-only visual/audio
harness on port 4191; it is not a production route and never mutates a room.
The existing wheel-view hook lint errors predate this feature.
