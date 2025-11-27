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
- Reset current level: **R**
- Open main menu from gameplay: **ESC** (quit from the menu with **ESC**)
- Level select: press **L** on the main menu or use number keys **1-0** inside the selector, then **Enter/Space** to load

### What’s in the game
- A **main menu** with a **level selector** (all 10 levels unlocked) so you can jump straight into any stage.
- Generous **green teleporter overlays** on goals and pads (`T`) with broader detection to keep progression snappy and avoid getting stuck after beating sections.
- **Shield pickups** (`S`) that grant a temporary protective bubble and brief invulnerability on hit, visible as a blue aura.
- 10 tuned levels with boosters, spikes, patrolling walkers, hovering shooters, moving platforms, timed laser barriers, and collectibles, all balanced for fair paths.
- Level 10 boss with unique attacks and optional music: a file named `FFVII_Battle_ThemeV2.mp3` in the game directory is preferred (any `*boss*.ogg|.mp3|.wav` will also be detected).
