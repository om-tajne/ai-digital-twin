import pdfplumber
import pytesseract
from pdf2image import convert_from_path


from app.services.pdf_service import _ocr_settings

# Tesseract / Poppler locations come from .env (TESSERACT_CMD / POPPLER_PATH) or PATH
_tesseract_cmd, _poppler_path = _ocr_settings()
if _tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = _tesseract_cmd


def process_pdf(file_path):
    extracted_text = ""

    try:
        # Step 1: Extract text using pdfplumber
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()

                if page_text:
                    extracted_text += page_text + "\n"

        # Step 2: If no text found, use OCR
        if not extracted_text.strip():
            print("No text found. Running OCR...")

            images = convert_from_path(
                file_path,
                poppler_path=_poppler_path,
            )

            for image in images:
                extracted_text += (
                    pytesseract.image_to_string(image)
                )

        return extracted_text

    except Exception as e:
        return f"Error: {str(e)}"


def chunk_text(
    text,
    chunk_size=1000,
    chunk_overlap=200
):
    """
    Split extracted text into smaller overlapping chunks.

    Args:
        text: Extracted PDF text.
        chunk_size: Maximum size of each chunk.
        chunk_overlap: Number of characters shared between chunks.

    Returns:
        List of text chunks.
    """

    if not text or not text.strip():
        return []

    if chunk_overlap >= chunk_size:
        raise ValueError(
            "chunk_overlap must be smaller than chunk_size"
        )

    # Clean unnecessary whitespace
    text = " ".join(text.split())

    chunks = []

    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        # Move forward while keeping overlap
        start = end - chunk_overlap

    return chunks