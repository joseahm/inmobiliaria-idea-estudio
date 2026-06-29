from __future__ import annotations

import io
import os
import re
import shutil
import unicodedata
import csv
import zipfile
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import quote
from xml.etree import ElementTree

from sqlmodel import Session, select

from .config import get_settings
from .models import (
    Charge,
    Contract,
    ContractTenant,
    CashMovement,
    Attachment,
    AuditLog,
    EmailImportRun,
    EmailInboxConfig,
    EmailProviderRule,
    InvoiceDocument,
    OwnerSettlement,
    OwnerSettlementLine,
    OwnerCharge,
    Payment,
    PaymentAllocation,
    Person,
    Property,
    PropertyOwnerShare,
    PropertyServiceAccount,
    PropertyVisit,
    RetentionVoucher,
    TenantCredit,
)


def money(value: float) -> float:
    return round(float(value or 0), 2)


def audit_log(
    session: Session,
    entity_type: str,
    entity_id: Optional[int],
    action: str,
    description: str = "",
    created_by: str = "admin",
) -> AuditLog:
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        description=description,
        created_by=created_by,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def strip_accents(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFD", value or "")
        if unicodedata.category(char) != "Mn"
    )


def compact_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", strip_accents(value).lower())


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def parse_invoice_number(value: str) -> Optional[float]:
    cleaned = re.sub(r"[^\d,.\-]", "", value or "")
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(".") > cleaned.rfind(","):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "." in cleaned:
        groups = cleaned.split(".")
        if len(groups[-1]) == 3 and all(group.isdigit() for group in groups):
            cleaned = "".join(groups)
    try:
        return money(float(cleaned))
    except ValueError:
        return None


def valid_invoice_amount(value: Optional[float]) -> bool:
    return value is not None and 0 < value <= 500_000


def line_has_percentage_number(line: str, raw_match: str) -> bool:
    escaped = re.escape(raw_match.strip())
    return bool(re.search(rf"{escaped}\s*%", line))


def detect_invoice_provider(text: str, filename: str = "") -> Dict[str, str]:
    haystack = strip_accents(f"{filename}\n{text}").lower()
    checks = [
        ("UTE", "UTE", [r"\bute\b", r"ute\.com", r"energia electrica", r"electricidad"]),
        ("OSE", "OSE", [r"\bose\b", r"obras sanitarias", r"agua potable"]),
        (
            "Gastos comunes",
            "GASTOS_COMUNES",
            [r"gastos comunes", r"expensas", r"administracion edificio", r"liquidacion edificio", r"gastos a pagar"],
        ),
        ("Tributos", "TRIBUTOS", [r"tributos", r"intendencia", r"contribucion", r"primaria"]),
        ("Saneamiento", "SANEAMIENTO", [r"saneamiento"]),
    ]
    for provider, concept, patterns in checks:
        if any(re.search(pattern, haystack, re.I) for pattern in patterns):
            return {"provider": provider, "concept": concept}
    return {"provider": "No identificado", "concept": "OTROS"}


def extract_invoice_amount(text: str) -> Optional[float]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    keyword_re = re.compile(r"(total\s+a\s+pagar|importe|monto|saldo|total|pagar)", re.I)
    number_re = re.compile(r"(?<!\d)(?:\$?\s*)?(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?!\d)")
    candidates: List[float] = []
    for line in lines:
        if keyword_re.search(strip_accents(line)):
            for match in number_re.findall(line):
                number = parse_invoice_number(match)
                if valid_invoice_amount(number) and number > 100 and not line_has_percentage_number(line, match):
                    candidates.append(number)
    if candidates:
        return max(candidates)

    for match in number_re.findall(text):
        number = parse_invoice_number(match)
        if valid_invoice_amount(number) and number > 100:
            candidates.append(number)
    return max(candidates) if candidates else None


def parse_invoice_date(raw: str) -> Optional[str]:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def extract_invoice_due_date(text: str) -> Optional[str]:
    date_re = re.compile(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})")
    normalized = strip_accents(text)
    for line in normalized.splitlines():
        if re.search(r"venc|vence|pagar antes|fecha limite", line, re.I):
            for match in date_re.findall(line):
                parsed = parse_invoice_date(match)
                if parsed:
                    return parsed
    for match in date_re.findall(normalized):
        parsed = parse_invoice_date(match)
        if parsed:
            return parsed
    return None


def extract_invoice_account(text: str) -> str:
    normalized = strip_accents(text)
    account_re = re.compile(
        r"(?:cuenta|servicio|nis|cliente|referencia|contrato)\D{0,18}([A-Z0-9][A-Z0-9\-.\/ ]{3,24})",
        re.I,
    )
    for match in account_re.findall(normalized):
        candidate = match.strip(" -./:")
        if len(compact_key(candidate)) >= 4 and len(re.findall(r"\d", candidate)) >= 4:
            return candidate
    return ""


def normalize_ute_account(raw: str) -> str:
    digits = digits_only(raw)
    return digits[:10] if len(digits) >= 10 else digits


def extract_ute_account(text: str) -> str:
    normalized = strip_accents(text)
    long_references = re.findall(r"\b(\d{20,})\b", normalized)
    for reference in long_references:
        if reference.startswith("56"):
            return reference[:10]

    patterns = [
        r"e-?ticket\s+credito\D{0,20}([\d\s]{7,18})",
        r"referencia\s+de\s+pago\D{0,30}(\d{10})\d+",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, re.I | re.S)
        if match:
            account = normalize_ute_account(match.group(1))
            if len(account) >= 7:
                return account

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if re.search(r"e-?ticket|credito", line, re.I):
            for next_line in lines[index + 1 : index + 5]:
                if re.search(r"rut|telefono|tel|paraguay|montevideo|1930", next_line, re.I):
                    continue
                account = normalize_ute_account(next_line)
                if len(account) >= 7:
                    return account
        if re.search(r"cuenta", line, re.I):
            inline_match = re.search(r"(UTE[-\s]?\d{4,}|\b\d{7,12}\b)", line, re.I)
            if inline_match:
                raw_account = inline_match.group(1).strip().replace(" ", "").upper()
                return raw_account if raw_account.startswith("UTE") else normalize_ute_account(raw_account)
            for next_line in lines[index + 1 : index + 9]:
                if re.search(
                    r"rut|telefono|tel|paraguay|montevideo|1930|iva|importe|total|cargo|%|\$",
                    next_line,
                    re.I,
                ) or parse_invoice_date(next_line):
                    continue
                account = normalize_ute_account(next_line)
                if len(account) >= 7:
                    return account
    return ""


def extract_ute_amount(text: str) -> Optional[float]:
    normalized = strip_accents(text)
    currency_values = []
    for match in re.findall(r"\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})?)", normalized):
        number = parse_invoice_number(match)
        if valid_invoice_amount(number) and number and number > 100:
            currency_values.append(number)
    if currency_values:
        return max(currency_values)

    total_match = re.search(
        r"(?:importe\s+total|total\s+cargos\s+del\s+mes|total)\D{0,80}(\d{1,3}(?:\.\d{3})*(?:,\d{2}))",
        normalized,
        re.I | re.S,
    )
    if total_match:
        number = parse_invoice_number(total_match.group(1))
        if valid_invoice_amount(number):
            return number

    barcode_amount = re.search(r"\*0{4,}(\d{4,9})\*", normalized)
    if barcode_amount:
        number = money(int(barcode_amount.group(1)) / 100)
        if valid_invoice_amount(number):
            return number
    return None


def extract_ute_due_date(text: str) -> Optional[str]:
    normalized = strip_accents(text)
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        line_key = line.lower()
        if "venc" in line_key and "prox" not in line_key and "emision" not in line_key:
            for next_line in lines[index : index + 8]:
                next_key = next_line.lower()
                if (
                    next_line != line
                    and ("prox" in next_key or "emision" in next_key or "factura" in next_key)
                ):
                    break
                dates = re.findall(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}", next_line)
                if dates:
                    return parse_invoice_date(dates[0])

    for index, line in enumerate(lines):
        line_key = line.lower()
        if "prox" in line_key and "venc" in line_key:
            for next_line in lines[index + 1 : index + 4]:
                dates = re.findall(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}", next_line)
                if dates:
                    return parse_invoice_date(dates[-1])

    labeled = re.search(
        r"vencimiento[^\n\d]{0,30}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})",
        normalized,
        re.I,
    )
    if labeled:
        return parse_invoice_date(labeled.group(1))

    for index, line in enumerate(lines):
        if re.search(r"e-?ticket|credito", line, re.I):
            seen_account = False
            for next_line in lines[index + 1 : index + 8]:
                if not seen_account and re.fullmatch(r"\d{7,12}", next_line):
                    seen_account = True
                    continue
                if seen_account:
                    parsed = parse_invoice_date(next_line)
                    if parsed:
                        return parsed
    return None


def extract_ose_reference(text: str) -> str:
    normalized = strip_accents(text)
    match = re.search(r"(?:ref\.?|cobro)\s*:?\s*(\d{6,12})", normalized, re.I)
    return match.group(1) if match else ""


def extract_ose_account(text: str) -> str:
    normalized = strip_accents(text)
    explicit = re.search(r"(?:cuenta|nro\.?\s*cuenta)\D{0,20}(OSE[-\s]?\d{4,}|\d{7,10})", normalized, re.I)
    if explicit:
        raw = explicit.group(1).strip().replace(" ", "").upper()
        if raw.startswith("OSE"):
            return raw
        if raw != "2344":
            return raw

    reference = extract_ose_reference(normalized)
    candidates = []
    for candidate in re.findall(r"\b(\d{7,10})\b", normalized):
        if candidate == reference:
            continue
        if candidate.startswith(("202", "799", "899", "902")):
            continue
        candidates.append(candidate)
    if candidates:
        ranked = sorted(
            set(candidates),
            key=lambda value: (candidates.count(value), len(value)),
            reverse=True,
        )
        return ranked[0]
    return ""


def extract_ose_amount(text: str) -> Optional[float]:
    normalized = strip_accents(text)
    stamped_amounts = []
    for match in re.findall(r"\$\*+\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})?)", normalized):
        number = parse_invoice_number(match)
        if valid_invoice_amount(number):
            stamped_amounts.append(number)
    if stamped_amounts:
        return max(stamped_amounts)

    total_match = re.search(
        r"total\s+monto\D{0,80}(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2}))",
        normalized,
        re.I | re.S,
    )
    if total_match:
        number = parse_invoice_number(total_match.group(1))
        if valid_invoice_amount(number):
            return number
    return None


def extract_ose_due_date(text: str) -> Optional[str]:
    normalized = strip_accents(text)
    match = re.search(r"vence\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", normalized, re.I)
    if match:
        return parse_invoice_date(match.group(1))
    return extract_invoice_due_date(normalized)


def extract_ose_issued_date(text: str) -> Optional[str]:
    normalized = strip_accents(text)
    dates = [
        parsed
        for raw in re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", normalized)
        if (parsed := parse_invoice_date(raw))
    ]
    due_date = extract_ose_due_date(normalized)
    period = extract_ose_consumption_period(normalized)
    period_dates = {period.get("start"), period.get("end")} if period else set()
    for parsed in dates:
        if parsed != due_date and parsed not in period_dates:
            return parsed
    return None


def extract_ose_consumption_period(text: str) -> Dict[str, Optional[str]]:
    normalized = strip_accents(text)
    match = re.search(
        r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|a)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        normalized,
        re.I,
    )
    if not match:
        return {"start": None, "end": None, "period": ""}
    start = parse_invoice_date(match.group(1))
    end = parse_invoice_date(match.group(2))
    return {"start": start, "end": end, "period": end[:7] if end else ""}


def extract_ose_meter_number(text: str) -> str:
    normalized = strip_accents(text)
    match = re.search(r"\b([A-Z]{2,4}\d{5,8})\b", normalized)
    return match.group(1) if match else ""


