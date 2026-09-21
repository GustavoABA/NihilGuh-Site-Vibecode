from pathlib import Path
from PIL import Image, ImageFilter
import cv2
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

ASSETS = {
    "assets/bg.webp": {"max_w": 3200, "transparent": False},
    "assets/logo.webp": {"max_w": 2400, "transparent": True},
    "assets/hero.webp": {"max_h": 2200, "transparent": True},
    "assets/ramen.webp": {"max_h": 2200, "transparent": True},
}
LEGACY = {
    "assets/bg.webp": "assets/bg-wonderland.webp",
    "assets/logo.webp": "assets/logo-nihilguh.webp",
    "assets/hero.webp": "assets/hero-resting.webp",
    "assets/ramen.webp": "assets/ramen-catboy.webp",
}

MODEL_PATH = Path("models/RealESRGAN_x4plus_anime_6B.pth")
model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32, scale=4)
upsampler = RealESRGANer(
    scale=4,
    model_path=str(MODEL_PATH),
    model=model,
    tile=256,
    tile_pad=16,
    pre_pad=0,
    half=False,
    device=torch.device("cpu"),
)

def resize_to_cap(im, cfg):
    max_w, max_h = cfg.get("max_w"), cfg.get("max_h")
    scale = 1.0
    if max_w and im.width > max_w:
        scale = min(scale, max_w / im.width)
    if max_h and im.height > max_h:
        scale = min(scale, max_h / im.height)
    if scale < 1:
        im = im.resize(
            (max(1, round(im.width * scale)), max(1, round(im.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return im

def enhance(path, cfg):
    src = Image.open(path)
    src.load()
    has_alpha = cfg["transparent"] and src.mode in ("RGBA", "LA", "P")
    rgba = src.convert("RGBA") if has_alpha else src.convert("RGB")

    if has_alpha:
        rgb = rgba.convert("RGB")
        alpha = rgba.getchannel("A")
        bgr = cv2.cvtColor(__import__("numpy").array(rgb), cv2.COLOR_RGB2BGR)
        out_bgr, _ = upsampler.enhance(bgr, outscale=2)
        out_rgb = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB)
        out = Image.fromarray(out_rgb, "RGB")
        alpha = alpha.resize(out.size, Image.Resampling.LANCZOS)
        out = out.convert("RGBA")
        out.putalpha(alpha)
    else:
        bgr = cv2.cvtColor(__import__("numpy").array(rgba), cv2.COLOR_RGB2BGR)
        out_bgr, _ = upsampler.enhance(bgr, outscale=2)
        out = Image.fromarray(cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB), "RGB")

    out = resize_to_cap(out, cfg)
    # Very light post-sharpen only; Real-ESRGAN already restores edges.
    out = out.filter(ImageFilter.UnsharpMask(radius=.45, percent=45, threshold=3))
    out.save(path, "WEBP", quality=97, method=6, alpha_quality=100, exact=True)
    print("Enhanced:", path, src.size, "->", out.size, Path(path).stat().st_size)

for path, cfg in ASSETS.items():
    p = Path(path)
    if not p.exists():
        print("Missing:", path)
        continue
    enhance(path, cfg)
    legacy = LEGACY.get(path)
    if legacy:
        Path(legacy).write_bytes(Path(path).read_bytes())
        print("Synced legacy alias:", legacy)
