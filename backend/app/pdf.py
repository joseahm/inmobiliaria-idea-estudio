from __future__ import annotations

from calendar import monthrange
from datetime import datetime
from io import BytesIO
from textwrap import wrap
from typing import Iterable, List, Sequence, Tuple

import fitz


Line = Tuple[str, str]
BLUE = (0.02, 0.12, 0.32)
ABACO_BLUE = (0.02, 0.16, 0.80)
INK = (0.03, 0.03, 0.03)
MUTED = (0.35, 0.35, 0.35)
WATERMARK = (0.55, 0.68, 0.70)
COMPANY_NAME = "SALGUEIRO\nINMOBILIARIA"
COMPANY_RUT = "R.U.T. 21.887388.0019"
COMPANY_ADDRESS = "18 de Julio 1268 oficina 404"
COMPANY_PHONE = "Tel.:2901 49 25 / 099 674 934"
COMPANY_EMAIL = "inmobiliaria.salgueiro@hotmail.com"


def format_money(value: object) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    formatted = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {formatted}"


def format_amount_plain(value: object) -> str:
    return format_money(value).replace("$ ", "")


def format_amount_tower(value: object) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"{amount:,.2f}"


def normalize_amount_tower(value: object) -> str:
    text = str(value or "").replace("$", "").strip()
    if not text:
        return format_amount_tower(0)
    try:
        normalized = text.replace(".", "").replace(",", ".") if "," in text else text.replace(",", "")
        return format_amount_tower(float(normalized))
    except ValueError:
        return text


def format_date_uy(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.strftime("%d/%m/%Y")
    except ValueError:
        return value


def format_date_long_es(value: str) -> str:
    months = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Setiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ]
    try:
        parsed = datetime.fromisoformat(value)
        return f"{parsed.day} de {months[parsed.month - 1]} de {parsed.year}"
    except ValueError:
        return value


def _finish_pdf(document: fitz.Document, *, page_numbers: bool = True) -> bytes:
    if page_numbers:
        for page_index, page in enumerate(document, start=1):
            page.insert_text((500, 820), f"Pag. {page_index}", fontsize=8, fontname="helv", color=(0.38, 0.44, 0.51))
    stream = BytesIO(document.tobytes(deflate=True))
    document.close()
    return stream.getvalue()


def _text_box(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    size: float = 9,
    fontname: str = "helv",
    align: int = fitz.TEXT_ALIGN_LEFT,
    color: tuple[float, float, float] = INK,
) -> None:
    page.insert_textbox(rect, str(text or ""), fontsize=size, fontname=fontname, align=align, color=color)


def _draw_company_header(page: fitz.Page, x: float, y: float, width: float, *, title: str = "") -> None:
    page.draw_line((x + 8, y + 50), (x + 50, y + 50), color=BLUE, width=1.1)
    page.draw_polyline(
        [
            (x + 16, y + 50),
            (x + 16, y + 35),
            (x + 25, y + 35),
            (x + 25, y + 12),
            (x + 38, y + 12),
            (x + 38, y + 50),
        ],
        color=BLUE,
        width=1.4,
    )
    page.insert_text((x + 55, y + 20), "SALGUEIRO", fontsize=20, fontname="helv", color=BLUE)
    page.insert_text((x + 55, y + 42), "INMOBILIARIA", fontsize=17, fontname="helv", color=BLUE)
    page.insert_text((x + width - 168, y + 18), COMPANY_RUT, fontsize=11, fontname="helv", color=INK)
    if title:
        page.insert_text((x + width - 125, y + 38), title, fontsize=11, fontname="helv", color=INK)
    page.insert_text((x, y + 67), COMPANY_ADDRESS, fontsize=8, fontname="helv", color=INK)
    page.insert_text((x, y + 81), COMPANY_PHONE, fontsize=8, fontname="helv", color=INK)
    page.insert_text((x, y + 95), COMPANY_EMAIL, fontsize=8, fontname="helv", color=INK)