def extract_ose_consumption(text: str) -> Dict[str, object]:
    normalized = strip_accents(text)
    match = re.search(r"consumo\s+m3\s+tipo\s+de\s+lec\.\s+[A-Z0-9]+\s+\d+\s+\d+\s+(\d+(?:[.,]\d+)?)", normalized, re.I | re.S)
    if not match:
        match = re.search(r"(\d+(?:[.,]\d+)?)\s*m3", normalized, re.I)
    amount = parse_invoice_number(match.group(1)) if match else None
    return {"amount": amount or 0, "unit": "m3" if amount else ""}


def extract_provider_specific_fields(provider: str, text: str) -> Dict[str, object]:
    if provider == "UTE":
        return {
            "account": extract_ute_account(text),
            "amount": extract_ute_amount(text),
            "due_date": extract_ute_due_date(text),
        }
    if provider == "OSE":
        period = extract_ose_consumption_period(text)
        consumption = extract_ose_consumption(text)
        return {
            "account": extract_ose_account(text),
            "amount": extract_ose_amount(text),
            "due_date": extract_ose_due_date(text),
            "issued_date": extract_ose_issued_date(text),
            "period": period.get("period") or "",
            "consumption_period_start": period.get("start"),
            "consumption_period_end": period.get("end"),
            "reference_number": extract_ose_reference(text),
            "meter_number": extract_ose_meter_number(text),
            "consumption_amount": consumption["amount"],
            "consumption_unit": consumption["unit"],
        }
    return {}


def property_accounts(property_obj: Property) -> Sequence[str]:
    return [
        property_obj.ute_account,
        property_obj.ose_account,
        property_obj.taxes_account,
        property_obj.sanitation_account,
        property_obj.padron,
    ]


def property_service_to_dict(service: PropertyServiceAccount) -> Dict[str, object]:
    return {
        "id": service.id,
        "property_id": service.property_id,
        "service_type": service.service_type,
        "provider": service.provider,
        "account_number": service.account_number,
        "portal_url": service.portal_url,
        "reference_data": service.reference_data,
        "payer": service.payer,
        "active": service.active,
        "notes": service.notes,
        "created_at": service.created_at.isoformat(),
    }


def attachment_to_dict(attachment: Attachment) -> Dict[str, object]:
    return {
        "id": attachment.id,
        "entity_type": attachment.entity_type,
        "entity_id": attachment.entity_id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "notes": attachment.notes,
        "uploaded_at": attachment.uploaded_at.isoformat(),
    }


def invoice_document_to_dict(session: Session, invoice: InvoiceDocument) -> Dict[str, object]:
    property_obj = session.get(Property, invoice.property_id) if invoice.property_id else None
    service = session.get(PropertyServiceAccount, invoice.service_account_id) if invoice.service_account_id else None
    return {
        "id": invoice.id,
        "provider": invoice.provider,
        "account_number": invoice.account_number,
        "property_id": invoice.property_id,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "service_account_id": invoice.service_account_id,
        "service_type": service.service_type if service else "",
        "responsible_type": invoice.responsible_type,
        "amount": money(invoice.amount),
        "issued_date": invoice.issued_date.isoformat() if invoice.issued_date else None,
        "due_date": invoice.due_date.isoformat(),
        "period": invoice.period,
        "consumption_period_start": invoice.consumption_period_start.isoformat() if invoice.consumption_period_start else None,
        "consumption_period_end": invoice.consumption_period_end.isoformat() if invoice.consumption_period_end else None,
        "reference_number": invoice.reference_number,
        "meter_number": invoice.meter_number,
        "consumption_amount": money(invoice.consumption_amount),
        "consumption_unit": invoice.consumption_unit,
        "status": invoice.status,
        "source": invoice.source,
        "attachment_id": invoice.attachment_id,
        "charge_id": invoice.charge_id,
        "owner_charge_id": invoice.owner_charge_id,
        "raw_text_preview": invoice.raw_text_preview,
        "notes": invoice.notes,
        "created_at": invoice.created_at.isoformat(),
    }


def email_rule_to_dict(rule: EmailProviderRule) -> Dict[str, object]:
    return {
        "id": rule.id,
        "inbox_id": rule.inbox_id,
        "provider": rule.provider,
        "sender_pattern": rule.sender_pattern,
        "subject_keywords": rule.subject_keywords,
        "active": rule.active,
        "created_at": rule.created_at.isoformat(),
    }


def email_inbox_to_dict(session: Session, inbox: EmailInboxConfig) -> Dict[str, object]:
    rules = session.exec(
        select(EmailProviderRule).where(EmailProviderRule.inbox_id == inbox.id)
    ).all()
    return {
        "id": inbox.id,
        "name": inbox.name,
        "email_address": inbox.email_address,
        "provider": inbox.provider,
        "host": inbox.host,
        "port": inbox.port,
        "username": inbox.username,
        "secret_env_var": inbox.secret_env_var,
        "folder": inbox.folder,
        "active": inbox.active,
        "last_checked_at": inbox.last_checked_at.isoformat() if inbox.last_checked_at else None,
        "notes": inbox.notes,
        "created_at": inbox.created_at.isoformat(),
        "rules": [email_rule_to_dict(rule) for rule in rules],
    }


def email_import_run_to_dict(run: EmailImportRun) -> Dict[str, object]:
    return {
        "id": run.id,
        "inbox_id": run.inbox_id,
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "messages_seen": run.messages_seen,
        "invoices_created": run.invoices_created,
        "notes": run.notes,
    }


def audit_log_to_dict(entry: AuditLog) -> Dict[str, object]:
    return {
        "id": entry.id,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "action": entry.action,
        "description": entry.description,
        "created_by": entry.created_by,
        "created_at": entry.created_at.isoformat(),
    }


def find_invoice_match(session: Session, text: str, account: str = "") -> Dict[str, object]:
    text_key = compact_key(text)
    account_key = compact_key(account)
    properties = session.exec(select(Property)).all()
    for property_obj in properties:
        for property_account in property_accounts(property_obj):
            if not property_account:
                continue
            property_key = compact_key(property_account)
            if property_key and (property_key in text_key or property_key == account_key):
                contract = session.exec(
                    select(Contract).where(
                        Contract.property_id == property_obj.id,
                        Contract.active == True,  # noqa: E712
                    )
                ).first()
                tenant = session.get(Person, contract.tenant_id) if contract else None
                return {
                    "matched_property_id": property_obj.id,
                    "matched_property_reference": property_obj.reference,
                    "matched_property_address": property_obj.address,
                    "matched_contract_id": contract.id if contract else None,
                    "matched_tenant_id": tenant.id if tenant else None,
                    "matched_tenant_name": tenant.full_name if tenant else "",
                    "matched_account": property_account,
                }
    return {
        "matched_property_id": None,
        "matched_property_reference": "",
        "matched_property_address": "",
        "matched_contract_id": None,
        "matched_tenant_id": None,
        "matched_tenant_name": "",
        "matched_account": account,
    }


def find_service_account_match(session: Session, account: str = "", provider: str = "") -> Optional[PropertyServiceAccount]:
    account_key = compact_key(account)
    provider_key = compact_key(provider)
    if not account_key:
        return None
    services = session.exec(select(PropertyServiceAccount).where(PropertyServiceAccount.active == True)).all()  # noqa: E712
    for service in services:
        service_key = compact_key(service.account_number)
        provider_matches = not provider_key or provider_key in compact_key(f"{service.provider} {service.service_type}") or compact_key(service.provider) in provider_key
        if service_key and (service_key == account_key or service_key in account_key or account_key in service_key) and provider_matches:
            return service
    return None


def is_pdf_upload(content_type: str, filename: str) -> bool:
    return content_type == "application/pdf" or filename.lower().endswith(".pdf")


def preprocess_ocr_image(image, threshold: bool = False):
    from PIL import ImageEnhance, ImageOps

    processed = ImageOps.grayscale(image)
    processed = ImageEnhance.Contrast(processed).enhance(2.5)
    processed = processed.resize((processed.width * 3, processed.height * 3))
    if threshold:
        processed = processed.point(lambda pixel: 255 if pixel > 165 else 0)
    return processed


def ocr_image_bytes(file_bytes: bytes) -> str:
    from PIL import Image
    import pytesseract

    image = Image.open(io.BytesIO(file_bytes))
    texts: List[str] = []
    variants = [image]
    width, height = image.size
    top_half = image.crop((0, 0, width, int(height * 0.34)))
    variants.extend(
        [
            preprocess_ocr_image(image),
            preprocess_ocr_image(top_half),
            preprocess_ocr_image(top_half, threshold=True),
        ]
    )
    for variant in variants:
        config = "--psm 6" if variant is not image else ""
        text = pytesseract.image_to_string(variant, lang="spa+eng", config=config).strip()
        if text and text not in texts:
            texts.append(text)
    return "\n".join(texts)


def extract_text_from_pdf(file_bytes: bytes, ocr_available: bool, max_pages: int = 3) -> Dict[str, object]:
    warnings: List[str] = []
    text_parts: List[str] = []
    used_ocr = False

    try:
        import fitz
    except Exception as exc:  # pragma: no cover - dependency/runtime issue
        return {
            "text": "",
            "warnings": [f"No se pudo cargar el lector PDF: {exc}"],
            "used_ocr": False,
        }

    try:
        document = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        return {
            "text": "",
            "warnings": [f"No se pudo abrir el PDF: {exc}"],
            "used_ocr": False,
        }

    pages_to_read = min(document.page_count, max_pages)
    for page_index in range(pages_to_read):
        page = document.load_page(page_index)
        page_text = page.get_text("text").strip()
        if page_text:
            text_parts.append(page_text)

    has_useful_text = len("\n".join(text_parts).strip()) > 40
    if not has_useful_text and ocr_available:
        try:
            import pytesseract
            from PIL import Image

            for page_index in range(pages_to_read):
                page = document.load_page(page_index)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image = Image.open(io.BytesIO(pixmap.tobytes("png")))
                page_text = ocr_image_bytes(pixmap.tobytes("png")).strip()
                if page_text:
                    text_parts.append(page_text)
                    used_ocr = True
        except Exception as exc:  # pragma: no cover - depends on local OCR setup
            warnings.append(f"No se pudo aplicar OCR al PDF: {exc}")

    text = "\n".join(text_parts).strip()
    if not text:
        warnings.append(
            "No se pudo leer texto del PDF. Probá subir una foto clara o un PDF con texto seleccionable."
        )

    return {"text": text, "warnings": warnings, "used_ocr": used_ocr}


def extract_text_from_invoice_upload(
    file_bytes: bytes, content_type: str = "", filename: str = ""
) -> Dict[str, object]:
    ocr_available = bool(shutil.which("tesseract"))
    warnings: List[str] = []
    text = ""
    analysis_source = "texto/nombre"

    if is_pdf_upload(content_type, filename):
        extracted = extract_text_from_pdf(file_bytes, ocr_available)
        text = str(extracted["text"])
        warnings.extend(list(extracted["warnings"]))
        analysis_source = "pdf-ocr" if extracted["used_ocr"] else "pdf-text"
    elif content_type.startswith("image/") and ocr_available:
        try:
            text = ocr_image_bytes(file_bytes)
            analysis_source = "ocr"
        except Exception as exc:  # pragma: no cover - depends on local OCR setup
            warnings.append(f"No se pudo leer la imagen con OCR: {exc}")
    elif content_type.startswith("image/") and not ocr_available:
        warnings.append("OCR local no disponible para leer imagenes.")

    if not text and not is_pdf_upload(content_type, filename):
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = ""

    if not text:
        warnings.append(
            "OCR local no disponible o archivo sin texto legible; se usaron pistas del nombre de archivo."
        )

    return {
        "text": text,
        "ocr_available": ocr_available,
        "warnings": warnings,
        "analysis_source": analysis_source,
    }


