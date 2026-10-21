"""Preview media for the editor: mp4 (PyAV, bundled with ComfyUI) and JPEG filmstrips (Pillow)."""
import os
import time

import numpy as np


def replace_file(tmp, path, tries=20, delay=0.05):
    """os.replace with a short retry: on Windows the target may be briefly open (e.g. served by /view)."""
    for k in range(tries):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if k == tries - 1:
                raise
            time.sleep(delay)

def to_uint8(frames):
    """IMAGE tensor [F,H,W,3] float 0..1 -> numpy uint8."""
    return (frames[..., :3].clamp(0, 1) * 255.0 + 0.5).to("cpu").byte().numpy()


# ---------------------------------------------------------------- BT.709 (idea after chanon/comfyui-obvpm-timeline)
# Every mp4 we write is converted with the BT.709 matrix and tagged BT.709 / TV range (primaries, transfer,
# matrix), like ComfyUI's own Save Video. Untagged H.264 is read as BT.601 by some players and as BT.709 by
# others, so greens looked duller and skin redder depending on where the file was played.
BT709 = 1          # AVCOL_PRI_BT709 = AVCOL_TRC_BT709 = AVCOL_SPC_BT709
RANGE_TV = 1       # AVCOL_RANGE_MPEG


def video_stream(container, w, h, rate, options=None):
    """H.264 (mpeg4 fallback) yuv420p stream, tagged BT.709 TV range."""
    import av
    codec = "libx264" if "libx264" in av.codecs_available else "mpeg4"
    vs = container.add_stream(codec, rate=rate)
    vs.width, vs.height, vs.pix_fmt = w, h, "yuv420p"
    if codec == "libx264" and options:
        vs.options = dict(options)
    cc = vs.codec_context
    for k, v in (("color_primaries", BT709), ("color_trc", BT709), ("colorspace", BT709), ("color_range", RANGE_TV)):
        try:
            setattr(cc, k, v)
        except Exception:
            pass
    return vs


def video_frame(arr):
    """RGB uint8 [H,W,3] -> yuv420p frame converted with the BT.709 matrix, TV range."""
    import av
    f = av.VideoFrame.from_ndarray(np.ascontiguousarray(arr), format="rgb24")
    try:
        return f.reformat(format="yuv420p", dst_colorspace="ITU709", dst_color_range="MPEG")
    except Exception:
        return f


def write_mp4(path, frames, fps=24, waveform=None, sample_rate=None, crf=20, max_width=None):
    """frames: IMAGE tensor [F,H,W,3]. waveform: tensor [C,L] (float, -1..1) or None."""
    import av
    tmp = path + ".part"
    arr = to_uint8(frames)
    h, w = arr.shape[1], arr.shape[2]
    if max_width and w > max_width:
        from PIL import Image
        nw = int(max_width) // 2 * 2
        nh = int(round(h * nw / w)) // 2 * 2
        arr = np.stack([np.asarray(Image.fromarray(f).resize((nw, nh), Image.BILINEAR)) for f in arr])
        h, w = nh, nw
    h2, w2 = h // 2 * 2, w // 2 * 2
    container = av.open(tmp, mode="w", format="mp4")
    try:
        vs = video_stream(container, w2, h2, int(fps), {"crf": str(crf), "preset": "veryfast", "movflags": "+faststart"})
        astream = None
        if waveform is not None and sample_rate:
            wf = waveform.detach().float().cpu().clamp(-1, 1).numpy()
            if wf.ndim == 1:
                wf = wf[None]
            wf = wf[:2]
            layout = "stereo" if wf.shape[0] == 2 else "mono"
            astream = container.add_stream("aac", rate=int(sample_rate), layout=layout)
        for f in arr:
            for p in vs.encode(video_frame(f[:h2, :w2])):
                container.mux(p)
        for p in vs.encode():
            container.mux(p)
        if astream is not None:
            af = av.AudioFrame.from_ndarray(np.ascontiguousarray(wf.astype(np.float32)), format="fltp", layout=layout)
            af.sample_rate = int(sample_rate)
            for p in astream.encode(af):
                container.mux(p)
            for p in astream.encode():
                container.mux(p)
    finally:
        container.close()
    replace_file(tmp, path)
    return path


STRIP_COUNT = 24


