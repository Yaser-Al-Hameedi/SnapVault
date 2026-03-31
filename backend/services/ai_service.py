from openai import OpenAI
from config import AI_API_KEY
import json

def extract_fields(text: str) -> dict:
    client = OpenAI(api_key=AI_API_KEY)

    prompt = f"""
    Extract from OCR text (may have errors):

    - vendor_name: The FIRST/HIGHEST company name with logo at the very top. This is usually the largest text or has a company logo. Skip any names that appear below it. NEVER use "BILL TO"/"SHIP TO" sections. Vendor name will never be Saba Petroleum LLC
    - document_date: Date from "DATE" or "Invoice Date" field (YYYY-MM-DD)
    - total_amount: The main payment amount - look for "Total", "Balance Due", "Amount Due", "Installment Amount", or the largest monetary value. If multiple amounts exist, prioritize non-zero values. Return number only.
    - document_type: "receipt", "invoice", "bill", "statement", or "other"

    Use null if uncertain. Convert dates to YYYY-MM-DD.

    {text}

    JSON: {{"vendor_name": "...", "document_date": "YYYY-MM-DD", "total_amount": 0.00, "document_type": "..."}}
    """

    response = client.chat.completions.create(
    model="gpt-4o-mini",  
    messages=[
        {"role": "system", "content": "You are a document extraction expert."},
        {"role": "user", "content": prompt}
    ],
    response_format={"type": "json_object"}
    )

    json_response = response.choices[0].message.content
    info_response = json.loads(json_response)

    return info_response

def extract_report_fields(text: str) -> dict:
    client = OpenAI(api_key=AI_API_KEY)

    report_prompt = f"""
    You are extracting daily financial data from OCR text of a gas station daily report. The text may contain OCR errors or inconsistent formatting.

    Extract the following 4 fields. Each field may appear under different names — use the aliases listed:

    - entry_date: The date of this daily report. Look anywhere on the document for a date. Return in YYYY-MM-DD format. If not found, return null.
    - income: Add together "Grocery Sales" / "Groceries" / "Store Sales" AND "EBT" / "Food Stamps" / "SNAP". Return their combined total as a single number.
    - lotto: look for "Lotto", "Lottery", "Scratch Offs"
    - payouts: look for "Payout", "Payouts", "Cash Out"
    - tax: look for "Tax", "Sales Tax"

    STRICT RULES:
    - Return numbers only for numeric fields. No $ signs, no commas.
    - For income, find grocery sales and EBT separately then add them together.
    - If a category label is present but has NO value next to it, return 0. Do NOT guess or fill in a value.
    - If a numeric category is not found at all in the text, return 0.
    - Never make up or estimate values. Only return what is explicitly written.

    {text}

    JSON: {{"entry_date": "YYYY-MM-DD", "income": 0.0, "lotto": 0.0, "payouts": 0.0, "tax": 0.0}}
    """

    response = client.chat.completions.create(
    model= "gpt-4o-mini",
    messages=[
            {"role": "system", "content": "You are a document extraction expert."},
            {"role": "user", "content": report_prompt}
    ],
    response_format={"type": "json_object"}
    )   

    json_response = response.choices[0].message.content
    info_response = json.loads(json_response)

    return info_response

    

