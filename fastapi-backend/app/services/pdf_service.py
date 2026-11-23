import io
import logging
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