def analyze_invoice_text(
    session: Session, text: str, filename: str = "", content_type: str = "", warnings: Optional[List[str]] = None
) -> Dict[str, object]:
    combined = f"{filename}\n{text}"
    provider = detect_invoice_provider(combined, filename)
    specific = extract_provider_specific_fields(provider["provider"], combined)
    account = str(specific.get("account") or extract_invoice_account(combined))
    amount = specific.get("amount") or extract_invoice_amount(combined)
    due_date = specific.get("due_date") or extract_invoice_due_date(combined)
    period = str(specific.get("period") or (str(due_date)[:7] if due_date else ""))
    match = find_invoice_match(session, combined, account)
    confidence = 0
    confidence += 25 if provider["concept"] != "OTROS" else 0
    confidence += 25 if amount else 0
    confidence += 20 if due_date else 0
    confidence += 30 if match["matched_contract_id"] else 0
    confidence += 10 if specific.get("consumption_period_start") and specific.get("consumption_period_end") else 0
    confidence = min(confidence, 100)

    description_parts = [provider["provider"]]
    if account or match["matched_account"]:
        description_parts.append(f"cuenta {account or match['matched_account']}")
    description = "Factura " + " · ".join(part for part in description_parts if part)

    return {
        "provider": provider["provider"],
        "concept": provider["concept"],
        "amount": amount,
        "due_date": due_date,
        "issued_date": specific.get("issued_date"),
        "period": period,
        "consumption_period_start": specific.get("consumption_period_start"),
        "consumption_period_end": specific.get("consumption_period_end"),
        "reference_number": specific.get("reference_number") or "",
        "meter_number": specific.get("meter_number") or "",
        "consumption_amount": specific.get("consumption_amount") or 0,
        "consumption_unit": specific.get("consumption_unit") or "",
        "account": account or match["matched_account"],
        "description": description,
        "confidence": confidence,
        "filename": filename,
        "content_type": content_type,
        "raw_text_preview": combined[:1200],
        "warnings": warnings or [],
        **match,
    }


def paid_amount_for_charge(session: Session, charge_id: int) -> float:
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.charge_id == charge_id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    return money(sum(item.amount for item in allocations))


def allocated_amount_for_payment(session: Session, payment_id: int) -> float:
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment_id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    return money(sum(item.amount for item in allocations))


def unallocated_amount_for_payment(session: Session, payment: Payment) -> float:
    if payment.status != "confirmado":
        return 0
    return money(max(payment.amount - allocated_amount_for_payment(session, payment.id or 0), 0))


def remaining_for_charge(session: Session, charge: Charge) -> float:
    return money(max(charge.amount - paid_amount_for_charge(session, charge.id or 0), 0))


def duplicate_charge_candidates(session: Session, charge: Charge, exclude_id: Optional[int] = None) -> List[Charge]:
    contract = session.get(Contract, charge.contract_id)
    property_id = contract.property_id if contract else None
    candidates: List[Charge] = []
    for item in session.exec(select(Charge)).all():
        if exclude_id and item.id == exclude_id:
            continue
        if item.status == "pagado":
            continue
        item_contract = session.get(Contract, item.contract_id)
        if property_id and item_contract and item_contract.property_id != property_id:
            continue
        same_person = item.responsible_person_id == charge.responsible_person_id
        same_concept = compact_key(item.concept) == compact_key(charge.concept)
        same_period = bool(item.period and charge.period and item.period == charge.period)
        same_accrual = bool(item.accrual_period and charge.accrual_period and item.accrual_period == charge.accrual_period)
        same_consumption = (
            item.consumption_period_start
            and charge.consumption_period_start
            and item.consumption_period_start == charge.consumption_period_start
            and item.consumption_period_end == charge.consumption_period_end
        )
        same_due_month = item.due_date.strftime("%Y-%m") == charge.due_date.strftime("%Y-%m")
        if same_person and same_concept and (same_period or same_accrual or same_consumption or same_due_month):
            candidates.append(item)
    return candidates


def duplicate_owner_charge_candidates(session: Session, owner_charge: OwnerCharge, exclude_id: Optional[int] = None) -> List[OwnerCharge]:
    candidates: List[OwnerCharge] = []
    for item in session.exec(select(OwnerCharge)).all():
        if exclude_id and item.id == exclude_id:
            continue
        if item.status == "anulado":
            continue
        same_owner = item.owner_id == owner_charge.owner_id
        same_property = item.property_id == owner_charge.property_id
        same_concept = compact_key(item.concept) == compact_key(owner_charge.concept)
        same_period = bool(item.period and owner_charge.period and item.period == owner_charge.period)
        same_range = (
            item.period_from
            and owner_charge.period_from
            and item.period_from == owner_charge.period_from
            and item.period_to == owner_charge.period_to
        )
        same_charge_month = item.charge_date.strftime("%Y-%m") == owner_charge.charge_date.strftime("%Y-%m")
        if same_owner and same_property and same_concept and (same_period or same_range or same_charge_month):
            candidates.append(item)
    return candidates


def computed_charge_status(session: Session, charge: Charge) -> str:
    paid = paid_amount_for_charge(session, charge.id or 0)
    if paid >= charge.amount:
        return "pagado"
    if paid > 0:
        return "parcial"
    if charge.due_date < date.today():
        return "vencido"
    return "pendiente"


def refresh_charge_status(session: Session, charge: Charge) -> Charge:
    charge.status = computed_charge_status(session, charge)
    session.add(charge)
    return charge


def refresh_all_charge_statuses(session: Session, charges: Iterable[Charge]) -> None:
    for charge in charges:
        refresh_charge_status(session, charge)
    session.commit()


def get_person(session: Session, person_id: int) -> Person:
    person = session.get(Person, person_id)
    if not person:
        raise ValueError("Persona no encontrada")
    return person


def get_contract(session: Session, contract_id: int) -> Contract:
    contract = session.get(Contract, contract_id)
    if not contract:
        raise ValueError("Contrato no encontrado")
    return contract


def charge_to_dict(session: Session, charge: Charge) -> Dict[str, object]:
    contract = session.get(Contract, charge.contract_id)
    tenant = session.get(Person, charge.responsible_person_id)
    property_obj = session.get(Property, contract.property_id) if contract else None
    paid = paid_amount_for_charge(session, charge.id or 0)
    status = computed_charge_status(session, charge)
    if charge.status != status:
        charge.status = status
        session.add(charge)
    return {
        "id": charge.id,
        "contract_id": charge.contract_id,
        "responsible_person_id": charge.responsible_person_id,
        "responsible_type": charge.responsible_type,
        "tenant_name": tenant.full_name if tenant else "",
        "tenant_legacy_code": tenant.legacy_code if tenant else "",
        "tenant_mobile": tenant.mobile if tenant else "",
        "tenant_email": tenant.email if tenant else "",
        "property_id": property_obj.id if property_obj else None,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "concept": charge.concept,
        "description": charge.description,
        "amount": money(charge.amount),
        "paid_amount": paid,
        "remaining_amount": money(max(charge.amount - paid, 0)),
        "due_date": charge.due_date.isoformat(),
        "period": charge.period,
        "accrual_period": charge.accrual_period or charge.period,
        "settlement_period": charge.settlement_period or charge.period,
        "owner_charge_id": charge.owner_charge_id,
        "notify_tenant": charge.notify_tenant,
        "notify_always": charge.notify_always,
        "consumption_period_start": charge.consumption_period_start.isoformat() if charge.consumption_period_start else None,
        "consumption_period_end": charge.consumption_period_end.isoformat() if charge.consumption_period_end else None,
        "proration_days": charge.proration_days,
        "proration_total_days": charge.proration_total_days,
        "status": status,
        "origin": charge.origin,
        "created_at": charge.created_at.isoformat(),
    }


def contract_to_dict(session: Session, contract: Contract) -> Dict[str, object]:
    tenant_links = session.exec(
        select(ContractTenant).where(ContractTenant.contract_id == (contract.id or 0))
    ).all()
    if tenant_links:
        tenant_links = sorted(tenant_links, key=lambda item: (not item.is_primary, item.id or 0))
        tenant_people = [session.get(Person, link.person_id) for link in tenant_links]
        tenant_people = [person for person in tenant_people if person]
    else:
        tenant_people = [session.get(Person, contract.tenant_id)] if contract.tenant_id else []
        tenant_people = [person for person in tenant_people if person]
    primary_tenant = tenant_people[0] if tenant_people else None
    property_obj = session.get(Property, contract.property_id)
    shares = session.exec(
        select(PropertyOwnerShare).where(
            PropertyOwnerShare.property_id == contract.property_id
        )
    ).all()
    owners = []
    for share in shares:
        owner = session.get(Person, share.owner_id)
        if owner:
            owners.append(
                {
                    "id": owner.id,
                    "full_name": owner.full_name,
                    "percentage": share.percentage,
                }
            )
    return {
        "id": contract.id,
        "legacy_code": contract.legacy_code,
        "property_id": contract.property_id,
        "tenant_id": contract.tenant_id,
        "tenant_name": primary_tenant.full_name if primary_tenant else "",
        "tenant_legacy_code": primary_tenant.legacy_code if primary_tenant else "",
        "tenants": [
            {
                "id": tenant_item.id,
                "legacy_code": tenant_item.legacy_code,
                "full_name": tenant_item.full_name,
                "document": tenant_item.document,
                "mobile": tenant_item.mobile,
                "email": tenant_item.email,
                "phone": tenant_item.phone,
            }
            for tenant_item in tenant_people
        ],
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "owners": owners,
        "start_date": contract.start_date.isoformat(),
        "end_date": contract.end_date.isoformat() if contract.end_date else None,
        "billing_end_date": contract.billing_end_date.isoformat() if contract.billing_end_date else None,
        "rent_amount": money(contract.rent_amount),
        "payment_type": contract.payment_type,
        "rent_payment_timing": contract.rent_payment_timing,
        "guarantee_type": contract.guarantee_type,
        "guarantee_provider": contract.guarantee_provider,
        "guarantee_percent": contract.guarantee_percent,
        "rent_regime": contract.rent_regime,
        "reajustment_index": contract.reajustment_index,
        "next_reajustment_date": contract.next_reajustment_date.isoformat() if contract.next_reajustment_date else "",
        "commission_percent": contract.commission_percent,
        "commission_on_rent": contract.commission_on_rent,
        "commission_on_other_charges": contract.commission_on_other_charges,
        "commission_iva_applies": contract.commission_iva_applies,
        "irpf_applies": contract.irpf_applies,
        "irpf_percent": contract.irpf_percent,
        "payment_origin": contract.payment_origin,
        "tenant_tax_role": contract.tenant_tax_role,
        "resguardo_required": contract.resguardo_required,
        "active": contract.active,
    }


def contract_primary_tenant_id(session: Session, contract: Contract) -> int:
    links = session.exec(
        select(ContractTenant).where(ContractTenant.contract_id == (contract.id or 0), ContractTenant.is_primary == True)  # noqa: E712
    ).all()
    if links:
        return int(links[0].person_id)
    return int(contract.tenant_id)


def property_visit_to_dict(session: Session, visit: PropertyVisit) -> Dict[str, object]:
    property_obj = session.get(Property, visit.property_id)
    return {
        "id": visit.id,
        "property_id": visit.property_id,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "interested_name": visit.interested_name,
        "interested_phone": visit.interested_phone,
        "interested_email": visit.interested_email,
        "visit_at": visit.visit_at.isoformat(),
        "status": visit.status,
        "contact_message": visit.contact_message,
        "notification_phone": visit.notification_phone,
        "reminder_minutes_before": visit.reminder_minutes_before,
        "notes": visit.notes,
        "created_at": visit.created_at.isoformat(),
    }


def person_debt_summary(session: Session, person: Person) -> Dict[str, object]:
    charges = session.exec(
        select(Charge).where(Charge.responsible_person_id == person.id)
    ).all()
    refresh_all_charge_statuses(session, charges)
    total_debt = sum(remaining_for_charge(session, charge) for charge in charges)
    overdue = sum(
        remaining_for_charge(session, charge)
        for charge in charges
        if computed_charge_status(session, charge) == "vencido"
    )
    return {
        "id": person.id,
        "legacy_code": person.legacy_code,
        "full_name": person.full_name,
        "document": person.document,
        "phone": person.phone,
        "mobile": person.mobile,
        "email": person.email,
        "address": person.address,
        "person_type": person.person_type,
        "bank_name": person.bank_name,
        "bank_account": person.bank_account,
        "bank_transfer_commission_applies": person.bank_transfer_commission_applies,
        "bank_transfer_commission_amount": money(person.bank_transfer_commission_amount),
        "created_at": person.created_at.isoformat(),
        "total_debt": money(total_debt),
        "overdue_debt": money(overdue),
        "open_charges": len(
            [charge for charge in charges if computed_charge_status(session, charge) != "pagado"]
        ),
    }


