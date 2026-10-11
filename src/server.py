"""Loopback-only UI server. OCR runs in the browser; text translation uses googletrans."""
import argparse
import asyncio
import hmac
import importlib.util
import json
import secrets
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
MAX_TEXT = 12000
MAX_BODY = 80000
CSRF = secrets.token_urlsafe(32)
TRANSLATION_SLOTS = threading.BoundedSemaphore(2)


def validate_text(body):
    if not isinstance(body, dict) or not isinstance(body.get("text"), str):
        raise ValueError("یک متن معتبر برای ترجمه وارد کن.")
    text = body["text"].strip()
    if not text:
        raise ValueError("متن خالیه؛ اول متن انگلیسی رو وارد کن.")
    if len(text) > MAX_TEXT:
        raise ValueError("متن باید حداکثر ۱۲ هزار نویسه باشه.")
    return text


async def translate_text(text):
    from googletrans import Translator
    import httpx
    async with Translator(service_urls=["translate.googleapis.com"], timeout=httpx.Timeout(30), raise_exception=True) as translator:
        result = await translator.translate(text, src="en", dest="fa")
        if not result.text.strip():
            raise RuntimeError("Empty translation")
        return result.text


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, format, *args):
        # Neither uploaded text nor request bodies are logged.
        if args:
            print(f"HTTP {args[0]}", flush=True)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def json_response(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def valid_host(self):
        return self.headers.get("Host", "") in {
            f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"
        }

    def do_GET(self):
        if not self.valid_host():
            return self.json_response(403, {"error": "Invalid host"})
        route = urlsplit(self.path).path
        if route == "/api/health":
            return self.json_response(200, {"translation": importlib.util.find_spec("googletrans") is not None, "csrf": CSRF})
        if route == "/sample.png":
            data = (ROOT / "photo/2.png").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        target = (WEB / unquote(route).lstrip("/")).resolve()
        if not target.is_relative_to(WEB.resolve()) or target.is_dir() and route != "/":
            return self.json_response(404, {"error": "Not found"})
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin", "")
        if not self.valid_host() or origin != f"http://{self.headers.get('Host', '')}" or not hmac.compare_digest(self.headers.get("X-CSRF-Token", ""), CSRF):
            return self.json_response(403, {"error": "درخواست از مبدأ مجاز نیست. صفحه رو دوباره باز کن."})
        if urlsplit(self.path).path != "/api/translate":
            return self.json_response(404, {"error": "Not found"})
        if self.headers.get_content_type() != "application/json":
            return self.json_response(415, {"error": "درخواست باید JSON باشه."})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                return self.json_response(413, {"error": "اندازهٔ درخواست مجاز نیست."})
            text = validate_text(json.loads(self.rfile.read(size)))
        except (ValueError, UnicodeError):
            return self.json_response(400, {"error": "متن باید معتبر، غیرخالی و حداکثر ۱۲ هزار نویسه باشه."})
        if not TRANSLATION_SLOTS.acquire(blocking=False):
            return self.json_response(429, {"error": "ترجمهٔ دیگری در حال انجامه؛ کمی بعد دوباره امتحان کن."})
        try:
            result = asyncio.run(asyncio.wait_for(translate_text(text), timeout=40))
            self.json_response(200, {"translation": result})
        except Exception:
            self.json_response(502, {"error": "سرویس ترجمه پاسخ نداد؛ اتصال اینترنت رو بررسی کن و دوباره امتحان کن."})
        finally:
            TRANSLATION_SLOTS.release()


def main():
    parser = argparse.ArgumentParser(description="Run Image2Text's local web interface")
    parser.add_argument("--port", type=int, default=4319)
    args = parser.parse_args()
    if not (WEB / "vendor/tesseract.min.js").exists():
        parser.error("Run npm ci && npm run prepare:web first.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    print(f"Image2Text ready: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
