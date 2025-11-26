import sys
import pygame
from pygame import Rect, Surface
from pygame.math import Vector2

# Game constants
WIDTH, HEIGHT = 960, 640
FPS = 60
TILE = 48
GRAVITY = 0.9
JUMP_FORCE = -16
PLAYER_SPEED = 6

def load_levels():
    """Return 10 handcrafted level layouts using text maps."""
    return [
        [
            "..............................",
            "..............................",
            "..............................",
            ".................C...........",
            ".................###.........",
            "......C......................",
            "......###.........#####......",
            "..P......................G...",
            "#############################",
        ],
        [
            "..............................",
            "........C.................C..",
            "........###.............#####",
            "....................C........",
            "....................###......",
            "..P......C................G..",
            "##########...####....########",
            "...............#............#",
            "#############################",
        ],
        [
            "..............................",
            "........C.............C......",
            "........###.......#####......",
            "..................C..........",
            "......#####.......#######....",
            "..P.....................G....",
            "############...##############",
            "...........#...#............#",
            "#############################",
        ],
        [
            "..............................",
            "...C.............C...........",
            "...###.....E.....###.........",
            ".................C...........",
            "..P..............###.....G...",
            "#########....###############.",
            "........#....#..............#",
            "#############################",
        ],
        [
            "..............................",
            ".......................C.....",
            "....C......#####.............",
            "....###......................",
            "..P...........E.....C....G...",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
        [
            "..............................",
            "....C.....C......C...........",
            "....###...###....###.........",
            "..............E..............",
            "..P.....C.............C...G..",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
        [
            "..............................",
            "...C......C......C...........",
            "...###....###....###.........",
            "..............E..............",
            "..P.....C......^.....C...G...",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
        [
            "..............................",
            "...C...E....C....E...C.......",
            "...###..###..###..###........",
            "..............^..............",
            "..P.....C..........C....G....",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
        [
            "..............................",
            "..C...E....C....E....C.......",
            "..###..###..###..###..###....",
            "..............^..............",
            "..P.....C....B.....C....G....",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
        [
            "..............................",
            "..C...E....C....E....C..G....",
            "..###..###..###..###..###....",
            "..B...........^..............",
            "..P.....C..........C.........",
            "#############################",
            "...........#............#....",
            "#############################",
        ],
    ]

class Tile(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((70, 50, 35))
        pygame.draw.rect(self.image, (110, 80, 55), self.image.get_rect(), 4)
        self.rect = self.image.get_rect(topleft=pos)

class Spike(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE), pygame.SRCALPHA)
        points = [(0, TILE), (TILE / 2, 0), (TILE, TILE)]
        pygame.draw.polygon(self.image, (200, 60, 50), points)
        self.rect = self.image.get_rect(topleft=pos)

class Booster(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((60, 100, 220))
        pygame.draw.rect(self.image, (255, 255, 255), self.image.get_rect(), 4)
        self.rect = self.image.get_rect(topleft=pos)

class Collectible(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE // 2, TILE // 2))
        self.image.fill((255, 215, 0))
        self.rect = self.image.get_rect(center=(pos[0] + TILE // 2, pos[1] + TILE // 2))

class Goal(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((80, 200, 120))
        pygame.draw.rect(self.image, (255, 255, 255), self.image.get_rect(), 4)
        self.rect = self.image.get_rect(topleft=pos)

class Enemy(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((200, 70, 70))
        self.rect = self.image.get_rect(topleft=pos)
        self.speed = 2
        self.direction = 1

    def update(self, tiles):
        self.rect.x += self.speed * self.direction
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                self.direction *= -1
                if self.direction > 0:
                    self.rect.left = tile.rect.right
                else:
                    self.rect.right = tile.rect.left
                break

class Player(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE * 0.8, TILE * 0.9))
        self.image.fill((240, 240, 255))
        self.rect = self.image.get_rect(topleft=pos)
        self.velocity = Vector2(0, 0)
        self.on_ground = False
        self.collected = 0

    def handle_input(self):
        keys = pygame.key.get_pressed()
        self.velocity.x = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.velocity.x = -PLAYER_SPEED
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.velocity.x = PLAYER_SPEED
        if (keys[pygame.K_SPACE] or keys[pygame.K_w] or keys[pygame.K_UP]) and self.on_ground:
            self.velocity.y = JUMP_FORCE
            self.on_ground = False

    def apply_gravity(self):
        self.velocity.y += GRAVITY
        self.velocity.y = min(self.velocity.y, 20)

    def horizontal_movement(self, tiles):
        self.rect.x += int(self.velocity.x)
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.velocity.x > 0:
                    self.rect.right = tile.rect.left
                elif self.velocity.x < 0:
                    self.rect.left = tile.rect.right

    def vertical_movement(self, tiles):
        self.rect.y += int(self.velocity.y)
        self.on_ground = False
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.velocity.y > 0:
                    self.rect.bottom = tile.rect.top
                    self.velocity.y = 0
                    self.on_ground = True
                elif self.velocity.y < 0:
                    self.rect.top = tile.rect.bottom
                    self.velocity.y = 0

    def update(self, tiles):
        self.handle_input()
        self.apply_gravity()
        self.horizontal_movement(tiles)
        self.vertical_movement(tiles)

class Level:
    def __init__(self, layout):
        self.tiles = pygame.sprite.Group()
        self.spikes = pygame.sprite.Group()
        self.collectibles = pygame.sprite.Group()
        self.goal = pygame.sprite.GroupSingle()
        self.enemies = pygame.sprite.Group()
        self.boosters = pygame.sprite.Group()
        self.player_start = Vector2(100, 100)

        for row_idx, row in enumerate(layout):
            for col_idx, cell in enumerate(row):
                pos = Vector2(col_idx * TILE, row_idx * TILE)
                if cell == '#':
                    self.tiles.add(Tile(pos))
                elif cell == 'P':
                    self.player_start = pos
                elif cell == 'G':
                    self.goal.add(Goal(pos))
                elif cell == 'C':
                    self.collectibles.add(Collectible(pos))
                elif cell == 'E':
                    self.enemies.add(Enemy(pos))
                elif cell == '^':
                    self.spikes.add(Spike(pos))
                elif cell == 'B':
                    self.boosters.add(Booster(pos))

class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Python Platformer - 10 Levels")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("arial", 24)

        self.levels = [Level(layout) for layout in load_levels()]
        self.level_index = 0
        self.player = Player(self.levels[self.level_index].player_start)
        self.reset_level_state()

    def reset_level_state(self):
        level = self.levels[self.level_index]
        self.player.rect.topleft = level.player_start
        self.player.velocity = Vector2(0, 0)
        self.player.collected = 0
        # Deep copy collectibles to allow replaying levels
        layout_copy = load_levels()[self.level_index]
        self.levels[self.level_index] = Level(layout_copy)
        self.player.rect.topleft = self.levels[self.level_index].player_start

    def draw_background(self):
        self.screen.fill((20, 22, 40))
        parallax_color = (35, 55, 90)
        for y in range(0, HEIGHT, 120):
            pygame.draw.rect(self.screen, parallax_color, (0, y, WIDTH, 40))

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                self.reset_level_state()

    def update_player_state(self, level):
        level.enemies.update(level.tiles)
        self.player.update(level.tiles)

        # Collectibles
        collected = pygame.sprite.spritecollide(self.player, level.collectibles, dokill=True)
        self.player.collected += len(collected)

        # Boosters
        if pygame.sprite.spritecollideany(self.player, level.boosters):
            self.player.velocity.y = JUMP_FORCE * 1.2
            self.player.on_ground = False

        # Hazards and enemies
        if pygame.sprite.spritecollideany(self.player, level.spikes) or pygame.sprite.spritecollideany(self.player, level.enemies):
            self.reset_level_state()
            return

        # Goal
        if pygame.sprite.spritecollideany(self.player, level.goal):
            if self.level_index < len(self.levels) - 1:
                self.level_index += 1
                self.reset_level_state()
            else:
                self.show_victory_screen()

    def show_victory_screen(self):
        message = self.font.render("You cleared all 10 levels! Press R to replay.", True, (255, 255, 255))
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                    self.level_index = 0
                    self.reset_level_state()
                    return

            self.screen.fill((10, 10, 10))
            self.screen.blit(message, message.get_rect(center=(WIDTH // 2, HEIGHT // 2)))
            pygame.display.flip()
            self.clock.tick(30)

    def draw_level(self, level):
        level.tiles.draw(self.screen)
        level.spikes.draw(self.screen)
        level.collectibles.draw(self.screen)
        level.goal.draw(self.screen)
        level.enemies.draw(self.screen)
        level.boosters.draw(self.screen)
        self.screen.blit(self.player.image, self.player.rect)

    def draw_hud(self, level):
        info = f"Level {self.level_index + 1}/10 | Gems: {self.player.collected}" \
               f" | Reset: R | Quit: ESC"
        text_surface = self.font.render(info, True, (240, 240, 240))
        self.screen.blit(text_surface, (20, 20))
        guide = self.font.render("Move: A/D or ←/→, Jump: W/SPACE/↑", True, (200, 200, 220))
        self.screen.blit(guide, (20, 50))

    def run(self):
        while True:
            self.clock.tick(FPS)
            self.handle_events()

            level = self.levels[self.level_index]
            self.update_player_state(level)

            self.draw_background()
            self.draw_level(level)
            self.draw_hud(level)

            pygame.display.flip()


if __name__ == "__main__":
    Game().run()
