import anthropic
from config import AI_API_KEY
import json
import re
import base64
import io
from PIL import Image
from pdf2image import convert_from_path

client = anthropic.Anthropic(api_key=AI_API_KEY)


def _encode_image_for_claude(file_path: str) -> list:
    """Encode an image or PDF into Claude-compatible content blocks."""
    if file_path.lower().endswith(".pdf"):
        pages = convert_from_path(file_path)
        blocks = []
        for page in pages:
            buf = io.BytesIO()
            page.save(buf, format="PNG")
            blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.standard_b64encode(buf.getvalue()).decode("utf-8"),
                },
            })
        return blocks
    else:
        with Image.open(file_path) as img:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
        return [{
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.standard_b64encode(buf.getvalue()).decode("utf-8"),
            },
        }]

def parse_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code blocks if present
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(text)

def extract_fields(text: str) -> dict:
    prompt = f"""
    Extract from OCR text (may have errors):

    - vendor_name: The FIRST/HIGHEST company name with logo at the very top. This is usually the largest text or has a company logo. Skip any names that appear below it. NEVER use "BILL TO"/"SHIP TO" sections. Vendor name will never be Saba Petroleum LLC
    - document_date: Date from "DATE" or "Invoice Date" field (YYYY-MM-DD)
    - total_amount: The main payment amount - look for "Total", "Balance Due", "Amount Due", "Installment Amount", or the largest monetary value. If multiple amounts exist, prioritize non-zero values. Return number only.
    - document_type: "receipt", "invoice", "bill", "statement", or "other"

    Use null if uncertain. Convert dates to YYYY-MM-DD.

    {text}

    Return ONLY valid JSON, no explanation:
    {{"vendor_name": "...", "document_date": "YYYY-MM-DD", "total_amount": 0.00, "document_type": "..."}}
    """

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )

    return parse_json(message.content[0].text)


def extract_fields_from_image(file_path: str) -> dict:
    """Extract document fields directly from an image using Claude vision."""
    images = _encode_image_for_claude(file_path)
    prompt = """Extract from this document image:

- vendor_name: The FIRST/HIGHEST company name with logo at the very top. Skip any names below it. NEVER use "BILL TO"/"SHIP TO" sections. Vendor name will never be Saba Petroleum LLC.
- document_date: Date from "DATE" or "Invoice Date" field (YYYY-MM-DD)
- total_amount: The main payment amount — look for "Total", "Balance Due", "Amount Due", "Installment Amount", or the largest monetary value. Return number only.
- document_type: "receipt", "invoice", "bill", "statement", or "other"

Use null if uncertain. Convert dates to YYYY-MM-DD.

Return ONLY valid JSON, no explanation:
{"vendor_name": "...", "document_date": "YYYY-MM-DD", "total_amount": 0.00, "document_type": "..."}"""

    content = images + [{"type": "text", "text": prompt}]
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": content}]
    )
    return parse_json(message.content[0].text)


def extract_report_fields_from_image(file_path: str) -> dict:
    """Extract daily report fields directly from an image using Claude vision."""
    images = _encode_image_for_claude(file_path)
    prompt = """You are extracting daily financial data from a gas station daily report image.

Extract the following fields:

- entry_date: The date of this daily report. Return in YYYY-MM-DD format. If not found, return null.
- income: Find "Store Sales" or "Grocery" value, then find "EBT" or "Food Stamps" or "SNAP" value, and add them together. Do NOT include "Gas Sales", "Fuel", or any combined total.
- payouts: Look for "Payout", "Payouts"
- tax: Look for "Sales Tax", "Tax"

STRICT RULES:
- Return numbers only for numeric fields. No $ signs, no commas.
- For income, only use the specific "Store Sales"/"Grocery" line and "EBT" line. Never use a combined total.
- If EBT is zero or not present, income = store sales only.
- If a category label is present but has NO value next to it, return 0.
- If a numeric category is not found at all, return 0.
- Never make up or estimate values. Only return what is explicitly visible.

Return ONLY valid JSON, no explanation:
{"entry_date": "YYYY-MM-DD", "income": 0.0, "payouts": 0.0, "tax": 0.0}"""

    content = images + [{"type": "text", "text": prompt}]
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": content}]
    )
    return parse_json(message.content[0].text)

def extract_report_fields(text: str) -> dict:
    prompt = f"""
    You are extracting daily financial data from OCR text of a gas station daily report. The text may contain OCR errors or inconsistent formatting.

    Extract the following fields. Each field may appear under different names — use the aliases listed:

    - entry_date: The date of this daily report. Look anywhere on the document for a date. Return in YYYY-MM-DD format. If not found, return null.
    - income: Find "Store Sales" or "Grocery" value, then find "EBT" or "Food Stamps" or "SNAP" value, and add them together. IMPORTANT: do NOT include "Gas Sales", "Fuel", or any total/subtotal that combines multiple categories.
    - payouts: look for "Payout", "Payouts"
    - tax: look for "Sales Tax", "Tax"

    STRICT RULES:
    - Return numbers only for numeric fields. No $ signs, no commas.
    - For income, only use the specific "Store Sales"/"Grocery" line and "EBT" line. Never use a combined total.
    - If EBT is zero or not present, income = store sales only.
    - If a category label is present but has NO value next to it, return 0.
    - If a numeric category is not found at all in the text, return 0.
    - Never make up or estimate values. Only return what is explicitly written.

    {text}

    Return ONLY valid JSON, no explanation:
    {{"entry_date": "YYYY-MM-DD", "income": 0.0, "payouts": 0.0, "tax": 0.0}}
    """

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )

    return parse_json(message.content[0].text)
