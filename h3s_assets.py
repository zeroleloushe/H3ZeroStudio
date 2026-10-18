"""Asset editor (non-destructive): processed derivatives of image / video / audio assets.

ops (all optional):
  start, end      seconds (video, audio): trimmed range
  rotate          0 / 90 / 180 / 270 (clockwise), then
  mirror          horizontal flip, then
  crop            [x, y, w, h] normalized 0..1 in the rotated+mirrored picture, then
  max_side        downscale so the long side is at most this (0 = full size); sides rounded to even
  gain_db, normalize (peak to -1 dBFS), fade_in, fade_out   (audio, and the sound of a video)
The original file is never touched; derivatives go to input/h3zerostudio/derived/ and are reused by hash.
"""
import hashlib
import json
import os
import wave

import numpy as np

from . import h3s_media as media

DERIVED = "h3zerostudio/derived"


def _input_dir():
    import folder_paths
    return folder_paths.get_input_directory()


def _out(path, ops, ext, tag=""):
    st = os.stat(path)
    h = hashlib.sha256(json.dumps([os.path.abspath(path), st.st_size, int(st.st_mtime), ops, tag], sort_keys=True).encode()).hexdigest()[:12]
    base = os.path.splitext(os.path.basename(path))[0][:60]
    d = os.path.join(_input_dir(), *DERIVED.split("/"))
    os.makedirs(d, exist_ok=True)
    name = f"{base}_{h}{ext}"
    return os.path.join(d, name), {"filename": name, "subfolder": DERIVED, "type": "input"}


def clean_ops(ops):
    ops = dict(ops or {})
    out = {}
    for k in ("start", "end", "gain_db", "fade_in", "fade_out"):
        if ops.get(k) not in (None, ""):
            out[k] = round(float(ops[k]), 4)
    r = int(ops.get("rotate") or 0) % 360
    if r in (90, 180, 270):
        out["rotate"] = r
    if ops.get("mirror"):
        out["mirror"] = True
    c = ops.get("crop")
    if isinstance(c, (list, tuple)) and len(c) == 4:
        x, y, w, h = [min(1.0, max(0.0, float(v))) for v in c]
        w, h = min(w, 1 - x), min(h, 1 - y)
        if w > 0.01 and h > 0.01 and (x, y, w, h) != (0.0, 0.0, 1.0, 1.0):
            out["crop"] = [round(x, 5), round(y, 5), round(w, 5), round(h, 5)]
    if int(ops.get("max_side") or 0) > 0:
        out["max_side"] = int(ops["max_side"])
    if ops.get("normalize"):
        out["normalize"] = True
    return out


def out_size(w, h, ops):
    """Picture size after rotate / crop / downscale (even sides)."""
    if ops.get("rotate") in (90, 270):
        w, h = h, w
    c = ops.get("crop")
    if c:
        w, h = max(2, int(round(w * c[2]))), max(2, int(round(h * c[3])))
    m = ops.get("max_side") or 0
    if m and max(w, h) > m:
        k = m / max(w, h)
        w, h = max(2, int(round(w * k))), max(2, int(round(h * k)))
    return w // 2 * 2, h // 2 * 2


def transform(img, ops):
    """PIL image -> PIL image with rotate, mirror, crop, downscale."""
    from PIL import Image
    r = ops.get("rotate")
    if r:
        img = img.transpose({90: Image.ROTATE_270, 180: Image.ROTATE_180, 270: Image.ROTATE_90}[r])
    if ops.get("mirror"):
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    c = ops.get("crop")
    if c:
        W, H = img.size
        x0, y0 = int(round(c[0] * W)), int(round(c[1] * H))
        img = img.crop((x0, y0, min(W, x0 + max(2, int(round(c[2] * W)))), min(H, y0 + max(2, int(round(c[3] * H))))))
    w, h = out_size(*img.size, {"max_side": ops.get("max_side")})
    if (w, h) != img.size:
        img = img.resize((w, h), Image.LANCZOS)
    return img


