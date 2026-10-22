# ManaPool: Rules and Card Changes

Everything changed or clarified from the original rules PDF and Cards.xlsx, as used by the digital version (0.1.9).

## Core rules

- **Field:** every player plays with a Field card. (So there is no Druid precon until Druids get a Field.)
- **Life:** life is a number, not a pile of cards. A player hit by an attack loses life and draws 1 card; CRITICAL stops that draw.
- **Main phase:** Spell-speed and Incantation-speed cards can both be played.
- **Charging:** once per turn, you may put 1 card from your hand face-down into your mana pool as a Mana Orb (1 mana). Charges made by card effects don't use up this charge.
- **Mana:** Mana Orbs refill at the start of your Upkeep. Mana Rocks stay until spent. Mana added "until the end of the turn" empties at the end of the turn.
- **Charging by card effects** (Mana Ramp, Cosmic Channeling, Druids #3…): the new Mana Orb is filled unless the card says otherwise (confirmed).
- **Orb swaps** (Mana Portal, Druids #3, Demon Pit): the hand card and the Orb trade places. The new Orb is filled.
- **Stack:** works like MTG. Only the top item resolves; then the active player gets priority. Triggered abilities use the stack.
- **Activated abilities:** Incantation speed unless the card says otherwise.
- **Combat:** one attacker at a time. Blocking taps the blocker. The attacker never dies in a clash; only the defending creature can.
- **Fizzling:** if the attacker, its blocker or its FACEOFF target leaves the field during the attack, the attack fizzles and does nothing, even if that creature comes right back.
- **Choosing:** every target and every choice shows a popup of the options, grouped by player, even when there is only one.
- **Unblocked attack:** the defender loses 1 life (2 with DOUBLE STRIKE).
- **Boosting:** you boost the attacker or the defending creature (blocker or FACEOFF target), not a player.
- **Effect damage to creatures:** lowers defense until the end of the turn; the creature dies at 0.
- **"Gains +X/X":** a permanent bonus that is not a counter.
- **"+X/X counter" / combat counter:** a counter; it stays on the card.
- **Copies:** a copied permanent is a token. A copied Spell or Incantation goes on the stack for free with new targets, then disappears.
- **Equip:** your Main phase only, with nothing on the stack. Pay again to move it. Equipment stays on the field if its creature leaves.
- **Constructs** are Creatures and Artifacts (tokens too).
- **Souls:** each contract (accepted OFFER, COMMAND, GIFT) gives you 1 Soul.
- **Corrupted Mana:** can only be spent on creatures played from your discard pile. You may play a creature from your discard pile by paying its whole cost with Corrupted Mana (confirmed).
- **Elimination:** an eliminated player's permanents and stack items leave the game.
- **First turn:** the first player draws.
- **God tab:** every card is a God, except DEMIGODs until they ascend.

## Keywords

| Keyword | Meaning |
|---|---|
| OFFER | Each opponent (unless specified) may accept or refuse X. Each acceptance is a contract. |
| COMMAND | Target player must do X. Counts as a contract. |
| GIFT | Target player gets X. Counts as a contract. |
| FADE OUT | Leaves the game until the End Phase, then returns untapped to its controller's field. Counters stay. |
| INFECT | At the end of its controller's next turn, the creature becomes your 1/1 Zombie with no abilities. If it is destroyed first, you create a 1/1 Zombie Token. |
| RECONFIGURE | Once per round (your turn to your next), you may untap this whenever you have priority. |
| CRITICAL BOOST | When this boosts an attack, that attack gains CRITICAL. |
| ILLUSION | A creature type created by spells. |
| TRAMPLE, FLASH | As in MTG. |
| VIGILANCE | Attacking doesn't tap this creature, but it still attacks only once per turn. |
| Summoning sickness | A new creature can't attack or use TAP abilities until its controller's next turn (unless HASTE). It can block and boost. |
| Counter card | A Spell or Incantation that negates. |
| BREAKTHROUGH | Removed from the game. |
| FLYING | On hold; not used. |
| FEED | Ignored for now. |

## Card changes

**Stats and costs**
- **Isolde, Bloodborne Mistress:** cost 6 → **5**.
- **Demon #1:** 2/2 → **3/3**.
- **Construct "NULL"** renamed **Support MK II**.
- **Clockwork Titan:** */* = Artifacts you control.
- **Dragon Rider** (cost 3, 1/1, DOUBLESTRIKE): adds BOND.
- **Database:** RELOAD → RECONFIGURE.
- **Steelshaper Vanguard:** BREAKTHROUGH removed from its options.

**Balance pass (Oct 22, 2026)**
- **Cost 1:** Creature Retrieval, Repairs, Sacrifice, Angel's Protection, Confused Knight, Morale Boost, Summoning Seal, Price of Passage, Blink, Path of the Seer.
- **Cost 2:** Anthropomorph, Disarm, Educated Civilian, Pact of Insight, Parasitic Society, Shadowveil Shroud, The Gods' Blessing, Artificer's Insight, Bounce, Forgotten Memory, Shadowbane Sacrifice, Mana Droid.
- **Cost 3:** Reanimation, Replica Creation, Reset, Rinse, Shifting Relic, Weapons Rack, Echoing Reflection, Arcane Foundry, Database, Xavier, Vampire Groom.
- **Cost 4:** Mana Processing Unit, Raining Arrows, Corrupted Artificer, Inspired Vampire (now **1/4**).
- **Now Incantations:** Echoes of the Past, Mimicry Magic, Reanimation.
- **Atredes, Vampire Overlord:** ATK **4**. **Alucard:** gains **HASTE**.
- **Support MK II:** no mana cost: tap an Artifact you control, draw 1.
- **Corrupted Mana Tree:** no mana cost: Tap, create 1 Corrupted Mana Rock.
- **Mana Conductor:** creates **2** Mana Rocks.
- **Urgal the Whisperer:** no 3-counter limit.
- **Demon Leecher, Demon Pup:** also trigger when you COMMAND.
- **Rinse:** GUIDE 3, then draw 3.
- **Unholy Grimoire:** also draws 1 card.
- **Summoning Seal:** the negated creature's controller creates 1 Mana Rock.
- **Counter the Counter:** draws 1 card when it negates.
- **Shadowveil Shroud:** Pay 2: equip (no Tap). **Magic Shield:** Pay 1: equip; opponents' card effects can't target or choose the equipped creature.
- **Tombstone:** also marks a creature in your discard pile; until your next End Phase you may play it by paying its cost (normal mana).
- **Tavern:** also: the first boost each of your creatures gets in a battle from a creature of its own tribe counts for 1 more.
- **Vendor Street:** removed (same as Anthem #1).

**Newly implemented (Oct 22, 2026)**

| Card | How it works |
|---|---|
| Abyssal Disposal | A creature from your deck to your discard pile; with 4+ Mana Orbs, draw 2. |
| Echoes of the Past | Play a Spell or Incantation from your discard pile, paying its cost. |
| Mimicry Magic | Your next Spell or Incantation is copied (new targets allowed). |
| Parasitic Society | 1 mana per creature of yours with +X/+Y counters. |
| Ragnarok | Every creature returns to its owner's hand; tokens cease to exist. |
| Raining Arrows | X = your creatures' total attack. A creature takes X damage. A player may block with an untapped creature and boost the block (+1 DEF per creature, tapped). Unblocked: they lose X life. Block beaten: blocker destroyed, 1 life. Equal: blocker destroyed. X > 6: CRITICAL (no draws). |
| Shifting Relic | Pay 2: a copy of a creature or Artifact until the end of the turn (Artifact and Creature). Not played this turn: no summoning sickness. |
| Weapons Rack | Tap: your creatures get +1/+1 until the end of the turn per Equipment you control. |
| Confused Knight | Switches a creature's ATK and DEF for good; later buffs switch too (1/4 → 4/1, then +2/+0 → 4/3). |
| Price of Passage | The card's controller may pay 1 mana (an OFFER: a contract); if not, the card is negated. |
| Blink | The permanent leaves until the End Phase (like FADE OUT). |
| Bounce | The permanent returns to its owner's hand (tokens cease to exist). |
| Shadowbane Sacrifice | Negate a card; sacrifice a creature you control as you play it. |
| Echoing Reflection | Copy a card being played (a permanent copy is a token on your field). |
| Low Kick | Destroy all tapped creatures of an opponent you fought this turn (attacked or were attacked by). |
| Book of Spells | Your Spells can be played at incantation speed and count as Incantations. |
| Mount Olympus | Playing a creature with printed cost 5+ creates 1 Mana Rock. |
| Spiteful Bargain | When a player refuses your OFFER: tap one of their creatures, +1 counter. At 3: remove them, 2 damage split among opponents. |
| Token Tide | Your token creatures gain "Tap: add 1 mana". |
| Twin Rhythms | Your Upkeep triggers happen twice. |
| Fine Print | 10 Souls: once per round, an OFFER is a COMMAND for one player. 20 Souls: once per round, for every player. |
| Royal Banquet | Your End Phase: if 3+ of your attacks this turn weren't blocked, 1 damage to a player. |

**Life loss (Oct 22, 2026):** every point of life lost draws a card, in combat or from card effects, unless CRITICAL or the card says otherwise (DOUBLE STRIKE: 2 life, 2 cards).

**New wording**
- **Cryptic Reclaimer:** During your turn, you may send this card **from your hand** to your Discard Pile; add 1 Zombie from your Discard Pile to your hand. (Used from the hand, not the field; it can't bring itself back; needs another Zombie in your discard pile. Oct 21, 2026.)

| Card | Text |
|---|---|
| Vampire Feeder | Your Vampires gain +0/1. |
| Vampire Butler | Whenever another Vampire you control gets a counter, this gets a +1/1 counter. |
| Herald, Food Critic | When this creature is blocked, if you have less than 5 life, gain 1 life. |
| Isolde, Bloodborne Mistress | When this creature clashes with a creature, create a token copy of that creature. The copy is a Vampire. |
| Arsen, Vampire Familiar | Once during your turn, you may equip this to another Vampire you control. Equipped Vampire gains +1/1 and FACEOFF. While equipped, this is an Artifact, not a Creature. |
| Atredes, Vampire Overlord | DMG GAIN, FACEOFF. At the end of your turn, if your attacking Vampires this turn had 9+ total attack (boosts included), create a 0/3 Vampire Token with DMG GAIN. |
| Alucard, Prince of the Night | FACEOFF. Whenever this creature destroys a creature in combat, target Vampire gains +1/1. |
| City Night (Field) | Your creatures with at least +4 attack above their printed attack gain EVASIVE. |
| Krr'ask, Virulent Contagion | Tap: INFECT target tapped creature. |
| Isolated Sentinel | Whenever a Zombie is destroyed, this creature gains +1/1. |
| Deathly Reconjurer | When this creature attacks, you may return a Zombie from your discard pile to your field. After this attack, that Zombie attacks the same player. |
| Beelzebub, Lord of the Flies | ETB - OFFER: draw 1 card and create 1 Mana Rock. Then you may draw 1 card and create 1 Mana Rock per contract. |
| Demon Shade | ETB - OFFER: draw 1 card. Then draw 1 card per contract. |
| Demon Leecher | Whenever you OFFER, you may draw 1 card. |
| Demon Pup | Whenever you OFFER, this gets a +1/1 counter. |
| Evil Spirit | ETB - Search your deck for a Spell or Incantation with OFFER, reveal it and add it to your hand. Shuffle. |
| Paimon, Great King of Hell | ETB - OFFER: create 1 Mana Rock. Add 2 mana until the end of the turn per contract. COMMAND each player who refuses to destroy 1 Anthem and 1 Artifact they control. |
| Demon #1 | Whenever a Demon you control damages an opponent, COMMAND that player to create 1 Mana Rock. |
| Infernal Tutor | OFFER: create a 1/1 Demon Token with "Tap: draw 1 card." Then GUIDE 2 per contract and draw 1 card. |
| Carnival Games | OFFER: search your deck for a card that costs 2 or less, add it to your hand and shuffle. Then draw 1 card and gain 1 extra Soul per contract. |
| Pact of Insight | OFFER: create a 1/1 Pact Token with "At the start of your Upkeep, you and the player who OFFERED this may each draw 1 card." |
| Demon Pit | The first time you OFFER during your turn, also OFFER: swap 1 of your Mana Orbs with 1 card in your hand. Create 1 Mana Rock per contract. |
| Win / Win | Whenever no one accepts your OFFER, create 1 Mana Rock. |
| Graveyard (Zombie Field, new) | 1st creature of yours destroyed or sacrificed each turn: draw 1 card. 2nd: add 1 mana until the end of the turn. 3rd: until the End Phase, you may play 1 card from your discard pile. Corrupted Mana can help pay. |
| Demon Field (Field) | 5 SOULS: Your Demons gain +1/1. 10 SOULS: For each damage your creatures deal to an opponent, you may draw 1 card. 15 SOULS: Your Demons gain DOUBLE STRIKE. Pay 2 SOULS: Target creature gets a +1/1 counter. |
| Counter the Counter | Negate target Counter card (a Spell or Incantation that negates). |
| Arcane Vanishing | Your permanents FADE OUT. |
| Anthropomorph | Target creature becomes a 1/1 Human with no abilities. |
| Frog Song | Whenever a creature you control triggers an ability, you may GUIDE 1 and draw 1 card. |
| Blood Vial | Every second time in a turn your creatures use their own Tap abilities, draw 1 card and add 1 mana until the end of the turn. |
| Combat Mk II | CRITICAL. Whenever this creature untaps outside your Untap step, it gains DOUBLE STRIKE until the end of the turn. |
| Mana Portal | Tap: add 1 mana until the end of the turn. Once per round, you may swap 1 of your Mana Orbs with 1 card in your hand (the new Orb is filled). |
| Druids #3 | Once per turn, you may swap 1 of your Mana Orbs with 1 card in your hand (the new Orb is filled). |
| Clockwork Servitor | TAP - Untap another target Artifact you control. |
| Fangs, Truesight Helmet, The Gods' Blessing, Enchanted Mace, Lightweight Sandals, Exalted Weapon | Pay N - Equip to target creature you control (Main phase). Equipped creature gains [keyword]. |
| Resonant Mana Node | RECONFIGURE. Tap: add 1 mana until the end of the turn. |
| Crystalforge Automaton | RECONFIGURE. Tap: create 1 Mana Rock. |
| Runes of Configuration | Tap: target Artifact gains RECONFIGURE. |
| Recalibrator Sentinel | Your Artifacts gain RECONFIGURE. |
| Sacrifice | As you play it, sacrifice a creature you control (cost); then destroy another target creature. |
| Corrupted Mana Rock | 1 mana that can only pay for creatures played from your discard pile. Stays until spent. |
| Construct, Vampire, God, Shapeshifter Tokens | Their keywords (RECONFIGURE, DMG GAIN, INDESTRUCTIBLE, SHAPESHIFTER) are now printed on the token. |

**Earlier card rulings (unchanged text, confirmed meaning)**
- **Goblin Artillery:** +2/0 per Goblin of yours boosted this turn, including itself.
- **Goblin Assassin:** doubles its total attack (after boosts) when it clashes as the attacker.
- **Goblin Berserker:** DOUBLE STRIKE for that battle if a Goblin boosts it, even when unblocked.
- **Goblin Wizard:** the extra point is for attack boosts only.
- **Grukza:** +1 token each time you create tokens.
- **Goblin Planner:** its mana ability uses the stack.
- **Druids #1:** pay the charged card's cost to copy it (any card).
- **El Crow Druid:** "Pay 2: untap" and "Destroy 1 of your Mana Orbs: +2/+2" (not a counter).
- **Druids #4:** counts your Mana Orbs, not Rocks.
- **Cloudwhisper, Anthem #1:** each gives 1 extra charge per turn.
- **Charitable Demon:** the defending player doesn't refill 1 Mana Orb in their next Upkeep.

## Needs your OK

- **Weapons Rack:** counts every Equipment you control, equipped or not.
- **Blink:** the card comes back at the End Phase like FADE OUT (no new ETB).
- **Royal Banquet:** counts your attacks this turn with no blocker (FACEOFF attacks count); you may pick any player.

- **Clockwork Servitor:** "another" Artifact; untapping itself loops forever now that it's an Artifact.
- **Krr'ask (ruling 17, "No"):** I read this as: the creature itself turns into your 1/1 Zombie (not a token). If it's destroyed first, you get a 1/1 Zombie Token.
- **Frog Song:** counts triggered abilities only, not activated ones.
- **Vampire Butler:** Butlers don't trigger off each other's counters (two Butlers would loop forever).
- **Paimon:** "each player" = each opponent, as with every OFFER.
- **Arcane Vanishing:** returning cards don't trigger their ETB again.
- **Equip:** only onto your own creatures.
- **Groot:** destroying another creature is mandatory if you control one.
- **Goblin #1:** a boost from any player's creature counts.
