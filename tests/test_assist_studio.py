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


def test_llm_stats_include_ttft():
    from h3s import h3s_llm as llm
    import inspect
    src = inspect.getsource(llm._stats)
    assert "ttft" in src
    assert "first_token_at" in inspect.getsource(llm._stream_once)