def contract_billing_end_date(contract: Contract) -> date | None:
    return contract.billing_end_date or contract.end_date


def add_months_to_period(period: str, offset: int) -> str:
    year, month = [int(part) for part in period.split("-")]
    month_index = month - 1 + offset
    return f"{year + month_index // 12:04d}-{month_index % 12 + 1:02d}"


def rent_period_for_due_period(due_period: str, timing: str) -> str:
    return add_months_to_period(due_period, -1) if timing == "vencido" else due_period


def due_date_for_rent_period(period: str, timing: str, due_day: int) -> date:
    due_period = add_months_to_period(period, 1) if timing == "vencido" else period
    year, month = [int(part) for part in due_period.split("-")]
    return date(year, month, min(due_day, 28))


def contract_covers_rent_period(contract: Contract, period: str) -> bool:
    year, month = [int(part) for part in period.split("-")]
    period_month = date(year, month, 1)
    start_month = date(contract.start_date.year, contract.start_date.month, 1)
    if period_month < start_month:
        return False
    billing_end = contract_billing_end_date(contract)
    if not billing_end:
        return True
    end_month = date(billing_end.year, billing_end.month, 1)
    return period_month <= end_month


def generate_monthly_charges(session: Session, period: str, due_day: int) -> List[Charge]:
    year, month = [int(part) for part in period.split("-")]
    due_date = date(year, month, min(due_day, 28))
    created: List[Charge] = []
    contracts = session.exec(select(Contract).where(Contract.active == True)).all()  # noqa: E712
    for contract in contracts:
        rent_period = rent_period_for_due_period(period, contract.rent_payment_timing)
        if not contract_covers_rent_period(contract, rent_period):
            continue
        existing = session.exec(
            select(Charge).where(
                Charge.contract_id == contract.id,
                Charge.period == rent_period,
                Charge.concept == "ALQUILER",
            )
        ).first()
        if existing:
            continue
        charge = Charge(
            contract_id=contract.id or 0,
            responsible_person_id=contract_primary_tenant_id(session, contract),
            concept="ALQUILER",
            description=f"Alquiler {rent_period}",
            amount=contract.rent_amount,
            due_date=due_date,
            period=rent_period,
            accrual_period=rent_period,
            settlement_period=rent_period,
            origin="recurrente",
        )
        session.add(charge)
        created.append(charge)
    session.commit()
    for charge in created:
        session.refresh(charge)
        refresh_charge_status(session, charge)
    session.commit()
    return created


