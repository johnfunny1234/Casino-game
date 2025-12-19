# Casino-game

Python platformer built with Pygame that includes 10 handcrafted levels, boosters, spikes, enemies, and collectibles.

## Setup
1. Create a virtual environment (recommended):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Play the game
Run the platformer directly:
```bash
python platformer.py
```

### Controls & menus
- Move: **A/D** or **Left/Right arrows**
- Jump: **W**, **Space**, or **Up arrow**
- Shoot firebolt: **E** (red projectile)
- Raise shield: **F** (holds a regenerating barrier that can break under sustained fire)
- Reset current level: **R**
- Open main menu from gameplay: **ESC** (quit from the menu with **ESC**)
- Level select: press **L** on the main menu or use number keys **1-0** inside the selector, then **Enter/Space** to load
- Owner menu (testing): press **O** on the main menu to toggle **God Mode** or **OP Projectiles** (two-shot boss fire)

### What’s in the game
- A **main menu** with a **level selector** (all 10 levels unlocked) so you can jump straight into any stage.
- Generous **green teleporter overlays** on goals and pads (`T`) with broader detection to keep progression snappy and avoid getting stuck after beating sections.
- **Shield pickups** (`S`) that refill and supercharge your **F-key shield**, which regenerates after breaking if it takes too much fire.
- An **owner/testing menu** that exposes **God Mode** (invulnerable runs) and **OP Projectiles** (two-shot boss fire) outside normal play so you can debug the levels or boss.
- A **5-segment health bar** for the player: every two unshielded hits remove one bar (ten total hits), making difficulty clearer without removing challenge.
- 10 tuned levels with boosters, spikes, patrolling walkers (now edge-aware), hovering shooters, moving platforms, timed laser barriers, and collectibles, all balanced for fair paths.
- Custom in-engine sound effects for firing, enemy volleys, and pickups—no external SFX needed—plus richer skies (nebulae/starfield) and fiery ember overlays during the finale.
- A flat Level 10 arena with a stationary boss that now fires beams, volleys, flame rain, and bursts of projectiles with beefed-up health while optionally playing `FFVII_Battle_ThemeV2.mp3` (any `*boss*.ogg|.mp3|.wav` file is also detected).
- After the boss is defeated, its eye blacks out and it rockets off-screen before a fiery celebration: the backdrop and ground ignite with animated embers and bursts, the player auto-dances to `Goback.mp3` (or `What we Do Here is Go Back - Otis McDonald.mp3`, both auto-detected) for a minute, then the music stops, the dance ends, and an encore wave of ground gunners spawns. Clear them and the hero will auto-walk right toward the exit where the “Level 11 / Chapter 2 coming soon” teaser awaits.
- Finale timing is frame-rate independent: once the boss falls, the celebration, music, encore wave, and auto-walk always trigger—even if the boss despawns early—so the post-fight sequence never stalls.
