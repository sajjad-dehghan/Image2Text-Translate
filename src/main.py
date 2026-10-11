"""Original native OCR pipeline, with portable paths and asynchronous translation."""
import argparse
import asyncio
import os
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps
from server import translate_text


def main():
    parser = argparse.ArgumentParser(description="Read English text from an image and translate it to Persian")
    parser.add_argument("image", nargs="?", type=Path, default=Path(__file__).resolve().parents[1] / "photo/2.png")
    parser.add_argument("--ocr-only", action="store_true", help="Skip online translation")
    parser.add_argument("--tesseract", default=os.environ.get("TESSERACT_CMD"), help="Path to the native Tesseract executable")
    args = parser.parse_args()
    if args.tesseract:
        pytesseract.pytesseract.tesseract_cmd = args.tesseract
    try:
        with Image.open(args.image) as image:
            text = pytesseract.image_to_string(ImageOps.exif_transpose(image), lang="eng", timeout=60).strip()
    except (OSError, RuntimeError, pytesseract.TesseractNotFoundError) as error:
        parser.exit(1, f"OCR failed: {error}\nInstall Tesseract or use the browser interface (no native engine required).\n")
    print(text)
    if not text or args.ocr_only:
        return
    try:
        print("\n--- Persian ---\n")
        print(asyncio.run(asyncio.wait_for(translate_text(text), timeout=40)))
    except Exception:
        parser.exit(1, "Translation unavailable. The extracted text was printed above; try again when online.\n")


if __name__ == "__main__":
    main()