def process_audio_array(wf, sr, ops):
    """numpy [C, L] -> trimmed / gained / normalized / faded copy."""
    i0 = int(round(float(ops.get("start") or 0) * sr))
    i1 = int(round(float(ops["end"]) * sr)) if ops.get("end") is not None else wf.shape[1]
    a = wf[:, max(0, i0):max(i0, i1)].astype(np.float32).copy()
    if ops.get("gain_db"):
        a *= 10 ** (float(ops["gain_db"]) / 20)
    if ops.get("normalize") and a.size:
        pk = float(np.abs(a).max())
        if pk > 1e-6:
            a *= (10 ** (-1 / 20)) / pk
    n = a.shape[1]
    for key, ramp in (("fade_in", lambda k: np.linspace(0, 1, k)), ("fade_out", lambda k: np.linspace(1, 0, k))):
        k = min(n, int(round(float(ops.get(key) or 0) * sr)))
        if k > 0:
            if key == "fade_in":
                a[:, :k] *= ramp(k)
            else:
                a[:, n - k:] *= ramp(k)
    return np.clip(a, -1, 1)


def write_wav16(path, wf, sr):
    tmp = path + ".part.wav"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(wf.shape[0])
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes((np.clip(wf.T, -1, 1) * 32767).astype("<i2").tobytes())
    media.replace_file(tmp, path)


def edit_image(path, ops):
    from PIL import Image, ImageOps
    dst, ref = _out(path, ops, ".png")
    if not os.path.isfile(dst):
        img = transform(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), ops)
        img.save(dst + ".part.png")
        media.replace_file(dst + ".part.png", dst)
    from PIL import Image as _I
    with _I.open(dst) as im:
        w, h = im.size
    return ref, {"width": w, "height": h}


def edit_audio(path, ops):
    dst, ref = _out(path, ops, ".wav")
    if not os.path.isfile(dst):
        wf, sr = media.load_audio(path)
        write_wav16(dst, process_audio_array(wf, sr, ops), sr)
    wf, sr = media.load_audio(dst)
    return ref, {"duration": round(wf.shape[1] / sr, 3)}


def edit_video(path, ops):
    """Trim + rotate/mirror/crop/downscale (source frame rate kept) + the edited sound."""
    import av
    from PIL import Image
    dst, ref = _out(path, ops, ".mp4")
    if not os.path.isfile(dst):
        t0 = float(ops.get("start") or 0)
        t1 = float(ops["end"]) if ops.get("end") is not None else None
        audio = sr = None
        try:
            wf, sr = media.load_audio(path)
            audio = process_audio_array(wf, sr, ops)
        except ValueError:
            pass
        tmp = dst + ".part.mp4"
        out = av.open(tmp, mode="w", format="mp4")
        n = 0
        try:
            with av.open(path) as c:
                st = c.streams.video[0]
                st.thread_type = "AUTO"
                rate = st.average_rate or 24
                w, h = out_size(st.codec_context.width, st.codec_context.height, ops)
                codec = "libx264" if "libx264" in av.codecs_available else "mpeg4"
                vs = out.add_stream(codec, rate=rate)
                vs.width, vs.height, vs.pix_fmt = w, h, "yuv420p"
                if codec == "libx264":
                    vs.options = {"crf": "17", "preset": "medium", "movflags": "+faststart"}
                astream = None
                if audio is not None and audio.shape[1]:
                    layout = "stereo" if audio.shape[0] >= 2 else "mono"
                    audio = audio[:2]
                    astream = out.add_stream("aac", rate=int(sr), layout=layout)
                    astream.bit_rate = 192000
                if t0 > 0.5:
                    try:
                        c.seek(int(max(0.0, t0 - 1.0) / st.time_base), stream=st, backward=True)
                    except Exception:
                        pass
                for fr in c.decode(st):
                    t = float(fr.pts * st.time_base) if fr.pts is not None else 0.0
                    if t < t0 - 1e-6:
                        continue
                    if t1 is not None and t >= t1 - 1e-6:
                        break
                    img = transform(Image.fromarray(fr.to_ndarray(format="rgb24")), ops)
                    if img.size != (w, h):
                        img = img.resize((w, h), Image.LANCZOS)
                    for p in vs.encode(av.VideoFrame.from_ndarray(np.asarray(img), format="rgb24")):
                        out.mux(p)
                    n += 1
                for p in vs.encode():
                    out.mux(p)
                if astream is not None:
                    af = av.AudioFrame.from_ndarray(np.ascontiguousarray(audio), format="fltp", layout=layout)
                    af.sample_rate = int(sr)
                    for p in astream.encode(af):
                        out.mux(p)
                    for p in astream.encode():
                        out.mux(p)
        finally:
            out.close()
        if n == 0:
            os.remove(tmp)
            raise ValueError("в выбранном диапазоне нет кадров")
        media.replace_file(tmp, dst)
    return ref, media.video_info(dst)


