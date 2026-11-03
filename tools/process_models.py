#!/usr/bin/env python3
"""Prepares the 3D models generated with Meshy (via Higgsfield) for the game.

Input:  tools/raw_glb/<name>.glb      (see tools/model_sources.json)
Output: assets/models/<name>.glb      (same mesh, smaller JPEG texture)
        assets/models/models.json     (list of models with texture size)

The Meshy GLBs contain one mesh with positions, normals, UVs and one base
colour texture (4K JPEG). The texture is scaled down and re-encoded; the
geometry is kept as it is (it was generated with a target polycount).
"""
import io, json, os, struct
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'raw_glb')
OUT = os.path.join(ROOT, 'assets', 'models')
TEX = {'parkhaus': 1024, 'tiefgarage': 1024}  # others: 512


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, path
    jl, _ = struct.unpack('<II', b[12:20])
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, _ = struct.unpack('<II', b[off:off + 8])
    return js, bytearray(b[off + 8:off + 8 + bl])


def write_glb(path, js, chunks):
    """chunks: list of bytes per bufferView (in order); rebuilds the single buffer."""
    binary = bytearray()
    for i, data in enumerate(chunks):
        while len(binary) % 4:
            binary.append(0)
        js['bufferViews'][i]['byteOffset'] = len(binary)
        js['bufferViews'][i]['byteLength'] = len(data)
        js['bufferViews'][i]['buffer'] = 0
        binary += data
    while len(binary) % 4:
        binary.append(0)
    js['buffers'] = [{'byteLength': len(binary)}]
    j = json.dumps(js, separators=(',', ':')).encode()
    while len(j) % 4:
        j += b' '
    total = 12 + 8 + len(j) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack('<II', len(binary), 0x004E4942)); f.write(binary)


def process(name):
    js, buf = read_glb(os.path.join(RAW, name + '.glb'))
    chunks = []
    img_views = {im['bufferView'] for im in js.get('images', [])}
    for i, bv in enumerate(js['bufferViews']):
        data = bytes(buf[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
        if i in img_views:
            im = Image.open(io.BytesIO(data)).convert('RGB')
            size = TEX.get(name, 512)
            im = im.resize((size, size), Image.LANCZOS)
            out = io.BytesIO()
            im.save(out, 'JPEG', quality=84, optimize=True, progressive=False)
            data = out.getvalue()
        chunks.append(data)
    for im in js.get('images', []):
        im['mimeType'] = 'image/jpeg'
    # drop extras the game does not need
    js.pop('extensionsUsed', None); js.pop('extensionsRequired', None)
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, name + '.glb')
    write_glb(dst, js, chunks)
    acc = js['accessors']
    prim = js['meshes'][0]['primitives'][0]
    return {'file': name + '.glb', 'tris': acc[prim['indices']]['count'] // 3, 'kb': os.path.getsize(dst) // 1024}


if __name__ == '__main__':
    src = json.load(open(os.path.join(ROOT, 'tools', 'model_sources.json')))
    manifest = {}
    for name in src:
        if name.startswith('_'):
            continue
        if not os.path.exists(os.path.join(RAW, name + '.glb')):
            import urllib.request
            print('  lade', name)
            urllib.request.urlretrieve(src[name]['url'], os.path.join(RAW, name + '.glb'))
        info = process(name)
        manifest[name] = info
        print(f"  {name}: {info['tris']} Dreiecke, {info['kb']} KB")
    json.dump(manifest, open(os.path.join(OUT, 'models.json'), 'w'), indent=1)