def ensure_rent_charge_for_period(
    session: Session,
    contract: Contract,
    period: str,
    due_day: int = 10,
) -> Charge:
    if not contract_covers_rent_period(contract, period):
        raise ValueError("El periodo no esta dentro del rango de cobro del contrato.")
    existing = session.exec(
        select(Charge).where(
            Charge.contract_id == contract.id,
            Charge.period == period,
            Charge.concept == "ALQUILER",
        )
    ).first()
    if existing:
        return existing
    charge = Charge(
        contract_id=contract.id or 0,
        responsible_person_id=contract_primary_tenant_id(session, contract),
        concept="ALQUILER",
        description=f"Alquiler {period}",
        amount=contract.rent_amount,
        due_date=due_date_for_rent_period(period, contract.rent_payment_timing, due_day),
        period=period,
        accrual_period=period,
        settlement_period=period,
        origin="recurrente",
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    return charge


def create_first_rent_charge(
    session: Session,
    contract: Contract,
    amount: float,
    period: str,
    due_date: date | None = None,
) -> Charge:
    if amount <= 0:
        raise ValueError("El importe del primer alquiler debe ser mayor a cero.")
    if len(period.split("-")) != 2:
        raise ValueError("El periodo del primer alquiler debe tener formato AAAA-MM.")
    if not contract_covers_rent_period(contract, period):
        raise ValueError("El periodo del primer alquiler no esta dentro del rango de cobro del contrato.")
    existing = session.exec(
        select(Charge).where(
            Charge.contract_id == contract.id,
            Charge.period == period,
            Charge.concept == "ALQUILER",
        )
    ).first()
    if existing:
        return existing
    charge = Charge(
        contract_id=contract.id or 0,
        responsible_person_id=contract_primary_tenant_id(session, contract),
        concept="ALQUILER",
        description=f"Primer alquiler / cuota inicial {period}",
        amount=money(amount),
        due_date=due_date or due_date_for_rent_period(period, contract.rent_payment_timing, 10),
        period=period,
        accrual_period=period,
        settlement_period=period,
        origin="primer_alquiler",
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    refresh_charge_status(session, charge)
    session.commit()
    session.refresh(charge)
    return charge


def create_advance_rent_payment(
    session: Session,
    contract: Contract,
    months: Sequence[str],
    payment_date: date,
    method: str,
    reference: str,
    notes: str,
    due_day: int = 10,
) -> Dict[str, object]:
    if not months:
        raise ValueError("Debe indicar al menos un mes")
    charges = [ensure_rent_charge_for_period(session, contract, month, due_day) for month in months]
    total = money(sum(remaining_for_charge(session, charge) for charge in charges))
    if total <= 0:
        raise ValueError("Los meses seleccionados no tienen saldo pendiente")
    payment = Payment(
        person_id=contract_primary_tenant_id(session, contract),
        amount=total,
        payment_date=payment_date,
        method=method,
        reference=reference,
        notes=notes or f"Pago adelantado de alquileres: {', '.join(months)}",
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    apply_allocations(
        session,
        payment,
        [{"charge_id": charge.id or 0, "amount": remaining_for_charge(session, charge)} for charge in charges],
    )
    movement = create_cash_movement_for_payment(session, payment)
    audit_log(
        session,
        "payment",
        payment.id,
        "advance_rent_payment",
        f"Pago de alquileres {', '.join(months)} contra contrato {contract.id}",
    )
    return {
        "payment": payment,
        "charges": charges,
        "cash_movement": movement,
    }


def create_charge_from_invoice(session: Session, invoice: InvoiceDocument) -> Optional[Charge]:
    if invoice.charge_id or invoice.responsible_type != "tenant" or not invoice.property_id:
        return None
    contracts = session.exec(
        select(Contract).where(
            Contract.property_id == invoice.property_id,
            Contract.active == True,  # noqa: E712
        )
    ).all()
    valid_contracts = [
        contract
        for contract in contracts
        if contract.start_date <= invoice.due_date and (contract_billing_end_date(contract) is None or contract_billing_end_date(contract) >= invoice.due_date)
    ]
    contract = sorted(
        valid_contracts or contracts,
        key=lambda item: (item.start_date, item.id or 0),
        reverse=True,
    )[0] if contracts else None
    if not contract:
        return None
    amount, proration_days, proration_total_days = prorated_invoice_amount(invoice, contract)
    period = invoice.period or invoice.due_date.strftime("%Y-%m")
    description = f"Factura {invoice.provider} cuenta {invoice.account_number}"
    if invoice.consumption_period_start and invoice.consumption_period_end:
        description += f" · consumo {invoice.consumption_period_start.isoformat()} a {invoice.consumption_period_end.isoformat()}"
    if proration_total_days:
        if proration_days < proration_total_days:
            description += f" · prorrateado {proration_days}/{proration_total_days} dias"
        else:
            description += f" · ocupacion {proration_days}/{proration_total_days} dias (sin prorrateo)"
    charge = Charge(
        contract_id=contract.id or 0,
        responsible_person_id=contract_primary_tenant_id(session, contract),
        responsible_type="tenant",
        concept=invoice.provider.upper(),
        description=description,
        amount=amount,
        due_date=invoice.due_date,
        period=period,
        accrual_period=period,
        settlement_period=period,
        consumption_period_start=invoice.consumption_period_start,
        consumption_period_end=invoice.consumption_period_end,
        proration_days=proration_days,
        proration_total_days=proration_total_days,
        origin="invoice",
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    invoice.charge_id = charge.id
    invoice.status = "convertida"
    session.add(invoice)
    session.commit()
    audit_log(session, "invoice", invoice.id, "create_charge", f"Deuda creada desde factura {invoice.id}")
    return charge


def prorated_invoice_amount(invoice: InvoiceDocument, contract: Contract) -> tuple[float, int, int]:
    if not invoice.consumption_period_start or not invoice.consumption_period_end:
        return money(invoice.amount), 0, 0
    return prorated_amount_for_contract(
        invoice.amount,
        invoice.consumption_period_start,
        invoice.consumption_period_end,
        contract,
    )


def prorated_amount_for_contract(base_amount: float, start: date, end: date, contract: Contract) -> tuple[float, int, int]:
    if end < start:
        return money(base_amount), 0, 0
    total_days = (end - start).days + 1
    occupancy_start = max(start, contract.start_date)
    occupancy_end = min(end, contract_billing_end_date(contract) or end)
    if occupancy_end < occupancy_start:
        return 0.0, 0, total_days
    occupied_days = (occupancy_end - occupancy_start).days + 1
    if occupied_days >= total_days:
        return money(base_amount), total_days, total_days
    return money(base_amount * occupied_days / total_days), occupied_days, total_days


def append_proration_note(description: str, start: date, end: date, days: int, total_days: int) -> str:
    if not total_days:
        return description
    description = description or ""
    if "prorrateado" in description.lower() or "ocupacion" in strip_accents(description).lower():
        return description
    note = f"consumo {start.isoformat()} a {end.isoformat()}"
    if days < total_days:
        note += f" · prorrateado {days}/{total_days} dias"
    else:
        note += f" · ocupacion {days}/{total_days} dias (sin prorrateo)"
    return f"{description} · {note}" if description else note


def apply_manual_proration_to_charge_data(
    data: Dict[str, object],
    contract: Contract,
    apply_proration: bool,
    base_amount: Optional[float],
) -> None:
    start = data.get("consumption_period_start")
    end = data.get("consumption_period_end")
    if not apply_proration:
        data["proration_days"] = 0
        data["proration_total_days"] = 0
        return
    if not isinstance(start, date) or not isinstance(end, date):
        data["proration_days"] = 0
        data["proration_total_days"] = 0
        return
    amount_to_prorate = float(base_amount if base_amount is not None else data.get("amount") or 0)
    prorated_amount, days, total_days = prorated_amount_for_contract(amount_to_prorate, start, end, contract)
    data["amount"] = prorated_amount
    data["proration_days"] = days
    data["proration_total_days"] = total_days
    data["description"] = append_proration_note(str(data.get("description") or ""), start, end, days, total_days)


def create_owner_charge_from_invoice(session: Session, invoice: InvoiceDocument) -> Optional[OwnerCharge]:
    if invoice.owner_charge_id or invoice.responsible_type != "owner" or not invoice.property_id:
        return None
    share = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == invoice.property_id)
    ).first()
    if not share:
        return None
    owner_charge = OwnerCharge(
        owner_id=share.owner_id,
        property_id=invoice.property_id,
        concept=invoice.provider.upper(),
        description=f"Factura {invoice.provider} cuenta {invoice.account_number}",
        amount=invoice.amount,
        charge_date=invoice.due_date,
        period=invoice.period or invoice.due_date.strftime("%Y-%m"),
        paid_by_agency=False,
        generates_commission=False,
        split_by_ownership=True,
    )
    session.add(owner_charge)
    session.commit()
    session.refresh(owner_charge)
    invoice.owner_charge_id = owner_charge.id
    invoice.status = "convertida"
    session.add(invoice)
    session.commit()
    audit_log(session, "invoice", invoice.id, "create_owner_charge", f"Debito propietario creado desde factura {invoice.id}")
    return owner_charge


def cash_movement_to_dict(session: Session, movement: CashMovement) -> Dict[str, object]:
    person = session.get(Person, movement.person_id) if movement.person_id else None
    property_obj = session.get(Property, movement.property_id) if movement.property_id else None
    return {
        "id": movement.id,
        "movement_date": movement.movement_date.isoformat(),
        "movement_type": movement.movement_type,
        "amount": money(movement.amount),
        "concept": movement.concept,
        "person_id": movement.person_id,
        "person_name": person.full_name if person else "",
        "person_legacy_code": person.legacy_code if person else "",
        "property_id": movement.property_id,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "origin": movement.origin,
        "origin_id": movement.origin_id,
        "reversal_of_id": movement.reversal_of_id,
        "status": movement.status,
        "notes": movement.notes,
        "created_at": movement.created_at.isoformat(),
    }


def create_cash_movement_for_payment(session: Session, payment: Payment) -> CashMovement:
    existing = session.exec(
        select(CashMovement).where(
            CashMovement.origin == "payment",
            CashMovement.origin_id == payment.id,
            CashMovement.status == "confirmado",
        )
    ).first()
    if existing:
        return existing
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    concept_parts: List[str] = []
    property_id: Optional[int] = None
    for allocation in allocations:
        charge = session.get(Charge, allocation.charge_id)
        if not charge:
            continue
        contract = session.get(Contract, charge.contract_id)
        if contract and property_id is None:
            property_id = contract.property_id
        label = charge.concept.replace("_", " ").title()
        if charge.concept == "ALQUILER" and (charge.accrual_period or charge.period):
            label = f"Alquiler {charge.accrual_period or charge.period}"
        elif charge.period:
            label = f"{label} {charge.period}"
        concept_parts.append(label)
    concept = "Pago de inquilino"
    if concept_parts:
        unique_parts = list(dict.fromkeys(concept_parts))
        concept = f"Pago: {', '.join(unique_parts[:3])}"
        if len(unique_parts) > 3:
            concept += f" +{len(unique_parts) - 3}"
    movement = CashMovement(
        movement_date=payment.payment_date,
        movement_type="entrada",
        amount=payment.amount,
        concept=concept,
        person_id=payment.person_id,
        property_id=property_id,
        origin="payment",
        origin_id=payment.id,
        notes=payment.reference,
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    unallocated = unallocated_amount_for_payment(session, payment)
    if unallocated > 0:
        existing_credit = session.exec(
            select(TenantCredit).where(TenantCredit.payment_id == payment.id)
        ).first()
        if not existing_credit:
            session.add(
                TenantCredit(
                    person_id=payment.person_id,
                    payment_id=payment.id,
                    amount=unallocated,
                    remaining_amount=unallocated,
                    notes="Saldo a favor generado automaticamente por pago sin imputar completo.",
                )
            )
            session.commit()
    return movement


def tenant_credit_to_dict(session: Session, credit: TenantCredit) -> Dict[str, object]:
    person = session.get(Person, credit.person_id)
    return {
        "id": credit.id,
        "person_id": credit.person_id,
        "person_name": person.full_name if person else "",
        "payment_id": credit.payment_id,
        "amount": money(credit.amount),
        "remaining_amount": money(credit.remaining_amount),
        "status": credit.status,
        "notes": credit.notes,
        "created_at": credit.created_at.isoformat(),
    }


def owner_charge_to_dict(session: Session, owner_charge: OwnerCharge) -> Dict[str, object]:
    owner = session.get(Person, owner_charge.owner_id)
    property_obj = session.get(Property, owner_charge.property_id)
    commission = owner_charge.amount * (owner_charge.commission_percent / 100) if owner_charge.generates_commission else 0
    settings = get_settings()
    iva = commission * (settings.iva_percent / 100)
    return {
        "id": owner_charge.id,
        "owner_id": owner_charge.owner_id,
        "owner_name": owner.full_name if owner else "",
        "owner_legacy_code": owner.legacy_code if owner else "",
        "property_id": owner_charge.property_id,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "concept": owner_charge.concept,
        "description": owner_charge.description,
        "amount": money(owner_charge.amount),
        "charge_date": owner_charge.charge_date.isoformat(),
        "period": owner_charge.period,
        "period_from": owner_charge.period_from.isoformat() if owner_charge.period_from else None,
        "period_to": owner_charge.period_to.isoformat() if owner_charge.period_to else None,
        "paid_by_agency": owner_charge.paid_by_agency,
        "generates_commission": owner_charge.generates_commission,
        "commission_percent": owner_charge.commission_percent,
        "split_by_ownership": owner_charge.split_by_ownership,
        "commission": money(commission),
        "iva": money(iva),
        "status": owner_charge.status,
        "created_at": owner_charge.created_at.isoformat(),
    }


def create_cash_movement_for_owner_charge(session: Session, owner_charge: OwnerCharge) -> Optional[CashMovement]:
    if not owner_charge.paid_by_agency:
        return None
    existing = session.exec(
        select(CashMovement).where(
            CashMovement.origin == "owner_charge",
            CashMovement.origin_id == owner_charge.id,
            CashMovement.status == "confirmado",
        )
    ).first()
    if existing:
        return existing
    movement = CashMovement(
        movement_date=owner_charge.charge_date,
        movement_type="salida",
        amount=owner_charge.amount,
        concept=f"Gasto propietario: {owner_charge.concept}",
        person_id=owner_charge.owner_id,
        property_id=owner_charge.property_id,
        origin="owner_charge",
        origin_id=owner_charge.id,
        notes=owner_charge.description,
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    return movement


def create_owner_charge_for_tenant_charge(
    session: Session,
    charge: Charge,
    concept: str = "",
    paid_by_agency: bool = False,
    split_by_ownership: bool = True,
) -> Optional[OwnerCharge]:
    if charge.owner_charge_id:
        return session.get(OwnerCharge, charge.owner_charge_id)
    contract = session.get(Contract, charge.contract_id)
    if not contract:
        return None
    share = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == contract.property_id)
    ).first()
    if not share:
        return None
    owner_charge = OwnerCharge(
        owner_id=share.owner_id,
        property_id=contract.property_id,
        concept=(concept or charge.concept or "OTROS").upper(),
        description=f"Traslado desde deuda #{charge.id}: {charge.description or charge.concept}",
        amount=charge.amount,
        charge_date=charge.due_date,
        period=charge.settlement_period or charge.period or charge.due_date.strftime("%Y-%m"),
        paid_by_agency=paid_by_agency,
        generates_commission=False,
        split_by_ownership=split_by_ownership,
    )
    session.add(owner_charge)
    session.commit()
    session.refresh(owner_charge)
    charge.owner_charge_id = owner_charge.id
    session.add(charge)
    session.commit()
    if paid_by_agency:
        create_cash_movement_for_owner_charge(session, owner_charge)
    audit_log(session, "charge", charge.id, "create_owner_charge", f"Debito propietario {owner_charge.id} vinculado")
    return owner_charge


def proration_difference_owner_charge_marker(charge: Charge) -> str:
    return f"Diferencia por prorrateo desde deuda #{charge.id}"


def find_proration_difference_owner_charge(session: Session, charge: Charge) -> Optional[OwnerCharge]:
    marker = proration_difference_owner_charge_marker(charge)
    return session.exec(
        select(OwnerCharge).where(
            OwnerCharge.description.contains(marker),
            OwnerCharge.status != "anulado",
        )
    ).first()


def sync_proration_difference_owner_charge(
    session: Session,
    charge: Charge,
    base_amount: Optional[float],
    create_difference: bool,
    paid_by_agency: bool = False,
    concept: str = "",
    split_by_ownership: bool = True,
) -> Optional[OwnerCharge]:
    existing = find_proration_difference_owner_charge(session, charge)
    if not create_difference or not base_amount:
        if existing:
            void_owner_charge(session, existing, "Se desmarco diferencia de prorrateo")
        return None
    difference = money(max(float(base_amount) - float(charge.amount or 0), 0))
    if difference <= 0:
        if existing:
            void_owner_charge(session, existing, "Sin diferencia de prorrateo")
        return None
    contract = session.get(Contract, charge.contract_id)
    if not contract:
        return None
    share = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == contract.property_id)
    ).first()
    if not share:
        return None
    description = (
        f"{proration_difference_owner_charge_marker(charge)}: "
        f"factura total ${money(float(base_amount)):,.2f}, "
        f"cobra inquilino ${money(charge.amount):,.2f}, "
        f"diferencia propietario ${difference:,.2f}"
    )
    if existing:
        existing.owner_id = share.owner_id
        existing.property_id = contract.property_id
        existing.concept = (concept or charge.concept or "OTROS").upper()
        existing.description = description
        existing.amount = difference
        existing.charge_date = charge.due_date
        existing.period = charge.settlement_period or charge.period or charge.due_date.strftime("%Y-%m")
        existing.paid_by_agency = paid_by_agency
        existing.generates_commission = False
        existing.split_by_ownership = split_by_ownership
        session.add(existing)
        session.commit()
        session.refresh(existing)
        if paid_by_agency:
            create_cash_movement_for_owner_charge(session, existing)
        return existing
    owner_charge = OwnerCharge(
        owner_id=share.owner_id,
        property_id=contract.property_id,
        concept=(concept or charge.concept or "OTROS").upper(),
        description=description,
        amount=difference,
        charge_date=charge.due_date,
        period=charge.settlement_period or charge.period or charge.due_date.strftime("%Y-%m"),
        paid_by_agency=paid_by_agency,
        generates_commission=False,
        split_by_ownership=split_by_ownership,
    )
    session.add(owner_charge)
    session.commit()
    session.refresh(owner_charge)
    if paid_by_agency:
        create_cash_movement_for_owner_charge(session, owner_charge)
    audit_log(session, "charge", charge.id, "create_proration_difference", f"Diferencia prorrateo propietario {owner_charge.id}")
    return owner_charge


def owner_settlement_cash_movements(session: Session, settlement: OwnerSettlement) -> List[CashMovement]:
    return sorted(
        session.exec(
            select(CashMovement).where(
                CashMovement.origin == "owner_settlement",
                CashMovement.origin_id == settlement.id,
                CashMovement.status == "confirmado",
            )
        ).all(),
        key=lambda item: (item.movement_date, item.id or 0),
    )


def owner_settlement_paid_amount(session: Session, settlement: OwnerSettlement) -> float:
    return money(sum(item.amount for item in owner_settlement_cash_movements(session, settlement)))


def owner_settlement_balance_status(balance: float) -> str:
    if balance > 0:
        return "saldo_a_favor_propietario"
    if balance < 0:
        return "saldo_deudor_propietario"
    return "cancelado"


def create_cash_movement_for_owner_settlement(
    session: Session,
    settlement: OwnerSettlement,
    movement_date: Optional[date] = None,
    amount: Optional[float] = None,
    notes: str = "",
) -> CashMovement:
    paid_before = owner_settlement_paid_amount(session, settlement)
    remaining_before = money(settlement.total_to_transfer - paid_before)
    if amount is None:
        if paid_before > 0 and remaining_before <= 0:
            raise ValueError("La liquidacion ya no tiene saldo pendiente para retirar.")
        amount_to_pay = money(remaining_before if remaining_before > 0 else settlement.total_to_transfer)
    else:
        amount_to_pay = money(amount)
    if amount_to_pay <= 0:
        raise ValueError("La liquidacion no tiene importe positivo para retirar.")
    balance_after = money(settlement.total_to_transfer - paid_before - amount_to_pay)
    balance_label = owner_settlement_balance_status(balance_after).replace("_", " ")
    movement = CashMovement(
        movement_date=movement_date or date.today(),
        movement_type="salida",
        amount=amount_to_pay,
        concept=f"Pago liquidacion propietario {settlement.period}",
        person_id=settlement.owner_id,
        property_id=None,
        origin="owner_settlement",
        origin_id=settlement.id,
        notes=notes
        or (
            f"Comision bancaria: {money(settlement.bank_transfer_fee)} · "
            f"Retiro: {amount_to_pay} · Saldo posterior: {balance_after} ({balance_label})"
        ),
    )
    settlement.status = "emitida"
    settlement.paid_at = datetime.utcnow()
    session.add(settlement)
    session.add(movement)
    session.commit()
    session.refresh(movement)
    audit_log(session, "settlement", settlement.id, "pay", f"Salida de caja {movement.id}")
    return movement


