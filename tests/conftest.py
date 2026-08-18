import atexit
import base64
import os
import sys
import pytest


@pytest.fixture(autouse=True)
def _reset_contract_registry():
    yield
    try:
        import genlayer.gl.genvm_contracts as contracts
    except ImportError:
        return
    contracts.__known_contract__ = None


def warp_to(direct_vm, iso_timestamp: str) -> None:
    direct_vm.warp(iso_timestamp)
    gl = sys.modules.get("genlayer.gl")
    if gl is None:
        return
    raw = getattr(gl, "message_raw", None)
    if isinstance(raw, dict): raw["datetime"] = iso_timestamp
    message = getattr(gl, "message", None)
    nested = getattr(message, "raw", None)
    if isinstance(nested, dict): nested["datetime"] = iso_timestamp


if sys.platform == "win32":
    from gltest.direct import loader as _loader
    _leaked = []
    _unlink = os.unlink
    def _tolerant(path, *args, **kwargs):
        try: return _unlink(path, *args, **kwargs)
        except PermissionError: _leaked.append(os.fspath(path))
    _original = _loader._inject_message_to_fd0
    def _inject(vm):
        os.unlink = _tolerant
        try: return _original(vm)
        finally: os.unlink = _unlink
    _loader._inject_message_to_fd0 = _inject

    # gltest 0.29.2 returns empty bytes for mocked screenshots, while the SDK
    # correctly attempts to decode them as an image. Supply a valid 1x1 PNG so
    # image-aware contracts can be exercised in direct mode on every platform.
    from gltest.direct import wasi_mock as _wasi
    _render = _wasi._handle_web_render
    _png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    def _image_render(vm, data):
        result = _render(vm, data)
        if data.get("mode") == "screenshot" and result.get("ok", {}).get("image") == b"":
            result["ok"]["image"] = _png
        return result
    _wasi._handle_web_render = _image_render
    @atexit.register
    def _sweep():
        for path in _leaked:
            try: _unlink(path)
            except OSError: pass
