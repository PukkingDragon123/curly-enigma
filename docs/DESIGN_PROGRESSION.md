# Progression spine (wave 21)

The loop was dig → sell → dig, aimed at one number (a million gold). Every pick was bought for gold,
so the ore you dug didn't matter, only its price. Nothing stood between one layer and the next but
depth. This spine gives each layer a job, a tool to earn and a thing to beat.

## What was wrong (audit, played headless)

- **One goal, far away.** After the lessons the poster said "Save up 1,000,000 gold". No step
  between 220 g and a million.
- **Gold buys every tool.** Grubb sold every pick. Copper, iron and silver were all just money,
  so a layer's ore never mattered for what you could do next.
- **No gates.** Rock hardness only bit from the Magma Deep down. Ore had no tier. A rusty pick could
  dig the Crystal Grotto. No creature ever stood in the way.
- **Milestones were a ledger.** 26 achievement rows in a panel, all paying gold.
- **The forge fed nothing back.** Blades went to the assay office. The smith never made her own kit.

## The tier ladder

Minecraft's rule (the tool's tier decides whether a block drops) and Terraria's ladder (each ore
makes the pick that mines the next one) meet the forge. Picks are forged at home now. They aren't
sold.

| Tier | Pick (item id)           | Forged from                    | Frees ore                                | Digs hard rock in  |
|------|--------------------------|--------------------------------|------------------------------------------|--------------------|
| 1    | Copper (`pick_first`)    | 2 copper ingots (the lesson)   | coal, copper, tin, salt, quartz, amber…  | Rootsoil, Clayworks|
| 2    | Bronze (`pick_copper`)   | 2 bronze ingots, card 1 opens it | iron, lumite                           | –                  |
| 3    | Iron (`pick_iron`)       | 3 iron ingots + Clay Warden's heart | silver, amethyst, echo, gravium, bioxide | Crystal Grotto     |
| 4    | Steel (`pick_steel`)     | 3 steel ingots + Grotto Warden's heart | gold, ruby, magmaite, emerald, the Frost Vault's | Magma Deep, Frost Vault |
| 5–7  | Mithril, adamant, starmetal | 3 ingots of their metal     | voidstone, sunstone, starmetal, adamant  | the Core           |

- `ORES[].tier` (`data/ores.js`) is the pick tier that frees an ore. A softer pick clangs off with
  sparks. Ore you dig round stays fused in, and a toast names the pick it wants
  ("Too tough · Bronze Pickaxe"). Blasts don't free it either. The Index Book learns `ore_tier`.
- `HARD_ROCK_TIER` (`data/items.js`) is now `[0,0,0,3,4,4,5]`: Grotto granite needs iron.
- `pick_copper` is now the **Bronze Pickaxe**. The id stays the same so old saves keep it.

## The slate (milestone board)

Stardew's Community Center bundles: you hand in the items, a bundle fills and something opens.
Old Star's Miners' Board, the chalk slate on its crate by the lift, is the board now. It's drawn in
the world as chalk, with no text (`src/home/wayBoard.js`):

- Across the top are the four layers as chalk doodles (roots, a clay pot, a crystal, a flame) with
  an arrow and the two wardens' heads between them. Filled layers get a gold ring. The current one
  is underlined. Beaten wardens are crossed out.
- Below that is the current card. It has three slots, each holding the real item icon in a chalk
  box with "have/need" under it, plus a tick when full. An arrow points to what it pays: the pick
  it opens, or coin.
- E hands in whatever your bag has for the card. Words float off the slate as you hand in, and the
  slate bounces. When the bag has nothing for the card, E opens the old board panel.

