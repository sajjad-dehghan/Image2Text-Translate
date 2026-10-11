import importlib.util
import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location("server", Path(__file__).resolve().parents[1] / "src/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class TextValidationTests(unittest.TestCase):
    def test_valid_text(self):
        self.assertEqual(server.validate_text({"text": " Hello world. "}), "Hello world.")

    def test_bad_inputs(self):
        for value in [None, [], {}, {"text": 2}, {"text": "   "}, {"text": "x" * 12001}]:
            with self.assertRaises(ValueError):
                server.validate_text(value)


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def post(self, body, origin=None, csrf=None):
        request = Request(self.base + "/api/translate", data=json.dumps(body).encode(), headers={
            "Content-Type": "application/json", "Origin": origin or self.base,
            "X-CSRF-Token": csrf if csrf is not None else server.CSRF,
        })
        try:
            response = urlopen(request, timeout=4)
        except HTTPError as error:
            response = error
        return response.code, json.loads(response.read())

    def test_rejects_foreign_origin_and_missing_csrf(self):
        self.assertEqual(self.post({"text": "Hello"}, origin="https://example.com")[0], 403)
        self.assertEqual(self.post({"text": "Hello"}, csrf="")[0], 403)

    def test_rejects_invalid_text(self):
        self.assertEqual(self.post({"text": ""})[0], 400)
        self.assertEqual(self.post({"text": "x" * 12001})[0], 400)

    def test_returns_result_from_translation_provider(self):
        async def fake_provider(text):
            self.assertEqual(text, "Hello")
            return "سلام"
        with patch.object(server, "translate_text", fake_provider):
            self.assertEqual(self.post({"text": "Hello"}), (200, {"translation": "سلام"}))

    def test_provider_failure_is_not_fake_success(self):
        async def failed_provider(text):
            raise RuntimeError("offline")
        with patch.object(server, "translate_text", failed_provider):
            code, body = self.post({"text": "Hello"})
            self.assertEqual(code, 502)
            self.assertNotIn("translation", body)

    def test_private_source_not_served(self):
        with self.assertRaises(HTTPError) as caught:
            urlopen(self.base + "/../src/server.py", timeout=4)
        self.assertEqual(caught.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
