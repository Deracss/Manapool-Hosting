# ManaPool Digital – Rules & Data Decisions

Running log of clarifications from Gustavo, used to build the digital version. The player-facing summary of every rule and card change is in `claude/rules-and-card-changes.md`.

## Terminology
- **Mana Orb:** a card from hand charged face-down into the mana pool (card back = a glowing mana orb). Not a token. The card stays under the Orb; some cards can interact with it.
- **Mana Rock / Corrupted Mana Rock:** tokens created by card effects.

## Rules clarifications
- **Main phase** allows Spell-speed AND Incantation-speed cards.
- **Mana cards:** any card can be played as itself or charged face-down as 1 mana (a Mana Orb).
- **Charging:** optional; once per turn the player may convert one card from hand into a Mana Orb.
- **Charging is an event:** "On ManaCharge" abilities trigger whenever you charge, and "ON CHARGE THIS CARD" abilities trigger on the charged card itself. A card in the mana pool only uses its own ON CHARGE THIS CARD ability; its other abilities need it on the field.
- **Paying mana (digital):** mana is emptied/consumed to pay (physical game taps it). All Mana Orbs refill at the beginning of Upkeep.
- **Payment choice:** the player pays manually or automatically. Automatic order: floating mana → Mana Orbs → Mana Rocks.
- **Corrupted Mana (confirmed):** only pays for creatures played from your discard pile, and such a creature's whole cost must be Corrupted Mana. (Graveyard's 3rd-death play is the exception: any card, any mix of mana.)
- **Mana Rocks / Corrupted Mana:** stay in the mana pool until consumed.
- **FILL 1 mana:** refill 1 used Mana Orb (not a token).
- **Charging by effects:** a charged Orb enters filled unless the card says otherwise.
- **DESTROY 1 mana:** send 1 Mana Orb card to its owner's discard pile.
- **Charitable Demon:** the defending player does not refill 1 Mana Orb during their next Upkeep.
- **Stack and priority:** work like MTG. Only the top item resolves when everyone passes; then the active player gets priority again. Response windows are like MTG's steps (Upkeep, Draw, Main, combat steps, End). Triggered abilities use the stack and can be responded to; destroying the source doesn't stop a trigger already on the stack.
- **Activated abilities:** Incantation speed unless the card says otherwise.
- **Boosting:** you boost a creature: the attacker, or the defending creature (blocker or FACEOFF target). An unblocked attack has no defending creature, so the defender can't boost.
- **Blocking taps the blocker.** Tapped creatures cannot block.
- **FACEOFF attack on a creature:** treated like a block: that creature can be boosted; if beaten, it dies and its controller loses 1 life.
- **Unblocked attack:** defender loses 1 life (attack vs 0 defense), unless the attacker's effects say otherwise (e.g., DOUBLE STRIKE → 2).
- **Attack fizzles** if the attacker or the defending creature (blocker / FACEOFF target) leaves the field; it doesn't retarget, even if the creature returns.
- **Life:** life is a number; the old "life pile" is gone. A player hit by an attack draws 1 card (CRITICAL prevents it).
- **Combat:** the attacking creature never dies from a clash; only the blocker can die.
- **INDESTRUCTIBLE blocker:** survives, but life loss still goes through if the attack is higher.
- **Effect damage to creatures** (Fireball, etc.): reduces defense; the creature dies at 0 defense or less. Damage wears off at end of turn.
- **"Gains +X/X":** permanent, not a counter.
- **First turn:** the first player draws on turn 1.
- **Field required (Oct 20, 2026):** every player must play with a Field. No "No field" option in the app; a bot deck without a suggested Field gets a random playable one. Druid Grove precon removed (5 precons).
- **Elimination:** an eliminated player's permanents and stack items leave the game.
- **Copies:** a copy of a permanent is a token on the field. A copy of a Spell or Incantation goes on the stack (it isn't cast, so it costs nothing and its controller picks new targets), then disappears instead of going to the discard pile.
- **FLYING:** still under consideration; do NOT implement the keyword or cards that rely on it.
- **BREAKTHROUGH:** removed from the game; ignore cards with it.
- **TRAMPLE, FLASH:** work as in MTG.
- **CRITICAL BOOST:** when this creature boosts another creature's attack, that attack gains CRITICAL.
- **ILLUSION:** a creature type conjured by spells (e.g., Shade creates a 3/1 Illusion attacking target player).
- **Souls:** every contract you make with a player (via OFFER being accepted, COMMAND, or GIFT) gives you 1 Soul. Some cards grant Souls in other ways. (GIFT currently appears on no card; rule kept for future cards.)
- **God tab tribes:** every card in the God tab is a God, except DEMIGOD cards, which are Demigods until ascension triggers; then they become Gods.
- **FEED:** ignore for now.
- **Keywords:** every ALL-CAPS word on a card is a keyword with a defined meaning. The Keyword columns in tribe tabs show keywords that tribe tends to have (tab-level notes, not card text).
- **"+1/1"** means +1/+1.

## Goblin rulings
- **Goblin Artillery:** +2/0 for each of your Goblins that received a boost this turn (Artillery itself counts); updates the moment another Goblin is boosted for the first time.
- **Goblin Assassin:** doubles its total attack (after boosts) when it clashes as the attacker.
- **Goblin berserker:** gains DOUBLE STRIKE if at least one Goblin boosts it, until the end of that battle, even when unblocked (no clash needed).
- **Goblin Wizard:** the extra point applies to attack boosts only.
- **Urgal the Whisperer:** Urgal can give a Goblin at most 3 counters; counters from other cards don't count toward that.
- **Grukza:** +1 token per creation (Whelpcaller makes 3, not 4).
- **Goblin Planner:** its mana ability is a trigger on the stack; it can be responded to, and still resolves if Planner is destroyed in response.
- **Not yet confirmed:** Groot (destroying another creature is mandatory if you control one) and Goblin #1 (a boost by any player's creature counts).

## Druid and charging rulings (confirmed)
- **"On ManaCharge"** counts only your own charges, including charges made by card effects (Mana Ramp, Cosmic Channeling, Druids #3).
- **Charges made by effects** don't use up the turn's charge.
- **Druids #1:** you may pay the charged card's cost to create a copy of it. Any card can be copied (see Copies above).
- **Druids #3 / Mana Portal / Demon Pit swaps:** the Orb and the hand card trade places; the new Orb arrives filled.
- **El Crow Druid:** two abilities: "Pay 2: untap this card" and "Destroy one of your Mana Orbs: +2/+2". The +2/+2 is permanent but is not a counter.
- **Druids #4:** "Mana Cards in your Mana Pool" = your Mana Orbs (filled or used), not Mana Rocks.
- **Cloudwhisper, Anthem #1:** each lets you charge one more card per turn. (Vendor Street was removed Oct 22, 2026: same as Anthem #1.)
- **Mana Droid:** the draw is optional ("may").

## Artifact and Construct rulings (confirmed)
- **RECONFIGURE:** once per round (from the start of your turn until your next turn), you may untap the permanent whenever you have priority. It doesn't use the stack.
- **Equip:** spell speed only (your own Main phase, nothing on the stack). Pay the equip cost again to move it to another creature. If the equipped creature leaves the field, the equipment stays on the field unattached. Equip goes on a creature you control.
- **Constructs are Artifacts:** every Construct and Construct token is both a Creature and an Artifact.
- **Clockwork Servitor (digital change, awaiting OK):** it untaps *another* Artifact, because untapping itself (now that it is an Artifact) would loop forever.
- **Combat Mk II:** triggers on any untap except the Untap step (e.g. RECONFIGURE).
- **Mana Portal:** its swap is once per round.

## Rulings 4–24 (Oct 19, 2026)
- **OFFER:** each opponent accepts or refuses; acceptors get the gift; each acceptance is a contract (+1 Soul). "Per contract" counts acceptances.
- **FADE OUT:** leaves the game until the End Phase, then returns. Counters stay.
- **Counter card:** a Spell or Incantation that negates.
- **Anthropomorph:** the creature becomes a 1/1 Human with no abilities.
- **Vampire Feeder:** only your Vampires. **Vampire Butler:** another Vampire.
- **Herald:** gains 1 life (the old "add top card to life" from the life-pile era).
- **Isolde:** copies the creature she clashes with, as a Vampire. Cost reduced to 5.
- **City Night:** +4 attack above the printed value.
- **Atredes:** the 9 total includes boosts.
- **Krr'ask (17: "No"):** read as the infected creature itself becoming your 1/1 Zombie; awaiting confirmation.
- **Deathly Reconjurer:** the returned Zombie makes a separate attack.
- **Demon #1:** COMMAND = the damaged player creates a Mana Rock and you make a contract. Stats now 3/3.
- **Demon Pit:** Orb swap, positions and roles exchange.
- **Evil Spirit:** finds Spells and Incantations with OFFER.
- **Blood Vial:** no per-turn cap; triggers on every 2nd own Tap ability your creatures use in a turn.
- **Mana Portal / Druids #3:** the new Orb enters filled.
- **Graveyard (Zombie Field, from the extra spreadsheet tab):** 1st creature of yours destroyed or sacrificed each turn draws, 2nd adds 1 mana, 3rd lets you play 1 card from your discard pile until the End Phase.

## Digital app decisions
- **Inspect:** hold Alt while hovering a card (or your own Mana Orb) to see it large with full text, current state and keyword explanations.
- **Mana Orbs:** you can see the cards under your own Orbs; opponents' Orbs stay face-down.
- **Discard piles:** every player's discard pile is public and viewable from a button. Cards you can play from it get a Play button.
- **GUIDE screen:** shows the top cards; each can be kept on top or sent to the bottom, in any order.
- **OFFER prompt:** an OFFER to you shows Accept / Refuse. Souls show next to each player once they have any.
- **Field abilities** (Demon Field) are buttons next to your Field's name.
- **Table layout (0.1.8, chosen from mockups Oct 20, 2026):** slim opponent strips (click one, or its expand button, to see that field large); your field with a full-width mana bar underneath (mana bar option 1: every Orb, then Rock and Corrupted symbols with counts); hand shown as a fan; stack option 1, a docked panel with Hide; log with icons, filters and hoverable card names.
- **Field sorting:** permanents sorted by type; in the expanded view creatures go on top, artifacts bottom left, anthems bottom right.
- **Targeting:** anything that targets opens a popup with the valid targets grouped by player, even when there is only one.
- **Card states:** tapped cards turn sideways; stats above printed are green, below are red; counters, damage, equipment, INFECTED and summoning sickness show as corner badges; keywords from other cards are green italic; FADED OUT cards leave a dashed ghost.
- **Combat and targeting:** an arrow from the attacker to its target with an ATK vs DEF label; legal targets glow with a Target tag while everything else dims; hovering a hand card shows which mana it would spend.
- **Animations:** every played card flies to the center with "X plays" and its target (1.4 s for bots, 0.8 s for you; bots wait for it); new cards pop in; attackers lunge; destroyed cards crack and fade; damage, life, counters and Souls float as numbers; spent Orbs flash.
- **Auto-pass (Game menu):** skip when you can't do anything (on); stop when attacked, before damage (on); stop when a card targets your things (on); stop at every opponent's End Phase (off); skip your own empty Upkeep and Draw (on). "Stop at the next chance" overrides it once.
- **Response prompt (0.1.10):** says exactly what's about to happen ("If nobody responds"), shows the targets, dims cards you can't use and highlights the ones you can, and says "You have nothing to respond with." when true. "Skip all responses" toggle under the main button.
- **0.1.12 (chosen from mockups Oct 20, 2026):**
  - **Turn banner** every turn; click to skip.
  - **Danger:** at 2 life or less your life badge pulses and the table edges glow red. No "opponent one hit from out" note.
  - **Milestones** for everyone: Souls 5/10/15 and Graveyard unlocks show a short card; when one gives you something to do, that place glows (e.g. the Discard button).
  - **Elimination:** "X IS OUT" band naming who finished them; their strip greys out with "OUT · turn N".
  - **Victory / defeat screen:** turns, life left, players you finished, cards played, final blow, order out; Main menu / Play again (Watch the rest on defeat).
  - **Spotlight:** cards about to be hit, possible blockers and boosters get outcome tags ("Would be destroyed", "Survives", "+1 · not enough yet").
  - **Drag to play:** drag a hand card onto your field to play, onto the mana bar to charge, onto a target for targeted spells; drag your creature onto an opponent's strip or creature to attack. Clicking still works; Esc or right-click cancels.
- **0.1.13 (chosen from mockups Oct 20, 2026):**
  - **Hand sorting (0.1.18):** a one-time "Sort hand" button (cyan, top-left of your hand) sorts the cards you hold now: cost low → high, then Creature · Artifact · Anthem · Field · Spell · Incantation, then name. Cards drawn later go to the right; the button reads "Hand sorted" while the hand is in that order. Not a setting.
  - **Field scenes (0.1.15, from the round-4 mockups):** each player's area shows their Field's painted scene: Forest (pines, light shafts, fireflies), City Night (moon, gothic skyline, red mist), Neural Nexus (hex grid, circuit traces), Demon Field (rune circle, lava cracks, embers), Celestial Citadel (stars, gold rays, marble columns, clouds), Graveyard (moon, dead tree, tombstones, iron fence, fog). Scenery stays at the edges and bottom; opponent areas are dimmed slightly. Field names show as themed name plates, the mana bar takes the Field's tint, the expanded view uses the scene too.
  - **Turn banner** uses the active player's Field colors and a small Field emblem on both sides (default cyan / gold without one).
  - **Ping** (groundwork for online play): middle-click = Look; hold the middle button, or use the Ping button in the top bar, for Look / Careful / Attack this / Help?. A ring in that color pulses on the target for 4 s and follows it; one log line. Limit 3 pings per 5 s. A mute option comes with online play.
  - **Rematch:** Same decks (default) · Swap decks (every deck moves one seat left) · New random decks (random precons, no repeats). Loser goes first; if you won, a random opponent does. Main menu leads to the normal deck choice.
- **0.1.17 animations + sounds (round-5 storyboard, all 14):** draw (yours flips face up into its slot; opponents' card backs bump their Hand count), discard (flies to the Discard button), destroyed (cracks, shards fly to the discard pile; tokens just shatter), charged (flips face down, shrinks into the new Orb), negated (red slash + NEGATED stamp, the card splits), spell resolves (sparks fly to each target, which flashes), token (ring of light), tap/untap (smooth turn; Upkeep untap wave), life lost (badge shakes; soft muted thump, 0.1.18) / gained (green pulse), a player going out (one low bell toll, 0.1.18), counters (+1/+1 pip drops on the card), back to hand (flies home), FADE OUT (dissolves into mist, reforms at the End Phase), Mana Orb destroyed (orb cracks, card falls to the discard pile), contract (soul wisp to the gainer's Souls). None pause the game; several at once stagger 80 ms. Each has a short synthesized sound (no audio files). Game menu: Sound effects on/off + volume (default on, 50%).
- **Card popups stay on screen (0.1.19):** a field card's action popup opens above the card when it would run off the bottom of the window (it had hidden Krr'ask's ability below three Attack options).
- **Blank tokens say what they are (0.1.19):** a token with no rules text shows "<Tribe> token." (e.g. "Zombie token.").
- **Online play (0.2.0, Oct 21, 2026):** a game server on Render's free plan, deployed from GitHub with `render.yaml` (every push to main redeploys). The app has the address built in (`https://manapool-server.onrender.com`; changeable under Play online → Server address). Play online → choose name, deck, Field → **Host** wakes the server (up to ~1 min on the free plan) and creates a room with a 4-letter code; friends **Join** with the code; the host starts; open seats are bots. The server runs the rules engine and sends each player only what they may see (other hands, all decks and opponents' Orbs are face down). Pings are shared. A dropped player has 45 s to reconnect before a bot plays for them. After a game the host can play again in the same room.
- **Deck builder (0.2.2, all 17 items from the round-6 mockups):** filters as chip rows above the grid (type, tribe, cost, show all / not in deck / in deck, working only, clear); search matches name, text, type, tribe and keywords; sort (cost, name, type, card number) and a card-size slider (remembered). Cards in the deck get a gold check and an IN DECK ribbon. Hover: the card lifts, tilts toward the mouse with a sheen and a "Click to add / remove" hint (soft paper tick). Add: the card flies into its row, which flashes green and shows ADDED until you save (two-note snap). Remove: the row slides out (soft swish). Deck panel: the Field's scene behind an editable name, a Field picker (every deck saves a Field), a ring to 60 (fills gold, pulses, three-note fanfare and the Play button lights when complete), mana curve, average cost, type bar, list grouped by type with a card preview on hover. Sample hand (7, Draw 1 more, Draw again; deal sounds), share codes (MP1-…) and Import, Undo, Duplicate, Delete with confirmation, unsaved-changes prompt, right-click for card details.
- **0.3.0 (round-7 mockups, Oct 21, 2026):** Field scenes move slowly (fireflies, flickering windows, circuit pulses, embers, twinkling stars, drifting fog), paused while you target or answer a prompt. Field music: a quiet generated loop per Field (your own Field), "Field music" slider in the Game menu (default 30%). Faint tribe emblems in the middle of every card (type symbols for Spells, Incantations, Artifacts, Anthems). Victory: a burst in your Field's colors; defeat: the table drains to grey; then the end screen. Bigger card preview after 0.25 s of hovering a hand or field card. Identical tokens in the same state stack as one card "×N" (summoning-sick only with summoning-sick; anything in combat, targeted or being chosen stays separate); click to spread, Collapse to fold. Concede in the Game menu (engine action, works any time). Online (protocol 2, older apps are asked to update): six quick emotes (Good game, Nice!, Oops, Thinking…, Well played, Hello!) as a bubble over your area, one every 3 s, can be hidden; lobby: change your deck and Field at your seat (also between games), the host picks each bot's deck, guests press I'm ready, Start lights up when everyone is ready; after a game everyone goes Back to the lobby. When every person at the table is out, the server lets the bots finish quickly.
- **0.3.2–0.3.3 (round-8 mockups):** hovering a card on the table plays the deck builder's soft paper tick. Playing a card has a sound by type (Creature thump, Spell whoosh, Incantation crackle, Artifact clank, Anthem horn). Clash impact: a starburst on the defender with a thud and a metallic ring; when the defender is destroyed the table shakes briefly. Mana flow: the Orbs you spend send streams of light into the card or ability. The Field reacts (scene flares 1.5 s; sound for your own Field only): Demon Field when a Demon enters, Forest when a Goblin attacks, Graveyard when a Zombie dies, City Night when a Vampire gains counters, Neural Nexus when an Artifact/Construct is tapped, Celestial Citadel when a God enters. Start: a coin spins and shows who goes first (click to skip), then the opening hand is dealt card by card. Damage cracks grow with the share of defense lost and heal with the damage.
- **0.3.4 (Oct 21, 2026):** Token stacks stay together while you block or boost: click a stack to pick one token, chosen tokens form their own gold-ringed stack (click it to unpick one). During a boost choice, summoning sickness doesn't split stacks. Stacks group by what matters in play (effective ATK/DEF, keywords, tapped, counters, damage); summoning sickness only splits creatures without HASTE. Spread-out stacks fold back at each new turn, so tokens whose sickness ended rejoin their group.
- **0.3.5 (Oct 21, 2026):** Plain counters (no stat change, e.g. Machinist's Reservoir) show as "2 counters", not "+0/+0 ×2". Summoning sickness texts say the creature can block and boost (the engine already allowed both; now covered by a test). VIGILANCE: the attacker stays untapped, but each creature still attacks only once per turn.
- **0.3.6 (Oct 22, 2026):** Balance pass (costs, types, new wordings) and 22 newly implemented cards; see rules-and-card-changes.md. Every point of life lost draws a card unless CRITICAL or the card says otherwise. Confused Knight shows a "Switched" badge; Tombstone-marked creatures light up the discard pile button.
- **0.3.7 (Oct 22, 2026):** The last 16 Spells, Incantations and Anthems scripted (Dragonheart Incubation waits for BOND). Audit: every scripted card played in a scripted board check, 200 bot games with the new cards, and UI checks of the new choices (Arcane Spell, Goblin Soup, Echoes of the Past, Shade, Tombstone). OFFERs with a cost show "Accept, pay N". FADE OUT/Blink during the End Phase now return before the turn ends.
- **0.3.8 (Oct 22, 2026):** Online: GUIDE cards and deck searches are face-up for the player deciding. Revealed cards (Mana Sage, searches that reveal, Artificer's Insight) show to everyone in the middle of the table with what happens ("Charged as a Mana Orb: draws 1 card"), with a shimmer sound. Coin flips (Gambler's Bounty) show the spinning coin with the result and its effect, with the coin sounds; choices wait until the coin lands. A soft two-note chime when the game turns to you (a decision, or priority with something on the stack or in combat), not when auto-pass answers for you. Protocol 5.
- **0.3.9 (Oct 23, 2026, round-9 mockups):** ManaPool area = "The Pool" without the oval basin: a water-colored bar with rain ripples opening across it (a splash ring when an Orb arrives); round Orbs (filled ones bob gently), Mana Rocks, Corrupted (with "discard creatures only"), "+N floating · until end of turn" with gold sparkles, and a big AVAILABLE total on the right (paying preview "7 → 5" in gold; charge status under it). Enter-the-field sounds: one for Artifacts, one for Anthems, and one per kindred for creatures (Goblin snicker, Vampire swell and bat wings, Demon growl and embers, Zombie earth and moan, Human fanfare, Construct clank and servo, God choir, Demigod bell, Druid leaves and chime, Dragon roar, Dragon Rider wingbeat and horn, Shapeshifter warble, Illusion shimmer; other creatures a firm step). Spells and Incantations get their own resolve sounds.
- **0.3.10 (Oct 23, 2026):** Creature enter-the-field sounds rebuilt to sound like the creatures: a voice synthesizer (buzz shaped by vowel formants, growl, breath) plus footsteps, wings and bird calls. Goblin cackle, Vampire hiss and bats, Demon distorted growl, Zombie moan, Human battle shout, Construct clunk/servo/robot chirp, God choir "aah", Demigod single voice, Druid leaves and birds, Dragon wings and roar, Dragon Rider horn and snort, Shapeshifter melting voice, Illusion whisper. Loudness trimmed per sound. The ManaPool Sound Board artifact plays every sound.
- **0.3.11 (Oct 23, 2026):** Zombies and Humans get several voices, chosen per card. Zombie: Grave moan (Zombie Spawn, tokens, Infected), Hungry growl (Mourning Marauder, Krr'ask, Morbid Manipulator), Shambler (Resilient Revenant, Isolated Sentinel, Gravebound Martyr), Rising horde (Necromantic Summoner, Dreaded Lineage, Deathly Reconjurer, Graveborn Guardian), "Braaains" (Cryptic Reclaimer, Dread Envoy, Corrupted Artificer). Human: Battle shout (Artificers and the rest), Soldier (Resting Adventurer, Human #1), Herald (Marcel, Tavern Hostess), Villager (Mischievous Child, Meditating Monk, Dual Channeler, Mad Scientist), Knight (Castiel, Human Shield).
- **0.3.12 (Oct 23, 2026):** Voices replaced where they didn't work: every Zombie plays "Grave burst" (a hand punches up through the soil, earth and pebbles scatter); every Human plays the Herald (three-note fanfare and a crowd cheer). The per-card Zombie and Human voices are gone.
- **0.3.13 (Oct 23, 2026):** Demons enter with "Infernal pact": a match strikes and catches under a dark organ chord with a tritone (replaces the growl).
- **0.3.14 (Oct 23, 2026):** Auto-pass never skips an opponent's card aimed at yours (your card being played, or your creature, artifact or anthem) when you could answer it, even with "Skip all responses" on.
- **0.3.15 (Oct 24, 2026):** Online games survive a server restart. Every few seconds (and when Render stops the server) each player's app receives a sealed snapshot of the room (AES-GCM, key in the SNAPSHOT_KEY setting, so nobody can read hidden cards from it). If the server lost the room, the app sends it back and the game continues ("The server restarted; the game was brought back." in the log); the others rejoin as usual. Reconnecting keeps trying for about 3 minutes. The Play online screen offers "Resume game" for the last unfinished game (up to 6 hours) after the app itself was closed. Protocol 6.
- **0.3.16 (Oct 24, 2026):** Table round 11. Turn clock in the header and a priority clock on the stack (no limits). Your field and hand grow with the window. Your field shows creatures full size and artifacts/anthems smaller after an ARTIFACTS · ANTHEMS divider; the expanded view keeps all cards equal. Opponent strips fit their whole field and show a summary line (creatures · artifacts · anthems); life shows as a heart that turns red at 2 or less. Hand: count and Sort sit left of the cards, playable cards rise a little, neighbors spread on hover, drag to reorder. The card preview is a slim strip. Stack items can be hovered with Alt. Each attack is one log line with its result; click it for the steps.
- **Not now:** keyboard shortcuts, undo, bot speed button on the table, turn recap, stuck hints, accessibility options, match stats, replays, timer bar on prompts, save & resume, away protection (online AFK), life history tooltip (no), pass-until-phase, online rejoin after restart, spectating, threat meter, turn-order tracking, mulligan hint, card backs, campaign/tutorial/challenges, layout memory, attack preview, "why not" reasons, end-turn check, progress pips, contracts panel, tribe crests, bot speech.
- **Bots (smarter, 0.1.12):** charge their least useful card; play Creatures, Artifacts and Anthems; use removal on the biggest threat and negate threats or creatures costing 4+; protect a threatened creature; boost their own side in combat; block safely, or chump when low on life; finish low-life players, FACEOFF good targets, otherwise attack the leader; sacrifice their weakest creature; bring back creatures with Corrupted Mana. They accept OFFERs unless the offerer has 9+ Souls.

## Card data decisions
- Use only tabs: Anthem, Artifact, Spell, Incantation, Zombie, Goblin, Vampire, Human, Druids, Construct, Demon, Dragon, Dragon Rider, God (plus the Graveyard Field from Sheet20).
- Unnamed cards → "<Tab name> #N", numbered within each tab starting at 1.
- Human: Resting Adventurer and Castiel, War General are duplicates; keep one of each.
- Unfinished cards (no cost/stats) are excluded: Support MK I, Achilles, and the cost-less Druid rows.
- Construct "NULL" is renamed **Support MK II**.
- Clockwork Titan: */* = number of Artifacts you control.
- Dragon Rider (cost 3, 1/1, DOUBLESTRIKE): add BOND.
- Database (Anthem): RELOAD → RECONFIGURE.
- Steelshaper Vanguard: keep the card, drop BREAKTHROUGH from its keyword options.
- Cards excluded for now: Rallying Cry (BREAKTHROUGH), the cost-3 2/1 BOND FLYING Dragon, Valkyrie (FLYING on ascend).
- Card data 0.2.0: 44 card texts rewritten for clarity (see rules-and-card-changes.md); Isolde cost 5; Demon #1 3/3. Tokens print their keywords.

## Card frames (approved)
- Creature gold, Artifact grey, Spell blue, Incantation red, Anthem white/cream, Field green. Tokens light gold, Mana Rocks dark indigo, card back navy with a glowing orb.
- Layout (design B, "Banner", chosen Oct 20, 2026): no art. Colored banner with the name as the headline and a large cost coin · type and tribe in small caps (lightning bolt = incantation speed) · keyword line · rules text (a keyword's reminder in italics when there is no other text) · "ATK x / y DEF" row for creatures, card number for others.