def capture_frame(path, t, ops):
    """«Use frame»: the frame at t seconds (with the picture ops, no trim) -> png in derived/."""
    import av
    from PIL import Image
    pops = {k: v for k, v in ops.items() if k in ("rotate", "mirror", "crop", "max_side")}
    dst, ref = _out(path, pops, ".png", tag=f"frame@{round(float(t), 3)}")
    if not os.path.isfile(dst):
        last = None
        with av.open(path) as c:
            st = c.streams.video[0]
            if t > 0.5:
                try:
                    c.seek(int(max(0.0, t - 1.0) / st.time_base), stream=st, backward=True)
                except Exception:
                    pass
            for fr in c.decode(st):
                ft = float(fr.pts * st.time_base) if fr.pts is not None else 0.0
                if last is not None and ft > t + 1e-6:
                    break
                last = fr.to_ndarray(format="rgb24")
        if last is None:
            raise ValueError("кадр не найден")
        transform(Image.fromarray(last), pops).save(dst + ".part.png")
        media.replace_file(dst + ".part.png", dst)
    return ref


def extract_audio(path, ops):
    """«Use audio»: the (trimmed, processed) sound of a video -> wav in derived/."""
    aops = {k: v for k, v in ops.items() if k in ("start", "end", "gain_db", "normalize", "fade_in", "fade_out")}
    dst, ref = _out(path, aops, ".wav", tag="audio")
    if not os.path.isfile(dst):
        wf, sr = media.load_audio(path)
        write_wav16(dst, process_audio_array(wf, sr, aops), sr)
    wf, sr = media.load_audio(dst)
    return ref, {"duration": round(wf.shape[1] / sr, 3)}


def run(body, asset_path):
    """Route entry: {action: edit|frame|audio, kind: image|video|audio, source: ref, ops, t}."""
    src = body.get("source") or {}
    path = asset_path({"file": src.get("filename", ""), "subfolder": src.get("subfolder", ""), "type": src.get("type", "input"),
                       "name": src.get("filename")})
    ops = clean_ops(body.get("ops"))
    action, kind = body.get("action") or "edit", body.get("kind")
    if action == "frame":
        return {"file": capture_frame(path, float(body.get("t") or 0), ops)}
    if action == "audio":
        ref, info = extract_audio(path, ops)
        return {"file": ref, "info": info}
    if not ops:
        return {"file": None, "info": {}, "ops": {}}   # nothing to do: the original is used
    fn = {"image": edit_image, "video": edit_video, "audio": edit_audio}.get(kind)
    if fn is None:
        raise ValueError(f"unknown asset kind {kind!r}")
    ref, info = fn(path, ops)
    return {"file": ref, "info": info, "ops": ops}