def _draw_tower_header(page: fitz.Page, x: float, y: float, width: float, *, amount: float | None = None) -> None:
    page.insert_text((x + 4, y + 10), COMPANY_RUT, fontsize=9.5, fontname="helv", color=INK)
    page.draw_line((x + 4, y + 70), (x + 56, y + 70), color=BLUE, width=1.0)
    page.draw_polyline(
        [
            (x + 10, y + 70),
            (x + 10, y + 48),
            (x + 20, y + 48),
            (x + 20, y + 18),
            (x + 36, y + 18),
            (x + 36, y + 70),
        ],
        color=BLUE,
        width=1.3,
    )
    page.insert_text((x + 62, y + 34), "SALGUEIRO", fontsize=18, fontname="helv", color=BLUE)
    page.insert_text((x + 62, y + 58), "INMOBILIARIA", fontsize=15, fontname="helv", color=BLUE)
    page.insert_text((x + 6, y + 88), COMPANY_ADDRESS, fontsize=7.5, fontname="helv", color=INK)
    page.insert_text((x + 6, y + 101), COMPANY_PHONE, fontsize=7.5, fontname="helv", color=INK)
    page.insert_text((x + 6, y + 114), COMPANY_EMAIL, fontsize=7.5, fontname="helv", color=INK)
    if amount is not None:
        box = fitz.Rect(x + width - 145, y + 55, x + width - 5, y + 110)
        page.draw_rect(box, color=INK, width=0.8)
        page.draw_line((box.x0, box.y0 + 21), (box.x1, box.y0 + 21), color=INK, width=0.8)
        _text_box(page, fitz.Rect(box.x0, box.y0 + 4, box.x1, box.y0 + 19), "IMPORTE", size=8.5, fontname="cour", align=fitz.TEXT_ALIGN_CENTER)
        page.insert_text((box.x0 + 8, box.y0 + 42), "$", fontsize=9.5, fontname="cour", color=INK)
        _text_box(page, fitz.Rect(box.x0 + 30, box.y0 + 30, box.x1 - 8, box.y0 + 48), format_amount_tower(amount), size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)


def _draw_watermark(page: fitz.Page, x: float, y: float, width: float, height: float) -> None:
    page.insert_text((x + width * 0.19, y + height * 0.42), "SALGUEIRO", fontsize=38, fontname="helv", color=WATERMARK)
    page.insert_text((x + width * 0.13, y + height * 0.60), "INMOBILIARIA", fontsize=38, fontname="helv", color=WATERMARK)


def _split_receipt_label(label: str) -> tuple[str, str]:
    left = (label or "").split("·")[0].strip()
    if not left:
        return "PAGO", ""
    parts = left.split()
    if len(parts) >= 2 and parts[-1].count("-") == 1:
        return " ".join(parts[:-1]), parts[-1]
    return left, ""


UNITS = [
    "CERO",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
]