def reverse_cash_movement(session: Session, movement: CashMovement, reason: str) -> CashMovement:
    if movement.status != "confirmado":
        raise ValueError("El movimiento ya esta anulado")
    movement.status = "anulado"
    session.add(movement)
    reversal = CashMovement(
        movement_date=date.today(),
        movement_type="salida" if movement.movement_type == "entrada" else "entrada",
        amount=movement.amount,
        concept=f"Reversa: {movement.concept}",
        person_id=movement.person_id,
        property_id=movement.property_id,
        origin="anulacion",
        origin_id=movement.id,
        reversal_of_id=movement.id,
        status="confirmado",
        notes=reason,
    )
    session.add(reversal)
    session.commit()
    session.refresh(reversal)
    return reversal


def void_payment(session: Session, payment: Payment, reason: str) -> CashMovement:
    if payment.status != "confirmado":
        raise ValueError("El pago ya esta anulado")
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    affected_charge_ids = [allocation.charge_id for allocation in allocations]
    for allocation in allocations:
        allocation.status = "anulado"
        session.add(allocation)
    payment.status = "anulado"
    session.add(payment)
    session.commit()

    for charge_id in affected_charge_ids:
        charge = session.get(Charge, charge_id)
        if charge:
            refresh_charge_status(session, charge)
    session.commit()

    movements = session.exec(
        select(CashMovement).where(
            CashMovement.origin.in_(["payment", "payment_adjustment"]),
            CashMovement.origin_id == payment.id,
            CashMovement.status == "confirmado",
        )
    ).all()
    if not movements:
        raise ValueError("El pago no tiene movimiento de caja confirmado")
    reversals = [reverse_cash_movement(session, movement, reason) for movement in movements]
    return reversals[0]


def void_owner_charge(session: Session, owner_charge: OwnerCharge, reason: str) -> Optional[CashMovement]:
    if owner_charge.status == "anulado":
        raise ValueError("El debito ya esta anulado")
    owner_charge.status = "anulado"
    session.add(owner_charge)
    session.commit()
    movement = session.exec(
        select(CashMovement).where(
            CashMovement.origin == "owner_charge",
            CashMovement.origin_id == owner_charge.id,
            CashMovement.status == "confirmado",
        )
    ).first()
    if movement:
        return reverse_cash_movement(session, movement, reason)
    return None


def apply_allocations(
    session: Session, payment: Payment, allocations: Sequence[Dict[str, float]]
) -> None:
    already_allocated = sum(
        item.amount
        for item in session.exec(
            select(PaymentAllocation).where(
                PaymentAllocation.payment_id == payment.id,
                PaymentAllocation.status == "confirmado",
            )
        ).all()
    )
    if payment.status != "confirmado":
        raise ValueError("No se puede imputar un pago anulado")
    requested_total = sum(float(item["amount"]) for item in allocations)
    if already_allocated + requested_total > payment.amount + 0.01:
        raise ValueError("Las imputaciones superan el monto del pago")

    for item in allocations:
        charge = session.get(Charge, int(item["charge_id"]))
        if not charge:
            raise ValueError("Deuda no encontrada")
        remaining = remaining_for_charge(session, charge)
        amount = money(float(item["amount"]))
        if amount <= 0:
            raise ValueError("El monto imputado debe ser mayor a cero")
        if amount > remaining + 0.01:
            raise ValueError("La imputacion supera el saldo de la deuda")
        session.add(
            PaymentAllocation(
                payment_id=payment.id or 0,
                charge_id=charge.id or 0,
                amount=amount,
                status="confirmado",
            )
        )
    session.commit()

    charge_ids = [int(item["charge_id"]) for item in allocations]
    charges = [session.get(Charge, charge_id) for charge_id in charge_ids]
    for charge in charges:
        if charge:
            refresh_charge_status(session, charge)
    session.commit()


def build_reminder_message(session: Session, charge_ids: Sequence[int]) -> Dict[str, object]:
    charges = [session.get(Charge, charge_id) for charge_id in charge_ids]
    charges = [charge for charge in charges if charge]
    if not charges:
        raise ValueError("No hay deudas para recordar")
    person = session.get(Person, charges[0].responsible_person_id)
    total = sum(remaining_for_charge(session, charge) for charge in charges)
    lines = [
        f"Hola {person.full_name.split()[0] if person else ''}, te compartimos el estado pendiente:",
    ]
    for charge in charges:
        lines.append(
            f"- {charge.concept}: ${remaining_for_charge(session, charge):,.2f} vence {charge.due_date.isoformat()}"
        )
    lines.append(f"Total pendiente: ${money(total):,.2f}.")
    lines.append("Gracias, Inmobiliaria Salgueiro.")
    message = "\n".join(lines)
    phone = (person.mobile if person else "").replace("+", "").replace(" ", "")
    return {
        "person": person,
        "message": message,
        "whatsapp_url": f"https://wa.me/{phone}?text={quote(message)}",
    }


def public_link_charge_ids(csv_value: str) -> List[int]:
    return [int(part) for part in csv_value.split(",") if part.strip()]


def retention_voucher_to_dict(session: Session, voucher: RetentionVoucher) -> Dict[str, object]:
    contract = session.get(Contract, voucher.contract_id)
    owner = session.get(Person, voucher.owner_id) if voucher.owner_id else None
    property_obj = session.get(Property, contract.property_id) if contract else None
    tenant = session.get(Person, contract.tenant_id) if contract else None
    return {
        "id": voucher.id,
        "contract_id": voucher.contract_id,
        "contract_code": contract.legacy_code if contract else "",
        "owner_id": voucher.owner_id,
        "owner_name": owner.full_name if owner else "",
        "tenant_name": tenant.full_name if tenant else "",
        "property_reference": property_obj.reference if property_obj else "",
        "period": voucher.period,
        "source": voucher.source,
        "amount": money(voucher.amount),
        "due_date": voucher.due_date.isoformat() if voucher.due_date else None,
        "status": voucher.status,
        "received_at": voucher.received_at.isoformat() if voucher.received_at else None,
        "notes": voucher.notes,
        "created_at": voucher.created_at.isoformat(),
    }


def ensure_retention_voucher(
    session: Session,
    contract: Contract,
    owner_id: Optional[int],
    period: str,
    source: str,
    amount: float,
) -> None:
    existing = session.exec(
        select(RetentionVoucher).where(
            RetentionVoucher.contract_id == (contract.id or 0),
            RetentionVoucher.owner_id == owner_id,
            RetentionVoucher.period == period,
            RetentionVoucher.source == source,
        )
    ).first()
    if existing:
        existing.amount = money(amount)
        session.add(existing)
        return
    session.add(
        RetentionVoucher(
            contract_id=contract.id or 0,
            owner_id=owner_id,
            period=period,
            source=source,
            amount=money(amount),
            status="pendiente",
            notes="Generado automaticamente al liquidar contrato con resguardo.",
        )
    )


def contract_retention_source(contract: Contract) -> str:
    if contract.tenant_tax_role == "cede":
        return "CEDE"
    if contract.payment_origin in {"ANDA", "Contaduria"}:
        return contract.payment_origin
    if contract.guarantee_type == "anda":
        return "ANDA"
    if contract.guarantee_type == "contaduria":
        return "Contaduria"
    return ""


def institutional_commission_percent(institution: str) -> float:
    key = compact_key(institution)
    if key == "anda":
        return 2.0
    if key in {"contaduria", "cgn"}:
        return 3.0
    return 0.0


def institutional_reconciliation_rows(session: Session, institution: str, period: str) -> Dict[str, object]:
    settings = get_settings()
    key = compact_key(institution)
    display_name = "ANDA" if key == "anda" else "Contaduria"
    commission_percent = institutional_commission_percent(key)
    contracts = session.exec(select(Contract).where(Contract.active == True)).all()  # noqa: E712
    rows: List[Dict[str, object]] = []
    for contract in contracts:
        guarantee_key = compact_key(contract.guarantee_type)
        origin_key = compact_key(contract.payment_origin)
        if key == "anda":
            matches = guarantee_key == "anda" or origin_key == "anda"
        elif key in {"contaduria", "cgn"}:
            matches = guarantee_key in {"contaduria", "cgn"} or origin_key in {"contaduria", "cgn"}
        else:
            matches = False
        if not matches:
            continue
        property_obj = session.get(Property, contract.property_id)
        tenant = session.get(Person, contract.tenant_id)
        shares = session.exec(
            select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == contract.property_id)
        ).all()
        owner_names = []
        irpf_exonerated = not contract.irpf_applies or all(not share.irpf_applies for share in shares)
        for share in shares:
            owner = session.get(Person, share.owner_id)
            if owner:
                owner_names.append(owner.full_name)
        gross_rent = money(contract.rent_amount)
        institutional_commission = money(gross_rent * (commission_percent / 100))
        institutional_iva = money(institutional_commission * (settings.iva_percent / 100)) if key == "anda" else 0
        admin_commission = money(gross_rent * (contract.commission_percent / 100)) if contract.commission_on_rent else 0
        admin_iva = money(admin_commission * (settings.iva_percent / 100)) if contract.commission_iva_applies else 0
        irpf_retained = 0 if irpf_exonerated else money(gross_rent * (contract.irpf_percent / 100))
        expected_net = money(gross_rent - institutional_commission - institutional_iva - irpf_retained)
        rows.append(
            {
                "contract_id": contract.id,
                "contract_code": contract.legacy_code,
                "tenant_id": contract.tenant_id,
                "tenant_name": tenant.full_name if tenant else "",
                "tenant_legacy_code": tenant.legacy_code if tenant else "",
                "property_id": contract.property_id,
                "property_reference": property_obj.reference if property_obj else "",
                "property_address": property_obj.address if property_obj else "",
                "owner_names": owner_names,
                "guarantee_type": contract.guarantee_type,
                "period": period,
                "gross_rent": gross_rent,
                "institution_commission_percent": commission_percent,
                "institution_commission": institutional_commission,
                "institution_iva": institutional_iva,
                "admin_commission_percent": contract.commission_percent if contract.commission_on_rent else 0,
                "admin_commission": admin_commission,
                "admin_iva": admin_iva,
                "irpf_retained": irpf_retained,
                "irpf_exonerated": irpf_exonerated,
                "expected_net": expected_net,
            }
        )
    return {
        "institution": display_name,
        "period": period,
        "commission_percent": commission_percent,
        "iva_on_institution_commission": key == "anda",
        "rows": sorted(rows, key=lambda item: (str(item["tenant_legacy_code"]), str(item["tenant_name"]))),
    }


def decode_institutional_file(file_bytes: bytes, filename: str, content_type: str = "") -> Dict[str, object]:
    lower_name = (filename or "").lower()
    warnings: List[str] = []
    if lower_name.endswith(".xlsx"):
        try:
            return {"text": xlsx_to_text(file_bytes), "warnings": warnings, "source": "xlsx"}
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"No se pudo leer XLSX: {exc}")
            return {"text": "", "warnings": warnings, "source": "xlsx"}
    if lower_name.endswith(".csv"):
        return {"text": decode_text_file(file_bytes), "warnings": warnings, "source": "csv"}
    if is_pdf_upload(content_type, filename):
        extracted = extract_text_from_pdf(file_bytes, bool(shutil.which("tesseract")), max_pages=25)
        warnings.extend(list(extracted.get("warnings") or []))
        return {
            "text": str(extracted.get("text") or ""),
            "warnings": warnings,
            "source": "pdf-ocr" if extracted.get("used_ocr") else "pdf-text",
        }
    extracted = extract_text_from_invoice_upload(file_bytes, content_type, filename)
    warnings.extend(list(extracted.get("warnings") or []))
    return {
        "text": str(extracted.get("text") or ""),
        "warnings": warnings,
        "source": str(extracted.get("analysis_source") or "texto"),
    }


