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
| `/doot detail <1-4>` | How much the scene draws, 1 leanest to 4 richest (remembered) |
| `/doot restart` | Form the band up again if it has stopped |

## If the parade stops

This is a heavy scene for a backdrop, and the app stops a scene it cannot keep up with.

- Try a lower detail level: `/doot detail 2` or `/doot detail 1`. Lower levels use simpler skeletons and legs on the far files; every level keeps the whole band.
- If it stalls after a long stretch of use, or `/doot restart` does not bring it back, quit and reopen the app.

## What is in here

- `hooks/scene.ts` builds the whole scene as one SVG from a small 3D model: no images, no script, CSS animation only.
- `hooks/register.tsx` sets the look, draws the backdrop and answers `/doot`.
- `sounds/` holds the five doot notes.
- `hooks/make-colors.js` and `hooks/make-colors.d.ts` are the palette helper that ships with Claude Code's plugin-authoring kit, copied in unchanged as that kit instructs; they are not my work and the licence below does not cover them.

## Licence

MIT, see `LICENSE`. Made with Claude Code.
