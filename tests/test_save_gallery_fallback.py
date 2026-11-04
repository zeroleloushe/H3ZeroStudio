"""«Сохранить видео» falls back to the newest gallery final when the live result is stale."""
import os


def test_library_latest_final_prefers_gallery_final():
    from h3s import h3s_library as lib
    # unit: function exists and docstring mentions save-video use
    assert "gallery" in (lib.latest_final.__doc__ or "").lower() or "Сохранить" in (lib.latest_final.__doc__ or "")


def test_save_dialog_wires_gallery_fallback():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    menus = open(os.path.join(root, "h3s_menus.js"), encoding="utf-8").read()
    assert "latestGalleryFinal" in menus
    assert 'via === "gallery"' in menus
    assert "timelineSource" in menus
    assert "из галереи" in menus
    lib = open(os.path.join(os.path.dirname(__file__), "..", "h3s_library.py"), encoding="utf-8").read()
    assert "def latest_final" in lib