def amount_to_words_es(value: float) -> str:
    number = int(round(float(value or 0)))
    if number == 0:
        return "CERO"
    if number < 10:
        return UNITS[number]
    if number < 100:
        tens = [
            "",
            "DIEZ",
            "VEINTE",
            "TREINTA",
            "CUARENTA",
            "CINCUENTA",
            "SESENTA",
            "SETENTA",
            "OCHENTA",
            "NOVENTA",
        ]
        if number < 16:
            specials = {10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE"}
            return specials[number]
        if number < 20:
            return "DIECI" + UNITS[number - 10]
        if number < 30:
            return "VEINTI" + UNITS[number - 20] if number > 20 else "VEINTE"
        return tens[number // 10] if number % 10 == 0 else f"{tens[number // 10]} Y {UNITS[number % 10]}"
    if number < 1000:
        hundreds = {
            100: "CIEN",
            200: "DOSCIENTOS",
            300: "TRESCIENTOS",
            400: "CUATROCIENTOS",
            500: "QUINIENTOS",
            600: "SEISCIENTOS",
            700: "SETECIENTOS",
            800: "OCHOCIENTOS",
            900: "NOVECIENTOS",
        }
        if number in hundreds:
            return hundreds[number]
        return f"CIENTO {amount_to_words_es(number - 100)}" if number < 200 else f"{hundreds[number // 100 * 100]} {amount_to_words_es(number % 100)}"
    if number < 1_000_000:
        thousands = number // 1000
        rest = number % 1000
        prefix = "MIL" if thousands == 1 else f"{amount_to_words_es(thousands)} MIL"
        return prefix if rest == 0 else f"{prefix} {amount_to_words_es(rest)}"
    return format_amount_plain(number)


def _draw_wrapped(
    page: fitz.Page,
    text: str,
    x_position: float,
    y_position: float,
    *,
    size: int = 10,
    max_chars: int = 92,
    fontname: str = "helv",
) -> float:
    for line in wrap(str(text), width=max_chars) or [""]:
        page.insert_text((x_position, y_position), line, fontsize=size, fontname=fontname)
        y_position += size + 4
    return y_position


def _new_page(document: fitz.Document) -> tuple[fitz.Page, float]:
    page = document.new_page(width=595, height=842)
    page.insert_text((42, 44), "Inmobiliaria Salgueiro", fontsize=11, fontname="helv", color=(0.1, 0.42, 0.48))
    page.draw_line((42, 58), (553, 58), color=(0.75, 0.82, 0.86), width=0.6)
    return page, 86


def _ensure_space(document: fitz.Document, page: fitz.Page, y_position: float, needed: float = 40) -> tuple[fitz.Page, float]:
    if y_position + needed <= 790:
        return page, y_position
    return _new_page(document)


def _draw_section(document: fitz.Document, page: fitz.Page, y_position: float, title: str, lines: Sequence[Line]) -> tuple[fitz.Page, float]:
    page, y_position = _ensure_space(document, page, y_position, 34 + len(lines) * 18)
    page.insert_text((42, y_position), title, fontsize=13, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 22
    for label, value in lines:
        page, y_position = _ensure_space(document, page, y_position, 20)
        page.insert_text((52, y_position), f"{label}:", fontsize=9, fontname="helv", color=(0.38, 0.44, 0.51))
        y_position = _draw_wrapped(page, value, 180, y_position, size=9, max_chars=64)
    return page, y_position + 8


def _draw_table(
    document: fitz.Document,
    page: fitz.Page,
    y_position: float,
    title: str,
    rows: Iterable[Sequence[str]],
    *,
    max_rows: int = 80,
) -> tuple[fitz.Page, float]:
    page, y_position = _ensure_space(document, page, y_position, 42)
    page.insert_text((42, y_position), title, fontsize=13, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 20
    row_count = 0
    for row in rows:
        if row_count >= max_rows:
            page, y_position = _ensure_space(document, page, y_position, 20)
            page.insert_text((52, y_position), "Se omitieron lineas adicionales por extension.", fontsize=9, fontname="helv")
            y_position += 16
            break
        page, y_position = _ensure_space(document, page, y_position, 32)
        concept, detail, amount = row
        page.insert_text((52, y_position), concept[:30], fontsize=9, fontname="helv", color=(0.05, 0.13, 0.22))
        page.insert_text((240, y_position), detail[:38], fontsize=8, fontname="helv", color=(0.38, 0.44, 0.51))
        page.insert_text((470, y_position), amount, fontsize=9, fontname="helv", color=(0.05, 0.13, 0.22))
        y_position += 18
        row_count += 1
    return page, y_position + 8


def _draw_ledger_table(
    document: fitz.Document,
    page: fitz.Page,
    y_position: float,
    title: str,
    rows: Iterable[Sequence[str]],
    *,
    max_rows: int = 90,
) -> tuple[fitz.Page, float]:
    page, y_position = _ensure_space(document, page, y_position, 42)
    page.insert_text((42, y_position), title, fontsize=13, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 20
    headers = [("Fecha", 52), ("Finca / detalle", 108), ("Concepto", 270), ("Debe", 420), ("Haber", 500)]
    page, y_position = _ensure_space(document, page, y_position, 24)
    for label, x_position in headers:
        page.insert_text((x_position, y_position), label, fontsize=8, fontname="helv", color=(0.38, 0.44, 0.51))
    y_position += 14
    row_count = 0
    for row in rows:
        if row_count >= max_rows:
            page, y_position = _ensure_space(document, page, y_position, 20)
            page.insert_text((52, y_position), "Se omitieron lineas adicionales por extension.", fontsize=9, fontname="helv")
            y_position += 16
            break
        page, y_position = _ensure_space(document, page, y_position, 28)
        date_text, detail, concept, debit, credit = row
        page.insert_text((52, y_position), date_text[:10], fontsize=8, fontname="helv")
        page.insert_text((108, y_position), detail[:38], fontsize=8, fontname="helv")
        page.insert_text((270, y_position), concept[:28], fontsize=8, fontname="helv")
        page.insert_text((420, y_position), debit, fontsize=8, fontname="helv")
        page.insert_text((500, y_position), credit, fontsize=8, fontname="helv")
        y_position += 16
        row_count += 1
    return page, y_position + 8


def payment_receipt_pdf(
    *,
    receipt_number: int,
    payer_name: str,
    payment_date: str,
    amount: float,
    method: str,
    reference: str,
    notes: str,
    allocations: Sequence[Line],
    unallocated_amount: float,
    tenant_code: str = "",
    owner_code: str = "",
    property_reference: str = "",
    property_address: str = "",
) -> bytes:
    document = fitz.open()
    page = document.new_page(width=842, height=595)
    page.draw_line((421, 18), (421, 570), color=INK, width=0.7)
    lines = list(allocations) or [("PAGO SIN IMPUTAR", format_money(unallocated_amount or amount))]
    detail_amount = amount

    def draw_copy(x: float, label: str) -> None:
        copy_width = 390
        _draw_company_header(page, x, 20, copy_width, title="Recibo de Alquiler")
        page.draw_rect(fitz.Rect(x + 230, 72, x + copy_width, 116), color=INK, width=0.7)
        page.draw_line((x + 315, 72), (x + 315, 116), color=INK, width=0.7)
        page.draw_line((x + 230, 94), (x + copy_width, 94), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x + 230, 75, x + 315, 92), "N° RECIBO", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 315, 75, x + copy_width, 92), "FECHA", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 230, 98, x + 315, 114), str(receipt_number), size=9, fontname="cour", align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 315, 98, x + copy_width, 114), format_date_uy(payment_date), size=9, fontname="cour", align=fitz.TEXT_ALIGN_CENTER)

        _draw_watermark(page, x, 122, copy_width, 250)
        page.draw_rect(fitz.Rect(x, 126, x + copy_width, 190), color=INK, width=0.7)
        page.draw_line((x, 148), (x + copy_width, 148), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x, 130, x + copy_width, 146), "OBSERVACIONES", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 8, 154, x + copy_width - 8, 188), notes or reference or "", size=7, fontname="cour", align=fitz.TEXT_ALIGN_LEFT)

        page.draw_rect(fitz.Rect(x, 200, x + copy_width, 250), color=INK, width=0.7)
        page.draw_line((x, 222), (x + copy_width, 222), color=INK, width=0.7)
        page.draw_line((x + 100, 200), (x + 100, 250), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x, 204, x + 100, 220), "PROPIETARIO", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 100, 204, x + copy_width, 220), "CODIGO Y NOMBRE INQUILINO", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x, 228, x + 100, 246), owner_code or "-", size=10, fontname="cour", align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 108, 228, x + 148, 246), tenant_code or "", size=10, fontname="cour", align=fitz.TEXT_ALIGN_LEFT)
        _text_box(page, fitz.Rect(x + 148, 228, x + copy_width - 4, 246), payer_name.replace(f"Inq {tenant_code or 's/n'} - ", ""), size=8, fontname="cour", align=fitz.TEXT_ALIGN_LEFT)

        page.draw_rect(fitz.Rect(x, 260, x + copy_width, 310), color=INK, width=0.7)
        page.draw_line((x, 282), (x + copy_width, 282), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x, 264, x + copy_width, 280), "FINCA", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 8, 288, x + copy_width - 8, 306), f"{property_address or ''} {property_reference or ''}".strip() or "Sin finca", size=8, fontname="cour", align=fitz.TEXT_ALIGN_LEFT)

        page.draw_rect(fitz.Rect(x, 320, x + copy_width, 520), color=INK, width=0.7)
        page.draw_line((x, 342), (x + copy_width, 342), color=INK, width=0.7)
        page.draw_line((x + 255, 320), (x + 255, 520), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x, 324, x + 255, 340), "CONCEPTO", size=8, align=fitz.TEXT_ALIGN_CENTER)
        _text_box(page, fitz.Rect(x + 255, 324, x + copy_width, 340), "IMPORTE", size=8, align=fitz.TEXT_ALIGN_CENTER)
        row_y = 354
        for item_label, item_amount in lines[:8]:
            concept, period = _split_receipt_label(item_label)
            page.insert_text((x + 8, row_y), concept[:20].upper(), fontsize=8.5, fontname="cour", color=INK)
            if period:
                page.insert_text((x + 172, row_y), period, fontsize=8.5, fontname="cour", color=INK)
            page.insert_text((x + 264, row_y), "$", fontsize=8.5, fontname="cour", color=INK)
            _text_box(page, fitz.Rect(x + 284, row_y - 10, x + copy_width - 8, row_y + 5), item_amount, size=8.5, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
            row_y += 16
        page.draw_line((x + 255, 474), (x + copy_width, 474), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x + 255, 478, x + copy_width - 8, 494), "TOTAL", size=9, align=fitz.TEXT_ALIGN_CENTER)
        page.insert_text((x + 264, 510), "$", fontsize=9, fontname="cour", color=INK)
        _text_box(page, fitz.Rect(x + 284, 500, x + copy_width - 8, 516), format_amount_plain(detail_amount), size=9, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)

        page.insert_text((x, 535), "RECIBIMOS LOS IMPORTES CORRESPONDIENTES AL", fontsize=7, fontname="cour", color=INK)
        page.insert_text((x, 550), "MES DE LA FECHA. EVITE GASTOS JUDICIALES,", fontsize=7, fontname="cour", color=INK)
        page.insert_text((x, 565), "ABONANDO DEL 1° AL 10 DE CADA MES.", fontsize=7, fontname="cour", color=INK)
        _text_box(page, fitz.Rect(x + copy_width - 80, 558, x + copy_width, 578), label, size=8, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)

    draw_copy(20, "EMPRESA")
    draw_copy(432, "CLIENTE")
    return _finish_pdf(document, page_numbers=False)