def write_strip(path, frames, count=STRIP_COUNT, height=72):
    """Horizontal JPEG sprite of `count` evenly spaced frames, each tile in the video aspect.
    The timeline tiles it CapCut-style (as many thumbnails as fit the clip) and uses it for hover scrubbing."""
    from PIL import Image
    arr = to_uint8(frames)
    n = arr.shape[0]
    count = max(1, min(int(count), n))
    # tile j shows the middle of the j-th 1/count of the clip
    idx = [min(n - 1, int((j + 0.5) * n / count)) for j in range(count)]
    h, w = arr.shape[1], arr.shape[2]
    tw = max(8, int(round(w * height / h)))
    strip = Image.new("RGB", (tw * count, height))
    for j, i in enumerate(idx):
        strip.paste(Image.fromarray(arr[i]).resize((tw, height), Image.BILINEAR), (j * tw, 0))
    tmp = path + ".part.jpg"
    strip.save(tmp, quality=82)
    replace_file(tmp, path)
    return path


def write_poster(path, frame, max_width=640):
    from PIL import Image
    a = to_uint8(frame[None])[0]
    img = Image.fromarray(a)
    if img.width > max_width:
        img = img.resize((max_width, int(round(img.height * max_width / img.width))), Image.BILINEAR)
    tmp = path + ".part.jpg"
    img.save(tmp, quality=85)
    replace_file(tmp, path)
    return path


# ---------------------------------------------------------------- export
def export_video(src, dst, start=0, end=None, fps=24, audio=None, sample_rate=None, video_gain=1.0, crf=17, declick=True):
    """Re-encode frames [start, end) of an mp4 (timeline frames at fps) to dst, streaming (no full decode in
    memory). audio: numpy [C, L] for the exported range (already mixed), or None = the file's own sound
    (times video_gain)."""
    import av
    if audio is None:
        try:
            wf, sr = load_audio(src)
            i0 = int(round(start / fps * sr))
            i1 = None if end is None else int(round(end / fps * sr))
            audio, sample_rate = wf[:, i0:i1] * float(video_gain), sr
        except ValueError:
            audio = None
    tmp = dst + ".part.mp4"
    out = av.open(tmp, mode="w", format="mp4")
    n = 0
    try:
        with av.open(src) as c:
            st = c.streams.video[0]
            st.thread_type = "AUTO"
            w, h = st.codec_context.width // 2 * 2, st.codec_context.height // 2 * 2
            vs = video_stream(out, w, h, int(fps), {"crf": str(crf), "preset": "medium", "movflags": "+faststart"})
            astream = layout = None
            if audio is not None and sample_rate and audio.shape[-1] > 0:
                audio = np.clip(audio[:2], -1, 1).astype(np.float32)
                if declick:   # the range starts / ends mid-sound: 5 ms fades instead of clicks
                    from .h3s_seams import taper_edges
                    audio = taper_edges(audio.copy(), int(sample_rate))
                layout = "stereo" if audio.shape[0] == 2 else "mono"
                astream = out.add_stream("aac", rate=int(sample_rate), layout=layout)
                astream.bit_rate = 192000
            if start > 0:
                try:
                    c.seek(int(max(0.0, start / fps - 1.0) / st.time_base), stream=st, backward=True)
                except Exception:
                    pass
            for fr in c.decode(st):
                j = int(round(float(fr.pts * st.time_base) * fps)) if fr.pts is not None else n + start
                if j < start:
                    continue
                if end is not None and j >= end:
                    break
                a = fr.to_ndarray(format="rgb24")[:h, :w]
                for p in vs.encode(video_frame(a)):
                    out.mux(p)
                n += 1
            for p in vs.encode():
                out.mux(p)
            if astream is not None:
                L = int(round(n / fps * sample_rate))
                au = np.zeros((audio.shape[0], L), np.float32)
                au[:, :min(L, audio.shape[1])] = audio[:, :L]
                af = av.AudioFrame.from_ndarray(np.ascontiguousarray(au), format="fltp", layout=layout)
                af.sample_rate = int(sample_rate)
                for p in astream.encode(af):
                    out.mux(p)
                for p in astream.encode():
                    out.mux(p)
    finally:
        out.close()
    if n == 0:
        os.remove(tmp)
        raise ValueError("в выбранном диапазоне нет кадров")
    replace_file(tmp, dst)
    return n