def decode_text_file(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="replace")


def xlsx_to_text(file_bytes: bytes) -> str:
    namespaces = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: List[str] = []
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.findall(".//main:si", namespaces):
                chunks = [node.text or "" for node in item.findall(".//main:t", namespaces)]
                shared_strings.append("".join(chunks))
        sheet_names = [name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
        for sheet_name in sorted(sheet_names)[:3]:
            sheet_root = ElementTree.fromstring(archive.read(sheet_name))
            for row in sheet_root.findall(".//main:row", namespaces):
                values: List[str] = []
                for cell in row.findall("main:c", namespaces):
                    raw_value = cell.find("main:v", namespaces)
                    inline_text = cell.find(".//main:t", namespaces)
                    value = raw_value.text if raw_value is not None and raw_value.text is not None else ""
                    if cell.attrib.get("t") == "s" and value.isdigit():
                        index = int(value)
                        value = shared_strings[index] if index < len(shared_strings) else value
                    elif cell.attrib.get("t") == "inlineStr" and inline_text is not None:
                        value = inline_text.text or ""
                    values.append(str(value).strip())
                if any(values):
                    rows.append(" | ".join(values))
    return "\n".join(rows)


def parse_institutional_liquidation_rows(text: str) -> List[Dict[str, object]]:
    csv_rows = parse_institutional_csv_rows(text)
    if csv_rows:
        return csv_rows
    anda_rows = parse_anda_liquidation_rows(text)
    if anda_rows:
        return anda_rows
    rows: List[Dict[str, object]] = []
    for line in (text or "").splitlines():
        parsed = parse_institutional_text_line(line)
        if parsed:
            rows.append(parsed)
    return rows


def parse_anda_liquidation_rows(text: str) -> List[Dict[str, object]]:
    raw_text = text or ""
    if "A.N.D.A." not in raw_text and "Liquidación de alquileres ANDA" not in raw_text:
        return []
    if "TOTAL POR CONTRATO" not in raw_text:
        return []

    rows: List[Dict[str, object]] = []
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw_text.splitlines()]
    current: Optional[Dict[str, object]] = None
    current_label = ""

    def flush_current(amount: float) -> None:
        nonlocal current
        if not current:
            return
        contract_code = str(current.get("contract_code") or "")
        tenant_name = str(current.get("tenant_name") or "")
        rows.append(
            {
                "amount": money(amount),
                "contract_code": contract_code,
                "tenant_legacy_code": str(current.get("tenant_legacy_code") or ""),
                "property_reference": "",
                "tenant_name": tenant_name,
                "period": current.get("period") or "",
                "gross_rent": current.get("gross_rent"),
                "institution_iva": current.get("institution_iva"),
                "institution_commission": current.get("institution_commission"),
                "irpf_retained": current.get("irpf_retained"),
                "source_line": f"{contract_code} | {tenant_name} | TOTAL POR CONTRATO: {money(amount):.2f}".strip(),
            }
        )
        current = None

    for line in lines:
        if not line:
            continue
        full_header = re.match(r"^([A-Z])\s+(\d{3,})\s+(.+?)\s+(\d{5,})$", line, re.I)
        simple_header = re.match(r"^([A-Z])\s+(\d{3,})$", line, re.I)
        if full_header:
            current = {
                "contract_code": f"{full_header.group(1).upper()} {full_header.group(2)}",
                "tenant_name": full_header.group(3).strip(),
                "tenant_legacy_code": full_header.group(4).strip(),
            }
            current_label = ""
            continue
        if simple_header:
            current = {
                "contract_code": f"{simple_header.group(1).upper()} {simple_header.group(2)}",
                "tenant_name": "",
                "tenant_legacy_code": "",
            }
            current_label = ""
            continue
        if not current:
            continue

        total_match = re.search(r"TOTAL POR CONTRATO\s*:?\s*(-?\d+(?:[.,]\d{2})?)", line, re.I)
        if total_match:
            amount = parse_invoice_number(total_match.group(1))
            if valid_invoice_amount(abs(amount) if amount is not None else None):
                flush_current(float(amount or 0))
            current_label = ""
            continue
        if compact_key(line).startswith("totalporcontrato"):
            current_label = "total"
            continue

        detail_match = re.match(
            r"^(ALQUILER|IVA POR PRIMA DE ALQUILER|PRIMA POR ALQUILER|RETENCION POR I\.R\.P\.F\.)\s+(\d{6})\s+(-?\d+(?:[.,]\d{2})?)$",
            line,
            re.I,
        )
        if detail_match:
            current_label = anda_detail_label(detail_match.group(1))
            current["period"] = yyyymm_to_period(detail_match.group(2))
            amount = parse_invoice_number(detail_match.group(3))
            if amount is not None:
                assign_anda_detail_amount(current, current_label, amount)
            current_label = ""
            continue

        line_key = compact_key(line)
        if line_key in {"alquiler", "ivaporprimadealquiler", "primaporalquiler", "retencionporirpf"}:
            current_label = anda_detail_label(line)
            continue
        if re.fullmatch(r"\d{6}", line) and current_label:
            current["period"] = yyyymm_to_period(line)
            continue

        amount = parse_invoice_number(line)
        if amount is not None and current_label:
            if current_label == "total":
                if valid_invoice_amount(abs(amount)):
                    flush_current(float(amount))
            else:
                assign_anda_detail_amount(current, current_label, amount)
            current_label = ""
            continue

        if not current.get("tenant_name") and re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", line):
            if not any(skip in line_key for skip in {"gmail", "liquidacion", "contrato", "descripcion", "importe"}):
                current["tenant_name"] = line
            continue
        if current.get("tenant_name") and not current.get("tenant_legacy_code") and re.fullmatch(r"\d{5,}", line):
            current["tenant_legacy_code"] = line

    return rows


def anda_detail_label(label: str) -> str:
    key = compact_key(label)
    if key == "alquiler":
        return "rent"
    if key == "ivaporprimadealquiler":
        return "iva"
    if key == "primaporalquiler":
        return "commission"
    if key == "retencionporirpf":
        return "irpf"
    return ""


def yyyymm_to_period(value: str) -> str:
    if not re.fullmatch(r"\d{6}", value or ""):
        return ""
    return f"{value[:4]}-{value[4:]}"


def assign_anda_detail_amount(row: Dict[str, object], label: str, amount: float) -> None:
    if label == "rent":
        row["gross_rent"] = money(amount)
    elif label == "iva":
        row["institution_iva"] = money(abs(amount))
    elif label == "commission":
        row["institution_commission"] = money(abs(amount))
    elif label == "irpf":
        row["irpf_retained"] = money(abs(amount))


