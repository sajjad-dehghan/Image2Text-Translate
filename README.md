# Image2Text Translate

A short Python script that extracts English text from an image with **Tesseract OCR** and translates it sentence by sentence into **Persian (Farsi)** with `googletrans`.

## How It Works

`src/main.py`:

1. Sets the path to the Tesseract executable (`pytesseract.pytesseract.tesseract_cmd`).
2. Opens the image with Pillow.
3. Extracts the text with `pytesseract.image_to_string`.
4. Splits the text into sentences on `.` and prints each one.
5. Translates each non-empty sentence into Persian (`dest='fa'`) with `googletrans.Translator` and prints the translation. If a sentence fails to translate, the script prints an error message and continues.

A sample input image is in `photo/2.png`: an English paragraph about the early days of the web.

## Prerequisites

- Python 3
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) installed locally
- Python packages:

  ```bash
  pip install pytesseract pillow googletrans==4.0.0-rc1
  ```

`googletrans` calls Google Translate online, so the script needs internet access.

## Usage

1. Clone the repository:

   ```bash
   git clone https://github.com/sedwna/Image2Text-Translate.git
   cd Image2Text-Translate
   ```

2. Edit the two hard-coded paths in `src/main.py`:
   - `pytesseract.pytesseract.tesseract_cmd`: your Tesseract executable (the default is `C:\Program Files\Tesseract-OCR\tesseract.exe`)
   - `Image.open(...)`: the image to read, for example `photo/2.png`

3. Run the script:

   ```bash
   python src/main.py
   ```

The script prints the extracted sentences first, then their Persian translations.

## Customization

- **Target language:** change `dest='fa'` in `translator.translate()` to any language code from `googletrans.LANGUAGES`.
- **OCR quality:** results depend on image quality, so clear, high-contrast text works best.

## Project Structure

```
Image2Text-Translate/
├── photo/
│   └── 2.png          # sample input image
├── src/
│   └── main.py        # OCR + translation script
└── README.md
```

## Acknowledgments

- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
- [googletrans](https://pypi.org/project/googletrans/)
- [Pillow](https://python-pillow.org/)