# ---------------------------------------------------------------- video files
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".gif")


def video_info(path, fps=24):
    """Duration / size / audio of a video file; frames = length on the 24 fps timeline."""
    import av
    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError(f"в файле нет видеодорожки: {os.path.basename(path)}")
        st = c.streams.video[0]
        dur = None
        if st.duration is not None and st.time_base:
            dur = float(st.duration * st.time_base)
        elif c.duration:
            dur = c.duration / 1_000_000
        if not dur:   # no header duration: count packets (demux only, no decoding)
            n, rate = 0, float(st.average_rate or st.guessed_rate or fps)
            for pk in c.demux(st):
                if pk.size:
                    n += 1
            dur = n / rate
        return {"duration": round(dur, 3), "frames": int(dur * fps + 1e-6), "width": int(st.codec_context.width),
                "height": int(st.codec_context.height), "src_fps": float(st.average_rate or 0), "has_audio": bool(c.streams.audio)}


def sample_video_frames(path, times, w, h):
    """Frames nearest-before each time (seconds, ascending) scaled to w x h (stretch) -> uint8 [N,h,w,3].
    One open + (mostly) one forward pass; seeks only across gaps > 2 s. Scaling is done by swscale on the frame."""
    import av

    def conv(fr):
        try:
            return fr.to_ndarray(width=w, height=h, format="rgb24")
        except TypeError:
            from PIL import Image
            return np.asarray(Image.fromarray(fr.to_ndarray(format="rgb24")).resize((w, h), Image.BILINEAR))

    out = []
    with av.open(path) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        it = pend = best = None
        last_t = -1e9
        for tg in times:
            if it is None or tg - last_t > 2.0:
                try:
                    c.seek(int(max(0.0, tg) / st.time_base), stream=st, backward=True)
                except Exception:
                    c.seek(0)
                it, pend, best, last_t = c.decode(st), None, None, -1e9
            while True:
                if pend is None:
                    pend = next(it, None)
                    if pend is None:
                        break
                t = float(pend.pts * st.time_base) if pend.pts is not None else 0.0
                if best is None or t <= tg + 1e-6:
                    best, pend, last_t = pend, None, t
                    continue
                break
            if best is None:
                raise ValueError(f"не удалось прочитать кадры из {os.path.basename(path)}")
            out.append(conv(best))
    return np.stack(out)


def _fit(arr, w, h, mode):
    """uint8 [H,W,3] -> [h,w,3]: "crop" = cover + center crop (timeline footage), "stretch" = plain resize."""
    from PIL import Image
    img = Image.fromarray(arr)
    if mode == "stretch":
        return np.asarray(img.resize((w, h), Image.LANCZOS))
    sc = max(w / img.width, h / img.height)
    rw, rh = max(w, int(round(img.width * sc))), max(h, int(round(img.height * sc)))
    img = img.resize((rw, rh), Image.LANCZOS)
    x0, y0 = (rw - w) // 2, (rh - h) // 2
    return np.asarray(img.crop((x0, y0, x0 + w, y0 + h)))


def load_video_frames(path, start, count, w, h, fps=24, mode="crop"):
    """count frames of the 24 fps timeline from frame start (nearest earlier source frame for each), resized.
    Short files hold their last frame. -> float32 numpy [count, h, w, 3] 0..1"""
    import av
    out = []
    with av.open(path) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        t0 = start / fps
        if t0 > 0.5:
            try:
                c.seek(int(max(0.0, t0 - 1.0) / st.time_base), stream=st, backward=True)
            except Exception:
                c.seek(0)
        last = None
        want = start
        for fr in c.decode(st):
            t = float(fr.pts * st.time_base) if fr.pts is not None else 0.0
            # emit every timeline frame whose time lies before this source frame: they show the previous one
            while last is not None and want < start + count and want / fps < t - 1e-6:
                out.append(last)
                want += 1
            if len(out) >= count:
                break
            last = _fit(fr.to_ndarray(format="rgb24"), w, h, mode)
        while len(out) < count:
            if last is None:
                raise ValueError(f"не удалось прочитать кадры из {os.path.basename(path)}")
            out.append(last)
    return np.stack(out[:count]).astype(np.float32) / 255.0


