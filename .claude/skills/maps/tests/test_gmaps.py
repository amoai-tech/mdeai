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

    def test_only_approved_google_api_hosts_allowed(self):
        for url in (
            "https://evil.example/steal?key=secret",
            "http://maps.googleapis.com/maps/api/geocode/json",
            "https://maps.googleapis.com:8080/maps/api/geocode/json",
            "https://user:pass@maps.googleapis.com/maps/api/geocode/json",
            "https://maps.googleapis.com@evil.example/steal",
            "https://maps.googleapis.com.evil.example/steal",
            "https://evil.example@maps.googleapis.com:8443/path",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                gmaps._request(url)

    def test_redirect_handler_rejects_untrusted_destination(self):
        request = gmaps.urllib.request.Request(
            "https://maps.googleapis.com/maps/api/geocode/json?key=test"
        )
        self.assertIsNone(
            gmaps._NoRedirect().redirect_request(
                request, None, 302, "Found", {}, "https://evil.example/"
            )
        )

    def test_valid_google_api_request_uses_no_redirect_handler(self):
        class FakeResponse:
            def __init__(self):
                self.headers = {"Content-Type": "application/json"}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b'{"ok":true}'
        with patch.object(gmaps.urllib.request, "build_opener") as builder:
            builder.return_value.open.return_value = FakeResponse()
            result = gmaps._request("https://maps.googleapis.com/maps/api/geocode/json")
        self.assertEqual(result, {"ok": True})
        self.assertTrue(any(isinstance(h, gmaps._NoRedirect) for h in builder.call_args.args))
        self.assertEqual(builder.return_value.open.call_count, 1)

    def test_http_error_parse_failure_is_reported(self):
        stderr = io.StringIO()
        err = gmaps.urllib.error.HTTPError("u", 400, "bad", {}, None)
        err.read = lambda: b"not-json"
        with patch.object(gmaps.urllib.request, "build_opener") as builder, redirect_stderr(stderr):
            builder.return_value.open.side_effect = err
            with self.assertRaises(SystemExit):
                gmaps._request("https://maps.googleapis.com/maps/api/geocode/json")
        self.assertIn("failed to parse HTTP error response body", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
