"""Static checks: JS syntax, Python/JS core parity, tooltips on every input."""
import json
import os
import pathlib
import shutil
import subprocess
import textwrap

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "web", "js")
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")


@need_node
@pytest.mark.parametrize("name", sorted(f for f in os.listdir(JS) if f.endswith(".js")))
def test_js_syntax(name):
    r = subprocess.run([NODE, "--check", os.path.join(JS, name)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


PROJECTS = [
    {},
    {"settings": {"aspect": "9:16", "megapixels": 0.98, "prompt": "cinematic"},
     "assets": [{"id": "a", "file": "a.png", "category": "location"}, {"id": "b", "file": "b.png", "category": "character"},
                {"id": "c", "file": "c.png"}],
     "segments": [{"frames": 124, "prompt": "one", "refs": ["c", "a", "b", "a"]},
                  {"frames": 300, "prompt": "two", "refs": ["b"], "color": "3"},
                  {"frames": 50, "link": "cut", "overrides": {"steps": 8, "seed": 7, "cfg": ""}}]},
    {"settings": {"res_mode": "custom", "width": 1000, "height": 777, "overlap_blocks": 2, "continuity_ref": False},
     "audio": {"mode": "reference"},
     "segments": [{"frames": 400}, {"frames": 22}, {"frames": 957, "prompt": "long"}]},
    {"segments": [{"frames": 2000}]},
    {"assets": [{"id": "h", "file": "h.png", "category": "character"}, {"id": "g", "file": "g.png", "category": "character"},
                {"id": "l", "file": "l.png", "category": "location"}],
     "audio": {"mode": "locked", "source": "file", "file": {"filename": "s.mp3"}, "start": "1.5", "in": 2, "length": 7.25, "offset": 9},
     "run": {"upto": "1"},
     "markers": [{"frame": 300, "effect": "prompt", "text": " she turns around "}, {"frame": 5, "effect": "boost"},
                 {"frame": 130, "effect": "boost", "asset": "g", "label": "G"}, {"frame": 131, "effect": "boost", "asset": "zz"},
                 {"frame": 9999, "effect": "prompt", "text": "late"}, {"frame": "x", "effect": "bogus", "color": True}, 7],
     "segments": [{"frames": 124, "refs": ["l", "h"], "prompt": "a"}, {"frames": 158, "refs": ["h", "g"], "takes": [{"key": "k"}, {}, 3]},
                  {"frames": 124, "link": "cut", "active_take": 5}]},
    {"audio": {"offset": 3, "mode": "weird", "source": "x", "start": -4, "length": "nan"}, "run": [1], "markers": "bad"},
    # video end marker + multi-clip audio
    {"end": 200, "audio": {"mode": "reference", "clips": [{"id": "b", "start": 4, "in": 1, "length": 2}, {"start": "0.5", "length": 3},
                                                          "bad", {"id": "z", "start": -1, "in": "x"}]},
     "settings": {"audio_seam_lock": False},
     "markers": [{"frame": 150, "effect": "prompt", "text": "x"}, {"frame": 250, "effect": "prompt", "text": "y"}],
     "segments": [{"frames": 124}, {"frames": 124, "prompt": "two"}, {"frames": 124}]},
    {"end": "130.7", "settings": {"lock_overlap": False}, "segments": [{"frames": 124}, {"frames": 124}]},
    {"end": 9999, "audio": {"clips": []}, "segments": [{"frames": 124}]},
    # per-segment overlap overrides, audio context raising the overlap, shrink-to-fit
    {"settings": {"overlap_blocks": 1, "audio_context_sec": 2.1},
     "segments": [{"frames": 124}, {"frames": 124, "overlap_blocks": 0}, {"frames": 124, "overlap_blocks": "3"},
                  {"frames": 56, "overlap_blocks": 6}, {"frames": 39, "overlap_blocks": None}, {"frames": 124, "overlap_blocks": "x"}]},
    {"end": 300, "end_mode": "auto", "segments": [{"frames": 124}]},
    {"audio": {"video_volume": "0.5", "clips": [{"id": "m", "lane": 2, "start": 1, "volume": 3, "fade_in": "0.5"}, {"id": "k", "lane": 7},
                                              {"id": "l", "lane": 1, "volume": 0.5, "fade_out": -2}]},
     "segments": [{"frames": 124}, {"frames": 124}]},
    {"end": 300, "end_mode": "fixed", "segments": [{"frames": 124}]},
    {"assets": [{"id": "m", "file": "m.mp3", "category": "audio", "duration": "12.5"}, {"id": "p", "file": "p.png", "category": "character"},
                {"id": "q", "file": "q.wav", "category": "audio"}, {"id": "r", "file": "r.wav", "category": "audio"}],
     "audio": {"clips": [{"asset": "m", "start": 3, "lane": 7}, {"id": "k", "asset": "input", "start": 1, "length": 2}, {"asset": "zz"}],
               "input_ref": {"filename": "source_x.wav", "duration": 4}},
     "segments": [{"frames": 124, "refs": ["m", "p", "input", "m"]}, {"frames": 124, "refs": ["m", "q", "r", "input"], "prompt": "<Audio 2> sings"}]},
    {"audio": {"mode": "locked", "source": "file", "file": {"filename": "x y.mp3"}, "start": 1}, "segments": [{"frames": 124}]},
    {"end": 100, "segments": [{"frames": 124, "link": "cut"}, {"frames": 56}]},
    # video assets: footage clips (as is / vid2vid) and <Video k> references
    {"assets": [{"id": "v", "file": "v.mp4", "category": "video", "duration": "6.5", "frames": 156, "width": 1280, "height": "720",
                 "has_audio": 1, "poster": {"filename": "p.jpg"}, "frozen": None},
                {"id": "w", "file": "w.mp4", "category": "video", "poster": "bad", "orig": {"filename": "o.mp4"}, "edit": {"start": 1, "max_side": 832}}, {"id": "i", "file": "i.png", "category": "character"}],
     "segments": [{"frames": 124, "source": {"asset": "v", "in": "12.7", "denoise": 0}},
                  {"frames": 124, "prompt": "dance", "refs": ["i", "w", "v", "v", "w2"]},
                  {"frames": 124, "source": {"asset": "v", "in": 40, "denoise": "1.7"}, "refs": ["w"]},
                  {"frames": 124, "source": {"asset": "nope"}},
                  {"frames": 124, "source": {"asset": "w", "denoise": -1}, "link": "extend"}]},
    # draft mode: draft canvas/steps, final from the draft (refine), clamped settings
    {"settings": {"quality": "draft", "draft_scale": 0.6, "draft_steps": 6, "megapixels": 0.98, "steps": 20},
     "segments": [{"frames": 124}, {"frames": 158, "overrides": {"steps": 9}}]},
    {"settings": {"quality": "final", "final_mode": "refine", "refine_sigma": 2, "refine_steps": "x", "upscale_method": "zz", "steps": 8},
     "segments": [{"frames": 124}, {"frames": 124, "link": "cut"}]},
    {"settings": {"quality": "bogus", "final_mode": "refine", "draft_scale": "0.75", "refine_steps": 5, "res_mode": "custom", "width": 1344, "height": 768},
     "segments": [{"frames": 124}]},
    # «Апскейл отрезка»: normalization, keys only where an upscale applies, legacy draft->final upscaler migration
    {"settings": {"upscale_method": "vae"},
     "assets": [{"id": "v", "file": "v.mp4", "category": "video"}],
     "segments": [{"frames": 124, "upscale": {"method": "tiles", "scale": "1.4", "sigma": 0.01, "quality": "high"}, "approved": 1},
                  {"frames": 124, "upscale": {"method": "tiles", "scale": 3}},
                  {"frames": 124, "upscale": {"method": "latent", "sigma": "0.5"}, "link": "cut"},
                  {"frames": 124, "upscale": {"method": "zz"}},
                  {"frames": 124, "source": {"asset": "v", "denoise": 0}, "upscale": {"method": "latent"}},
                  {"frames": 124, "upscale": {"method": "latent"}, "freeze": {"key": "k1", "frames": 124}}]},
    {"settings": {"upscale_method": "vae", "upscale_rev": 2}, "segments": [{"frames": 124, "upscale": {"method": "latent", "scale": 1.5}}]},
    # tiled upscale: tile size / overlap (stored only when set)
    {"segments": [{"frames": 124, "upscale": {"method": "tiles", "scale": 2, "tile": [768, 432], "tile_ov": 9}},
                  {"frames": 124, "upscale": {"method": "tiles", "tile": [99999, 10], "tile_ov": 1}},
                  {"frames": 124, "upscale": {"method": "tiles", "tile": "x", "tile_ov": 0}},
                  {"frames": 124, "upscale": {"method": "latent", "tile": [512, 512], "tile_ov": 8}}]},
    # stage parameters, per-run kind, settings scope
    {"settings": {"final_mode": "refine", "draft_sampler": "euler", "draft_cfg": "2.5", "refine_scheduler": "simple", "refine_cfg": 99, "settings_scope": "global",
                  "seg_upscale": {"method": "tiles", "scale": 1.5}},
     "run": {"upto": 1, "only": 1, "kind": "draft"}, "segments": [{"frames": 124, "upscale": {"method": "latent"}}, {"frames": 124}]},
    {"settings": {"draft_scheduler": 5, "refine_sampler": None, "settings_scope": "x"}, "run": {"kind": "zz"}, "segments": [{"frames": 124}]},
    # «✂ Участок»: regions (normalization, windows on the scene grid, cuts / footage / scene end)
    {"settings": {"overlap_blocks": 2}, "run": {"region": "r2"},
     "assets": [{"id": "v", "file": "v.mp4", "category": "video"}, {"id": "c", "file": "c.png", "category": "character"}],
     "regions": [{"id": "r1", "start": 50, "end": 80}, {"id": "r2", "start": "100.6", "end": 170, "head": "3", "tail": 0, "refs": ["c", 5], "seed": "7",
                 "takes": [{"key": "k1", "id": "t"}, {}], "active_take": 3}, {"start": 200, "end": 260}, {"start": 10, "end": 5}, "bad",
                 {"id": "r5", "start": 400, "end": 470, "head": 9, "tail": "x"}, {"id": "r6", "start": 3, "end": 9999}],
     "segments": [{"frames": 124}, {"frames": 124}, {"frames": 90, "link": "cut"}, {"frames": 124, "source": {"asset": "v"}}, {"frames": 158}]},
    {"run": {"region": 5}, "regions": "bad", "segments": [{"frames": 56}]},
    # upscale: legacy multipliers migrate to mp (same canvas), mp targets, chunk settings
    {"settings": {"aspect": "16:9", "megapixels": 1.0, "seg_upscale": {"method": "tiles", "scale": 1.4}, "upscale_chunk_sec": 3.25, "upscale_chunk_overlap": 9},
     "segments": [{"frames": 362, "upscale": {"method": "latent", "scale": 2}}, {"frames": 158, "upscale": {"method": "tiles", "mp": 3.33333, "tile_ov": 7}},
                  {"frames": 124, "upscale": {"method": "latent", "mp": "0.1"}}, {"frames": 600, "upscale": {"method": "tiles", "mp": 99, "quality": "low"}}]},
    {"settings": {"upscale_chunk_sec": 0, "seg_upscale": {"method": "latent", "mp": 2.5}}, "segments": [{"frames": 600, "upscale": {"method": "latent", "mp": 2.5}}]},
    # per-method upscale profiles (own σ / steps / sampler / chunks) + legacy flat chunk keys still present
    {"segments": [{"id": "a", "frames": 124, "prompt": "x", "upscale": {"method": "tiles", "mp": 2}}],
     "settings": {"seg_upscale": {"method": "latent", "mp": 2, "sigma": 0.25}, "upscale_chunk_sec": 4, "upscale_chunk_overlap": 2,
                  "upscale_profiles": {"latent": {"sigma": 0.25, "steps": 6, "chunk": True, "chunk_sec": 3},
                                       "rtx": {"quality": "HIGH", "sigma": 0.2, "sampler": "euler", "scheduler": "simple", "chunk": False},
                                       "tiles": {"tile": 512, "chunk": True, "chunk_sec": 99, "chunk_overlap": 7, "steps": 999}}}},
    # legacy flat values only: migrated into the selected method (tiles) profile
    {"settings": {"seg_upscale": {"method": "tiles", "mp": 3, "sigma": 0.45, "tile": 768, "tile_ov": 64}, "upscale_chunk_sec": 6},
     "segments": [{"frames": 362, "upscale": {"method": "tiles", "mp": 3}}]},
    # upscale_rev 4: a tiles profile at the old default σ 0.35 moves to 0.60, a picked value stays, σ up to 1.0
    {"settings": {"upscale_rev": 3, "seg_upscale": {"method": "tiles", "mp": 2, "sigma": 0.35}, "upscale_profiles": {"tiles": {"mp": 2, "sigma": 0.35}}},
     "segments": [{"frames": 124, "upscale": {"method": "tiles", "mp": 2, "sigma": 0.35}}, {"frames": 124, "upscale": {"method": "latent", "mp": 2, "sigma": 3}}]},
    {"settings": {"upscale_rev": 3, "upscale_profiles": {"tiles": {"mp": 2, "sigma": 0.85}}}, "segments": [{"frames": 124}]},
    {"settings": {"upscale_rev": 4, "upscale_profiles": {"tiles": {"mp": 2, "sigma": 0.35}}}, "segments": [{"frames": 124}]},
    # «Настройки → Апскейл» → «Модель доработки»: the refine's own model + LoRA (custom / garbage)
    {"settings": {"upscale_gen": {"mode": "custom", "model": "detail.safetensors", "lora": "sharp.safetensors", "lora_strength": 0.7}},
     "segments": [{"frames": 124, "upscale": {"method": "latent"}}]},
    {"settings": {"upscale_gen": {"mode": "weird", "model": 5, "lora": None, "lora_strength": "x"}},
     "segments": [{"frames": 124}]},
    {"settings": {"upscale_gen": "bad"}, "segments": [{"frames": 124}]},
    # the learned upscaler model choice (settings.upscale_model): a name / garbage
    {"settings": {"upscale_model": "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors"},
     "segments": [{"frames": 124, "upscale": {"method": "latent"}}]},
    {"settings": {"upscale_model": 7}, "segments": [{"frames": 124}]},
    # «custom SIGMAS» schedules (main / stages / upscale profile / clip override)
    {"settings": {"scheduler": "custom", "sigmas": "1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0"},
     "segments": [{"frames": 124}, {"frames": 124, "overrides": {"scheduler": "custom", "sigmas": "1,0.9,0"}}]},
    {"settings": {"final_mode": "refine", "draft_scheduler": "custom", "draft_sigmas": "1,0.9,0.7,0",
                  "refine_scheduler": "custom", "refine_sigmas": "abc",   # unparsable: the raw string stays, no sigmas apply
                  "upscale_profiles": {"latent": {"scheduler": "custom", "sigmas": "1,0.9,0.8,0.7,0"}}},
     "segments": [{"frames": 124, "upscale": {"method": "latent"}}]},
    # «✨ Ассистент»: chats live in the project (normalization, id collisions, garbage)
    {"assistant": {"chats": [{"id": "c1", "title": "Сцена 1", "created": 1700000000,
                              "msgs": [{"role": "user", "text": "привет"}, {"role": "assistant", "text": "ответ", "reasoning": "анализ",
                                       "stats": {"prompt": 3, "completion": 2, "tps": 7.5, "elapsed": 0.27, "finish": "stop"}}, {"role": "bot", "text": "x"}, "bad"]},
                             {"id": "c1", "msgs": []}],
                   "active": "c1", "style_deleted": ["cinema", "cinema"],
                   "style_defs": [{"id": "custom", "name": " Custom ", "instructions": "one\ntwo", "priority": 120, "enabled": True, "custom": True},
                                  {"id": "custom", "name": "Duplicate", "instructions": [" three ", ""], "category": None}, {"name": " "}],
                   "cfg": {"model": "m.gguf", "temperature": 5, "max_tokens": 0, "ctx_refs": False,
                           "styles": ["custom", "cinema", "cinema"], "stream_timeout": 900, "auto_unload": True,
                           "auto_unload_delay": 30, "unload_endpoint": "/unload", "show_reasoning": False}},
     "segments": [{"frames": 124}]},
    {"assistant": "bad", "segments": [{"frames": 124}]},
    # model & LoRA presets: project copy, per-clip override, garbage
    {"model_presets": {"t1": {"name": "Turbo", "model": "h3.safetensors", "dtype": "fp8_e4m3fn", "clip": "te.safetensors",
                             "loras": [{"file": "turbo.safetensors", "sm": 0.8125}, {"file": "b.safetensors", "on": False, "sm": 2, "sc": 0}]},
                      "bad": 5, "x y": {"name": 3, "base": "checkpoint", "dtype": "fp16", "loras": [{"file": "a", "sm": "0.5", "sc": None, "on": 0}, {"file": ""}, "z"]}},
    "settings": {"model_preset": "t1"}, "segments": [{"frames": 124, "model_preset": "x y"}, {"frames": 124, "model_preset": 7}, {"frames": 124, "model_preset": "gone"}]},
]

JS_DRIVER = textwrap.dedent("""
    import * as C from "%s";
    const projects = JSON.parse(process.argv[2]);
    const out = projects.map((raw) => {
      const p = C.normalizeProject(raw);
      return { norm: p, plan: C.plan(p), est: C.estimate(p), res: C.resolution(p.settings),
               prompts: p.segments.map((_, i) => C.composePrompt(p, i)),
               params: p.segments.map((_, i) => C.effectiveParams(p, i)),
               refs: p.segments.map((s) => C.orderedRefs(p, s).map((a) => a.id)),
               run: C.runItems(p).map((it) => it.index), win: C.audioWindows(p),
               lim: C.limitedProject(p).segments.map((s) => s.frames), vend: C.videoEnd(p), sigs: C.segmentSigs(p).length,
               alock: C.audioLockOverlap(p), arefs: p.segments.map((s) => C.audioRefs(p, s).map((a) => a.id)),
               mseg: p.markers.map((m) => C.markerSegment(C.plan(p), m.frame)),
               vrefs: p.segments.map((s) => C.videoRefs(p, s).map((a) => a.id)), foot: p.segments.map((s) => C.isFootage(s)),
               fmt: [0, 1, 3, 6, 11, 12, 13, 36, 124, 2399].map(C.fmtSec10),
               kind: C.runKind(p.settings), wres: C.workResolution(p.settings), dres: C.workResolution(p.settings, "draft"),
               pp: ["draft", "refine", "full"].map((k) => p.segments.map((_, i) => C.passParams(p, i, k))),
               ssteps: p.segments.map((_, i) => C.segSteps(p, i)), dsigs: C.segmentSigs(p, "draft").length,
               ups: C.upscaleSigList(C.limitedProject(p), C.baseSigs(p), C.runKind(p.settings)).map((x) => !!x),
               ucv: p.segments.map((s) => (s.upscale ? C.upscaleCanvas(...C.workResolution(p.settings), s.upscale) : null)),
               rwin: p.regions.map((r) => C.regionWindow(p, r)), chains: C.sceneChains(C.plan(p)),
               chunks: [39, 124, 141, 158, 175, 226, 362, 600, 957].map((f) => C.upscaleChunking(p.settings, f)),
               mchunks: ["latent", "tiles"].map((m) => [124, 362, 957].map((f) => C.upscaleChunking(p.settings, f, m))),
               upp: ["latent", "tiles"].map((m) => p.segments.map((s, i) => C.upscalePassParams(p, i, m))),
               mpsc: [[960, 544], [1344, 768], [832, 480], [1280, 720]].map(([w, hh]) => [C.mpForScale(w, hh, 1.5), C.mpForScale(w, hh, 2), C.upscaleCanvas(w, hh, { mp: 3 })]),
               keyform: p.segments.map((s) => C.upscaleKeyForm(s.upscale, ...C.workResolution(p.settings))) };
    });
    process.stdout.write(JSON.stringify(out));
""")


@need_node
def test_core_parity(h3s, tmp_path):
    core = h3s.h3s_core
    drv = tmp_path / "drv.mjs"
    drv.write_text(JS_DRIVER % pathlib.Path(JS, "h3s_core.js").as_uri(), encoding="utf-8")
    r = subprocess.run([NODE, str(drv), json.dumps(PROJECTS)], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    js = json.loads(r.stdout)
    for raw, j in zip(PROJECTS, js):
        p = core.normalize_project(raw)
        p.pop("version", None); j["norm"].pop("version", None)
        j["norm"]["id"] = p["id"] = "x"
        assert json.loads(json.dumps(p)) == j["norm"]
        assert json.loads(json.dumps(core.plan(p))) == j["plan"]
        e = core.estimate(p)
        assert sorted(e) == sorted(j["est"])
        for k in e:
            assert e[k] == pytest.approx(j["est"][k]) if isinstance(e[k], float) else e[k] == j["est"][k], k
        assert list(core.resolution(p["settings"])) == list(j["res"])
        assert [core.compose_prompt(p, i) for i in range(len(p["segments"]))] == j["prompts"]
        assert [core.effective_params(p, i) for i in range(len(p["segments"]))] == j["params"]
        assert [[a["id"] for a in core.ordered_refs(p, s)] for s in p["segments"]] == j["refs"]
        assert [it["index"] for it in core.run_items(p)] == j["run"]
        assert [list(x) for x in core.audio_windows(p)] == j["win"]
        assert [s["frames"] for s in core.limited_project(p)["segments"]] == j["lim"]
        assert core.video_end(p) == j["vend"] and len(core.segment_keys(p)) == j["sigs"]
        assert core.audio_lock_overlap(p) == j["alock"]
        assert [[a["id"] for a in core.audio_refs(p, s)] for s in p["segments"]] == j["arefs"]
        assert [core.marker_segment(core.plan(p), m["frame"]) for m in p["markers"]] == j["mseg"]
        assert [[a["id"] for a in core.video_refs(p, s)] for s in p["segments"]] == j["vrefs"]
        assert [bool(x) for x in core.upscale_keys(p, core.segment_keys(p))] == j["ups"]
        assert [list(core.upscale_canvas(*core.work_resolution(p["settings"]), s["upscale"])) if s["upscale"] else None
                for s in p["segments"]] == j["ucv"]
        assert core.run_kind(p["settings"]) == j["kind"]
        assert list(core.work_resolution(p["settings"])) == j["wres"] and list(core.work_resolution(p["settings"], "draft")) == j["dres"]
        assert [[core.pass_params(p, i, k) for i in range(len(p["segments"]))] for k in ("draft", "refine", "full")] == j["pp"]
        assert [core.seg_steps(p, i) for i in range(len(p["segments"]))] == j["ssteps"]
        assert len(core.segment_keys(p, kind="draft")) == j["dsigs"]
        assert [core.is_footage(s) for s in p["segments"]] == j["foot"]
        assert [core.fmt_sec10(x) for x in (0, 1, 3, 6, 11, 12, 13, 36, 124, 2399)] == j["fmt"]
        assert json.loads(json.dumps([core.region_window(p, r) for r in p["regions"]])) == j["rwin"]
        assert [list(c) for c in core.scene_chains(core.plan(p))] == j["chains"]
        assert [list(core.upscale_chunking(p["settings"], f)) for f in (39, 124, 141, 158, 175, 226, 362, 600, 957)] == j["chunks"]
        assert [[list(core.upscale_chunking(p["settings"], f, m)) for f in (124, 362, 957)] for m in ("latent", "tiles")] == j["mchunks"]
        assert [[core.upscale_pass_params(p, i, m) for i in range(len(p["segments"]))] for m in ("latent", "tiles")] == j["upp"]
        assert [[core.mp_for_scale(w, hh, 1.5), core.mp_for_scale(w, hh, 2), list(core.upscale_canvas(w, hh, {"mp": 3}))]
                for w, hh in ((960, 544), (1344, 768), (832, 480), (1280, 720))] == j["mpsc"]
        assert [core.upscale_key_form(s["upscale"], *core.work_resolution(p["settings"])) for s in p["segments"]] == j["keyform"]


def test_tooltips(h3s):
    cls = h3s.nodes.ZL_H3ZeroStudio
    assert cls.OUTPUT_NODE is True and h3s.nodes.ZL_H3StudioLegacy.OUTPUT_NODE is True
    spec = cls.INPUT_TYPES()
    for group in ("required", "optional"):
        for name, val in spec.get(group, {}).items():
            assert len(val) > 1 and val[1].get("tooltip"), f"нет подсказки у входа {name}"
    assert len(cls.OUTPUT_TOOLTIPS) == len(cls.RETURN_TYPES)


def test_standalone_node_is_valid_output(h3s, monkeypatch):
    import asyncio
    import execution
    import nodes as comfy_nodes

    monkeypatch.setitem(comfy_nodes.NODE_CLASS_MAPPINGS, h3s.nodes.NODE_ID, h3s.nodes.ZL_H3ZeroStudio)
    prompt = {"1": {"class_type": h3s.nodes.NODE_ID, "inputs": {"project": ""}}}
    valid, error, _, node_errors = asyncio.run(execution.validate_prompt("standalone", prompt, None))
    assert valid, (error, node_errors)


@need_node
def test_interface_themes(tmp_path):
    driver = tmp_path / "themes.mjs"
    driver.write_text(textwrap.dedent(f"""
        const storage = new Map();
        globalThis.localStorage = {{ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }};
        globalThis.document = {{ documentElement: {{ dataset: {{}}, style: {{}} }} }};
        const {{ UI_THEMES, themeSetting, applyTheme }} = await import({json.dumps(pathlib.Path(JS, "h3s_theme.js").as_uri())});
        const applied = UI_THEMES.map((theme) => applyTheme(theme.id));
        const schemes = UI_THEMES.map((theme) => {{ applyTheme(theme.id); return document.documentElement.style.colorScheme; }});
        applyTheme("ocean", true);
        const stored = themeSetting();
        applyTheme();
        const restored = document.documentElement.dataset.h3zTheme;
        const invalid = applyTheme("missing");
        console.log(JSON.stringify({{ ids: UI_THEMES.map((t) => t.id), applied, schemes, stored, restored, invalid }}));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["ids"] == ["neon", "graphite", "ocean", "porcelain", "sunset"]
    assert out["applied"] == out["ids"] and out["schemes"] == ["dark", "dark", "dark", "light", "dark"]
    assert out["stored"] == out["restored"] == "ocean" and out["invalid"] == "graphite"
    settings = pathlib.Path(JS, "h3s_settings.js").read_text(encoding="utf-8")
    css = pathlib.Path(JS, "h3s_style.js").read_text(encoding="utf-8")
    assert "langRow, themeRow, blurRow, scope, resetBtn, tabs" in settings and "applyTheme(theme.id, true)" in settings
    assert all(f':root[data-h3z-theme="{theme}"]' in css for theme in out["ids"][1:])
    # a fresh install (nothing saved) and «Вернуть настройки по умолчанию» use «Графит»
    assert 'export const DEFAULT_THEME = "graphite";' in pathlib.Path(JS, "h3s_theme.js").read_text(encoding="utf-8")


@need_node
def test_bundled_win98_theme(tmp_path):
    """«Бонус: Windows 98» ships in the repo as a bundled pack (themes/win98): pure CSS, names in every UI language."""
    pack = pathlib.Path(JS).parents[1] / "themes" / "win98"
    meta = json.loads((pack / "theme.json").read_text(encoding="utf-8"))
    assert meta["id"] == "win98" and meta["base"] == "light" and meta["name_ru"] == "Бонус: Windows 98"
    assert all(meta.get(f"name_{l}") and meta.get(f"description_{l}") for l in ("ru", "en", "th", "zh"))
    css = (pack / meta["css"]).read_text(encoding="utf-8")
    assert ':root[data-h3z-theme="win98"]' in css and "url(" not in css and "@font-face" not in css
    assert sorted(f.name for f in pack.iterdir()) == ["theme.css", "theme.json"]  # no fonts / bitmaps shipped
    driver = tmp_path / "packs.mjs"
    driver.write_text(textwrap.dedent(f"""
        const storage = new Map([["h3zs.lang", "th"]]);
        globalThis.localStorage = {{ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }};
        globalThis.document = {{ documentElement: {{ dataset: {{}}, style: {{}} }} }};
        const {{ allThemes, loadPluginThemes, themeSetting }} = await import({json.dumps(pathlib.Path(JS, "h3s_theme.js").as_uri())});
        const first = themeSetting();
        await loadPluginThemes(async () => ({{ themes: [{{ ...{json.dumps(meta, ensure_ascii=False)}, css: "/h3zero/themes/win98/theme.css", plugin: true }}], warnings: [] }}));
        const w = allThemes().filter((t) => t.id === "win98");
        console.log(JSON.stringify({{ first, n: w.length, name: w[0]?.name }}));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out == {"first": "graphite", "n": 1, "name": meta["name_th"]}


@need_node
def test_settings_reset_defaults_button(tmp_path):
    """«Вернуть настройки по умолчанию»: between the scope block and the tabs, H3 dialog (no native confirm),
    i18n in every dictionary; the reset follows the scope and keeps API keys / projects."""
    settings = pathlib.Path(JS, "h3s_settings.js").read_text(encoding="utf-8")
    css = pathlib.Path(JS, "h3s_style.js").read_text(encoding="utf-8")
    assert "scope, resetBtn, tabs, ...cur[2]" in settings
    assert 'class: "h3z-btn sm danger h3z-setreset"' in settings and "onclick: () => this.askResetSettings()" in settings
    assert ".h3z-setbody > .h3z-setreset {" in css
    ask = settings[settings.index("    askResetSettings() {"):settings.index("    async resetSettings(")]
    assert "h3z-modal" in ask and "closeSaveDialog" in ask and "confirm(" not in ask
    keys = ["↺ Вернуть настройки по умолчанию", "↺ Вернуть настройки по умолчанию?", "Вернуть настройки по умолчанию", "Сбросить",
            "Сохраняются: API-ключи и адреса LLM, папки моделей, проекты (отрезки, промпты, ассеты), модели и кэш.",
            "Настройки для всех проектов сброшены по умолчанию", "Настройки этого проекта сброшены к глобальным (Ctrl+Z — вернуть)",
            "Сбрасываются глобальные настройки («Для всех проектов»): все вкладки ниже вернутся к значениям по умолчанию — в этом проекте и во всех проектах с «Для всех проектов». Язык интерфейса станет «Авто», тема — «{0}», размытие панелей включится, масштаб — {1}%.",
            "Сбрасываются настройки только этого проекта: все вкладки ниже снова станут как в глобальных настройках. Глобальные настройки, другие проекты, язык, тема и масштаб не меняются."]
    for k in keys:
        assert json.dumps(k, ensure_ascii=False) in settings or k in settings, k
    driver = tmp_path / "reset.mjs"
    driver.write_text(textwrap.dedent(f"""
        const storage = new Map([["h3zs.lang", "en"], ["h3zs.theme", "ocean"], ["h3zs.uiBlur", "off"], ["h3zs.uiScale", "125"], ["h3zs.llm", "KEEP"]]);
        globalThis.localStorage = {{ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }};
        globalThis.document = {{ documentElement: {{ dataset: {{}}, style: {{}} }} }};
        const C = await import({json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri())});
        const {{ installSettings }} = await import({json.dumps(pathlib.Path(JS, "h3s_settings.js").as_uri())});
        const dicts = {{}};
        for (const l of ["en", "th", "zh"]) dicts[l] = (await import({json.dumps(pathlib.Path(JS).as_uri())} + "/h3s_i18n_" + l + ".js")).default;
        class Editor {{}}
        installSettings(Editor, {{ C, h: () => ({{}}), ICON: {{}} }});
        const mk = (scope) => {{
          const ed = new Editor();
          ed.p = C.normalizeProject({{ id: "p1", segments: [{{ frames: 124, prompt: "keep me" }}],
            settings: {{ settings_scope: scope, steps: 6, cfg: 3, refine_sigma: 0.86, accel: {{ attention: "sage" }}, prompt: "project prompt", seed: 42 }} }});
          ed.glob = {{ steps: 9, sampler: "euler" }}; ed.puts = []; ed.toasts = []; ed.scale = null;
          ed.mutate = (fn) => fn(ed.p);
          ed.globLoad = async () => ed.glob;
          ed.globPut = async (v, replace) => {{ ed.puts.push([v, replace]); }};
          ed.setUiScale = (p) => {{ ed.scale = p; storage.set("h3zs.uiScale", String(p)); }};
          ed.toast = (m) => ed.toasts.push(m);
          return ed;
        }};
        const def = C.normalizeProject({{}}).settings;
        const g = mk("global"); await g.resetSettings(true); const gTheme = storage.get("h3zs.theme");
        const pr = mk("project"); storage.set("h3zs.theme", "sunset"); await pr.resetSettings(false);
        console.log(JSON.stringify({{
          g: {{ steps: g.p.settings.steps, cfg: g.p.settings.cfg, sigma: g.p.settings.refine_sigma, accel: g.p.settings.accel.attention,
               prompt: g.p.settings.prompt, seed: g.p.settings.seed, scope: g.p.settings.settings_scope, seg: g.p.segments[0].prompt,
               put: g.puts[0], scale: g.scale }},
          def: {{ steps: def.steps, cfg: def.cfg, sigma: def.refine_sigma, accel: def.accel.attention }},
          ls: Object.fromEntries(storage), gTheme,
          pr: {{ steps: pr.p.settings.steps, sampler: pr.p.settings.sampler, cfg: pr.p.settings.cfg, scope: pr.p.settings.settings_scope, puts: pr.puts.length }},
          keys: {json.dumps(keys, ensure_ascii=False)}.filter((k) => !["en", "th", "zh"].every((l) => typeof dicts[l][k] === "string" && dicts[l][k])),
          holes: {json.dumps(keys, ensure_ascii=False)}.filter((k) => ["en", "th", "zh"].some((l) => (dicts[l][k] || "").match(/\\{{\\d+\\}}/g)?.sort().join() !== (k.match(/\\{{\\d+\\}}/g) || []).sort().join() && (k.match(/\\{{\\d+\\}}/g) || dicts[l][k]?.match(/\\{{\\d+\\}}/g)))),
        }}));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["keys"] == [] and out["holes"] == []
    d = out["def"]
    # «Для всех проектов»: every GLOBAL_KEYS value → default, saved as the whole global set; interface → defaults
    assert (out["g"]["steps"], out["g"]["cfg"], out["g"]["sigma"], out["g"]["accel"]) == (d["steps"], d["cfg"], d["sigma"], d["accel"])
    assert out["g"]["prompt"] == "project prompt" and out["g"]["seed"] == 42 and out["g"]["seg"] == "keep me" and out["g"]["scope"] == "global"
    assert out["g"]["put"][1] is True and out["g"]["put"][0]["steps"] == d["steps"]
    assert out["gTheme"] == "graphite"
    assert out["g"]["scale"] == 100 and out["ls"]["h3zs.lang"] == "auto" and out["ls"]["h3zs.uiBlur"] == "on" and out["ls"]["h3zs.llm"] == "KEEP"
    # «Только этот проект»: the project takes the global values (defaults where none), the global set is not written
    assert out["pr"] == {"steps": 9, "sampler": "euler", "cfg": d["cfg"], "scope": "project", "puts": 0}
    assert out["ls"]["h3zs.theme"] == "sunset"


@need_node
def test_monitor_frontend_polling_and_history(tmp_path):
    driver = tmp_path / "monitor.mjs"
    driver.write_text(textwrap.dedent(f"""
        const {{ installMonitor, formatBytes, sparkPath }} = await import({json.dumps(pathlib.Path(JS, "h3s_monitor.js").as_uri())});
        class Editor {{}}
        installMonitor(Editor, {{ C: {{ fmtDur: String }}, h: null }});
        const ed = new Editor();
        ed.root = {{}}; ed.$ = {{}}; ed.run = {{ active: false }};
        let calls = [], paints = 0, timer = null, cleared = 0;
        globalThis.setInterval = (fn, ms) => {{ timer = {{ fn, ms }}; return 17; }};
        globalThis.clearInterval = () => cleared++;
        ed.host = {{ get: async (path, params) => {{
          calls.push({{ path, params }});
          return {{ seq: 2, metrics: {{ cpu: {{ percent: 12 }}, ram: {{ percent: 34 }}, gpu: {{ percent: 56, vram_percent: 67 }} }},
            logs: [{{ seq: 1, t: 1, text: "one" }}, {{ seq: 2, t: 2, text: "two" }}] }};
        }} }};
        ed.monitorPaint = () => paints++; ed.monitorPaintPop = () => {{}};
        ed.monitorStart();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const state = {{ seq: ed._mon.seq, logs: ed._mon.logs.length, history: ed._mon.history, active: ed._mon.active,
          path: calls[0].path, after: calls[0].params.after, interval: timer.ms, paints }};
        ed.monitorStop();
        state.stopped = !ed._mon.active && cleared > 0;
        state.bytes = formatBytes(2 * 1024 ** 3);
        state.path0 = sparkPath([0, 50, 100]);
        console.log(JSON.stringify(state));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["seq"] == 2 and out["logs"] == 2 and out["after"] == 0
    assert out["history"] == [{"cpu": 12, "ram": 34, "gpu": 56, "vram": 67, "temp": None}]
    assert out["active"] and out["stopped"] and out["interval"] == 2000 and out["paints"] == 1
    assert out["path"] == "/h3zero/monitor" and out["bytes"] == "2.0 ГБ"
    assert out["path0"] == "M0.0,100.0 L320.0,50.0 L640.0,0.0"
    src = pathlib.Path(JS, "h3s_editor.js").read_text(encoding="utf-8")
    assert "this.timerEl(), this.monitorEl()" in src
    assert "this.monitorStop?.();" in src and "this.monitorRun?.();" in src


def test_editor_keeps_keyboard_sink_focused():
    """ComfyUI's ChangeTracker (window keydown, capture, registered before extensions) runs graph undo on Ctrl+Z
    unless an <input> is focused, so the editor must keep focus on its hidden read-only sink input."""
    src = pathlib.Path(ROOT, "web", "js", "h3s_editor.js").read_text(encoding="utf-8")
    assert 'class: "h3z-sink", readonly: true' in src
    assert "focusSink()" in src and 'classList?.contains("h3z-sink")' in src
    assert "scheduleFocusSink()" in src
    assert "this._ptrDown" in src and "this._keepChatSelect" in src
    assert "window.getSelection()" in src and "sel.isCollapsed" in src
    assert ".h3z-ast-bubble,.h3z-ast-reasonbody,.h3z-final" in src


def test_end_marker_and_audio_clips(h3s):
    core = h3s.h3s_core
    p = core.normalize_project(PROJECTS[6])
    assert p["end"] == 200 and [c["id"] for c in p["audio"]["clips"]] == ["z", "a2", "b"]
    lp = core.limited_project(p)
    # segment 3 starts after the end, segment 2 crosses it and is shortened to the grid length covering it
    items = core.plan(p)
    assert [s["frames"] for s in lp["segments"]] == [124, core.snap_frames(200 - items[1]["start"], "up")]
    assert core.plan(lp)[-1]["end"] >= 200 and core.estimate(p)["frames"] == 200
    assert any("за маркером" in w for w in core.estimate(p)["warnings"])
    assert core.segment_keys(p)[0] == core.segment_keys(core.normalize_project({**PROJECTS[6], "end": 0}))[0]
    assert core.limited_project(lp) == lp
    # legacy single-window audio (locked mode) becomes one clip of the node input
    old = core.normalize_project({"audio": {"mode": "locked", "start": 1.5, "in": 2, "length": 7.25}})
    assert old["audio"]["clips"] == [{"id": "a1", "asset": "input", "lane": 0, "start": 1.5, "in": 2.0, "length": 7.25, "volume": 1.0, "fade_in": 0.0, "fade_out": 0.0}]
    assert core.audio_seam_params(core.normalize_project({"settings": {"audio_xfade_sec": 5}})) == {"xfade": 1.0, "match": True, "declick": True}
    assert core.audio_seam_params(core.normalize_project({"settings": {"audio_xfade": False}}))["xfade"] == 0.0


def test_assist_methods_defined(h3s):
    """Every this.method() used inside h3s_assist.js must exist on the editor: a missing one
    failed with a silent TypeError on every settings change (model pick, API fields, pills)."""
    import re
    src = pathlib.Path(JS, "h3s_assist.js").read_text(encoding="utf-8")
    used = set(re.findall(r"this\.(\w+)\(", src)) - {"constructor"}
    defined = set(_proto_methods())
    missing = sorted(m for m in used if m not in defined and not m.startswith("$"))
    assert not missing, "h3s_assist.js calls editor methods that do not exist: " + ", ".join(missing)


def test_upscale_gen_normalization(h3s):
    """«Настройки → Апскейл» → «Модель доработки»: normalization, the custom model + LoRA extractor, global settings."""
    core = h3s.h3s_core
    assert core.upscale_gen({}) is None
    assert core.upscale_gen({"upscale_gen": {"mode": "project", "model": "x"}}) is None
    assert core.upscale_gen({"upscale_gen": {"mode": "custom", "model": ""}}) is None
    p = core.normalize_project({"settings": {"upscale_gen": {"mode": "custom", "model": "m.safetensors",
                                                             "lora": "l.safetensors", "lora_strength": 99}}})
    assert p["settings"]["upscale_gen"] == {"mode": "custom", "model": "m.safetensors",
                                            "loras": [{"file": "l.safetensors", "on": True, "sm": 10.0, "sc": 10.0}]}
    assert core.upscale_gen(p["settings"]) == {"model": "m.safetensors", "loras": [{"file": "l.safetensors", "on": True, "sm": 10.0, "sc": 10.0}]}
    g = core.global_settings({"upscale_gen": {"mode": "custom", "model": "m", "lora_strength": 0.75}})
    assert g["upscale_gen"] == {"mode": "custom", "model": "m", "loras": []}
    assert "upscale_gen" in core.GLOBAL_KEYS
    # the learned upscaler model choice: a file name or "", global settings carry it
    assert core.normalize_project({})["settings"]["upscale_model"] == ""
    assert core.normalize_project({"settings": {"upscale_model": 7}})["settings"]["upscale_model"] == "7"
    assert "upscale_model" in core.GLOBAL_KEYS
    assert core.global_settings({"upscale_model": "m.safetensors"})["upscale_model"] == "m.safetensors"
    # several LoRAs with their own strengths (a legacy string takes the legacy strength)
    q = core.normalize_project({"settings": {"upscale_gen": {"mode": "custom", "model": "m", "lora": "old.safetensors"}}})
    assert q["settings"]["upscale_gen"]["loras"] == [{"file": "old.safetensors", "on": True, "sm": 1.0, "sc": 1.0}]
    q2 = core.normalize_project({"settings": {"upscale_gen": {"mode": "custom", "model": "m",
                                                              "loras": ["a", {"file": "b.safetensors", "sm": 0.8}, 5, ""]}}})
    assert q2["settings"]["upscale_gen"]["loras"] == [{"file": "a", "on": True, "sm": 1.0, "sc": 1.0},
                                                      {"file": "b.safetensors", "on": True, "sm": 0.8, "sc": 1.0},
                                                      {"file": "5", "on": True, "sm": 1.0, "sc": 1.0}]
    assert core.upscale_gen(q2["settings"])["loras"][1] == {"file": "b.safetensors", "on": True, "sm": 0.8, "sc": 1.0}


def test_custom_sigmas(h3s):
    """«custom SIGMAS»: parse, pass_params (main / stage / clip override), the upscale profile's list wins."""
    core = h3s.h3s_core
    assert core.parse_sigmas("1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0") == \
        [1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0]
    assert core.parse_sigmas("1 0.5 0") == [1.0, 0.5, 0.0]
    assert core.parse_sigmas("") is None and core.parse_sigmas("abc") is None and core.parse_sigmas("1") is None
    p = core.normalize_project({"settings": {"scheduler": "custom", "sigmas": "1, 0.5, 0"}, "segments": [{"frames": 124}]})
    pp = core.pass_params(p, 0)
    assert pp["scheduler"] == "custom" and pp["sigmas"] == [1.0, 0.5, 0.0] and pp["steps"] == 2
    p2 = core.normalize_project({"settings": {"final_mode": "refine", "refine_scheduler": "custom", "refine_sigmas": "1,0.8,0.6,0"},
                                 "segments": [{"frames": 124}]})
    assert core.pass_params(p2, 0, "refine")["sigmas"] == [1.0, 0.8, 0.6, 0.0]
    assert "sigmas" not in core.pass_params(p2, 0, "draft")   # the draft scheduler is not custom
    p3 = core.normalize_project({"settings": {"final_mode": "refine", "refine_scheduler": "custom", "refine_sigmas": "1,0.8,0.6,0"},
                                 "segments": [{"frames": 124, "overrides": {"scheduler": "custom", "sigmas": "1,0.9,0.8,0"}}]})
    assert core.pass_params(p3, 0, "refine")["sigmas"] == [1.0, 0.9, 0.8, 0.0]   # a clip override wins
    p4 = core.normalize_project({"settings": {"final_mode": "refine", "refine_scheduler": "custom", "refine_sigmas": "1,0.8,0.6,0",
                                              "upscale_profiles": {"latent": {"scheduler": "custom", "sigmas": "1,0.9,0.7,0.5,0"}}},
                                 "segments": [{"frames": 124, "upscale": {"method": "latent"}}]})
    up = core.upscale_pass_params(p4, 0, "latent")
    assert up["sigmas"] == [1.0, 0.9, 0.7, 0.5, 0.0] and up["steps"] == 4   # the profile's list wins over the refine stage
    assert "sigmas" in core.GLOBAL_KEYS


def test_assistant_llm(h3s):
    """«✨ Ассистент»: API-only project normalization and prompt-mode presets."""
    core = h3s.h3s_core
    a = core.normalize_assistant({"chats": [{"id": "c1", "created": "1700000000",
                                             "msgs": [{"role": "user", "text": "x"}, {"role": "bot", "text": "no"}, 5]}],
                                  "active": "zz", "cfg": {"temperature": 9, "max_tokens": 1, "sys": "s" * 9000}})
    assert a["chats"][0]["msgs"] == [{"role": "user", "text": "x"}]
    assert a["active"] == ""
    draft = core.normalize_assistant({"chats": [{"id": "draft", "created": 1, "msgs": []}], "active": "draft"})
    assert draft["active"] == "draft" and draft["chats"] == [{"id": "draft", "title": "", "created": 1, "msgs": []}]
    draft["chats"][0]["msgs"].extend([{"role": "user", "text": "Первое сообщение"}, {"role": "assistant", "text": ""}])
    assert core.normalize_assistant(draft)["chats"][0]["msgs"] == draft["chats"][0]["msgs"]
    assert a["cfg"]["temperature"] == 2.0 and a["cfg"]["max_tokens"] == 16
    assert a["cfg"]["sys"] == "s" * 8000 and a["cfg"]["ctx_refs"] is True
    assert "provider" not in a["cfg"] and "model" not in a["cfg"] and "n_ctx" not in a["cfg"]
    assert core.normalize_assistant({}) == core.normalize_project({})["assistant"]
    assert core.normalize_assistant({})["cfg"]["max_tokens"] == 32768
    memory = core.normalize_assistant({"cfg": {"engine_defaults": True, "unload_on_generate": True}})["cfg"]
    assert memory["engine_defaults"] is True and memory["unload_on_generate"] is True
    defaults = core.normalize_assistant({"cfg": {}})["cfg"]
    assert defaults["unload_on_generate"] is True
    assert core.normalize_assistant({"cfg": {"unload_on_generate": False}})["cfg"]["unload_on_generate"] is False
    thinking = {"temperature": 1.0, "top_p": 0.95, "top_k": 20, "min_p": 0.05,
                "presence_penalty": 0.0, "repetition_penalty": 1.0}
    plain = {"temperature": 0.7, "top_p": 0.8, "top_k": 20, "min_p": 0.0,
             "presence_penalty": 1.5, "repetition_penalty": 1.0}
    defaults = core.normalize_assistant({})["cfg"]
    assert defaults["thinking"] is True and defaults["sampling"] == {"thinking": thinking, "plain": plain}
    assert defaults["show_reasoning"] is True and defaults["stream_timeout"] == 600
    assert defaults["auto_unload"] is False and defaults["auto_unload_delay"] == 300
    changed = {"thinking": {**thinking, "temperature": 1.15, "top_k": 35},
               "plain": {**plain, "temperature": 0.45, "presence_penalty": 0.8}}
    profiles = core.normalize_assistant({"cfg": {"thinking": False, "sampling": changed}})["cfg"]
    assert profiles["sampling"] == changed
    profiles = core.normalize_assistant({"cfg": {**profiles, "thinking": True}})["cfg"]
    assert profiles["thinking"] is True and profiles["sampling"] == changed
    reasoned = core.normalize_assistant({"chats": [{"id": "c1", "msgs": [{"role": "assistant", "text": "Ответ", "reasoning": "Сначала анализ",
        "stats": {"prompt": 12, "completion": 8, "tps": 4.25, "elapsed": 1.88, "finish": "stop", "extra": "drop"}}]}],
        "cfg": {"styles": ["cinema", "cinema", "realism"], "stream_timeout": 900, "unload_endpoint": "/free-llm",
                "auto_unload": True, "auto_unload_delay": 45, "show_reasoning": False}})
    assert reasoned["chats"][0]["msgs"][0]["reasoning"] == "Сначала анализ"
    assert reasoned["chats"][0]["msgs"][0]["stats"] == {"prompt": 12, "completion": 8, "tps": 4.25, "elapsed": 1.88, "finish": "stop"}
    assert reasoned["cfg"]["styles"] == ["cinema", "realism"] and reasoned["cfg"]["stream_timeout"] == 900
    assert reasoned["cfg"]["unload_endpoint"] == "/free-llm" and reasoned["cfg"]["auto_unload_delay"] == 45
    assert reasoned["cfg"]["auto_unload"] is True and reasoned["cfg"]["show_reasoning"] is False
    pr = core.normalize_assistant({"presets": [{"name": "Кино", "cfg": {"mode": "lipsync", "api_base": "http://x/v1", "temperature": 3}}, {"name": "  "}, "bad"],
                                   "preset": "nope"})
    assert len(pr["presets"]) == 1 and pr["presets"][0]["cfg"]["mode"] == "lipsync" and pr["presets"][0]["cfg"]["temperature"] == 2.0
    assert pr["presets"][0]["cfg"]["api_base"] == "http://x/v1" and pr["preset"] == ""


def test_assistant_official_h3_rules_and_text_selection():
    src = pathlib.Path(JS, "h3s_assist.js").read_text(encoding="utf-8")
    for marker in ("integrated_multimodal_description", "overall_soundscape", "non_diegetic_music",
                   "subject_definitions", "retention_analysis", "detailed_description",
                   "with small/large amplitude", "at slow/fast speed", "(S1,S2)",
                   "says in an off-screen voiceover", "<scenetrans>", "<cutoff>",
                   "fully_preserved", "attribute_transfer", "fully_copy", "partially_copy",
                   "<Audio N> is the voice-timbre reference for <Subject N> (Sx).",
                   "For the target video, at 0.00 seconds into the target video",
                   "How the reference pictures align with the target video"):
        assert marker in src
    assert ".h3z-root .h3z-ast-bubble,.h3z-root .h3z-ast-bubble *,.h3z-root .h3z-ast-reasonbody,.h3z-root .h3z-ast-reasonbody *{user-select:text!important;-webkit-user-select:text!important}" in src


@need_node
def test_assistant_composer_keys_and_autogrow(tmp_path):
    src = pathlib.Path(JS, "h3s_assist.js").read_text(encoding="utf-8")
    assert ".h3z-ast-compose{" in src and ".h3z-ast-toolbar{" in src
    assert 'placeholder: T("Опишите сцену или задайте вопрос…")' in src
    driver = tmp_path / "assistant_composer.mjs"
    driver.write_text(textwrap.dedent(f"""
        import {{ H3Editor }} from {json.dumps(pathlib.Path(JS, "h3s_editor.js").as_uri())};
        import {{ installAssist }} from {json.dumps(pathlib.Path(JS, "h3s_assist.js").as_uri())};
        installAssist(H3Editor, {{ C: {{}}, h: () => null, ICON: {{}} }});
        const ed = Object.create(H3Editor.prototype);
        ed.root = {{}}; ed._ast = {{}};
        let sent = 0; ed.astSend = () => sent++;
        const event = (shiftKey = false, isComposing = false) => ({{
          key: "Enter", shiftKey, isComposing, prevented: false,
          target: {{ tagName: "TEXTAREA", matches: (s) => s === ".h3z-ast-inputbox textarea" || s === "textarea.h3z-ast-input" || (typeof s === "string" && s.includes("h3z-ast-input")), classList: {{ contains: () => false }} }},
          stopPropagation() {{}}, preventDefault() {{ this.prevented = true; }}
        }});
        const enter = event(); ed.onKey(enter);
        const shift = event(true); ed.onKey(shift);
        const composing = event(false, true); ed.onKey(composing);
        const ta = {{ style: {{}}, value: "x".repeat(80) }}; let scrollHeight = 180;
        Object.defineProperty(ta, "scrollHeight", {{ get: () => scrollHeight }});
        ed.astAutoGrow(ta); const large = {{ ...ta.style }};
        ta.value = ""; scrollHeight = 36; ed.astAutoGrow(ta); const small = {{ ...ta.style }};
        const C = await import({json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri())});
        installAssist(H3Editor, {{ C, h: () => null, ICON: {{}} }});
        const crud = Object.create(H3Editor.prototype);
        crud.p = C.normalizeProject({{}}); crud._ast = {{ styleDraft: null }};
        crud.flushSave = () => {{}}; crud.renderAssistSettings = () => {{}}; crud.astPaintComposer = () => {{}}; crud.toast = () => {{}};
        globalThis.confirm = () => true;
        crud.astEditStyle();
        Object.assign(crud._ast.styleDraft, {{ name: "Test style", description: "Desc", instructions: "First rule\\nSecond rule", priority: 80 }});
        crud.astSaveStyle();
        const created = crud.p.assistant.style_defs.find((s) => s.name === "Test style");
        crud.astEditStyle(created.id); crud._ast.styleDraft.name = "Edited custom"; crud.astSaveStyle();
        const edited = crud.astStyles().find((s) => s.id === created.id);
        crud.astDeleteStyle(created.id);
        const customDeleted = !crud.astStyles().some((s) => s.id === created.id) && !crud.p.assistant.cfg.styles.includes(created.id);
        const builtin = crud.astStyles()[0], originalName = builtin.name;
        crud.astEditStyle(builtin.id); crud._ast.styleDraft.name = "Edited builtin"; crud.astSaveStyle();
        const builtinEdited = crud.astStyles().find((s) => s.id === builtin.id).name === "Edited builtin";
        crud.astDeleteStyle(builtin.id);
        const builtinDeleted = !crud.astStyles().some((s) => s.id === builtin.id);
        crud.astResetStyles();
        const restored = crud.astStyles().find((s) => s.id === builtin.id)?.name === originalName;
        console.log(JSON.stringify({{ sent, enter: enter.prevented, shift: shift.prevented, composing: composing.prevented, large, small,
          created: !!created && created.instructions.length === 2, edited: edited?.name === "Edited custom", customDeleted, builtinEdited, builtinDeleted, restored }}));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["sent"] == 1 and out["enter"] is True
    assert out["shift"] is False and out["composing"] is False
    assert out["large"]["height"] == "140px" and out["large"]["minHeight"] == "44px" and out["large"]["overflowY"] == "auto"
    assert out["large"].get("maxHeight") in (None, "140px") or str(out["large"].get("maxHeight","")).endswith("px")
    assert out["small"]["height"] == "44px" and out["small"]["minHeight"] == "44px" and out["small"]["overflowY"] == "hidden"
    assert all(out[key] for key in ("created", "edited", "customDeleted", "builtinEdited", "builtinDeleted", "restored"))


@need_node
def test_upscale_gen_ui_sig(tmp_path):
    """The UI change signature of an upscale carries the custom refine model / LoRA (a changed setting marks
    upscaled clips stale); «Как в проект» keeps the old signatures (the cache stays valid)."""
    js = tmp_path / "ug.mjs"
    js.write_text(textwrap.dedent(f"""
        const C = await import({json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri())});
        const mk = (ug, upm) => C.normalizeProject({{ settings: {{ megapixels: 1, ...(ug ? {{ upscale_gen: ug }} : {{}}), ...(upm ? {{ upscale_model: upm }} : {{}}) }},
                                               segments: [{{ frames: 124, upscale: {{ method: "latent" }} }}] }});
        const sig = (p) => C.upscaleSigList(C.limitedProject(p), C.baseSigs(p), C.runKind(p.settings))[0];
        const a = mk(null), b = mk({{ mode: "custom", model: "m.safetensors", lora: "", lora_strength: 1 }}),
              c = mk({{ mode: "custom", model: "m.safetensors", lora: "l.safetensors", lora_strength: 0.8 }}), d = mk(null),
              e = mk(null, "u.safetensors");
        console.log(JSON.stringify({{ eq: sig(a) === sig(d), ne1: sig(a) !== sig(b), ne2: sig(b) !== sig(c), ne3: sig(a) !== sig(e),
                                     gen: [C.upscaleGen(a.settings), C.upscaleGen(b.settings)] }}));
    """))
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["eq"] and o["ne1"] and o["ne2"] and o["ne3"]
    assert o["gen"] == [None, {"model": "m.safetensors", "loras": []}]


@need_node
def test_tile_grid_matches_python(tmp_path):
    import h3s.h3s_upscale as up
    cases = [(1312, 576, 1984, 864, None), (1312, 576, 1984, 864, {"tile": [768, 448]}), (1312, 576, 2624, 1152, {"tile": [960, 544], "tile_ov": 8}),
             (768, 448, 1536, 896, {"tile": [1280, 704], "tile_ov": 24})]
    drv = tmp_path / "grid.mjs"
    drv.write_text('import * as C from "%s";\nconst cs = JSON.parse(process.argv[2]);\n'
                   'console.log(JSON.stringify(cs.map(([bw, bh, W, H, u]) => { const g = C.tileGrid(bw, bh, W, H, u); return [g.rows, g.cols, g.tw, g.th]; })));'
                   % (pathlib.Path(JS, "h3s_core.js").as_uri()))
    r = subprocess.run([NODE, str(drv), json.dumps(cases)], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    js = json.loads(r.stdout)
    for (bw, bh, W, H, u), g in zip(cases, js):
        u = u or {}
        crops = up.plan_crops(5, 8, H // 16, W // 16, "tiles", bh // 16, bw // 16, tile=u.get("tile"), tile_ov=u.get("tile_ov"))
        rows, cols = len({c["y"] for c in crops}), len({c["x"] for c in crops})
        c0 = crops[0]
        assert [rows, cols, (c0["x"][1] - c0["x"][0]) * 16, (c0["y"][1] - c0["y"][0]) * 16] == g, (bw, bh, W, H, u)


@need_node
def test_prompt_editor_sections_and_template(tmp_path):
    """Prompt editor helpers: section parsing (detailed_description word count) and the H3 skeleton."""
    js = pathlib.Path(JS, "h3s_prompted.js").as_uri()
    code = textwrap.dedent(f"""
        import {{ parseSections, promptTemplate }} from "{js}";
        const t = promptTemplate([{{ token: "<Picture 1>", name: "lina", kind: "picture" }}, {{ token: "<Audio 1>", name: "v", kind: "audio" }}], {{ task: "[video continuation]" }});
        const s = parseSections(t + "\\n").map((x) => x.key);
        const d = parseSections("summary: [reference generation] a b\\ndetailed_description:\\n[Shot 1] one two three four\\nnon_diegetic_music: N/A");
        console.log(JSON.stringify({{ t, s, d: d.map((x) => [x.key, x.words]) }}));
    """)
    f = tmp_path / "t.mjs"; f.write_text(code, encoding="utf-8")
    r = subprocess.run([NODE, str(f)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["s"] == ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"]
    assert "<Picture 1> — lina: " in out["t"] and "<Audio 1>: reference" in out["t"] and "[video continuation]" in out["t"]
    assert out["d"] == [["summary", 4], ["detailed_description", 6], ["non_diegetic_music", 1]]


def test_prompt_editor_wired_and_vendored():
    src = {n: pathlib.Path(JS, n).read_text(encoding="utf-8") for n in ("h3s_editor.js", "h3s_regions.js", "h3s_markers.js", "h3s_settings.js", "h3s_prompted.js")}
    assert src["h3s_editor.js"].count("this.peButton(") >= 2 and "this.peButton(" in src["h3s_regions.js"] and "this.peButton(" in src["h3s_markers.js"] and "this.peButton(" in src["h3s_settings.js"]
    assert "if (this.pe)" in src["h3s_editor.js"]   # the editor's window key handler steps aside for the modal
    assert 'import("./vendor/codemirror.js")' in src["h3s_prompted.js"]
    vend = pathlib.Path(JS, "vendor", "codemirror.js").read_text(encoding="utf-8")
    assert vend.startswith("/*! CodeMirror 6") and "MIT" in vend[:400]
    assert pathlib.Path(JS, "vendor", "codemirror.LICENSE").exists()


def _proto_methods():
    """Editor methods: class body of h3s_editor.js + every Object.assign(Editor.prototype, {...}) installer."""
    import re
    from collections import defaultdict
    where = defaultdict(list)
    ed = open(os.path.join(JS, "h3s_editor.js"), encoding="utf-8").read()
    for n in re.findall(r"^  (?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", ed, re.M):
        where[n].append("h3s_editor.js (class)")
    for f in sorted(os.listdir(JS)):
        if not f.endswith(".js"):
            continue
        s = open(os.path.join(JS, f), encoding="utf-8").read()
        for m in re.finditer(r"Object\.assign\(\w+\.prototype,\s*\{", s):
            end = s.find("\n  });", m.end())
            for n in re.findall(r"^    (?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", s[m.end():end if end > 0 else len(s)], re.M):
                where[n].append(f)
    return where


def test_no_editor_method_defined_twice():
    """Two modules giving the editor a method of the same name: the later installer silently wins
    (that is how the timeline's trailing «клик — заполнить» ended up calling the gap-span fill and doing nothing)."""
    dup = {k: v for k, v in _proto_methods().items() if len(v) > 1}
    assert not dup, dup


@need_node
def test_fill_trailing_area_moves_the_end_marker(tmp_path):
    """Click on the empty tail before a fixed end marker: one new continuation piece of the nearest H3 length,
    selected, and the marker moved onto its end — one undo step, no toast; a gap longer than one clip: a max piece."""
    js = tmp_path / "fe.mjs"
    js.write_text(textwrap.dedent(f"""
        globalThis.window = globalThis; globalThis.localStorage = {{ getItem: () => null, setItem() {{}} }};
        globalThis.document = {{ createElement: () => ({{ style: {{}} }}), head: {{ append() {{}} }}, addEventListener() {{}} }};
        const C = await import({json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri())});
        const {{ H3Editor }} = await import({json.dumps(pathlib.Path(JS, "h3s_editor.js").as_uri())});
        const out = [];
        for (const gap of [77, 3, 40, 2000]) {{
          const e = Object.create(H3Editor.prototype);
          e.p = C.normalizeProject({{ segments: [{{ id: "a", frames: 90, prompt: "x" }}] }});
          e.p.end_mode = "fixed"; e.p.end = e.contentFrames() + gap;
          const undo = [], toasts = [];
          e.mutate = (fn) => {{ undo.push(JSON.stringify(e.p)); fn(e.p); }};
          e.renderAll = e.scrollToPlayhead = e.renderTimeline = () => {{}}; e.toast = (m) => toasts.push(m);
          e.fillEnd();
          const its = e.items();
          out.push({{ gap, n: e.p.segments.length, sel: e.sel, frames: e.p.segments[1].frames, link: e.p.segments[1].link,
                     end: e.p.end, last: its.at(-1).end, undo: undo.length, toasts: toasts.length, max: C.MAX_FRAMES }});
        }}
        console.log(JSON.stringify(out));
    """))
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    for o in json.loads(r.stdout.strip().splitlines()[-1]):
        assert o["n"] == 2 and o["sel"] == 1 and o["link"] != "cut" and o["undo"] == 1, o
        assert (o["frames"] - 5) % 17 == 0, o
        if o["gap"] < 1000:
            assert o["end"] == o["last"] and o["toasts"] == 0, o           # marker exactly on the new piece's end
        else:
            assert o["end"] > o["last"] and o["toasts"] == 1, o            # longer than one clip: max piece, click again


@need_node
def test_workspace_audio_lanes_and_flexible_video_track(tmp_path):
    """Optional lane 2 keeps visible-row drag/drop mapping and existing clips; video shrinks before overflow."""
    js = tmp_path / "workspace.mjs"
    js.write_text(textwrap.dedent(f"""
        class FakeNode {{
          constructor(tag = "") {{ this.tag = tag; this.children = []; this.style = {{}}; this.dataset = {{}}; this._text = ""; }}
          set innerHTML(v) {{ this.children = []; this._html = v; }}
          set textContent(v) {{ this.children = []; this._text = String(v); }}
          append(...items) {{ for (const item of items) this.children.push(item instanceof FakeNode ? item : String(item)); }}
          addEventListener() {{}}
          setAttribute() {{}}
          text() {{ return this._text + this.children.map((item) => item instanceof FakeNode ? item.text() : item).join(""); }}
        }}
        globalThis.Node = FakeNode;
        globalThis.document = {{ createElement: (tag) => new FakeNode(tag), createTextNode: (text) => String(text) }};
        const C = await import({json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri())});
        const {{ H3Editor }} = await import({json.dumps(pathlib.Path(JS, "h3s_editor.js").as_uri())});
        const e = Object.create(H3Editor.prototype);
        e.p = C.normalizeProject({{ audio: {{ clips: [] }}, segments: [{{ frames: 124 }}] }});
        e.host = {{ inputLinked: () => true }};
        e.audioLane2 = false;
        const hidden = {{ lanes: e.audioLanes(), musicRow: e.audioRow(2), drops: [0, 38, 80].map((y) => e.audioLaneAt(y)) }};
        e.$ = {{ aHead: new FakeNode() }};
        e.renderAudioHead();
        const hiddenHead = e.$.aHead.text();
        e.audioLane2 = true;
        const visible = {{ lanes: e.audioLanes(), rows: [0, 1, 2].map((l) => e.audioRow(l)), drops: [0, 38, 80].map((y) => e.audioLaneAt(y)) }};
        e.renderAudioHead();
        const visibleHead = e.$.aHead.text();
        e.audioLane2 = false;
        e.p.audio.clips.push({{ id: "lane2", asset: "input", lane: 1, start: 0, in: 0, length: 1, volume: 1, fade_in: 0, fade_out: 0 }});
        const occupied = e.audioLanes();
        const metrics = [];
        for (const height of [230, 120]) {{
          const props = {{}};
          e.$ = {{ tscroll: {{ clientHeight: height }}, tl: {{ style: {{ setProperty: (k, v) => props[k] = v }}, classList: {{ toggle() {{}} }} }} }};
          e.syncTimelineMetrics();
          metrics.push({{ height, video: e.timelineVideoHeight, props }});
        }}
        console.log(JSON.stringify({{ hidden, visible, occupied, metrics, hiddenHead, visibleHead }}));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["hidden"] == {"lanes": [0, 2], "musicRow": 1, "drops": [0, 2, 2]}
    assert o["visible"] == {"lanes": [0, 1, 2], "rows": [0, 1, 2], "drops": [0, 1, 2]}
    assert o["occupied"] == [0, 1, 2]
    assert "null" not in o["hiddenHead"] and "Аудио" in o["hiddenHead"] and "Музыка" in o["hiddenHead"]
    assert "null" not in o["visibleHead"] and "🔒 2" in o["visibleHead"]
    assert o["metrics"][0]["video"] == 68 and o["metrics"][0]["props"]["--audio-h"] == "110px"
    assert o["metrics"][1]["video"] == 64 and o["metrics"][1]["props"]["--timeline-min"] == "226px"


def test_workspace_layout_and_gallery_wiring():
    editor = pathlib.Path(JS, "h3s_editor.js").read_text(encoding="utf-8")
    style = pathlib.Path(JS, "h3s_style.js").read_text(encoding="utf-8")
    gallery = pathlib.Path(JS, "h3s_gallery.js").read_text(encoding="utf-8")
    assert "this.timerEl(), this.monitorEl()" in editor and 'class: "h3z-head-group"' in editor
    assert 'togglePanel(side)' in editor and 'this.$.left.hidden = L.lc' in editor and 'this.$.insp.hidden = L.rc' in editor
    assert 'class: "h3z-heads-inner"' in editor and 'translateY(${-$.tscroll.scrollTop}px)' in editor
    assert 'grid-template-rows:auto var(--h3z-gap)' in style and '--video-h' in style and '--timeline-min' in style
    assert 'class: "gtype"' in gallery and 'T("Папка · {0} видео"' in gallery and 'T("Видео · {0}"' in gallery


def test_models_tab_uses_single_panel_background():
    models = pathlib.Path(JS, "h3s_modeltab.js").read_text(encoding="utf-8")
    assert 'class: "h3z-card h3z-mt"' in models
    assert 'class: "h3z-card h3z-glass h3z-mt"' not in models
    assert '.h3z-root:not(.h3z-left-collapsed) .h3z-body.h3z-mtwide' in models


def test_author_links_open_in_new_tabs_above_help():
    editor = pathlib.Path(JS, "h3s_editor.js").read_text(encoding="utf-8")
    style = pathlib.Path(JS, "h3s_style.js").read_text(encoding="utf-8")
    for url in ("https://boosty.to/zeroleloushe", "https://github.com/zeroleloushe/H3ZeroStudio", "https://www.youtube.com/@zeroleloushe"):
        assert url in editor
    assert editor.count('target: "_blank", rel: "noopener noreferrer"') == 2
    assert editor.index('class: "h3z-socials"') < editor.index('class: "h3z-support"') < editor.index('tool("help"')
    assert '.h3z-social-link:focus-visible, .h3z-support:focus-visible' in style


def test_help_colors_follow_interface_theme():
    style = pathlib.Path(JS, "h3s_style.js").read_text(encoding="utf-8")
    help_css = style[style.index(".h3z-body > .h3z-helpview"):style.index(".h3z-setbody")]
    assert "background:var(--bg1)" in help_css
    assert "background:var(--control)" in help_css
    assert "color:var(--txt)" in help_css
    assert "color:var(--a1)" in help_css
    for fixed in ("#0b1024", "#eef0ff", "#cfd4f6", "#c4b5fd", "#d6dafa", "rgba(139,92,246", "rgba(148,163,255"):
        assert fixed not in help_css


# ---------------------------------------------------------------- i18n (RU source → EN dictionary)
import re
CYR = re.compile(r"[А-Яа-яЁё]")
I18N_SKIP = {"h3s_i18n.js", "h3s_i18n_en.js", "h3s_i18n_th.js", "h3s_i18n_zh.js", "h3s_help_ru.js", "h3s_prompt_library.js"}   # dictionaries and source-language content
I18N_ALLOW = {"H3ZeroStudio · Таймлайн", "максимум"}              # matched against Russian text on purpose


def _skip_regex(src, i):
    j, cls, n = i + 1, False, len(src)
    while j < n and (cls or src[j] != "/") and src[j] != "\n":
        if src[j] == "\\": j += 1
        elif src[j] == "[": cls = True
        elif src[j] == "]": cls = False
        j += 1
    return j + 1


def _js_template(src, i, out):
    """Template literal at src[i] == "`": records its text (CSS comments dropped) and any literals inside ${…}."""
    j, n, buf = i + 1, len(src), []
    while j < n and src[j] != "`":
        if src[j] == "\\":
            buf.append(src[j:j + 2]); j += 2
        elif src.startswith("${", j):
            j, depth, prev = j + 2, 1, "("
            while j < n and depth:
                c = src[j]
                if c == "/" and prev in "(,=:[!&|?{};+-*%<>~^":
                    j = _skip_regex(src, j); prev = "x"; continue
                if not c.isspace():
                    prev = c
                if c in "\"'":
                    k = j + 1
                    while k < n and src[k] != c:
                        k += 2 if src[k] == "\\" else 1
                    out.append(("str", src[j + 1:k], j)); j = k + 1; continue
                if c == "`":
                    j = _js_template(src, j, out); continue
                depth += (c == "{") - (c == "}"); j += 1
        else:
            buf.append(src[j]); j += 1
    out.append(("tpl", re.sub(r"/\*.*?\*/", "", "".join(buf), flags=re.S), i))
    return j + 1


def _js_strings(src):
    """(kind, text, start) for every string / template literal outside comments and regex literals."""
    out, i, n = [], 0, len(src)
    prev = ""
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            i = src.find("\n", i); i = n if i < 0 else i; continue
        if src.startswith("/*", i):
            i = src.find("*/", i + 2); i = n if i < 0 else i + 2; continue
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(("str", src[i + 1:j], i)); i = j + 1; prev = "x"; continue
        if c == "`":
            i = _js_template(src, i, out); prev = "x"; continue
        if c == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%<>~^"):
            i = _skip_regex(src, i); prev = "x"; continue
        if not c.isspace():
            prev = c
        i += 1
    return out


def _en_keys():
    keys = set()
    for line in open(os.path.join(JS, "h3s_i18n_en.js"), encoding="utf-8"):
        m = re.match(r'^\s*("(?:[^"\\]|\\.)*"):\s*"', line)
        if m:
            keys.add(json.loads(m.group(1)))
    return keys


def test_ui_strings_are_translated():
    """Every user-visible Russian literal in web/js (help excepted) goes through T("…") and has an English entry."""
    en, bare, missing = _en_keys(), [], []
    for f in sorted(os.listdir(JS)):
        if not f.endswith(".js") or f in I18N_SKIP:
            continue
        src = open(os.path.join(JS, f), encoding="utf-8").read()
        for kind, text, at in _js_strings(src):
            if not CYR.search(text.replace("Русский", "")):   # the language's own name is shown as is
                continue
            line = src.count("\n", 0, at) + 1
            if kind == "tpl":
                bare.append(f"{f}:{line} template `{text[:50]}`"); continue
            wrapped = re.search(r"\bT\(\s*$", src[max(0, at - 12):at])
            key = json.loads('"' + text.replace('\\\'', "'") + '"') if '\\' in text else text
            if not wrapped:
                if key not in I18N_ALLOW:
                    bare.append(f"{f}:{line} {text[:60]!r}")
            elif key not in en:
                missing.append(f"{f}:{line} {text[:60]!r}")
    assert not bare, "not wrapped in T():\n" + "\n".join(bare[:40])
    assert not missing, "no English entry:\n" + "\n".join(missing[:40])


@need_node
def test_i18n_runtime(tmp_path):
    """T() fills {0}…, falls back to Russian, plurals per language; server messages (exact / f-string patterns /
    «prefix: message») are translated in English mode."""
    js = tmp_path / "i.mjs"
    js.write_text(textwrap.dedent(f"""
        const I = await import({json.dumps(pathlib.Path(JS, "h3s_i18n.js").as_uri())});
        const r = {{}};
        r.ru = I.T("Отрезок {{0}}", 3); r.ruPl = I.plural(3, "отрезок", "отрезка", "отрезков");
        I.setLangForTests("en");
        r.en = I.T("Отрезок {{0}}", 3); r.miss = I.T("Нет такой строки {{0}}", 1); r.enPl = [I.plural(1, "a", "b", "c"), I.plural(3, "a", "b", "c")];
        r.srv = I.tServer("Карточка «Ann» уже есть — выберите другое имя");
        r.srv2 = I.tServer("Не создалась: Нет VAE: подключите VAE проводом к узлу студии или выберите в пресете моделей проекта");
        r.plain = I.tServer("CUDA out of memory");
        console.log(JSON.stringify(r));
    """))
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["ru"] == "Отрезок 3" and o["ruPl"] == "отрезка" and o["en"] == "Segment 3" and o["miss"] == "Нет такой строки 1"
    assert o["enPl"] == ["a", "c"] and o["srv"] == "Card “Ann” already exists — choose another name"
    assert o["srv2"].startswith("Not created: No VAE:") and o["plain"] == "CUDA out of memory"


@need_node
def test_help_has_english_version(tmp_path):
    """The English help mirrors the Russian one section by section and contains no Russian (except the language name)."""
    js = tmp_path / "h.mjs"
    js.write_text(textwrap.dedent(f"""
        const R = await import({json.dumps(pathlib.Path(JS, "h3s_help_ru.js").as_uri())});
        const E = await import({json.dumps(pathlib.Path(JS, "h3s_help_en.js").as_uri())});
        console.log(JSON.stringify({{ ru: R.HELP_RU.map((x) => x[0]), en: E.HELP_EN.map((x) => x[0]),
          cyr: E.HELP_EN.flatMap(([id, t, html]) => (t + html).replaceAll("Русский", "").match(/[А-Яа-яЁё]+/g) || []) }}));
    """))
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["ru"] == o["en"] and len(o["en"]) > 20
    assert not o["cyr"], o["cyr"][:20]


I18N_EXTRA = {"th": ("h3s_i18n_th.js", "ไทย", re.compile(r"[\u0E00-\u0E7F]")), "zh": ("h3s_i18n_zh.js", "中文", re.compile(r"[\u4E00-\u9FFF]"))}


def _dict_entries(name):
    out = {}
    for line in open(os.path.join(JS, name), encoding="utf-8"):
        m = re.match(r'^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$', line)
        if m:
            out[json.loads(m.group(1))] = json.loads(m.group(2))
    return out


def test_language_picker_lists_thai_and_chinese():
    """Settings → interface language offers Thai and Chinese (native names) next to Auto / Russian / English."""
    i18n = open(os.path.join(JS, "h3s_i18n.js"), encoding="utf-8").read()
    settings = open(os.path.join(JS, "h3s_settings.js"), encoding="utf-8").read()
    assert 'export const LANGS = ["auto", "ru", "en", "th", "zh"];' in i18n
    assert 'import TH from "./h3s_i18n_th.js";' in i18n and 'import ZH from "./h3s_i18n_zh.js";' in i18n
    assert '["en", "English"], ["th", "ไทย"], ["zh", "中文"]]' in settings
    assert settings.count('["th", "ไทย"]') == 1 and settings.count('["zh", "中文"]') == 1   # one picker, no duplicates
    assert 'h("select", { class: "h3z-sel sm" }, [["auto"' in settings   # the same picker control as before


@pytest.mark.parametrize("code", sorted(I18N_EXTRA))
def test_extra_ui_dictionary_matches_english(code):
    """th/zh: every key exists in the English dictionary, {0}… holes and <tags> match it, the text is in the language
    (no Russian left); keys they lack fall back to English at runtime. No help file is needed for them."""
    name, label, script = I18N_EXTRA[code]
    en, d = _dict_entries("h3s_i18n_en.js"), _dict_entries(name)
    assert len(d) > 0.95 * len(en)
    assert set(d) <= set(en), sorted(set(d) - set(en))[:10]
    holes = lambda s: sorted(re.findall(r"\{\d+\}|<\/?[A-Za-z][^<>]*?(?=[\s>])|&[a-z]+;", s))
    bad = [k for k, v in d.items() if holes(v) != holes(en[k])]
    assert not bad, bad[:10]
    assert not [v for v in d.values() if CYR.search(v)]
    assert sum(1 for v in d.values() if script.search(v)) > 0.9 * len(d)
    assert not os.path.exists(os.path.join(JS, f"h3s_help_{code}.js"))   # the help is not translated: English is shown


@need_node
def test_i18n_thai_chinese_runtime(tmp_path):
    """Thai / Chinese: T() uses their dictionary, a missing key falls back to English, then to Russian; plurals use
    the one/many forms; server messages are translated; the help panel shows the English help (not empty)."""
    js = tmp_path / "tz.mjs"
    js.write_text(textwrap.dedent(f"""
        const I = await import({json.dumps(pathlib.Path(JS, "h3s_i18n.js").as_uri())});
        const H = await import({json.dumps(pathlib.Path(JS, "h3s_help.js").as_uri())});
        const E = await import({json.dumps(pathlib.Path(JS, "h3s_help_en.js").as_uri())});
        const R = await import({json.dumps(pathlib.Path(JS, "h3s_help_ru.js").as_uri())});
        const r = {{ langs: I.LANGS, ruHelp: H.HELP() === R.HELP_RU }};
        for (const l of ["th", "zh"]) {{
          I.setLangForTests(l);
          r[l] = {{ seg: I.T("Отрезок {{0}}", 3), lang: I.T("Язык интерфейса"), miss: I.T("Нет такой строки {{0}}", 1),
            pl: [I.plural(1, "a", "b", "c"), I.plural(3, "a", "b", "c")], srv: I.tServer("Генерация прервана"),
            help: H.HELP() === E.HELP_EN && H.HELP().length > 20, helpTitle: I.T("Справка H3ZeroStudio") }};
        }}
        console.log(JSON.stringify(r));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(js)], capture_output=True, text=True, timeout=60, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["langs"] == ["auto", "ru", "en", "th", "zh"] and o["ruHelp"]
    assert o["th"]["seg"] == "ช่วง 3" and o["zh"]["seg"] == "分段 3"
    assert o["th"]["lang"] == "ภาษาของอินเทอร์เฟซ" and o["zh"]["lang"] == "界面语言"
    for l in ("th", "zh"):
        assert o[l]["miss"] == "Нет такой строки 1" and o[l]["pl"] == ["a", "c"] and o[l]["help"]
        assert not CYR.search(o[l]["srv"]) and not CYR.search(o[l]["helpTitle"])


def test_node_texts_are_english_with_russian_locale():
    """nodes.py speaks English (class keys and input names untouched); locales/ru/nodeDefs.json covers the same fields."""
    src = open(os.path.join(ROOT, "nodes.py"), encoding="utf-8").read()
    assert not CYR.search(src)
    assert '"ZL_H3ZeroStudio"' in src and '"ZL_H3Studio"' in src
    ru = json.load(open(os.path.join(ROOT, "locales", "ru", "nodeDefs.json"), encoding="utf-8"))
    for nid in ("ZL_H3ZeroStudio", "ZL_H3Studio"):
        d = ru[nid]
        assert d["display_name"] == "H3ZeroStudio · Таймлайн" and CYR.search(d["description"])
        assert set(d["inputs"]) == {"project", "model", "clip", "vae", "audio_vae", "audio", "sampler", "sigmas"} and set(d["outputs"]) == {"0", "1", "2"}
        assert all(CYR.search(d["inputs"][k]["tooltip"]) for k in d["inputs"])   # every input has a Russian tooltip
