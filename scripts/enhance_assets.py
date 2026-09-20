from pathlib import Path
import os, subprocess, sys
from PIL import Image, ImageFilter

ASSETS = {
    "assets/bg-wonderland.webp": {"max_w": 2600, "transparent": False},
    "assets/logo-nihilguh.webp": {"max_w": 3000, "transparent": True},
    "assets/hero-resting.webp": {"max_h": 1800, "transparent": True},
    "assets/ramen-catboy.webp": {"max_w": 1800, "transparent": True},
}

def pillow_fallback(path, cfg):
    im = Image.open(path)
    im.load()
    target_w = cfg.get("max_w")
    target_h = cfg.get("max_h")
    if target_w and im.width < target_w:
        r = target_w / im.width
        im = im.resize((target_w, max(1, round(im.height*r))), Image.Resampling.LANCZOS)
    elif target_h and im.height < target_h:
        r = target_h / im.height
        im = im.resize((max(1, round(im.width*r)), target_h), Image.Resampling.LANCZOS)
    if im.mode not in ("RGB","RGBA"):
        im = im.convert("RGBA" if cfg["transparent"] else "RGB")
    im = im.filter(ImageFilter.UnsharpMask(radius=.85, percent=112, threshold=2))
    im.save(path, "WEBP", quality=95, method=6, alpha_quality=100, exact=True)
    print("Pillow fallback:", path, im.size, Path(path).stat().st_size)

def realesrgan(path, cfg):
    import cv2
    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    model_path = Path("models/RealESRGAN_x4plus_anime_6B.pth")
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32, scale=4)
    upsampler = RealESRGANer(
        scale=4, model_path=str(model_path), model=model, tile=256, tile_pad=10,
        pre_pad=0, half=False, device=torch.device("cpu")
    )
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError("cv2 could not decode " + path)
    output, _ = upsampler.enhance(img, outscale=2)

    # Convert to PIL, keep alpha when present.
    if output.ndim == 3 and output.shape[2] == 4:
        output = cv2.cvtColor(output, cv2.COLOR_BGRA2RGBA)
        im = Image.fromarray(output, "RGBA")
    else:
        output = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
        im = Image.fromarray(output, "RGB")

    max_w, max_h = cfg.get("max_w"), cfg.get("max_h")
    scale = 1.0
    if max_w and im.width > max_w: scale = min(scale, max_w/im.width)
    if max_h and im.height > max_h: scale = min(scale, max_h/im.height)
    if scale < 1:
        im = im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
    im.save(path, "WEBP", quality=95, method=6, alpha_quality=100, exact=True)
    print("Real-ESRGAN:", path, im.size, Path(path).stat().st_size)

for path,cfg in ASSETS.items():
    if not Path(path).exists():
        print("missing",path); continue
    try:
        realesrgan(path,cfg)
    except Exception as exc:
        print("Real-ESRGAN failed for",path,repr(exc))
        pillow_fallback(path,cfg)
