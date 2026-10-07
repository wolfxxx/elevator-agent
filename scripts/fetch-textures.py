# Downloads CC0 PBR textures from Poly Haven (1k) and recompresses them for the web.
# Usage: python scripts/fetch-textures.py
import io, json, os, urllib.request
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')
TEXTURES = {
    'carpet': 'poly_wool_herringbone',
    'parquet': 'herringbone_parquet',
    'marble': 'marble_tiles',
    'garage': 'concrete_floor_worn_001',
    'ceiling': 'ceiling_interior',
    'roof': 'tarred_gravel',
    'asphalt': 'worn_asphalt',
    'concrete': 'concrete_wall_008',
    'metal': 'metal_plate',
}
MAPS = {'diff': 'Diffuse', 'nor': 'nor_gl', 'arm': 'arm'}

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'elevator-agent-build'})
    with urllib.request.urlopen(req) as r:
        return r.read()

for name, asset in TEXTURES.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    for short, key in MAPS.items():
        dst = os.path.join(d, f'{short}.jpg')
        if os.path.exists(dst):
            continue
        img = Image.open(io.BytesIO(get(files[key]['1k']['jpg']['url']))).convert('RGB')
        img.save(dst, quality=84 if short == 'diff' else 88, optimize=True)
        print(name, short, os.path.getsize(dst) // 1000, 'KB')
print('done')
