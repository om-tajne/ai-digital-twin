import io
import logging
import os
from typing import List
import pdfplumber

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        RecursiveCharacterTextSplitter = None

logger = logging.getLogger(__name__)

OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "50"))


def _ocr_settings():
    """
    Where Tesseract / Poppler live. Works on Windows, macOS, Linux and Docker:
    set TESSERACT_CMD / POPPLER_PATH in .env to override, otherwise the binaries
    are found on PATH (or in the default Windows install folder).
    """
    tesseract_cmd = os.getenv("TESSERACT_CMD")
    if not tesseract_cmd and os.name == "nt":
        default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        tesseract_cmd = default if os.path.exists(default) else None
    return tesseract_cmd, os.getenv("POPPLER_PATH") or None


def ocr_pdf(pdf_bytes: bytes) -> str:
    """OCR a scanned PDF. Returns "" (and logs why) if OCR tooling is unavailable."""
    try:
        import pytesseract
        from pdf2image import convert_from_bytes

        tesseract_cmd, poppler_path = _ocr_settings()
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

        images = convert_from_bytes(
            pdf_bytes, poppler_path=poppler_path, last_page=OCR_MAX_PAGES
        )
        pages = []
        for index, image in enumerate(images):
            text = pytesseract.image_to_string(image).strip()
            if text:
                pages.append(f"--- Page {index + 1} ---\n{text}")
        return "\n\n".join(pages).strip()
    except Exception as e:  # missing tesseract/poppler, corrupt file, ...
        logger.warning(
            "OCR skipped (%s). Install Tesseract + Poppler, or set TESSERACT_CMD / POPPLER_PATH in .env.", e
        )
        return ""

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts text content from PDF bytes using pdfplumber with pypdfium2 fallback.
    """
    extracted_text = []

    # 1. Primary extraction with pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for index, page in enumerate(pdf.pages):
                page_text = (page.extract_text() or "").strip()
                if page_text:
                    extracted_text.append(f"--- Page {index + 1} ---\n{page_text}")
    except Exception as e:
        logger.warning(f"pdfplumber text extraction notice: {e}")

    full_text = "\n\n".join(extracted_text).strip()

    # 2. Fallback to pypdfium2 (Chrome PDFium engine) if text is empty or very short
    if len(full_text) < 50:
        try:
            import pypdfium2 as pdfium
            pdf_doc = pdfium.PdfDocument(io.BytesIO(pdf_bytes))
            pdfium_texts = []
            for i, page in enumerate(pdf_doc):
                text_page = page.get_textpage()
                page_text = (text_page.get_text_range() or "").strip()
                if page_text:
                    pdfium_texts.append(f"--- Page {i + 1} ---\n{page_text}")
            pdfium_full = "\n\n".join(pdfium_texts).strip()
            if len(pdfium_full) > len(full_text):
                full_text = pdfium_full
                logger.info(f"pypdfium2 successfully extracted {len(full_text)} characters")
        except Exception as p_err:
            logger.warning(f"pypdfium2 extraction notice: {p_err}")

    # 3. Scanned document (images only): run OCR
    if len(full_text) < 50:
        logger.info("Little selectable text found - running OCR")
        ocr_text = ocr_pdf(pdf_bytes)
        if len(ocr_text) > len(full_text):
            full_text = ocr_text

    if not full_text:
        return "No extractable text found in the provided document."

    return full_text


def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """
    Splits document text into semantic chunks using LangChain RecursiveCharacterTextSplitter.
    """
    if RecursiveCharacterTextSplitter:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        return splitter.split_text(text)

    # Fallback chunker if LangChain text splitter is not loaded
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return chunks
