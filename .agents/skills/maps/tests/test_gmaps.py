import importlib.util
import io
import json
import sys
import types
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "gmaps.py"
spec = importlib.util.spec_from_file_location("gmaps", MODULE_PATH)
gmaps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gmaps)


class GMapsTests(unittest.TestCase):
    def test_distance_matrix_maps_driving_to_drive(self):
        args = types.SimpleNamespace(origins=["A"], destinations=["B"], mode="driving")
        with patch.object(gmaps, "api_post_fieldmask", return_value={}) as call, patch.object(gmaps, "out"):
            gmaps.cmd_distance_matrix(args)
        self.assertEqual(call.call_args.args[1]["travelMode"], "DRIVE")

    def test_streetview_accepts_zero_coordinates(self):
        args = types.SimpleNamespace(lat=0.0, lng=0.0, location=None, size="600x400", heading=None, pitch=None, fov=None, pano=None, output=None)
        with patch.object(gmaps, "download_file", return_value={"ok": True}) as call, patch.object(gmaps, "out"):
            gmaps.cmd_streetview(args)
        self.assertEqual(call.call_args.args[1]["location"], "0.0,0.0")

    def test_static_map_falls_back_when_coordinate_pair_incomplete(self):
        args = types.SimpleNamespace(lat=0.0, lng=None, center="Medellin", zoom=14, size="600x400", maptype="roadmap", format="png", markers=None, path_line=None, style=None, scale=None, output=None)
        with patch.object(gmaps, "download_file", return_value={"ok": True}) as call, patch.object(gmaps, "out"):
            gmaps.cmd_static_map(args)
        self.assertEqual(call.call_args.args[1]["center"], "Medellin")

    def test_http_error_parse_failure_is_reported(self):
        class BadHTTPError(Exception):
            code = 400
            def read(self):
                return b"not-json"
        request = types.SimpleNamespace()
        stderr = io.StringIO()
        with patch.object(gmaps.urllib.request, "Request", return_value=request), patch.object(gmaps.urllib.request, "urlopen", side_effect=gmaps.urllib.error.HTTPError("u", 400, "bad", {}, None)):
            err = gmaps.urllib.error.HTTPError("u", 400, "bad", {}, None)
            err.read = lambda: b"not-json"
            with patch.object(gmaps.urllib.request, "urlopen", side_effect=err), redirect_stderr(stderr):
                with self.assertRaises(SystemExit):
                    gmaps._request("https://example.invalid")
        self.assertIn("failed to parse HTTP error response body", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
