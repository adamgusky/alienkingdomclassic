# Alien Kingdom Classic

A tiny Kingdom-Classic-style side-scroller. You're a robot commander on Mars.
Mine scrap, fabricate bots, arm them, wall up, survive the night.

## Run

```
npm install
npm run dev
```

## Controls

- `A` / `D` (or arrows): move
- `E`: interact with whatever the prompt at the bottom says (hold at crystals to mine)
- `R`: reboot after the hab falls

## Loop

- Day: walk to a crystal and hold `E` to mine scrap, or let miner bots do it.
- Fabricator (right of the hab): 4 scrap makes an idle bot.
- Miner kit / Blaster kit (left of the hab): 2 / 3 scrap turns an idle bot into a miner or a guard.
- Wall stakes on both sides: 5 / 12 / 25 scrap to build and upgrade.
- Repair post (far right): 2 scrap patches the hab.
- Night: aliens come from both edges. Guards shoot, walls hold, civilians hide inside. Dead aliens drop scrap.
- The hab hits zero, colony's over. Waves grow every sol; big bruisers start on sol 4.

## Code

- `src/sprites.js`: every sprite is drawn in code (pixel rows or canvas calls). No image assets.
- `src/game.js`: world, entities, AI, day/night, HUD. Tuning constants at the top.
- `window.__g` is the live game object for poking at from the console.
