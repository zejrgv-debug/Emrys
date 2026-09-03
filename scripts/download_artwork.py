"""Download and normalize Emrys game artwork from the catalog's source URLs."""

from __future__ import annotations

import io
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "random" / "gamelayout.js"
ASSETS = ROOT / "src" / "assets" / "games"
NODE = Path(r"C:\Users\zejr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")

# Correct weak or mismatched legacy sources with official Steam CDN assets.
STEAM_OVERRIDES = {
    "999": "2381590",       # Only Up!
    "998": "3164500",       # Schedule I
    "970": "1659420",       # Uncharted: Legacy of Thieves Collection
    "975": "3008670",       # Poppy Playtime - Chapter 4
    "1002": "2161730",      # The First Berserker: Khazan
    "1001": "1569580",      # Blue Prince
    "980": "2903560",       # Platform 8
    "958": "2555190",       # Poppy Playtime - Chapter 3
    "512": "201870",        # Assassin's Creed Revelations
    "390": "976730",        # Halo: The Master Chief Collection / Reach
    "301": "1672970",       # Minecraft Dungeons
    "990": "2456740",       # inZOI
    "989": "2407270",       # AI LIMIT
    "982": "1987080",       # Inside the Backrooms
    "96": "601050",         # Attack on Titan 2
    "50": "425220",         # One Piece: Burning Blood
    "1013": "1903340",      # Clair Obscur: Expedition 33
    "602": "1414850",       # Catalog entry uses Nickelodeon All-Star Brawl art
    "1011": "3604030",      # Wolf Mate
}


def slugify(value: str) -> str:
    value = value.lower().replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def load_games() -> list[dict]:
    helper = ROOT / "scripts" / "export_games.cjs"
    result = subprocess.run([str(NODE), str(helper)], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def source_urls(game: dict) -> tuple[str, str]:
    steam_id = STEAM_OVERRIDES.get(str(game["id"]))
    if steam_id:
        root = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{steam_id}"
        return f"{root}/library_600x900.jpg", f"{root}/library_hero.jpg"
    return game["img"], game["bg"]


def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 EmrysArtwork/1.0", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"})
    with urlopen(req, timeout=30) as response:
        return response.read()


def save_webp(payload: bytes, destination: Path, size: tuple[int, int], quality: int) -> None:
    with Image.open(io.BytesIO(payload)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=quality, method=6)


def process(game: dict) -> dict:
    folder = ASSETS / slugify(game["n"])
    cover_url, hero_url = source_urls(game)
    result = {"id": game["id"], "name": game["n"], "cover": False, "hero": False, "errors": []}
    for kind, url, size, quality in (
        ("cover", cover_url, (480, 720), 82),
        ("hero", hero_url, (1280, 720), 80),
    ):
        output = folder / f"{kind}.webp"
        if output.exists() and output.stat().st_size > 4_000:
            result[kind] = True
            continue
        try:
            save_webp(download(url), output, size, quality)
            result[kind] = True
        except Exception as exc:
            # If an official override fails, retain the catalog's existing source.
            fallback = game["img"] if kind == "cover" else game["bg"]
            try:
                save_webp(download(fallback), output, size, quality)
                result[kind] = True
            except Exception as fallback_exc:
                counterpart = folder / ("cover.webp" if kind == "hero" else "hero.webp")
                try:
                    if not counterpart.exists():
                        raise FileNotFoundError("counterpart artwork unavailable")
                    save_webp(counterpart.read_bytes(), output, size, quality)
                    result[kind] = True
                except Exception as counterpart_exc:
                    result["errors"].append(
                        f"{kind}: {exc}; fallback: {fallback_exc}; counterpart: {counterpart_exc}"
                    )
    cover_file, hero_file = folder / "cover.webp", folder / "hero.webp"
    if not result["cover"] and hero_file.exists():
        save_webp(hero_file.read_bytes(), cover_file, (480, 720), 82)
        result["cover"] = True
    if not result["hero"] and cover_file.exists():
        save_webp(cover_file.read_bytes(), hero_file, (1280, 720), 80)
        result["hero"] = True
    if result["cover"] and result["hero"]:
        result["errors"] = []
    return result


def main() -> None:
    games = load_games()
    ASSETS.mkdir(parents=True, exist_ok=True)
    failures = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(process, game) for game in games]
        for index, future in enumerate(as_completed(futures), 1):
            result = future.result()
            state = "ok" if result["cover"] and result["hero"] else "partial"
            print(f"[{index:03}/{len(games)}] {state}: {result['name']}")
            if result["errors"]:
                failures.append(result)
    print(json.dumps({"games": len(games), "failures": failures}, indent=2))


if __name__ == "__main__":
    main()