def settlement_liquidation_pdf(
    *,
    settlement: dict,
    owner: dict,
) -> bytes:
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    _draw_company_header(page, 42, 26, 510, title="Liquidación")
    page.draw_line((42, 132), (553, 132), color=INK, width=0.8)
    y_position = 154
    page.insert_text((42, y_position), "Liquidación mensual al propietario", fontsize=18, fontname="helv", color=BLUE)
    y_position += 26
    page, y_position = _draw_section(
        document,
        page,
        y_position,
        "Resumen",
        [
            ("Propietario", str(settlement.get("owner_name") or "")),
            ("Periodo", str(settlement.get("period") or "")),
            ("Banco", str(owner.get("bank_name") or "Sin banco cargado")),
            ("Cuenta", str(owner.get("bank_account") or "Sin cuenta cargada")),
            ("Saldo anterior", format_money(0)),
            ("Monto recaudado", format_money(settlement.get("income"))),
            ("Gastos / debitos", format_money(settlement.get("expenses"))),
            ("Comision inmobiliaria", format_money(settlement.get("commission"))),
            ("IVA", format_money(settlement.get("iva"))),
            ("IRPF", format_money(settlement.get("irpf"))),
            ("Comision bancaria", format_money(settlement.get("bank_transfer_fee"))),
            ("Total final a transferir", format_money(settlement.get("total_to_transfer"))),
            ("Retirado registrado", format_money(settlement.get("paid_amount"))),
            ("Saldo posterior", f"{format_money(settlement.get('balance_after_payment'))} · {str(settlement.get('balance_status') or '').replace('_', ' ')}"),
        ],
    )
    rows: List[Sequence[str]] = []
    for line in settlement.get("lines", []):
        debit_amount = float(line.get("expense_amount") or 0) + float(line.get("commission") or 0) + float(line.get("iva") or 0) + float(line.get("irpf") or 0)
        credit_amount = float(line.get("owner_amount") or 0)
        rows.append(
            (
                str(line.get("payment_date") or ""),
                f"Fin {line.get('property_reference') or 's/n'} - {line.get('property_address') or ''}"[:42],
                f"{line.get('concept') or ''} · {line.get('tenant_name') or ''} · {line.get('accrual_period') or line.get('period') or ''}",
                format_money(debit_amount) if debit_amount else "",
                format_money(credit_amount) if credit_amount else "",
            )
        )
    if float(settlement.get("bank_transfer_fee") or 0) > 0:
        rows.append(("", "Transferencia bancaria", "Comision bancaria", format_money(settlement.get("bank_transfer_fee")), ""))
    _draw_ledger_table(document, page, y_position, "Detalle Debe / Haber", rows or [("", "Sin lineas", "", "", format_money(0))])
    return _finish_pdf(document)


