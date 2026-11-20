"""Build the Chromium ZIP and the Firefox development XPI for Pages."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
source = root / "bilibili-sync-extension"
dist = root / "dist"
manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
firefox_manifest = {
    **manifest,
    "browser_specific_settings": {
        "gecko": {
            "id": "iag-bilibili-sync@gem0816-1.github.io",
            "strict_min_version": "109.0",
            "data_collection_permissions": {"required": ["none"]},
        },
    },
}

dist.mkdir(exist_ok=True)
for name, contents in (
    ("iag-bilibili-sync.zip", manifest),
    ("iag-bilibili-sync-firefox.xpi", firefox_manifest),
):
    with ZipFile(dist / name, "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(contents, ensure_ascii=False, indent=2) + "\n")
        archive.write(source / "frame.js", "frame.js")
    print(f"Built {name}")
