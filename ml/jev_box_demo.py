"""Bounding boxes from typesafe/jev-1.14 (the only Decisions model with a `box` question).

Draws the returned box on each photo:  .venv/bin/python jev_box_demo.py <photos dir> <out dir>
File names and targets are hard-coded in Q below: edit them for other photos.
"""
import base64, io, json, sys, time, urllib.request, urllib.error, pathlib
sys.path.insert(0, '/media/denis/work4/mgts_hack/ml')
import decision as dec
from PIL import Image, ImageDraw

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(exist_ok=True)
Q = {
    'hatch_open.jpg': 'the open manhole / missing hatch opening in this photo',
    'pole_lean.jpg': 'the tilted utility pole in this photo',
    'cables_tangle.jpg': 'the sagging or tangled overhead cables in this photo',
    'hatch_patched.jpg': 'the manhole cover in this photo',
}
total = 0
for name, target in Q.items():
    data, mime = dec.image_bytes(src / name, 1280)
    body = {
        'model': 'typesafe/jev-1.14',
        'state': ['Photo from a city service vehicle camera.',
                  {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,' + base64.b64encode(data).decode()}}],
        'questions': {
            'present': {'type': 'noul', 'instructions': f'Is {target} visible?',
                        'criteria': {'true': 'It is visible.', 'false': 'It is not in the photo.'}},
            'where': {'type': 'box', 'instructions': target},
        },
    }
    req = urllib.request.Request('https://openrouter.ai/api/alpha/decisions', data=json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {dec.api_key()}', 'Content-Type': 'application/json'})
    t = time.monotonic()
    try:
        r = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        print(name, 'HTTP', e.code, e.read().decode()[:300])
        continue
    dt = time.monotonic() - t
    a = r['answers']
    b = a.get('where', {}).get('box')
    cost = (r.get('usage') or {}).get('cost', 0)
    total += cost
    print(f"{name:18} present={a.get('present')} box={b} conf={a.get('where', {}).get('confidence')} {dt:.1f}s ${cost}")
    if b:
        im = Image.open(io.BytesIO(data)).convert('RGB')
        W, H = im.size
        ImageDraw.Draw(im).rectangle([b['left'] * W, b['top'] * H, b['right'] * W, b['bottom'] * H], outline=(255, 60, 60), width=6)
        im.thumbnail((640, 640))
        im.save(out / name)
print('total $', round(total, 6))
