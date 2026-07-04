import anthropic
from config import AI_API_KEY
import json
import re

client = anthropic.Anthropic(api_key=AI_API_KEY)

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
