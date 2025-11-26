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

### Controls
- Move: **A/D** or **Left/Right arrows**
- Jump: **W**, **Space**, or **Up arrow**
- Shoot firebolt: **E** (red projectile)
- Reset current level: **R**
- Quit: **ESC** or window close

Reach the green goal block in each stage while avoiding spikes and patrolling enemies, collecting as many gems as you can along the way. There are 10 levels to clear, plus jump-boost pads to help with bigger gaps. Level 10 features a boss with unique abilities and accompanying boss-battle music; a file named `FFVII_Battle_ThemeV2.mp3` in the game directory will be used automatically, and otherwise any track matching `*boss*.ogg|.mp3|.wav` will be detected if available.