def cash_withdrawal_pdf(
    *,
    movement_id: int,
    movement_date: str,
    concept: str,
    person_name: str,
    property_reference: str,
    amount: float,
    origin: str,
    notes: str,
    extra_rows: Sequence[Tuple[str, str]] = (),
) -> bytes:
    document = fitz.open()
    page = document.new_page(width=842, height=595)
    page.draw_line((421, 18), (421, 570), color=INK, width=0.7)
    balance_label = ""
    balance_value = ""
    for label, value in extra_rows:
        if "saldo" in label.lower():
            balance_label = "La cuenta queda con un saldo de:"
            lower_value = str(value).lower()
            if "deudor" in lower_value:
                balance_label = "La cuenta queda con un saldo deudor de:"
            elif "favor" in lower_value or "acreedor" in lower_value:
                balance_label = "La cuenta queda con un saldo a favor de:"
            balance_value = str(value).split("·")[0].strip()
            break
    if not balance_value:
        balance_label = "La cuenta queda con un saldo de:"
        balance_value = format_money(0)
    words = amount_to_words_es(amount)
    date_text = format_date_long_es(movement_date)
    account = person_name.split(" - ")[0].replace("Prop", "").strip() if person_name else ""
    clean_name = person_name.split(" - ", 1)[1] if " - " in person_name else person_name

    def draw_copy(x: float) -> None:
        copy_width = 392
        _draw_tower_header(page, x, 16, copy_width, amount=amount)
        page.draw_line((x, 144), (x + copy_width, 144), color=INK, width=0.8)
        _draw_watermark(page, x + 10, 162, copy_width - 20, 250)
        page.insert_text((x + 88, 184), f"Montevideo, {date_text}", fontsize=10, fontname="cour", color=INK)
        page.insert_text((x, 248), f"CUENTA: {account or '-'}", fontsize=10, fontname="cour", color=INK)
        page.insert_text((x, 270), "NOMBRE:", fontsize=10, fontname="cour", color=INK)
        _text_box(page, fitz.Rect(x + 66, 257, x + copy_width - 10, 278), clean_name or "Sin propietario", size=9.5, fontname="cour", align=fitz.TEXT_ALIGN_LEFT)
        page.insert_text((x, 326), "Recibimos de SALGUEIRO INMOBILIARIA la cantidad", fontsize=11, fontname="helv", color=INK)
        page.insert_text((x, 346), "de:", fontsize=11, fontname="helv", color=INK)
        page.insert_text((x, 374), "PESOS URUGUAYOS", fontsize=9, fontname="cour", color=INK)
        word_lines = wrap(words, width=30) or [words]
        for index, line in enumerate(word_lines[:2]):
            page.insert_text((x + 155, 374 + index * 14), line, fontsize=9, fontname="cour", color=INK)
        reason = "por alquileres acreditados en mi (nuestra) cuenta."
        if "owner_charge" in origin or "gasto" in concept.lower():
            reason = "por concepto de egresos acreditados en mi (nuestra) cuenta."
        page.insert_text((x, 430), reason, fontsize=11, fontname="helv", color=INK)
        page.draw_line((x + 130, 500), (x + 340, 500), color=INK, width=0.8)
        _text_box(page, fitz.Rect(x + 154, 510, x + 316, 530), "FIRMA", size=10, fontname="cour", align=fitz.TEXT_ALIGN_CENTER)
        page.insert_text((x + 6, 548), balance_label, fontsize=9, fontname="helv", color=INK)
        page.draw_rect(fitz.Rect(x + 246, 534, x + 374, 564), color=INK, width=0.7)
        _text_box(page, fitz.Rect(x + 252, 542, x + 368, 560), normalize_amount_tower(balance_value), size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)

    draw_copy(18)
    draw_copy(432)
    return _finish_pdf(document, page_numbers=False)


