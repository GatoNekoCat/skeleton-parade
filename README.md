# Skeleton Parade

A synthwave theme for Claude Code: a marching band of 3D wireframe skeletons parades behind your conversation, five abreast, under a setting sun.

The drum major leads in full dress. Behind him come a "doot" banner, baton-twirling majorettes, three ranks of flag twirlers who toss in unison and then ripple quick tosses down the line, flutes, clarinets, saxophones, trumpets, French horns, trombones, sousaphones and a drumline. Layers of hills drift past at different speeds, and every tool call plays a doot.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install skeleton-parade --marketplace GatoNekoCat/skeleton-parade
```

Answer `y` to add the marketplace, then pick a scope (user scope puts the theme in every session).

From a shell:

```
claude plugin install skeleton-parade --marketplace GatoNekoCat/skeleton-parade
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `GatoNekoCat/skeleton-parade`, then **Add plugin**.

The moving backdrop draws in the desktop and mobile apps. The colours, the spinner words and the `/doot` command work in the terminal too.

## Commands

| Command | What it does |
| --- | --- |
| `/doot` | A fanfare from the band |
| `/doot off` / `/doot on` | Mute or unmute the doot on tool calls (remembered) |
| `/doot detail <1-2>` | How much the scene draws: 2 is the standard, 1 is leaner (remembered) |
| `/doot restart` | Form the band up again if it has stopped |

## If the parade stops

This is a heavy scene for a backdrop, and the Claude app stops a backdrop it cannot keep up with. When that happens the band freezes in place; the colours, `/doot` and the doot sounds carry on.

What to do, in this order:

1. **Quit the app completely and open it again.** This is the fix that works. The app seems to wear down a little each time a moving backdrop is set up afresh (a new session, a restart of the band, a change of detail level), and after enough of that in one sitting no backdrop keeps running. Reopening the app clears it.
2. **Use the leaner level** if it stalls soon after a fresh start: `/doot detail 1`. Both levels keep the whole band; level 1 uses lighter skeletons and simpler legs.
3. **Do not hammer `/doot restart`** or flip between detail levels to wake it up. Each one sets the scene up again, which adds to the wear. Try it once; if the band does not move, reopen the app.

All of this comes from use on one Windows PC, so where the limit sits on your machine may differ. A long sitting with many sessions opened and closed is what brought it on there.

Detail level 2 is the standard and the ceiling. Richer levels existed during development and were removed because they stalled in everyday use.

After you update the theme, restart your sessions (or the app) to load the new version.

## What is in here

- `hooks/scene.ts` builds the whole scene as one SVG from a small 3D model: no images, no script, CSS animation only.
- `hooks/register.tsx` sets the look, draws the backdrop and answers `/doot`.
- `sounds/` holds the five doot notes.
- `hooks/make-colors.js` and `hooks/make-colors.d.ts` are the palette helper that ships with Claude Code's plugin-authoring kit, copied in unchanged as that kit instructs; they are not my work and the licence below does not cover them.

## Licence

MIT, see `LICENSE`. Made with Claude Code.
