"""Inspector segment panel is split into themed card blocks."""
import os


def test_segment_inspector_split_into_cards():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    assert "inspCard(" in ed and "h3z-insp-block" in ed
    assert "document.createDocumentFragment" in ed
    # five logical groups still present
    assert 'T("Связь с предыдущим")' in ed
    assert 'T("Промпт отрезка")' in ed
    assert 'T("Референсы")' in ed
    assert "takesBlock(i)" in ed and "upscaleBlock(i)" in ed
    st = open(os.path.join(root, "h3s_style.js"), encoding="utf-8").read()
    assert "h3z-insp-block" in st and "var(--panel)" in st


def test_genmeta_menu_and_module():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    assert os.path.isfile(os.path.join(root, "h3s_genmeta.js"))
    menus = open(os.path.join(root, "h3s_menus.js"), encoding="utf-8").read()
    assert "Параметры генерации" in menus and "Повторить" in menus
    gal = open(os.path.join(root, "h3s_gallery.js"), encoding="utf-8").read()
    assert "Параметры генерации" in gal
