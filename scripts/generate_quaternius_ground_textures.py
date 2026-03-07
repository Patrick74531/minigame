#!/usr/bin/env python3

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_GRASS = ROOT / "third_party" / "quaternius-ultimate-stylized-nature" / "Grass.png"
SOURCE_ROCKS = ROOT / "third_party" / "quaternius-ultimate-stylized-nature" / "Rocks.png"
OUTPUT_GRASS = ROOT / "assets" / "resources" / "floor" / "grass.webp"
OUTPUT_DIRT = ROOT / "assets" / "resources" / "floor" / "Dirt_02.webp"

SIZE = 1024
SEED = 20260307


def wrap_noise(u: float, v: float, phases: tuple[float, ...]) -> float:
    # Periodic harmonic field so the generated texture tiles cleanly.
    a0, a1, a2, a3, a4, a5 = phases
    value = 0.0
    value += math.sin((u * 1.0 + a0) * math.tau) * 0.55
    value += math.cos((v * 1.0 + a1) * math.tau) * 0.45
    value += math.sin((u * 2.0 + v * 1.0 + a2) * math.tau) * 0.28
    value += math.cos((u * 1.0 - v * 2.0 + a3) * math.tau) * 0.22
    value += math.sin((u * 4.0 + a4) * math.tau) * 0.12
    value += math.cos((v * 4.0 + a5) * math.tau) * 0.10
    return value


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def fract(value: float) -> float:
    return value - math.floor(value)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def lerp_color(
    a: tuple[int, int, int],
    b: tuple[int, int, int],
    t: float,
) -> tuple[float, float, float]:
    return (
        lerp(a[0], b[0], t),
        lerp(a[1], b[1], t),
        lerp(a[2], b[2], t),
    )


def luminance(color: tuple[int, int, int] | tuple[float, float, float]) -> float:
    return (color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114) / 255.0


def hash_grid(ix: int, iy: int, seed: float) -> float:
    return fract(math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123)


def tiled_value_noise(u: float, v: float, period: int, seed: float) -> float:
    x = u * period
    y = v * period
    ix = math.floor(x)
    iy = math.floor(y)
    fx = x - ix
    fy = y - iy

    x0 = ix % period
    y0 = iy % period
    x1 = (ix + 1) % period
    y1 = (iy + 1) % period

    a = hash_grid(x0, y0, seed)
    b = hash_grid(x1, y0, seed)
    c = hash_grid(x0, y1, seed)
    d = hash_grid(x1, y1, seed)

    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy)


def sample_source(
    src_px,
    src_w: int,
    src_h: int,
    u: float,
    v: float,
    phases: tuple[float, ...],
    center_u: float,
    center_v: float,
    amp_u: float,
    amp_v: float,
) -> tuple[int, int, int]:
    sample_u = clamp01(center_u + wrap_noise(u, v, phases) * amp_u)
    sample_v = clamp01(center_v + wrap_noise(v, u, phases[::-1]) * amp_v)
    sx = min(src_w - 1, int(sample_u * (src_w - 1)))
    sy = min(src_h - 1, int(sample_v * (src_h - 1)))
    return src_px[sx, sy]