def parse_institutional_csv_rows(text: str) -> List[Dict[str, object]]:
    sample = (text or "").strip()
    if not sample or "\n" not in sample:
        return []
    try:
        dialect = csv.Sniffer().sniff(sample[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    try:
        reader = csv.DictReader(io.StringIO(sample), dialect=dialect)
        if not reader.fieldnames or len(reader.fieldnames) <= 1:
            return []
        parsed: List[Dict[str, object]] = []
        for record in reader:
            item = parse_institutional_record(record)
            if item:
                parsed.append(item)
        return parsed
    except csv.Error:
        return []


def parse_institutional_record(record: Dict[str, Any]) -> Optional[Dict[str, object]]:
    raw_line = " | ".join(str(value).strip() for value in record.values() if str(value or "").strip())
    tenant_field = field_by_header(record, ["inq", "inquilino", "nro inquilino", "codigo inquilino", "codigo"])
    explicit_tenant_name = field_by_header(record, ["nombre", "inquilino nombre", "tenant", "cliente"])
    amount_text = field_by_header(
        record,
        [
            "liquidado",
            "neto",
            "importe",
            "monto",
            "total",
            "a cobrar",
            "a transferir",
            "depositado",
            "pagado",
        ],
    )
    amount = parse_invoice_number(str(amount_text or "")) if amount_text else amount_from_line(raw_line)
    if not amount:
        return None
    return {
        "amount": amount,
        "contract_code": field_by_header(record, ["contrato", "codigo contrato", "cod contrato"]),
        "tenant_legacy_code": tenant_field if not re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", tenant_field) else "",
        "property_reference": field_by_header(record, ["fin", "finca", "nro finca", "codigo finca", "propiedad"]),
        "tenant_name": explicit_tenant_name or (tenant_field if re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", tenant_field) else ""),
        "source_line": raw_line,
    }


def field_by_header(record: Dict[str, Any], accepted_headers: Sequence[str]) -> str:
    accepted = {compact_key(header) for header in accepted_headers}
    for header, value in record.items():
        normalized = compact_key(str(header))
        if normalized in accepted or any(item in normalized for item in accepted):
            return str(value or "").strip()
    return ""


def parse_institutional_text_line(line: str) -> Optional[Dict[str, object]]:
    clean = re.sub(r"\s+", " ", line or "").strip()
    if not clean:
        return None
    amount = amount_from_line(clean)
    if not amount:
        return None
    return {
        "amount": amount,
        "contract_code": regex_group(clean, r"\b(?:contrato|ctto|cont)\.?\s*[:#-]?\s*([A-Za-z0-9-]+)"),
        "tenant_legacy_code": regex_group(clean, r"\b(?:inq|inquilino)\.?\s*[:#-]?\s*([A-Za-z0-9-]+)"),
        "property_reference": regex_group(clean, r"\b(?:fin|finca)\.?\s*[:#-]?\s*([A-Za-z0-9-]+)"),
        "tenant_name": text_name_hint(clean),
        "source_line": clean,
    }


def amount_from_line(line: str) -> Optional[float]:
    money_patterns = re.findall(
        r"-?\$?\s*\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|-?\$?\s*\d+(?:[,.]\d{2})",
        line or "",
    )
    for candidate in reversed(money_patterns):
        amount = parse_invoice_number(candidate)
        if valid_invoice_amount(amount):
            return amount
    return None


def regex_group(value: str, pattern: str) -> str:
    match = re.search(pattern, value or "", re.I)
    return match.group(1).strip() if match else ""


def text_name_hint(line: str) -> str:
    without_amounts = re.sub(
        r"-?\$?\s*\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|-?\$?\s*\d+(?:[,.]\d{2})",
        " ",
        line or "",
    )
    without_labels = re.sub(
        r"\b(?:contrato|ctto|cont|inq|inquilino|fin|finca)\.?\s*[:#-]?\s*[A-Za-z0-9-]+",
        " ",
        without_amounts,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", without_labels).strip(" -|")


def compare_institutional_reconciliation(
    session: Session,
    institution: str,
    period: str,
    imported_rows: Sequence[Dict[str, object]],
    *,
    filename: str = "",
    warnings: Optional[List[str]] = None,
) -> Dict[str, object]:
    expected = institutional_reconciliation_rows(session, institution, period)
    rows = list(expected["rows"])
    used_import_indexes: set[int] = set()
    matched = 0
    missing = 0
    differences = 0
    enriched_rows: List[Dict[str, object]] = []
    for expected_row in rows:
        best_index = best_institutional_import_match(expected_row, imported_rows, used_import_indexes)
        enriched = dict(expected_row)
        if best_index is None:
            enriched.update(
                {
                    "imported_amount": None,
                    "difference": None,
                    "match_status": "sin_importe",
                    "imported_source_line": "",
                }
            )
            missing += 1
        else:
            used_import_indexes.add(best_index)
            imported = imported_rows[best_index]
            imported_amount = money(float(imported.get("amount") or 0))
            difference = money(imported_amount - float(expected_row.get("expected_net") or 0))
            status = "ok" if abs(difference) <= 0.5 else "diferencia"
            if status == "diferencia":
                differences += 1
            matched += 1
            enriched.update(
                {
                    "imported_amount": imported_amount,
                    "difference": difference,
                    "match_status": status,
                    "imported_source_line": str(imported.get("source_line") or ""),
                }
            )
        enriched_rows.append(enriched)
    unmatched_imports = [
        imported_row
        for index, imported_row in enumerate(imported_rows)
        if index not in used_import_indexes
    ]
    return {
        **expected,
        "rows": enriched_rows,
        "import_summary": {
            "filename": filename,
            "rows_detected": len(imported_rows),
            "matched": matched,
            "missing": missing,
            "differences": differences,
            "unmatched": len(unmatched_imports),
            "warnings": warnings or [],
        },
        "unmatched_imports": unmatched_imports,
    }


def best_institutional_import_match(
    expected_row: Dict[str, object],
    imported_rows: Sequence[Dict[str, object]],
    used_indexes: set[int],
) -> Optional[int]:
    best_index: Optional[int] = None
    best_score = 0
    for index, imported in enumerate(imported_rows):
        if index in used_indexes:
            continue
        score = institutional_match_score(expected_row, imported)
        if score > best_score:
            best_score = score
            best_index = index
    return best_index if best_score >= 35 else None


def institutional_match_score(expected_row: Dict[str, object], imported_row: Dict[str, object]) -> int:
    score = 0
    expected_contract_digits = digits_only(str(expected_row.get("contract_code") or ""))
    imported_contract_digits = digits_only(str(imported_row.get("contract_code") or ""))
    if same_compact(expected_row.get("contract_code"), imported_row.get("contract_code")):
        score += 80
    elif expected_contract_digits and expected_contract_digits == imported_contract_digits:
        score += 65
    if same_compact(expected_row.get("tenant_legacy_code"), imported_row.get("tenant_legacy_code")):
        score += 55
    if same_compact(expected_row.get("property_reference"), imported_row.get("property_reference")):
        score += 35
    expected_name = str(expected_row.get("tenant_name") or "")
    imported_name = str(imported_row.get("tenant_name") or "")
    if expected_name and imported_name:
        expected_key = compact_key(expected_name)
        imported_key = compact_key(imported_name)
        if expected_key and (expected_key in imported_key or imported_key in expected_key):
            score += 45
        else:
            expected_tokens = {compact_key(token) for token in expected_name.split() if len(compact_key(token)) >= 4}
            imported_tokens = {compact_key(token) for token in imported_name.split() if len(compact_key(token)) >= 4}
            score += min(45, len(expected_tokens & imported_tokens) * 12)
    return score


def same_compact(left: object, right: object) -> bool:
    left_key = compact_key(str(left or ""))
    right_key = compact_key(str(right or ""))
    return bool(left_key and right_key and left_key == right_key)


def generate_owner_settlements(session: Session, period: str) -> List[OwnerSettlement]:
    settings = get_settings()
    existing = session.exec(
        select(OwnerSettlement).where(OwnerSettlement.period == period)
    ).all()
    existing_ids = [int(settlement.id) for settlement in existing if settlement.id]
    if existing_ids:
        lines = session.exec(
            select(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id.in_(existing_ids))
        ).all()
        for line in lines:
            session.delete(line)
        session.commit()
        existing = session.exec(
            select(OwnerSettlement).where(OwnerSettlement.id.in_(existing_ids))
        ).all()
        for settlement in existing:
            session.delete(settlement)
        session.commit()
    else:
        session.commit()

    period_prefix = f"{period}-"
    payments = session.exec(select(Payment)).all()
    owner_totals: Dict[int, Dict[str, float]] = {}
    pending_lines: Dict[int, List[Dict[str, object]]] = {}

    for payment in payments:
        if payment.status != "confirmado":
            continue
        if not payment.payment_date.isoformat().startswith(period_prefix):
            continue
        allocations = session.exec(
            select(PaymentAllocation).where(
                PaymentAllocation.payment_id == payment.id,
                PaymentAllocation.status == "confirmado",
            )
        ).all()
        for allocation in allocations:
            charge = session.get(Charge, allocation.charge_id)
            if not charge:
                continue
            contract = session.get(Contract, charge.contract_id)
            if not contract:
                continue
            if not contract.active:
                continue
            property_obj = session.get(Property, contract.property_id)
            shares = session.exec(
                select(PropertyOwnerShare).where(
                    PropertyOwnerShare.property_id == contract.property_id
                )
            ).all()
            for share in shares:
                owner_amount = allocation.amount * (share.percentage / 100)
                totals = owner_totals.setdefault(
                    share.owner_id,
                    {"income": 0, "expenses": 0, "commission": 0, "iva": 0, "irpf": 0},
                )
                totals["income"] += owner_amount
                is_rent = compact_key(charge.concept) == "alquiler"
                commission_applies = contract.commission_on_rent if is_rent else contract.commission_on_other_charges
                commission = owner_amount * (contract.commission_percent / 100) if commission_applies else 0
                iva = commission * (settings.iva_percent / 100) if contract.commission_iva_applies else 0
                should_apply_irpf = (
                    contract.irpf_applies
                    and share.irpf_applies
                    and contract.payment_origin == "normal"
                )
                irpf = owner_amount * (contract.irpf_percent / 100) if should_apply_irpf else 0
                totals["commission"] += commission
                totals["iva"] += iva
                totals["irpf"] += irpf
                retention_source = contract_retention_source(contract)
                if retention_source and (contract.resguardo_required or contract.tenant_tax_role == "cede" or irpf > 0):
                    ensure_retention_voucher(session, contract, share.owner_id, period, retention_source, irpf)
                pending_lines.setdefault(share.owner_id, []).append(
                    {
                        "property_id": contract.property_id,
                        "contract_id": contract.id,
                        "tenant_id": contract.tenant_id,
                        "source_type": "payment_allocation",
                        "source_id": allocation.id,
                        "concept": charge.concept,
                        "description": f"{property_obj.reference if property_obj else ''} · {charge.description}",
                        "period": period,
                        "accrual_period": charge.accrual_period or charge.period,
                        "payment_date": payment.payment_date,
                        "owner_percentage": share.percentage,
                        "gross_amount": allocation.amount,
                        "owner_amount": owner_amount,
                        "expense_amount": 0,
                        "commission": commission,
                        "iva": iva,
                        "irpf": irpf,
                        "net_amount": owner_amount - commission - iva - irpf,
                    }
                )

    owner_charges = session.exec(
        select(OwnerCharge).where(
            OwnerCharge.period == period,
            OwnerCharge.status != "anulado",
        )
    ).all()
    for owner_charge in owner_charges:
        if owner_charge.split_by_ownership:
            shares = session.exec(
                select(PropertyOwnerShare).where(
                    PropertyOwnerShare.property_id == owner_charge.property_id
                )
            ).all()
        else:
            shares = [
                PropertyOwnerShare(
                    property_id=owner_charge.property_id,
                    owner_id=owner_charge.owner_id,
                    percentage=100,
                )
            ]
        for share in shares:
            expense_amount = owner_charge.amount * (share.percentage / 100)
            totals = owner_totals.setdefault(
                share.owner_id,
                {"income": 0, "expenses": 0, "commission": 0, "iva": 0, "irpf": 0},
            )
            totals["expenses"] += expense_amount
            commission = expense_amount * (owner_charge.commission_percent / 100) if owner_charge.generates_commission else 0
            iva = commission * (settings.iva_percent / 100)
            totals["commission"] += commission
            totals["iva"] += iva
            pending_lines.setdefault(share.owner_id, []).append(
                {
                    "property_id": owner_charge.property_id,
                    "contract_id": None,
                    "tenant_id": None,
                    "source_type": "owner_charge",
                    "source_id": owner_charge.id,
                    "concept": owner_charge.concept,
                    "description": owner_charge.description,
                    "period": period,
                    "accrual_period": owner_charge.period,
                    "payment_date": owner_charge.charge_date,
                    "owner_percentage": share.percentage,
                    "gross_amount": owner_charge.amount,
                    "owner_amount": 0,
                    "expense_amount": expense_amount,
                    "commission": commission,
                    "iva": iva,
                    "irpf": 0,
                    "net_amount": -expense_amount - commission - iva,
                }
            )

    settlements: List[OwnerSettlement] = []
    for owner_id, totals in owner_totals.items():
        owner = session.get(Person, owner_id)
        income = money(totals["income"])
        expenses = money(totals["expenses"])
        commission = money(totals["commission"])
        iva = money(totals["iva"])
        irpf = money(totals["irpf"])
        transfer_before_bank_fee = money(income - expenses - commission - iva - irpf)
        bank_transfer_fee = (
            money(owner.bank_transfer_commission_amount)
            if owner
            and owner.bank_transfer_commission_applies
            and owner.bank_transfer_commission_amount > 0
            and transfer_before_bank_fee > 0
            else 0
        )
        settlement = OwnerSettlement(
            owner_id=owner_id,
            period=period,
            income=income,
            expenses=expenses,
            commission=commission,
            iva=iva,
            irpf=irpf,
            bank_transfer_fee=bank_transfer_fee,
            total_to_transfer=money(transfer_before_bank_fee - bank_transfer_fee),
            status="borrador",
        )
        session.add(settlement)
        settlements.append(settlement)
    session.commit()
    for settlement in settlements:
        session.refresh(settlement)
        for line_data in pending_lines.get(settlement.owner_id, []):
            session.add(
                OwnerSettlementLine(
                    settlement_id=settlement.id or 0,
                    owner_id=settlement.owner_id,
                    **line_data,
                )
            )
    session.commit()
    return settlements


def settlement_to_dict(session: Session, settlement: OwnerSettlement) -> Dict[str, object]:
    owner = session.get(Person, settlement.owner_id)
    lines = session.exec(
        select(OwnerSettlementLine).where(OwnerSettlementLine.settlement_id == settlement.id)
    ).all()
    cash_movements = owner_settlement_cash_movements(session, settlement)
    paid_amount = money(sum(movement.amount for movement in cash_movements))
    balance_after_payment = money(settlement.total_to_transfer - paid_amount)
    return {
        "id": settlement.id,
        "owner_id": settlement.owner_id,
        "owner_name": owner.full_name if owner else "",
        "period": settlement.period,
        "income": money(settlement.income),
        "expenses": money(settlement.expenses),
        "commission": money(settlement.commission),
        "iva": money(settlement.iva),
        "irpf": money(settlement.irpf),
        "bank_transfer_fee": money(settlement.bank_transfer_fee),
        "total_to_transfer": money(settlement.total_to_transfer),
        "paid_amount": paid_amount,
        "balance_after_payment": balance_after_payment,
        "balance_status": owner_settlement_balance_status(balance_after_payment),
        "status": settlement.status,
        "paid_at": settlement.paid_at.isoformat() if settlement.paid_at else None,
        "cash_movement": cash_movement_to_dict(session, cash_movements[-1]) if cash_movements else None,
        "cash_movements": [cash_movement_to_dict(session, movement) for movement in cash_movements],
        "created_at": settlement.created_at.isoformat(),
        "lines": [settlement_line_to_dict(session, line) for line in lines],
    }


def settlement_line_to_dict(session: Session, line: OwnerSettlementLine) -> Dict[str, object]:
    property_obj = session.get(Property, line.property_id) if line.property_id else None
    tenant = session.get(Person, line.tenant_id) if line.tenant_id else None
    return {
        "id": line.id,
        "settlement_id": line.settlement_id,
        "owner_id": line.owner_id,
        "property_id": line.property_id,
        "property_reference": property_obj.reference if property_obj else "",
        "property_address": property_obj.address if property_obj else "",
        "contract_id": line.contract_id,
        "tenant_id": line.tenant_id,
        "tenant_name": tenant.full_name if tenant else "",
        "source_type": line.source_type,
        "source_id": line.source_id,
        "concept": line.concept,
        "description": line.description,
        "period": line.period,
        "accrual_period": line.accrual_period,
        "payment_date": line.payment_date.isoformat() if line.payment_date else None,
        "owner_percentage": line.owner_percentage,
        "gross_amount": money(line.gross_amount),
        "owner_amount": money(line.owner_amount),
        "expense_amount": money(line.expense_amount),
        "commission": money(line.commission),
        "iva": money(line.iva),
        "irpf": money(line.irpf),
        "net_amount": money(line.net_amount),
    }
