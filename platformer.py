import sys
from pathlib import Path
import random
import math
import array

import pygame
from pygame import Rect, Surface
from pygame.math import Vector2

# Game constants
WIDTH, HEIGHT = 960, 640
FPS = 60
TILE = 48
GRAVITY = 0.9
JUMP_FORCE = -18
PLAYER_SPEED = 6
PROJECTILE_SPEED = 11

def load_levels():
    """Return 10 handcrafted level layouts using text maps."""
    return [
        [
            "..............................",
            "...C...............C.....S.C..",
            "...###.......###.......###....",
            "..P....................B......",
            "#####...........C........G....",
            "....#....###..........###.....",
            "....#........S................",
            "...^######....###.......###...",
            "##############################",
        ],
        [
            "..............................",
            "..C.....C......C..............",
            "..###...###....###....###.....",
            ".....M.............L.........S",
            "..P....B....E.............G...",
            "#####...........###....#######",
            "....#....^.............#......",
            "..M.#.........C....S...#......",
            "##############################",
        ],
        [
            "..............................",
            "...C....H....C....H....C......",
            "..###..###..###..###..###.....",
            "...........^.......^.....S....",
            "..P...B....C....E....C....G...",
            "#####...........#####....#####",
            "....#....M.............#......",
            "....#........C..S........#....",
            "##############################",
        ],
        [
            "..............................",
            "..C....E.......C..S....E......",
            "..###..###..M..###..M..###....",
            "..B.......................C...",
            "..P....###....#####....##..G..",
            "#####..###..........###..#####",
            ".....#....#...L.....#....#....",
            "##############################",
        ],
        [
            "..............................",
            "...........S...C..........C...",
            "....C.....#####.....#####.....",
            "....###...........L...........",
            "..P........E..M..B....C...G...",
            "#############....#############",
            ".....#.....#.............#....",
            "##############################",
        ],
        [
            "..............................",
            "..C.....C......C......C.......",
            "..###...###....###....###.....",
            "....M.........H......S........",
            "..P.....C....###.....C...G....",
            "#############....#############",
            ".....#..V..#.....^.......#....",
            "##############################",
        ],
        [
            "..............................",
            "..C.....C....C....C.....C.....",
            "..###..###..###..###..###.....",
            "...M......E....S...E......M...",
            "..P..B..###..^..###..B...G....",
            "#####....###.....###....######",
            "...#..C..L....C....L...C..#...",
            "##############################",
        ],
        [
            "..............................",
            "..C..M....C....E.S..C....M....",
            "..###..###..###..###..###.....",
            "..^...........^...........^...",
            "..P..B..C..L....C..B...C..G...",
            "#####M####....#####M##########",
            "...#..S..#..H.....#.....#.....",
            "##############################",
        ],
        [
            "..............................",
            "..C...E..^..C....E..^..C...T..",
            "..###..###..###..###..###..###",
            "..B...M....^..M....^.....B....",
            "..P....C...###.....C..B...G.S.",
            "#####.....###...M.....###.....",
            "..L..#..C..#...C....^..#..C...",
            "##############################",
        ],
        [
            "..............................",
            "..............................",
            "..............................",
            "..............................",
            "...P.....................G....",
            "............K.................",
            "..............................",
            "##############################",
            "##############################",
            "##############################",
        ],
    ]

def draw_gradient_rect(surface: Surface, color_start, color_end, rect: Rect):
    """Draw a vertical gradient for subtle background depth."""
    steps = rect.height
    for i in range(steps):
        ratio = i / steps
        r = color_start[0] + (color_end[0] - color_start[0]) * ratio
        g = color_start[1] + (color_end[1] - color_start[1]) * ratio
        b = color_start[2] + (color_end[2] - color_start[2]) * ratio
        pygame.draw.line(surface, (int(r), int(g), int(b)), (rect.x, rect.y + i), (rect.x + rect.width, rect.y + i))

class Tile(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        base = (94, 76, 56)
        highlight = (150, 125, 92)
        self.image.fill(base)
        pygame.draw.rect(self.image, highlight, self.image.get_rect(), 3, border_radius=6)
        pygame.draw.rect(self.image, (60, 45, 30), self.image.get_rect(), 1, border_radius=6)
        self.rect = self.image.get_rect(topleft=pos)

class Spike(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE), pygame.SRCALPHA)
        points = [(6, TILE), (TILE / 2, 6), (TILE - 6, TILE)]
        pygame.draw.polygon(self.image, (220, 80, 70), points)
        pygame.draw.polygon(self.image, (255, 180, 160), points, 3)
        self.rect = self.image.get_rect(topleft=pos)