def apply_soft_overlay(
    base: Image.Image,
    circles: list[tuple[float, float, float, tuple[int, int, int, int]]],
    blur_radius: float,
) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    overlay_px = overlay.load()
    size = base.size[0]

    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            rr = gg = bb = aa = 0.0
            for cx, cy, radius, color in circles:
                dx = min(abs(u - cx), 1.0 - abs(u - cx))
                dy = min(abs(v - cy), 1.0 - abs(v - cy))
                dist = math.hypot(dx, dy)
                if dist >= radius:
                    continue
                falloff = 1.0 - (dist / radius)
                weight = falloff * falloff
                rr += color[0] * weight
                gg += color[1] * weight
                bb += color[2] * weight
                aa += color[3] * weight

            if aa > 0.0:
                overlay_px[x, y] = (
                    int(max(0, min(255, rr))),
                    int(max(0, min(255, gg))),
                    int(max(0, min(255, bb))),
                    int(max(0, min(255, aa))),
                )

    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def build_grass_texture(grass_src: Image.Image, rng: random.Random) -> Image.Image:
    src_w, src_h = grass_src.size
    src_px = grass_src.load()
    out = Image.new("RGB", (SIZE, SIZE))
    px = out.load()

    phases_a = tuple(rng.random() for _ in range(6))
    phases_b = tuple(rng.random() for _ in range(6))
    phases_c = tuple(rng.random() for _ in range(6))
    phases_patch = tuple(rng.random() for _ in range(6))
    phases_tint = tuple(rng.random() for _ in range(6))
    phases_detail_mid = tuple(rng.random() for _ in range(6))
    phases_detail_fine = tuple(rng.random() for _ in range(6))

    for y in range(SIZE):
        v = y / SIZE
        for x in range(SIZE):
            u = x / SIZE

            base_a = sample_source(src_px, src_w, src_h, u, v, phases_a, 0.50, 0.58, 0.22, 0.17)
            base_b = sample_source(src_px, src_w, src_h, u, v, phases_b, 0.46, 0.48, 0.10, 0.12)
            base_c = sample_source(src_px, src_w, src_h, u, v, phases_c, 0.58, 0.38, 0.08, 0.09)

            mix_r = base_a[0] * 0.60 + base_b[0] * 0.27 + base_c[0] * 0.13
            mix_g = base_a[1] * 0.60 + base_b[1] * 0.27 + base_c[1] * 0.13
            mix_b = base_a[2] * 0.60 + base_b[2] * 0.27 + base_c[2] * 0.13

            patch = clamp01(0.5 + wrap_noise(u, v, phases_patch) * 0.52)
            tint_shift = wrap_noise(u, v, phases_tint)
            detail_mid = clamp01(0.5 + wrap_noise(u * 5.0, v * 5.0, phases_detail_mid) * 0.18)
            detail_fine = clamp01(
                0.5 + wrap_noise(u * 12.0, v * 12.0, phases_detail_fine) * 0.14
            )
            grain_mid = tiled_value_noise(u, v, 17, 1.37)
            grain_fine = tiled_value_noise(u, v, 37, 2.41)
            sparkle = smoothstep(0.76, 0.96, grain_fine)
            shadow_noise = smoothstep(0.62, 0.88, grain_mid)
            brightness = 0.91 + patch * 0.12 + detail_mid * 0.03 + grain_mid * 0.025

            r = mix_r * brightness * (0.972 + tint_shift * 0.018 + detail_fine * 0.012)
            g = mix_g * brightness * (
                0.992 + patch * 0.026 + detail_mid * 0.02 + sparkle * 0.016
            )
            b = mix_b * brightness * (0.934 - tint_shift * 0.012 + detail_fine * 0.008)
            r *= 0.994 - shadow_noise * 0.014
            g *= 0.998 - shadow_noise * 0.008
            b *= 0.992 - shadow_noise * 0.016

            px[x, y] = (
                int(max(0, min(255, r))),
                int(max(0, min(255, g))),
                int(max(0, min(255, b))),
            )

    circles: list[tuple[float, float, float, tuple[int, int, int, int]]] = []
    for _ in range(104):
        circles.append(
            (
                rng.random(),
                rng.random(),
                rng.uniform(0.018, 0.058),
                rng.choice(
                    (
                        (126, 146, 56, 9),
                        (66, 84, 26, 8),
                        (96, 118, 42, 7),
                        (146, 156, 74, 6),
                    )
                ),
            )
        )

    out = apply_soft_overlay(out, circles, blur_radius=4.8)
    return out.filter(ImageFilter.UnsharpMask(radius=0.9, percent=140, threshold=2))


