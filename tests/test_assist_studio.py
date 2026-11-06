import pathlib
"""Native H3 assistant left-rail: modes, compact UI, no PromptForge chrome."""
import os


def test_assist_studio_layout_and_modes():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    for mode in ("t2va", "i2va", "ref2va", "fl2va", "l2va", "lipsync"):
        assert f'id: "{mode}"' in js
    assert "h3z-ast-panel" in js and "h3z-ast-mode" in js
    assert "astNeighPill" in js and "ctx_neighbours" in js
    assert "astContextCard" in js  # stub only; no clip card in chat
    assert "Соседние отрезки" in js
    assert "h3z-ast-ctx" not in js and 'det(T("Клип")' not in js
    assert "astTranslateLast" in js and "astShowVersions" in js
    assert "astInsertPrompt" in js and "TTFT" in js
    assert 'tool = "assist"' in js
    assert 'tool("assist", ICON.spark, T("Ассистент"))' in ed
    assert 'T("<span>Ассистент</span>")' not in ed
    for bad in ("h3z-ast-modetab", "h3z-ast-box", "h3z-ast-setbox", "Prompt Studio", "h3z-ast-emptyicon"):
        assert bad not in js, bad
    assert "overflow-x:hidden" in js and "min-width:0" in js
    assert "renderAssistSettingsView" in js
    assert "h3z-settab" in js
    assert "h3z-ast-stylecard" in js
    assert "h3z-ast-emptyblurb" in js
    assert "h3z-ast-moderow" in js and 'T("Режим")' in js
    assert 'T("Диалог")' in js
    assert "h3z-ast-sugg" not in js
    assert 'type: "checkbox"' not in js



def test_assist_api_field_and_chat_selection():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    paint = js.split("astPaintStatus() {")[1].split("astOpenSettings")[0]
    assert "renderAssistHead" not in paint
    assert "h3z-ast-status" in paint
    assert 'class: "h3z-note h3z-ast-conn"' in js
    assert 'type: "text", inputmode: "url"' in js
    assert 'type: "url"' not in js
    assert "sel.isCollapsed" in ed
    assert ".h3z-ast-bubble,.h3z-ast-reasonbody,.h3z-final" in ed


def test_llm_stats_include_ttft():
    from h3s import h3s_llm as llm
    import inspect
    src = inspect.getsource(llm._stats)
    assert "ttft" in src
    assert "first_token_at" in inspect.getsource(llm._stream_once)


def test_assist_live_reasoning_and_draft_and_keys():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    assert "astPaintStream" in js and "h3z-ast-content" in js
    assert "insertBefore(details" in js or "host.insertBefore(details" in js
    assert "astCaptureDraft" in js and "astRememberDraft" in js and "h3zs.ast.drafts" in js
    assert "astClearDraft" in js
    # On send: empty textarea before clear, cancel debounce, no restore after stream re-render
    assert "clearTimeout(this._astDraftT)" in js
    assert 'ta.value = ""; ta.style.height = "44px"' in js or 'ta.value = "";' in js
    assert "this.astClearDraft(cid)" in js
    assert "textarea.h3z-ast-input" in ed
    assert "Shift+Enter" in js or "shiftKey" in js
    assert "isComposing" in ed and "isComposing" in js
    style = open(os.path.join(root, "h3s_style.js"), encoding="utf-8").read()
    assert ".h3z-root .h3z-ast-bubble { background:transparent; }" in style


def test_assist_markdown_renderer():
    import subprocess, json, os
    root = os.path.join(os.path.dirname(__file__), "..")
    js = open(os.path.join(root, "web", "js", "h3s_assist.js"), encoding="utf-8").read()
    assert "export function astMd" in js and "astFillMd" in js
    assert "h3z-ast-pre" in js and "h3z-ast-code" in js
    r = subprocess.run(["node", "--input-type=module", "-e",
        "import { astMd } from './web/js/h3s_assist.js';"
        "const o=astMd('**a** `b`\\n\\n- x\\n\\n<script>z</script>');"
        "console.log(JSON.stringify({"
        "strong:o.includes('<strong>a</strong>'),"
        "code:o.includes('h3z-ast-code'),"
        "li:o.includes('h3z-ast-li'),"
        "esc:o.includes('&lt;script&gt;'),"
        "noRaw: !o.includes('<script>')"
        "}));"], cwd=root, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    data = json.loads(r.stdout.strip().splitlines()[-1])
    assert all(data.values()), data


def test_prompt_editor_uses_theme_vars():
    """Prompt editor surfaces must follow theme vars (no hardcoded navy/hex fills)."""
    import re
    js = pathlib.Path(__file__).resolve().parents[1].joinpath("web/js/h3s_prompted.js").read_text(encoding="utf-8")
    assert "export const PE_CSS" in js
    m = re.search(r"export const PE_CSS = String\.raw`(.*?)`;", js, re.S)
    assert m, "PE_CSS missing"
    css = m.group(1)
    assert "background:var(--panel2)" in css
    assert "background:var(--field)" in css
    assert "background:var(--panel)" in css
    assert "caret-color:var(--txt)" in css
    # strip var(...) then forbid leftover #hex / rgba surface paints
    stripped = re.sub(r"var\([^)]+\)", "", css)
    hard = re.findall(r"#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)", stripped)
    assert hard == [], f"hardcoded colors remain in PE_CSS: {hard[:12]}"


def test_welcome_has_ui_scale_picker():
    root = pathlib.Path(__file__).resolve().parents[1] / "web" / "js"
    settings = (root / "h3s_settings.js").read_text(encoding="utf-8")
    editor = (root / "h3s_editor.js").read_text(encoding="utf-8")
    assert "uiScaleSelect" in editor and "setUiScale" in editor
    assert "h3z-welcome-prefs" in settings or "uiScaleSelect(" in settings
    assert 'this.uiScaleSelect(' in settings
    assert "h3z-welcome-prefs" in (root / "h3s_style.js").read_text(encoding="utf-8")



def test_assist_markdown_no_intraword_underscore():
    """snake_case H3 keys must not become italic / lose underscores."""
    import pathlib, json, subprocess, textwrap
    root = pathlib.Path(__file__).resolve().parents[1]
    driver = root / "tests" / "_tmp_md_snake.mjs"
    driver.write_text(textwrap.dedent("""        import { astMd } from "../web/js/h3s_assist.js";
        const samples = [
          "non_diegetic_music",
          "subject_definitions",
          "retention_analysis",
          "overall_soundscape",
          "use `non_diegetic_music` in code",
          "say _italic_ but keep non_diegetic_music",
          "**bold** and non_diegetic_music",
        ];
        const out = samples.map((s) => ({ s, html: astMd(s) }));
        console.log(JSON.stringify(out));
    """), encoding="utf-8")
    r = subprocess.run(["node", str(driver)], cwd=str(root / "tests"), capture_output=True, text=True, timeout=30)
    try:
        driver.unlink()
    except OSError:
        pass
    assert r.returncode == 0, r.stderr
    rows = json.loads(r.stdout.strip().splitlines()[-1])
    for row in rows:
        html = row["html"]
        if row["s"] in ("non_diegetic_music", "subject_definitions", "retention_analysis", "overall_soundscape"):
            assert row["s"] in html, (row["s"], html)
            assert "<em>" not in html, html
        if "code" in row["s"]:
            assert "non_diegetic_music" in html
            assert "<code" in html
        if "italic" in row["s"]:
            assert "<em>italic</em>" in html
            assert "non_diegetic_music" in html
        if "bold" in row["s"]:
            assert "<strong>bold</strong>" in html
            assert "non_diegetic_music" in html