# ---------------------------------------------------------------- audio files
AUDIO_EXT = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".webm", ".mp4", ".mov", ".mkv")


def load_audio(path):
    """Any audio (or video with audio) file -> (float32 numpy [C, L], sample_rate). Uses PyAV."""
    import av
    chunks, sr, layout_ch = [], None, None
    with av.open(path) as c:
        if not c.streams.audio:
            raise ValueError(f"в файле нет аудиодорожки: {os.path.basename(path)}")
        st = c.streams.audio[0]
        sr = st.codec_context.sample_rate or st.rate
        for frame in c.decode(st):
            a = frame.to_ndarray()
            if frame.format.is_planar:
                a = a.reshape(len(frame.layout.channels), -1)
            else:
                a = a.reshape(-1, len(frame.layout.channels)).T
            if a.dtype.kind == "i":
                a = a.astype(np.float32) / float(np.iinfo(a.dtype).max)
            chunks.append(a.astype(np.float32))
            layout_ch = a.shape[0]
    if not chunks:
        return np.zeros((2, 0), np.float32), int(sr or 44100)
    wf = np.concatenate([c_[:layout_ch] for c_ in chunks], axis=1)
    return wf, int(sr)


def audio_peaks(path, bins=2000):
    """Waveform overview: {"duration", "sample_rate", "peaks": [[min, max], ...]} (mono mix, rounded)."""
    wf, sr = load_audio(path)
    mono = wf.mean(axis=0) if wf.shape[0] else np.zeros(0, np.float32)
    n = mono.shape[0]
    bins = max(1, min(int(bins), max(1, n)))
    peaks = []
    if n:
        edges = np.linspace(0, n, bins + 1).astype(np.int64)
        for a, b in zip(edges[:-1], edges[1:]):
            seg = mono[a:max(a + 1, b)]
            peaks.append([round(float(seg.min()), 3), round(float(seg.max()), 3)])
    return {"duration": round(n / sr, 4) if sr else 0.0, "sample_rate": sr, "peaks": peaks}


def write_wav(path, waveform, sample_rate, out_rate=22050):
    """Small mono 16-bit WAV copy (waveform display / listening). waveform: numpy or tensor [C, L]."""
    import wave
    wf = waveform.detach().float().cpu().numpy() if hasattr(waveform, "detach") else np.asarray(waveform, np.float32)
    mono = wf.mean(axis=0) if wf.ndim == 2 else wf
    if sample_rate != out_rate and mono.shape[0] > 1:
        n = max(1, int(round(mono.shape[0] * out_rate / sample_rate)))
        mono = np.interp(np.linspace(0, mono.shape[0] - 1, n), np.arange(mono.shape[0]), mono)
    pcm = (np.clip(mono, -1, 1) * 32767).astype("<i2")
    tmp = path + ".part"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(out_rate))
        w.writeframes(pcm.tobytes())
    replace_file(tmp, path)
    return path


def sprite_grid(frames, tile_h=144, quality=72, max_side=16000):
    """IMAGE-like tensor [N,h,w,3] 0..1 -> (data:image/jpeg;base64 sprite, tile_w, tile_h, cols).
    Tiles are laid out in a grid (row-major, `cols` per row) so large previews stay under JPEG limits."""
    import base64
    import io
    from PIL import Image
    arr = to_uint8(frames)
    n, h, w = arr.shape[0], arr.shape[1], arr.shape[2]
    tile_h = int(tile_h) if tile_h else h
    tw = max(8, int(round(w * tile_h / h)))
    cols = max(1, min(n, max_side // tw))
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGB", (tw * cols, tile_h * rows))
    for j in range(n):
        im = Image.fromarray(arr[j])
        if im.size != (tw, tile_h):
            im = im.resize((tw, tile_h), Image.BILINEAR)
        sheet.paste(im, ((j % cols) * tw, (j // cols) * tile_h))
    buf = io.BytesIO()
    sheet.save(buf, format="JPEG", quality=int(quality))
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"), tw, tile_h, cols


def sprite_data_uri(frames, tile_h=144, quality=72):
    """Single-row sprite (kept for callers that expect three values)."""
    uri, tw, th, _ = sprite_grid(frames, tile_h, quality, max_side=10 ** 9)
    return uri, tw, th