| Card       | Slots                                   | Pays                 | Opens               |
|------------|-----------------------------------------|----------------------|---------------------|
| Rootsoil   | 5 copper ore, 2 tin ore, 4 coal         | 100 g, 1 skill point | the bronze pick pattern |
| Clayworks  | 4 iron ore, 2 lumite, 1 amber           | 250 g, 1 sp          | the Clay Warden quest |
| Grotto     | 4 silver ore, 3 quartz, 1 amethyst      | 700 g, 1 sp          | the Grotto Warden quest |
| Magma      | 3 gold ore, 2 magmaite, 1 ruby          | 2,500 g, 2 sp        | `way.done.magma` (a story hook) |

## The gates (wardens)

These follow Terraria's boss gates: one creature blocks the way and drops the key to the next
tier. Both are existing species, made tougher (`data/way.js WARDENS`, `src/deep/Wardens.js`):

- **Clay Warden**: a rubble golem half again as big as usual with 3.2× its health. It sleeps in a
  hall a short climb up and east of the shaft's lift stop 2 (about 53 m, the bottom of the
  Clayworks). It drops the **Clay Warden's Heart**, which the iron pick is forged round. Without it
  there's no iron pick, so no Grotto granite and no silver.
- **Grotto Warden**: a crystal golem with 1.8× health, off lift stop 3 (about 88 m). It drops the
  **Grotto Warden's Heart**, which the steel pick needs, and so the Magma Deep.
- The halls are carved by the world plan (`Generator.js plan.wardens`: a dome, a crawl to the stop,
  a lantern), so every save has them. A warden spawns once you're within 20 m, says its name when
  it wakes, shows on the radar, and stays beaten (`state.data.way.wardens`). The lift stop beside
  it is a safe place (creatures leave the mole alone there), like Stardew's elevator floors.

## The next goal (quest poster)

The poster always shows one concrete step. Lessons end by handing over a chain of `main` quests
(`data/quests.js WAY_QUESTS`), each one step on the poster with a count where there's a count:

`The Slate (0/11)` → `A Real Pick: smelt 2 bronze ingots, forge a bronze pickaxe` → `Clay Card (0/7)`
→ `The Clay Warden` → `Iron Round a Heart` → `Grotto Card` → `The Grotto Warden` →
`Steel Round a Heart` → `Magma Card`. The million stays as the long goal behind them.

The forge's order board shows a **Pick** card with the next rung's metal (`have/need`) once its
pattern is open (`forge/menus.js nextPick`).

## Reward cadence (first 30 minutes)

| Minute | What happens                                   | New thing                       |
|--------|------------------------------------------------|---------------------------------|
| 0–8    | Lessons: forge a pick, dig copper, smelt, forge a blade, cook | a pick, a blade, a meal |
| 8–14   | Rootsoil trip, fill card 1 at the slate        | 100 g, a skill point, the bronze pattern |
| 14–18  | Smelt bronze, forge the bronze pick            | a new pick, iron ore opens       |
| 18–26  | Clayworks: iron, lumite, amber; card 2          | 250 g, a skill point, the warden quest |
| 26–32  | Dig to 53 m, find the hall, beat the Clay Warden | the heart, a boss kill          |
| 32+    | Iron pick: the Grotto, silver, card 3, warden 2 | granite, silver, the next gate  |

Something new lands every 4–8 minutes. Card sizes are small on purpose: one trip each.

## Saves

New key `state.data.way = { cards, done, wardens }`. It defaults empty, and old saves get it from
`defaultData`. A save past the lessons without a `way_` quest starts `way_rootsoil` quietly
(`core/quests.js boot`). The pick and warden steps check what you already own, so a save that
already has an iron pick goes straight through them. Item ids are unchanged. The two hearts are
new items.

## Known gaps

- Gathering in `scripts/progression.mjs` is stood in for (items are added). Mining, the forge, the
  slate and the warden fight run through the game.
- The Grotto Warden's fight is the crystal golem's own (mine the crystal off its back). It's only
  checked as far as it spawning in its hall.
- Stardew's daily energy rhythm and "upgrades take a day" aren't in this spine. Stamina already
  limits a day, and the tool wait would fight the forge minigame.