class Booster(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((40, 120, 255))
        pygame.draw.rect(self.image, (180, 225, 255), self.image.get_rect(), 3, border_radius=10)
        pygame.draw.circle(self.image, (255, 255, 255), (TILE // 2, TILE // 2), TILE // 5)
        self.rect = self.image.get_rect(topleft=pos)

class MovingPlatform(pygame.sprite.Sprite):
    def __init__(self, pos, axis="x", distance=TILE * 2, speed=2.4):
        super().__init__()
        self.image = Surface((TILE, TILE // 2))
        self.image.fill((120, 190, 230))
        pygame.draw.rect(self.image, (40, 80, 140), self.image.get_rect(), 3, border_radius=8)
        self.rect = self.image.get_rect(topleft=(pos[0], pos[1] + TILE // 2))
        self.start_pos = Vector2(self.rect.topleft)
        self.axis = axis
        self.distance = distance
        self.speed = speed
        self.direction = 1

    def update(self):
        if self.axis == "x":
            self.rect.x += self.speed * self.direction
            if abs(self.rect.x - self.start_pos.x) >= self.distance:
                self.direction *= -1
        else:
            self.rect.y += self.speed * self.direction
            if abs(self.rect.y - self.start_pos.y) >= self.distance:
                self.direction *= -1

class Collectible(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE // 2, TILE // 2), pygame.SRCALPHA)
        pygame.draw.circle(self.image, (255, 215, 0), (TILE // 4, TILE // 4), TILE // 4)
        pygame.draw.circle(self.image, (255, 255, 240), (TILE // 6, TILE // 6), TILE // 8)
        self.rect = self.image.get_rect(center=(pos[0] + TILE // 2, pos[1] + TILE // 2))

class ShieldPickup(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE), pygame.SRCALPHA)
        glow_rect = self.image.get_rect()
        pygame.draw.rect(self.image, (70, 220, 255, 120), glow_rect, border_radius=10)
        pygame.draw.rect(self.image, (150, 240, 255, 180), glow_rect.inflate(-10, -10), border_radius=10)
        pygame.draw.circle(self.image, (255, 255, 255, 220), glow_rect.center, TILE // 5)
        self.rect = self.image.get_rect(topleft=pos)

class LaserBarrier(pygame.sprite.Sprite):
    def __init__(self, pos, axis="x"):
        super().__init__()
        size = (TILE, TILE // 3) if axis == "x" else (TILE // 3, TILE)
        self.image = Surface(size, pygame.SRCALPHA)
        self.rect = self.image.get_rect(topleft=pos)
        self.axis = axis
        self.timer = random.randint(0, 90)
        self.active = True

    def update(self):
        self.timer = (self.timer + 1) % 140
        self.active = self.timer < 90
        alpha = 220 if self.active else 70
        self.image.fill((0, 0, 0, 0))
        if self.axis == "x":
            pygame.draw.rect(
                self.image,
                (255, 80, 40, alpha),
                Rect(0, self.image.get_height() // 2 - 5, self.image.get_width(), 10),
                border_radius=6,
            )
        else:
            pygame.draw.rect(
                self.image,
                (255, 80, 40, alpha),
                Rect(self.image.get_width() // 2 - 5, 0, 10, self.image.get_height()),
                border_radius=6,
            )

class Goal(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((80, 200, 120))
        pygame.draw.rect(self.image, (240, 255, 240), self.image.get_rect(), 4, border_radius=6)
        self.rect = self.image.get_rect(topleft=pos)


class Teleporter(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE), pygame.SRCALPHA)
        glow_rect = self.image.get_rect()
        pygame.draw.rect(self.image, (120, 255, 180, 90), glow_rect, border_radius=10)
        pygame.draw.rect(self.image, (120, 255, 200, 150), glow_rect.inflate(-10, -10), border_radius=10)
        pygame.draw.rect(self.image, (60, 200, 120, 220), glow_rect.inflate(-18, -18), border_radius=10)
        self.rect = self.image.get_rect(topleft=pos)

class Enemy(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE, TILE))
        self.image.fill((210, 80, 90))
        pygame.draw.rect(self.image, (255, 200, 210), self.image.get_rect(), 3, border_radius=8)
        self.rect = self.image.get_rect(topleft=pos)
        self.speed = 2.6
        self.direction = 1
        self.pace_timer = random.randint(50, 110)

    def update(self, tiles):
        self.pace_timer -= 1
        if self.pace_timer <= 0:
            self.direction *= -1
            self.pace_timer = random.randint(80, 140)

        self.rect.x += self.speed * self.direction

        collided = False
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                self.direction *= -1
                if self.direction > 0:
                    self.rect.left = tile.rect.right
                else:
                    self.rect.right = tile.rect.left
                collided = True
                self.pace_timer = random.randint(70, 130)
                break

        if not collided:
            foot_x = self.rect.left if self.direction < 0 else self.rect.right
            foot_probe = Rect(foot_x - 4, self.rect.bottom, 8, 8)
            if not any(tile.rect.colliderect(foot_probe) for tile in tiles):
                self.direction *= -1
                self.pace_timer = random.randint(60, 120)

class HoverEnemy(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE * 0.9, TILE * 0.6), pygame.SRCALPHA)
        body_rect = self.image.get_rect()
        pygame.draw.ellipse(self.image, (255, 185, 120), body_rect)
        pygame.draw.ellipse(self.image, (90, 60, 140), Rect(8, 6, body_rect.width - 16, body_rect.height - 12))
        self.rect = self.image.get_rect(center=(pos[0] + TILE // 2, pos[1] + TILE // 2))
        self.origin = Vector2(self.rect.center)
        self.phase = random.randint(0, 120)
        self.shoot_cooldown = random.randint(70, 120)
        self.drift = Vector2(random.choice([-1, 1]) * 0.6, 0)

    def update(self, tiles, hazard_projectiles: pygame.sprite.Group, sound_callback=None, sound=None):
        self.phase += 1
        float_y = math.sin(self.phase / 35) * 20
        sway_x = math.cos(self.phase / 40) * 16
        self.origin += self.drift
        self.rect.center = (self.origin.x + sway_x, self.origin.y + float_y)
        self.shoot_cooldown -= 1
        if self.shoot_cooldown <= 0:
            hazard_projectiles.add(Projectile(self.rect.center, Vector2(0, 1), color=(255, 150, 90), speed=8, radius=8))
            if sound_callback:
                sound_callback(sound)
            self.shoot_cooldown = 110

class GroundShooter(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = Surface((TILE * 0.9, TILE * 0.9), pygame.SRCALPHA)
        body_rect = self.image.get_rect()
        pygame.draw.rect(self.image, (255, 140, 120), body_rect, border_radius=8)
        pygame.draw.rect(self.image, (60, 40, 70), body_rect.inflate(-8, -8), border_radius=8)
        pygame.draw.circle(self.image, (255, 220, 220), (body_rect.width // 2, body_rect.height // 3), 8)
        self.rect = self.image.get_rect(topleft=pos)
        self.direction = random.choice([-1, 1])
        self.speed = 2.4
        self.shoot_cooldown = random.randint(50, 90)

    def update(self, tiles, hazard_projectiles: pygame.sprite.Group, sound_callback=None, sound=None, player=None):
        self.rect.x += self.speed * self.direction
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.direction > 0:
                    self.rect.right = tile.rect.left
                else:
                    self.rect.left = tile.rect.right
                self.direction *= -1
                break

        foot_x = self.rect.left if self.direction < 0 else self.rect.right
        foot_probe = Rect(foot_x - 4, self.rect.bottom, 8, 8)
        if not any(tile.rect.colliderect(foot_probe) for tile in tiles):
            self.direction *= -1

        if player:
            self.shoot_cooldown -= 1
            if self.shoot_cooldown <= 0:
                direction = Vector2(player.rect.center) - Vector2(self.rect.center)
                hazard_projectiles.add(Projectile(self.rect.center, direction, color=(255, 180, 100), speed=8, radius=9))
                if sound_callback:
                    sound_callback(sound)
                self.shoot_cooldown = 120

class Projectile(pygame.sprite.Sprite):
    def __init__(self, pos, direction, color=(230, 60, 60), speed=PROJECTILE_SPEED, radius=10):
        super().__init__()
        self.image = Surface((radius * 2, radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(self.image, color, (radius, radius), radius)
        pygame.draw.circle(self.image, (255, 240, 240), (radius, radius), radius // 2)
        self.rect = self.image.get_rect(center=pos)
        self.velocity = Vector2(direction).normalize() * speed if direction.length() != 0 else Vector2(speed, 0)

    def update(self):
        self.rect.centerx += int(self.velocity.x)
        self.rect.centery += int(self.velocity.y)
        if self.rect.right < 0 or self.rect.left > WIDTH or self.rect.bottom < 0 or self.rect.top > HEIGHT:
            self.kill()

class Boss(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.base_color = (70, 30, 120)
        self.eye_color = (255, 110, 150)
        self.image = self.render_boss_image()
        self.rect = self.image.get_rect(topleft=pos)
        self.velocity = Vector2(0, 0)
        self.on_ground = False
        self.health = 38
        self.jump_cooldown = 110
        self.shot_cooldown = 60
        self.dash_cooldown = 220
        self.volley_cooldown = 150
        self.beam_cooldown = 200
        self.rain_cooldown = 140
        self.pulse_cooldown = 260
        self.dying = False
        self.exit_velocity = Vector2(0, -8)

    def render_boss_image(self, dark_eye=False):
        image = Surface((TILE * 1.6, TILE * 1.6), pygame.SRCALPHA)
        pygame.draw.rect(image, self.base_color, image.get_rect(), border_radius=18)
        pygame.draw.rect(image, (210, 140, 255), image.get_rect(), 6, border_radius=18)
        right_eye_color = (20, 20, 30) if dark_eye else self.eye_color
        pygame.draw.circle(image, self.eye_color, (int(image.get_width() * 0.25), int(image.get_height() * 0.3)), 12)
        pygame.draw.circle(image, right_eye_color, (int(image.get_width() * 0.75), int(image.get_height() * 0.3)), 12)
        pygame.draw.rect(image, (255, 240, 255), Rect(10, image.get_height() // 2, image.get_width() - 20, 14), border_radius=10)
        pygame.draw.circle(image, (90, 210, 255), (image.get_width() // 2, int(image.get_height() * 0.7)), 10)
        return image

    def apply_gravity(self):
        self.velocity.y += GRAVITY
        self.velocity.y = min(self.velocity.y, 18)

    def move_and_collide(self, tiles):
        self.rect.x += int(self.velocity.x)
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.velocity.x > 0:
                    self.rect.right = tile.rect.left
                elif self.velocity.x < 0:
                    self.rect.left = tile.rect.right

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

    def start_death(self):
        self.dying = True
        self.image = self.render_boss_image(dark_eye=True)
        self.exit_velocity = Vector2(6, -12)

    def update(self, tiles, player, hazard_projectiles: pygame.sprite.Group, volley_sound=None, sound_callback=None):
        if self.dying:
            self.rect.x += int(self.exit_velocity.x)
            self.rect.y += int(self.exit_velocity.y)
            self.exit_velocity.y -= 0.4
            return
        self.apply_gravity()
        self.velocity.x = 0
        self.jump_cooldown -= 1
        self.shot_cooldown -= 1
        self.dash_cooldown -= 1
        self.volley_cooldown -= 1
        self.beam_cooldown -= 1
        self.rain_cooldown -= 1
        self.pulse_cooldown -= 1

        if self.shot_cooldown <= 0:
            direction = Vector2(player.rect.center) - Vector2(self.rect.center)
            hazard_projectiles.add(Projectile(self.rect.center, direction, color=(255, 120, 255), speed=10, radius=12))
            self.shot_cooldown = 70

        if self.beam_cooldown <= 0:
            hazard_projectiles.add(Projectile(self.rect.midleft, Vector2(-1, 0), color=(255, 200, 120), speed=12, radius=10))
            hazard_projectiles.add(Projectile(self.rect.midright, Vector2(1, 0), color=(255, 200, 120), speed=12, radius=10))
            hazard_projectiles.add(Projectile(self.rect.center, Vector2(0, -1), color=(255, 200, 120), speed=12, radius=10))
            self.beam_cooldown = 240

        if self.rain_cooldown <= 0:
            for _ in range(5):
                drop_x = random.randint(80, WIDTH - 80)
                hazard_projectiles.add(Projectile((drop_x, 0), Vector2(0, 1), color=(255, 160, 60), speed=7, radius=9))
            self.rain_cooldown = 180

        if self.volley_cooldown <= 0:
            angles = [i for i in range(0, 360, 30)]
            center = Vector2(self.rect.center)
            for angle in angles:
                rad = math.radians(angle)
                hazard_projectiles.add(
                    Projectile(center, Vector2(math.cos(rad), math.sin(rad)), color=(120, 255, 220), speed=7, radius=9)
                )
            self.volley_cooldown = 220
            if sound_callback:
                sound_callback(volley_sound)

        if self.pulse_cooldown <= 0:
            offsets = [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
            for direction in offsets:
                hazard_projectiles.add(Projectile(self.rect.center, direction, color=(255, 90, 200), speed=14, radius=11))
            self.pulse_cooldown = 300

        self.move_and_collide(tiles)

    def take_hit(self):
        self.health -= 1
        pygame.draw.rect(self.image, (255, 255, 255), self.image.get_rect(), 2, border_radius=14)

class Player(pygame.sprite.Sprite):
    def __init__(self, pos, god_mode=False):
        super().__init__()
        self.image = Surface((TILE * 0.8, TILE * 0.9), pygame.SRCALPHA)
        body_rect = self.image.get_rect()
        pygame.draw.rect(self.image, (245, 245, 255), body_rect, border_radius=8)
        pygame.draw.rect(self.image, (110, 140, 255), Rect(6, body_rect.height // 2, body_rect.width - 12, body_rect.height // 2 - 4), border_radius=8)
        self.rect = self.image.get_rect(topleft=pos)
        self.velocity = Vector2(0, 0)
        self.on_ground = False
        self.collected = 0
        self.facing = 1
        self.shoot_cooldown = 0
        self.max_health_bars = 5
        self.health_bars = self.max_health_bars
        self.damage_buffer = 0
        self.shield_time = 0
        self.shield_energy_max = 140
        self.shield_energy = self.shield_energy_max
        self.shield_break_timer = 0
        self.shield_regen_delay = 0
        self.shielding = False
        self.invuln_timer = 0
        self.god_mode = god_mode
        self.auto_walk_right = False

    def handle_input(self):
        keys = pygame.key.get_pressed()
        if self.auto_walk_right:
            self.velocity.x = PLAYER_SPEED * 0.6
            self.facing = 1
            return None
        self.velocity.x = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.velocity.x = -PLAYER_SPEED
            self.facing = -1
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.velocity.x = PLAYER_SPEED
            self.facing = 1
        if (keys[pygame.K_SPACE] or keys[pygame.K_w] or keys[pygame.K_UP]) and self.on_ground:
            self.velocity.y = JUMP_FORCE
            self.on_ground = False
        self.shielding = (
            (keys[pygame.K_f])
            and self.shield_break_timer <= 0
            and self.shield_energy > 5
        )
        if keys[pygame.K_e] and self.shoot_cooldown <= 0:
            self.shoot_cooldown = 18
            return Projectile(self.rect.center, Vector2(self.facing, 0), color=(230, 60, 60))
        return None

    def apply_gravity(self):
        self.velocity.y += GRAVITY
        self.velocity.y = min(self.velocity.y, 20)

    def absorb_hit(self):
        if self.god_mode:
            return True
        if self.invuln_timer > 0:
            return True
        if (self.shielding or self.shield_time > 0) and self.shield_energy > 0:
            self.shield_energy -= 45
            self.shield_regen_delay = 50
            if self.shield_energy <= 0:
                self.shield_energy = 0
                self.shield_break_timer = 180
                self.shielding = False
            self.invuln_timer = 25
            return True
        return False

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
        projectile = self.handle_input()
        self.apply_gravity()
        self.horizontal_movement(tiles)
        self.vertical_movement(tiles)
        if self.shoot_cooldown > 0:
            self.shoot_cooldown -= 1
        if self.shield_time > 0:
            self.shield_time -= 1
        if self.invuln_timer > 0:
            self.invuln_timer -= 1
        if self.shield_break_timer > 0:
            self.shield_break_timer -= 1
        if self.shield_regen_delay > 0:
            self.shield_regen_delay -= 1

        if self.shielding:
            self.shield_energy = max(0, self.shield_energy - 0.6)
            if self.shield_energy <= 0:
                self.shield_break_timer = 180
                self.shielding = False
        elif self.shield_break_timer <= 0 and self.shield_regen_delay <= 0:
            regen_rate = 0.45 + (0.2 if self.shield_time > 0 else 0)
            self.shield_energy = min(self.shield_energy_max, self.shield_energy + regen_rate)
        return projectile

    def register_hit(self):
        if self.god_mode:
            return True
        self.invuln_timer = max(self.invuln_timer, 30)
        self.damage_buffer += 1
        if self.damage_buffer >= 2:
            self.health_bars -= 1
            self.damage_buffer = 0
        return self.health_bars > 0

class Level:
    def __init__(self, layout):
        self.tiles = pygame.sprite.Group()
        self.spikes = pygame.sprite.Group()
        self.collectibles = pygame.sprite.Group()
        self.goal = pygame.sprite.GroupSingle()
        self.teleporters = pygame.sprite.Group()
        self.enemies = pygame.sprite.Group()
        self.hover_enemies = pygame.sprite.Group()
        self.boosters = pygame.sprite.Group()
        self.moving_platforms = pygame.sprite.Group()
        self.lasers = pygame.sprite.Group()
        self.shields = pygame.sprite.Group()
        self.player_start = Vector2(100, 100)
        self.boss = None

        for row_idx, row in enumerate(layout):
            for col_idx, cell in enumerate(row):
                pos = Vector2(col_idx * TILE, row_idx * TILE)
                if cell == '#':
                    self.tiles.add(Tile(pos))
                elif cell == 'P':
                    self.player_start = pos
                elif cell == 'G':
                    self.goal.add(Goal(pos))
                    self.teleporters.add(Teleporter(pos))
                elif cell == 'C':
                    self.collectibles.add(Collectible(pos))
                elif cell == 'S':
                    self.shields.add(ShieldPickup(pos))
                elif cell == 'E':
                    self.enemies.add(Enemy(pos))
                elif cell == 'H':
                    self.hover_enemies.add(HoverEnemy(pos))
                elif cell == '^':
                    self.spikes.add(Spike(pos))
                elif cell == 'B':
                    self.boosters.add(Booster(pos))
                elif cell == 'M':
                    self.moving_platforms.add(MovingPlatform(pos, axis="x"))
                elif cell == 'V':
                    self.moving_platforms.add(MovingPlatform(pos, axis="y"))
                elif cell == 'L':
                    self.lasers.add(LaserBarrier(pos))
                elif cell == 'T':
                    self.teleporters.add(Teleporter(pos))
                elif cell == 'K':
                    self.boss = Boss(pos)

class Game:
    def __init__(self):
        self.audio_enabled = False
        pygame.init()
        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2)
            self.audio_enabled = True
        except pygame.error:
            self.audio_enabled = False
        pygame.display.set_caption("Python Platformer - 10 Levels")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("arial", 24)
        self.big_font = pygame.font.SysFont("arial", 42, bold=True)

        self.shoot_sound = None
        self.enemy_shoot_sound = None
        self.boss_volley_sound = None
        self.pickup_sound = None
        if self.audio_enabled:
            self.build_sounds()

        self.levels = [Level(layout) for layout in load_levels()]
        self.level_index = 0
        self.god_mode = False
        self.player = Player(self.levels[self.level_index].player_start, god_mode=self.god_mode)
        self.player_projectiles = pygame.sprite.Group()
        self.hazard_projectiles = pygame.sprite.Group()
        self.wave_enemies = pygame.sprite.Group()
        self.trail = []
        self.state = "menu"
        self.selected_level = 0
        self.transitioning = False
        self.stars = [
            {
                "pos": Vector2(random.randint(0, WIDTH), random.randint(0, HEIGHT)),
                "radius": random.randint(1, 3),
                "speed": random.uniform(0.15, 0.6),
                "twinkle": random.uniform(0.5, 1.0),
            }
            for _ in range(80)
        ]
        self.boss_music_path = self.find_boss_music()
        self.celebration_music_path = self.find_celebration_music()
        self.reset_level_state()

    def build_sounds(self):
        sample_rate = 44100

        def tone(freq, duration_ms=160, volume=0.35):
            length = int(sample_rate * duration_ms / 1000)
            buf = array.array("h")
            for i in range(length):
                value = int(volume * 32767 * math.sin(2 * math.pi * freq * (i / sample_rate)))
                buf.append(value)
            return pygame.mixer.Sound(buffer=buf.tobytes())

        self.shoot_sound = tone(520, 120, 0.28)
        self.enemy_shoot_sound = tone(300, 140, 0.22)
        self.boss_volley_sound = tone(140, 200, 0.35)
        self.pickup_sound = tone(760, 120, 0.3)

    def play_sound(self, sound):
        if self.audio_enabled and sound:
            try:
                sound.play()
            except pygame.error:
                pass

    def find_boss_music(self):
        base = Path(__file__).parent
        preferred = base / "FFVII_Battle_ThemeV2.mp3"
        if preferred.exists():
            return str(preferred)
        for ext in (".ogg", ".mp3", ".wav"):
            for candidate in base.glob(f"*boss*{ext}"):
                return str(candidate)
        return None

    def find_celebration_music(self):
        base = Path(__file__).parent
        preferred = base / "What we Do Here is Go Back - Otis McDonald.mp3"
        if preferred.exists():
            return str(preferred)
        for ext in (".ogg", ".mp3", ".wav"):
            for candidate in base.glob(f"*celebration*{ext}"):
                return str(candidate)
        return None

    def reset_level_state(self):
        level = self.levels[self.level_index]
        self.player.rect.topleft = level.player_start
        self.player.velocity = Vector2(0, 0)
        self.player.collected = 0
        self.player.god_mode = self.god_mode
        self.player.health_bars = self.player.max_health_bars
        self.player.damage_buffer = 0
        self.player.shield_time = 0
        self.player.shield_energy = self.player.shield_energy_max
        self.player.shield_break_timer = 0
        self.player.shield_regen_delay = 0
        self.player.shielding = False
        self.player.auto_walk_right = False
        self.player_projectiles.empty()
        self.hazard_projectiles.empty()
        self.wave_enemies.empty()
        self.boss_defeated = False
        self.boss_exit_timer = 0
        self.fire_mode = False
        self.player_dancing = False
        self.celebration_timer = 0
        self.wave_spawned = False
        self.epilogue_ready = False
        self.allow_exit = self.level_index < len(self.levels) - 1
        self.celebration_music_started = False
        # Deep copy collectibles to allow replaying levels
        layout_copy = load_levels()[self.level_index]
        self.levels[self.level_index] = Level(layout_copy)
        self.player.rect.topleft = self.levels[self.level_index].player_start
        if self.audio_enabled:
            if self.level_index == len(self.levels) - 1:
                if self.boss_music_path:
                    try:
                        pygame.mixer.music.load(self.boss_music_path)
                        pygame.mixer.music.play(-1)
                    except pygame.error:
                        pass
            else:
                pygame.mixer.music.stop()
        self.transitioning = False

    def draw_background(self):
        if self.fire_mode:
            draw_gradient_rect(self.screen, (90, 20, 10), (180, 60, 20), Rect(0, 0, WIDTH, HEIGHT))
            for _ in range(10):
                flicker_x = random.randint(0, WIDTH)
                flicker_y = random.randint(0, HEIGHT // 2)
                size = random.randint(40, 120)
                flame = Surface((size, size), pygame.SRCALPHA)
                pygame.draw.circle(flame, (255, 140, 60, 80), (size // 2, size // 2), size // 2)
                self.screen.blit(flame, (flicker_x, flicker_y))
        else:
            draw_gradient_rect(self.screen, (15, 18, 45), (35, 45, 80), Rect(0, 0, WIDTH, HEIGHT))
            for star in self.stars:
                star["pos"].x -= star["speed"]
                if star["pos"].x < 0:
                    star["pos"].x = WIDTH
                    star["pos"].y = random.randint(0, HEIGHT)
                twinkle = 150 + int(80 * abs(pygame.time.get_ticks() % 1200 - 600) / 600)
                color = (twinkle, twinkle, 255)
                pygame.draw.circle(self.screen, color, (int(star["pos"].x), int(star["pos"].y)), star["radius"])
            parallax_color = (60, 80, 130)
            for i in range(6):
                pygame.draw.polygon(
                    self.screen,
                    (parallax_color[0], parallax_color[1], parallax_color[2] + i * 4),
                    [
                        (i * 180 - 120, HEIGHT - 200 + i * 10),
                        (i * 180 + 80, HEIGHT - 260 + i * 8),
                        (i * 180 + 200, HEIGHT - 200 + i * 10),
                    ],
                    0,
                )

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                self.reset_level_state()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                self.state = "menu"

    def trigger_finale(self, level):
        self.boss_defeated = True
        self.boss_exit_timer = 0
        self.allow_exit = False
        if level.boss:
            level.boss.start_death()
        self.hazard_projectiles.empty()
        if self.audio_enabled:
            pygame.mixer.music.stop()

    def start_celebration_music(self):
        if self.audio_enabled and self.celebration_music_path and not self.celebration_music_started:
            try:
                pygame.mixer.music.load(self.celebration_music_path)
                pygame.mixer.music.play(-1)
                self.celebration_music_started = True
            except pygame.error:
                pass

    def stop_music(self):
        if self.audio_enabled:
            try:
                pygame.mixer.music.stop()
            except pygame.error:
                pass

    def spawn_wave_enemies(self, level):
        floor_top = min(tile.rect.top for tile in level.tiles) if level.tiles else HEIGHT - TILE * 2
        base_y = floor_top - int(TILE * 0.9)
        positions = [120, 260, 420, 580, 740]
        for x in positions:
            self.wave_enemies.add(GroundShooter((x, base_y)))

    def handle_finale_sequence(self, level):
        self.boss_exit_timer += 1
        if self.boss_exit_timer == 90:
            if level.boss:
                level.boss.kill()
                level.boss = None
            self.fire_mode = True
        if self.boss_exit_timer >= 90:
            self.player_dancing = self.celebration_timer < 3600 and not self.wave_spawned
            self.start_celebration_music()
            self.celebration_timer += 1
            if self.celebration_timer >= 3600 and not self.wave_spawned:
                self.wave_spawned = True
                self.player_dancing = False
                self.stop_music()
                self.spawn_wave_enemies(level)

        if self.wave_spawned and not self.epilogue_ready and len(self.wave_enemies) == 0:
            self.epilogue_ready = True
            self.allow_exit = True
            self.player.auto_walk_right = True

    def update_player_state(self, level):
        level.moving_platforms.update()
        level.lasers.update()
        collision_tiles = list(level.tiles) + list(level.moving_platforms)
        level.enemies.update(collision_tiles)
        level.hover_enemies.update(collision_tiles, self.hazard_projectiles, self.play_sound, self.enemy_shoot_sound)
        self.wave_enemies.update(collision_tiles, self.hazard_projectiles, self.play_sound, self.enemy_shoot_sound, self.player)
        player_projectile = self.player.update(collision_tiles)
        if player_projectile:
            self.player_projectiles.add(player_projectile)
            self.play_sound(self.shoot_sound)

        self.player_projectiles.update()
        self.hazard_projectiles.update()

        speed = abs(self.player.velocity.x) + abs(self.player.velocity.y)
        if speed > 2:
            self.trail.append({"pos": self.player.rect.center, "life": 18})
        for particle in self.trail:
            particle["life"] -= 1
        self.trail = [p for p in self.trail if p["life"] > 0]

        # Collectibles
        collected = pygame.sprite.spritecollide(self.player, level.collectibles, dokill=True)
        self.player.collected += len(collected)
        if collected:
            self.play_sound(self.pickup_sound)

        shield_pickups = pygame.sprite.spritecollide(self.player, level.shields, dokill=True)
        if shield_pickups:
            self.player.shield_time = 900
            self.player.shield_energy = self.player.shield_energy_max
            self.player.shield_break_timer = 0
            self.player.shield_regen_delay = 0
            self.play_sound(self.pickup_sound)

        # Boosters
        if pygame.sprite.spritecollideany(self.player, level.boosters):
            self.player.velocity.y = JUMP_FORCE * 1.2
            self.player.on_ground = False

        # Hazards and enemies
        laser_hit = any(laser.active and laser.rect.colliderect(self.player.rect) for laser in level.lasers)
        hurtful = (
            pygame.sprite.spritecollideany(self.player, level.spikes)
            or pygame.sprite.spritecollideany(self.player, level.enemies)
            or pygame.sprite.spritecollideany(self.player, level.hover_enemies)
            or pygame.sprite.spritecollideany(self.player, self.wave_enemies)
            or pygame.sprite.spritecollideany(self.player, self.hazard_projectiles)
            or laser_hit
        )
        if self.god_mode:
            hurtful = False
        if hurtful:
            if self.player.absorb_hit():
                return
            alive = self.player.register_hit()
            if not alive:
                self.reset_level_state()
            return

        # Boss logic
        if level.boss:
            level.boss.update(collision_tiles, self.player, self.hazard_projectiles, self.boss_volley_sound, self.play_sound)
            if pygame.sprite.collide_rect(self.player, level.boss) and not self.god_mode:
                alive = self.player.register_hit()
                if not alive:
                    self.reset_level_state()
                return
            boss_hits = pygame.sprite.spritecollide(level.boss, self.player_projectiles, dokill=True)
            if boss_hits:
                level.boss.take_hit()
                self.play_sound(self.enemy_shoot_sound)
            if level.boss.health <= 0:
                if self.level_index == len(self.levels) - 1:
                    self.trigger_finale(level)
                else:
                    self.advance_level()
                return

        if self.boss_defeated:
            self.handle_finale_sequence(level)

        # Player shots damage enemies
        pygame.sprite.groupcollide(self.player_projectiles, level.enemies, True, True)
        pygame.sprite.groupcollide(self.player_projectiles, level.hover_enemies, True, True)
        pygame.sprite.groupcollide(self.player_projectiles, self.wave_enemies, True, True)

        # Goal (inactive while boss lives)
        if level.boss and level.boss.health > 0:
            return

        reached_exit = False
        for teleporter in level.teleporters:
            if teleporter.rect.inflate(10, 10).colliderect(self.player.rect):
                reached_exit = True
                break
        if not reached_exit and level.goal:
            goal_sprite = level.goal.sprite
            if goal_sprite and goal_sprite.rect.inflate(12, 12).colliderect(self.player.rect):
                reached_exit = True

        if reached_exit and self.allow_exit:
            self.advance_level()

    def advance_level(self):
        if self.transitioning:
            return
        self.transitioning = True
        if self.level_index < len(self.levels) - 1:
            self.level_index += 1
            self.reset_level_state()
        else:
            self.show_victory_screen()
        self.transitioning = False

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
        level.moving_platforms.draw(self.screen)
        level.collectibles.draw(self.screen)
        level.shields.draw(self.screen)
        level.teleporters.draw(self.screen)
        level.goal.draw(self.screen)
        level.enemies.draw(self.screen)
        level.hover_enemies.draw(self.screen)
        level.boosters.draw(self.screen)
        level.lasers.draw(self.screen)
        self.wave_enemies.draw(self.screen)
        for particle in self.trail:
            alpha = max(40, particle["life"] * 7)
            radius = max(4, particle["life"] // 2)
            glow = Surface((radius * 2, radius * 2), pygame.SRCALPHA)
            pygame.draw.circle(glow, (120, 180, 255, alpha), (radius, radius), radius)
            pygame.draw.circle(glow, (255, 255, 255, alpha), (radius, radius), radius // 2)
            pos = (particle["pos"][0] - radius, particle["pos"][1] - radius)
            self.screen.blit(glow, pos)
        self.player_projectiles.draw(self.screen)
        self.hazard_projectiles.draw(self.screen)
        if level.boss:
            self.screen.blit(level.boss.image, level.boss.rect)
        if self.fire_mode:
            flame = Surface((WIDTH, TILE * 2), pygame.SRCALPHA)
            for i in range(10):
                start_x = i * 120 + random.randint(-20, 20)
                flame_height = random.randint(60, 140)
                pygame.draw.polygon(
                    flame,
                    (255, 120, 60, 120),
                    [
                        (start_x, TILE * 2),
                        (start_x + 80, TILE * 2),
                        (start_x + 40, TILE * 2 - flame_height),
                    ],
                )
            self.screen.blit(flame, (0, HEIGHT - TILE * 2))
        if self.player.shield_time > 0 or self.player.invuln_timer > 0:
            aura_size = TILE * 1.4
            aura = Surface((aura_size, aura_size), pygame.SRCALPHA)
            alpha = 160 if self.player.shield_time > 0 else 90
            pygame.draw.circle(aura, (120, 220, 255, alpha), (aura_size // 2, aura_size // 2), aura_size // 2)
            rect = aura.get_rect(center=self.player.rect.center)
            self.screen.blit(aura, rect)
        if self.player_dancing:
            angle = math.sin(pygame.time.get_ticks() / 180) * 14
            rotated = pygame.transform.rotate(self.player.image, angle)
            rect = rotated.get_rect(center=self.player.rect.center)
            self.screen.blit(rotated, rect)
        else:
            self.screen.blit(self.player.image, self.player.rect)

    def draw_hud(self, level):
        info = f"Level {self.level_index + 1}/10 | Gems: {self.player.collected}" \
               f" | Reset: R | Quit: ESC"
        text_surface = self.font.render(info, True, (240, 240, 240))
        self.screen.blit(text_surface, (20, 20))
        guide = self.font.render("Move: A/D or ←/→, Jump: W/SPACE/↑, Shoot: E, Shield: F", True, (200, 200, 220))
        self.screen.blit(guide, (20, 50))

        shield_bar_back = pygame.Rect(20, 80, 220, 16)
        pygame.draw.rect(self.screen, (40, 60, 90), shield_bar_back, border_radius=6)
        shield_ratio = self.player.shield_energy / self.player.shield_energy_max
        shield_bar = pygame.Rect(20, 80, int(220 * shield_ratio), 16)
        color = (120, 230, 255) if self.player.shielding else (80, 160, 220)
        pygame.draw.rect(self.screen, color, shield_bar, border_radius=6)
        pygame.draw.rect(self.screen, (210, 230, 255), shield_bar_back, 2, border_radius=6)
        shield_label = "Shielding" if self.player.shielding else "Shield"
        if self.player.shield_break_timer > 0:
            shield_label = "Shield broken"
        elif self.player.invuln_timer > 0:
            shield_label = "Shield recovering"
        shield_text = self.font.render(f"{shield_label} (F)", True, (200, 230, 255))
        self.screen.blit(shield_text, (20, 60))

        health_text = self.font.render("Health", True, (255, 210, 210))
        self.screen.blit(health_text, (20, 102))
        for i in range(self.player.max_health_bars):
            bar_rect = pygame.Rect(20 + i * 46, 122, 40, 14)
            pygame.draw.rect(self.screen, (70, 40, 40), bar_rect, border_radius=4)
            fill_ratio = 0
            if i < self.player.health_bars:
                fill_ratio = 1
            elif i == self.player.health_bars and self.player.damage_buffer > 0:
                fill_ratio = 0.5
            if fill_ratio > 0:
                fill_rect = pygame.Rect(bar_rect.x, bar_rect.y, int(bar_rect.width * fill_ratio), bar_rect.height)
                pygame.draw.rect(self.screen, (220, 100, 100), fill_rect, border_radius=4)
            pygame.draw.rect(self.screen, (255, 200, 200), bar_rect, 2, border_radius=4)

        if level.boss:
            health_text = self.font.render(f"Boss HP: {level.boss.health}", True, (255, 160, 200))
            self.screen.blit(health_text, (WIDTH - 220, 20))
        if self.player_dancing:
            dance_text = self.font.render("Celebration: dancing!", True, (255, 210, 120))
            self.screen.blit(dance_text, (WIDTH - 260, 50))
        if self.wave_spawned and not self.epilogue_ready:
            wave_text = self.font.render("Defeat the encore attackers!", True, (255, 200, 200))
            self.screen.blit(wave_text, (WIDTH - 330, 80))
        if self.epilogue_ready:
            soon = self.font.render("Walk right: Level 11 / Chapter 2 coming soon", True, (200, 255, 200))
            self.screen.blit(soon, (WIDTH // 2 - soon.get_width() // 2, HEIGHT - 40))
        if self.god_mode:
            gm = self.font.render("GOD MODE ENABLED", True, (255, 230, 140))
            self.screen.blit(gm, (WIDTH - gm.get_width() - 20, HEIGHT - 40))

    def run(self):
        while True:
            self.clock.tick(FPS)
            if self.state == "menu":
                self.handle_menu_events()
                self.draw_background()
                self.draw_menu()
            elif self.state == "owner_menu":
                self.handle_owner_menu_events()
                self.draw_background()
                self.draw_owner_menu()
            elif self.state == "level_select":
                self.handle_level_select_events()
                self.draw_background()
                self.draw_level_select()
            else:
                self.handle_events()
                level = self.levels[self.level_index]
                self.update_player_state(level)

                self.draw_background()
                self.draw_level(level)
                self.draw_hud(level)

            pygame.display.flip()

    def handle_menu_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    self.start_level(self.level_index)
                elif event.key == pygame.K_l:
                    self.state = "level_select"
                elif event.key == pygame.K_o:
                    self.state = "owner_menu"
                elif event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

    def draw_menu(self):
        title = self.big_font.render("Python Platformer", True, (245, 245, 255))
        subtitle = self.font.render("10 handcrafted levels | Shields, lasers, boss fight", True, (210, 220, 240))
        prompt = self.font.render("Press ENTER to play, L to choose a level, ESC to quit", True, (200, 255, 200))
        owner_prompt = self.font.render("Press O for owner tools (testing)", True, (255, 200, 200))
        self.screen.blit(title, title.get_rect(center=(WIDTH // 2, HEIGHT // 3)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 50)))
        self.screen.blit(prompt, prompt.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 100)))
        self.screen.blit(owner_prompt, owner_prompt.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 140)))

    def handle_owner_menu_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_1:
                    self.god_mode = not self.god_mode
                    self.player.god_mode = self.god_mode
                elif event.key in (pygame.K_ESCAPE, pygame.K_BACKSPACE):
                    self.state = "menu"
                elif event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    self.state = "menu"

    def draw_owner_menu(self):
        title = self.big_font.render("Owner Menu", True, (255, 220, 220))
        hint = self.font.render("Testing utilities (not for players)", True, (230, 200, 200))
        god_status = "ON" if self.god_mode else "OFF"
        god_color = (170, 255, 170) if self.god_mode else (255, 180, 180)
        option = self.font.render(f"1) God Mode: {god_status}", True, god_color)
        close = self.font.render("ENTER/ESC to return", True, (210, 220, 240))
        self.screen.blit(title, title.get_rect(center=(WIDTH // 2, HEIGHT // 3)))
        self.screen.blit(hint, hint.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 40)))
        self.screen.blit(option, option.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 90)))
        self.screen.blit(close, close.get_rect(center=(WIDTH // 2, HEIGHT // 3 + 140)))

    def handle_level_select_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if pygame.K_1 <= event.key <= pygame.K_9:
                    self.selected_level = event.key - pygame.K_1
                elif event.key == pygame.K_0:
                    self.selected_level = 9
                elif event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    self.start_level(self.selected_level)
                elif event.key in (pygame.K_LEFT, pygame.K_a):
                    self.selected_level = (self.selected_level - 1) % len(self.levels)
                elif event.key in (pygame.K_RIGHT, pygame.K_d):
                    self.selected_level = (self.selected_level + 1) % len(self.levels)
                elif event.key in (pygame.K_UP, pygame.K_w):
                    self.selected_level = (self.selected_level - 5) % len(self.levels)
                elif event.key in (pygame.K_DOWN, pygame.K_s):
                    self.selected_level = (self.selected_level + 5) % len(self.levels)
                elif event.key == pygame.K_ESCAPE:
                    self.state = "menu"

    def draw_level_select(self):
        title = self.big_font.render("Select a level", True, (240, 255, 240))
        self.screen.blit(title, title.get_rect(center=(WIDTH // 2, 70)))
        grid_cols = 5
        spacing_x = WIDTH // (grid_cols + 1)
        spacing_y = 100
        start_y = 170
        for idx in range(len(self.levels)):
            row = idx // grid_cols
            col = idx % grid_cols
            pos = (spacing_x + col * spacing_x, start_y + row * spacing_y)
            label = f"Level {idx + 1}"
            color = (120, 255, 170) if idx == self.selected_level else (210, 220, 230)
            box = pygame.Surface((150, 60), pygame.SRCALPHA)
            pygame.draw.rect(box, (40, 60, 90, 180), box.get_rect(), border_radius=12)
            pygame.draw.rect(box, (color[0], color[1], color[2], 200), box.get_rect(), 3, border_radius=12)
            text = self.font.render(label, True, color)
            box.blit(text, text.get_rect(center=(75, 30)))
            self.screen.blit(box, box.get_rect(center=pos))

        hint = self.font.render("Use arrows/wasd or 1-0 keys. Enter to load.", True, (200, 220, 240))
        self.screen.blit(hint, hint.get_rect(center=(WIDTH // 2, HEIGHT - 60)))

    def start_level(self, index):
        self.level_index = max(0, min(index, len(self.levels) - 1))
        self.reset_level_state()
        self.state = "playing"


if __name__ == "__main__":
    Game().run()