def tenant_debtors_report_pdf(*, rows: Sequence[dict], generated_at: str) -> bytes:
    document = fitz.open()
    page, y_position = _new_page(document)
    page.insert_text((42, y_position), "Inquilinos Deudores", fontsize=20, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 28
    page.insert_text((42, y_position), f"Generado: {generated_at}", fontsize=9, fontname="helv", color=(0.38, 0.44, 0.51))
    y_position += 24
    current_tenant = ""
    total = 0.0
    for row in rows:
        tenant = str(row.get("tenant_name") or "Sin inquilino")
        if tenant != current_tenant:
            page, y_position = _ensure_space(document, page, y_position, 34)
            current_tenant = tenant
            page.insert_text((42, y_position), tenant, fontsize=12, fontname="helv", color=(0.05, 0.13, 0.22))
            y_position += 18
        amount = float(row.get("remaining_amount") or 0)
        total += amount
        page, y_position = _ensure_space(document, page, y_position, 22)
        page.insert_text((52, y_position), str(row.get("property_address") or "")[:26], fontsize=8, fontname="helv")
        page.insert_text((190, y_position), str(row.get("property_reference") or "")[:12], fontsize=8, fontname="helv")
        page.insert_text((260, y_position), f"#{row.get('id')} {row.get('concept')} {row.get('period')}", fontsize=8, fontname="helv")
        page.insert_text((470, y_position), format_money(amount), fontsize=8, fontname="helv")
        y_position += 14
    page, y_position = _ensure_space(document, page, y_position, 30)
    page.draw_line((42, y_position), (553, y_position), color=(0.75, 0.82, 0.86), width=0.6)
    y_position += 18
    page.insert_text((390, y_position), "Total pendiente", fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    page.insert_text((470, y_position), format_money(total), fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    return _finish_pdf(document)


def commission_iva_report_pdf(*, rows: Sequence[dict], period: str, generated_at: str) -> bytes:
    document = fitz.open()
    page = document.new_page(width=595, height=842)

    try:
        generated_dt = datetime.fromisoformat(generated_at)
    except ValueError:
        generated_dt = datetime.now()

    def period_label() -> str:
        if not period:
            return "Todos"
        try:
            year_text, month_text = period.split("-", 1)
            year = int(year_text)
            month = int(month_text)
            end_day = generated_dt.day if generated_dt.year == year and generated_dt.month == month else monthrange(year, month)[1]
            return f"01/{month:02d}/{year} - {end_day:02d}/{month:02d}/{year}"
        except (ValueError, IndexError):
            return period

    def draw_header(target: fitz.Page, page_number: int) -> float:
        target.insert_text((35, 38), "abaco", fontsize=18, fontname="hebo", color=ABACO_BLUE)
        target.insert_text((205, 34), "INMOBILIARIA SALGUEIRO", fontsize=13, fontname="hebo", color=INK)
        target.insert_text((182, 64), "Comisión e I.V.A. generados", fontsize=18, fontname="helv", color=INK)
        target.insert_text((462, 32), f"Emisión:  {generated_dt.strftime('%d/%m/%y')}", fontsize=9, fontname="helv", color=INK)
        target.insert_text((462, 49), f"Hora:     {generated_dt.strftime('%H:%M:%S')}", fontsize=9, fontname="helv", color=INK)
        target.insert_text((462, 66), f"Página:   {page_number}", fontsize=9, fontname="helv", color=INK)
        target.insert_text((34, 122), "Moneda:", fontsize=9, fontname="helv", color=INK)
        target.insert_text((84, 122), "PESOS URUGUAYOS", fontsize=9, fontname="cour", color=INK)
        target.insert_text((385, 122), f"Período:  {period_label()}", fontsize=9, fontname="helv", color=INK)
        top = 144
        target.draw_rect(fitz.Rect(32, top, 563, top + 40), color=INK, width=0.8)
        headers = [
            ("Fecha", 90, 128),
            ("Comisión", 165, 218),
            ("Imp. Com.", 270, 330),
            ("I.V.A.", 395, 445),
            ("Total", 492, 540),
        ]
        for label, x0, x1 in headers:
            _text_box(target, fitz.Rect(x0, top + 13, x1, top + 31), label, size=10, fontname="helv", align=fitz.TEXT_ALIGN_CENTER)
        return top + 62

    page_number = 1
    y_position = draw_header(page, page_number)
    total_commission = 0.0
    total_iva = 0.0
    for row in rows:
        commission = float(row.get("commission") or 0)
        iva = float(row.get("iva") or 0)
        total_commission += commission
        total_iva += iva
        if y_position > 776:
            page_number += 1
            page = document.new_page(width=595, height=842)
            y_position = draw_header(page, page_number)
        date_text = format_date_uy(str(row.get("payment_date") or row.get("period") or ""))[:10]
        page.insert_text((85, y_position), date_text, fontsize=9, fontname="cour", color=INK)
        _text_box(page, fitz.Rect(150, y_position - 11, 226, y_position + 5), format_amount_tower(commission), size=9, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
        _text_box(page, fitz.Rect(260, y_position - 11, 336, y_position + 5), "0.00", size=9, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
        _text_box(page, fitz.Rect(377, y_position - 11, 452, y_position + 5), format_amount_tower(iva), size=9, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
        _text_box(page, fitz.Rect(472, y_position - 11, 548, y_position + 5), format_amount_tower(commission + iva), size=9, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
        y_position += 18
    if y_position > 760:
        page_number += 1
        page = document.new_page(width=595, height=842)
        y_position = draw_header(page, page_number)
    page.draw_line((140, y_position + 4), (552, y_position + 4), color=INK, width=0.6)
    y_position += 24
    page.insert_text((105, y_position), "Totales", fontsize=10, fontname="helv", color=INK)
    _text_box(page, fitz.Rect(150, y_position - 12, 226, y_position + 5), format_amount_tower(total_commission), size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
    _text_box(page, fitz.Rect(260, y_position - 12, 336, y_position + 5), "0.00", size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
    _text_box(page, fitz.Rect(377, y_position - 12, 452, y_position + 5), format_amount_tower(total_iva), size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
    _text_box(page, fitz.Rect(472, y_position - 12, 548, y_position + 5), format_amount_tower(total_commission + total_iva), size=10, fontname="cour", align=fitz.TEXT_ALIGN_RIGHT)
    return _finish_pdf(document, page_numbers=False)
