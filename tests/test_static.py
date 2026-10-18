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
     "segments": [{"frames": 124, "upscale": {"method": "rtx", "scale": "1.4", "sigma": 0.01, "quality": "high"}, "approved": 1},
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
                  "seg_upscale": {"method": "rtx", "scale": 1.5}},
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
    {"settings": {"aspect": "16:9", "megapixels": 1.0, "seg_upscale": {"method": "rtx", "scale": 1.4}, "upscale_chunk_sec": 3.25, "upscale_chunk_overlap": 9},
     "segments": [{"frames": 362, "upscale": {"method": "latent", "scale": 2}}, {"frames": 158, "upscale": {"method": "tiles", "mp": 3.33333, "tile_ov": 7}},
                  {"frames": 124, "upscale": {"method": "latent", "mp": "0.1"}}, {"frames": 600, "upscale": {"method": "rtx", "mp": 99, "quality": "low"}}]},
    {"settings": {"upscale_chunk_sec": 0, "seg_upscale": {"method": "latent", "mp": 2.5}}, "segments": [{"frames": 600, "upscale": {"method": "latent", "mp": 2.5}}]},
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
        assert [[core.mp_for_scale(w, hh, 1.5), core.mp_for_scale(w, hh, 2), list(core.upscale_canvas(w, hh, {"mp": 3}))]
                for w, hh in ((960, 544), (1344, 768), (832, 480), (1280, 720))] == j["mpsc"]
        assert [core.upscale_key_form(s["upscale"], *core.work_resolution(p["settings"])) for s in p["segments"]] == j["keyform"]


def test_tooltips(h3s):
    cls = h3s.nodes.ZL_H3ZeroStudio
    spec = cls.INPUT_TYPES()
    for group in ("required", "optional"):
        for name, val in spec.get(group, {}).items():
            assert len(val) > 1 and val[1].get("tooltip"), f"нет подсказки у входа {name}"
    assert len(cls.OUTPUT_TOOLTIPS) == len(cls.RETURN_TYPES)


def test_editor_keeps_keyboard_sink_focused():
    """ComfyUI's ChangeTracker (window keydown, capture, registered before extensions) runs graph undo on Ctrl+Z
    unless an <input> is focused, so the editor must keep focus on its hidden read-only sink input."""
    src = pathlib.Path(ROOT, "web", "js", "h3s_editor.js").read_text(encoding="utf-8")
    assert 'class: "h3z-sink", readonly: true' in src
    assert "focusSink()" in src and 'classList?.contains("h3z-sink")' in src


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
    assert core.audio_seam_params(core.normalize_project({"settings": {"audio_xfade_sec": 5}})) == {"xfade": 1.0, "match": True}
    assert core.audio_seam_params(core.normalize_project({"settings": {"audio_xfade": False}}))["xfade"] == 0.0


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
