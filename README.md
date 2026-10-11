# Interactive Urn

A browser toy in the spirit of Interactive Buddy, starring the Soul Urn from Deadlock.
Drag him around, throw him, crack him open with weapons, collect the souls that leak out
and spend them in the shop.

## Play

Open `index.html`, or serve the folder with any static web server. It is a plain HTML page
with no build step, so it also runs as-is on GitHub Pages.

## Controls

- Drag with the Hand to carry and throw him. Right-click drag grabs him with any weapon out.
- Keys 1-9 and 0 pick a weapon, B opens the shop, Esc closes it.
- Sweep the cursor (or a finger) over loose souls and buff tomes to pick them up.
- Hold, then release, Melee for a heavy melee. A heavy melee claims a Soul Bag.
- Smash golden statues for a chance at a permanent buff.

## Tools

- `node tools/fetch-assets.js` downloads the voice lines, icons, music and backgrounds.
- `node tools/mix-voice.js` builds the sentence-mixed voice lines (needs ffmpeg on PATH).
- `blender --background --python tools/render-sprite.py -- <model.glb> <out.png>` renders a game model
  to a sprite (the Soul Bag, hook arm, bomb and guns were made this way).

## Credits

Unofficial fan project, not affiliated with or endorsed by Valve. Deadlock and all of its
art, audio and music belong to Valve Corporation.