def build_dirt_texture(
    grass_src: Image.Image,
    rocks_src: Image.Image,
    rng: random.Random,
) -> Image.Image:
    grass_src = grass_src.resize((768, 768), Image.Resampling.LANCZOS)
    rocks_src = (
        rocks_src.resize((192, 192), Image.Resampling.LANCZOS)
        .filter(ImageFilter.GaussianBlur(radius=7))
        .resize((768, 768), Image.Resampling.BICUBIC)
    )

    grass_w, grass_h = grass_src.size
    rocks_w, rocks_h = rocks_src.size
    grass_px = grass_src.load()
    rocks_px = rocks_src.load()

    out = Image.new("RGB", (SIZE, SIZE))
    px = out.load()

    phases_grass = tuple(rng.random() for _ in range(6))
    phases_rock = tuple(rng.random() for _ in range(6))
    phases_patch = tuple(rng.random() for _ in range(6))
    phases_grain = tuple(rng.random() for _ in range(6))
    phases_grain_mid = tuple(rng.random() for _ in range(6))
    phases_grain_fine = tuple(rng.random() for _ in range(6))
    phases_pebbles = tuple(rng.random() for _ in range(6))

    dark = (88, 67, 41)
    mid = (122, 96, 58)
    light = (158, 130, 82)

    for y in range(SIZE):
        v = y / SIZE
        for x in range(SIZE):
            u = x / SIZE

            grass_sample = sample_source(
                grass_px, grass_w, grass_h, u, v, phases_grass, 0.53, 0.58, 0.16, 0.13
            )
            rock_sample = sample_source(
                rocks_px, rocks_w, rocks_h, u, v, phases_rock, 0.50, 0.50, 0.26, 0.24
            )

            soil_value = luminance(grass_sample) * 0.42 + luminance(rock_sample) * 0.58
            patch = clamp01(0.5 + wrap_noise(u, v, phases_patch) * 0.44)
            grain = wrap_noise(u, v, phases_grain) * 0.08
            grain_mid = clamp01(0.5 + wrap_noise(u * 7.0, v * 7.0, phases_grain_mid) * 0.2)
            grain_fine = clamp01(0.5 + wrap_noise(u * 18.0, v * 18.0, phases_grain_fine) * 0.16)
            pebbles = clamp01(0.5 + wrap_noise(u * 25.0, v * 25.0, phases_pebbles) * 0.24)

            base_a = lerp_color(dark, mid, clamp01(soil_value * 1.18))
            base_b = lerp_color(mid, light, clamp01(soil_value * 1.05 + patch * 0.22))
            warm_mix = clamp01(0.34 + patch * 0.48)
            rr = lerp(base_a[0], base_b[0], warm_mix)
            gg = lerp(base_a[1], base_b[1], warm_mix)
            bb = lerp(base_a[2], base_b[2], warm_mix)

            stone = luminance(rock_sample)
            rr *= 0.93 + stone * 0.08 + grain_mid * 0.08 + grain
            gg *= 0.93 + stone * 0.06 + grain_mid * 0.06 + grain * 0.65
            bb *= 0.91 + stone * 0.05 + grain_fine * 0.05

            grit = max(0.0, (pebbles - 0.72) / 0.28)
            rr = lerp(rr, rr * 0.84 + 22, grit * 0.2)
            gg = lerp(gg, gg * 0.86 + 22, grit * 0.18)
            bb = lerp(bb, bb * 0.91 + 24, grit * 0.16)

            px[x, y] = (
                int(max(0, min(255, rr))),
                int(max(0, min(255, gg))),
                int(max(0, min(255, bb))),
            )

    circles: list[tuple[float, float, float, tuple[int, int, int, int]]] = []
    for _ in range(76):
        circles.append(
            (
                rng.random(),
                rng.random(),
                rng.uniform(0.02, 0.07),
                rng.choice(
                    (
                        (76, 57, 34, 8),
                        (148, 120, 74, 6),
                        (108, 86, 52, 7),
                        (132, 109, 66, 5),
                    )
                ),
            )
        )

    out = apply_soft_overlay(out, circles, blur_radius=4.4)
    return out.filter(ImageFilter.UnsharpMask(radius=0.75, percent=120, threshold=2))


def save_webp(image: Image.Image, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="WEBP", quality=90, method=6)


def main() -> None:
    if not SOURCE_GRASS.exists():
        raise SystemExit(f"Missing source texture: {SOURCE_GRASS}")
    if not SOURCE_ROCKS.exists():
        raise SystemExit(f"Missing source texture: {SOURCE_ROCKS}")

    rng = random.Random(SEED)
    grass_src = Image.open(SOURCE_GRASS).convert("RGB")
    rocks_src = Image.open(SOURCE_ROCKS).convert("RGB")

    grass = build_grass_texture(grass_src, rng)
    dirt = build_dirt_texture(grass_src, rocks_src, rng)

    save_webp(grass, OUTPUT_GRASS)
    save_webp(dirt, OUTPUT_DIRT)

    print(f"wrote {OUTPUT_GRASS}")
    print(f"wrote {OUTPUT_DIRT}")


if __name__ == "__main__":
    main()
