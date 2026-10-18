"""ComfyUI-H3ZeroStudio: video-editor style timeline for MiniMax H3 (author: Zero Leloushe)."""
try:
    from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from . import routes as _routes
    _routes.register()
except ImportError:  # imported outside ComfyUI (pytest collection)
    NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS = {}, {}

WEB_DIRECTORY = "./web/js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
