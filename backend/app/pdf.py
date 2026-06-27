from __future__ import annotations

from datetime import datetime
from io import BytesIO
from textwrap import wrap
from typing import Iterable, List, Sequence, Tuple

import fitz


Line = Tuple[str, str]


def format_money(value: object) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    formatted = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {formatted}"


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


def _finish_pdf(document: fitz.Document) -> bytes:
    for page_index, page in enumerate(document, start=1):
        page.insert_text((500, 820), f"Pag. {page_index}", fontsize=8, fontname="helv", color=(0.38, 0.44, 0.51))
    stream = BytesIO(document.tobytes(deflate=True))
    document.close()
    return stream.getvalue()


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
) -> bytes:
    document = fitz.open()
    page, y_position = _new_page(document)
    page.insert_text((42, y_position), "Recibo de alquiler / pago", fontsize=20, fontname="helv", color=(0.05, 0.13, 0.22))
    page.insert_text((420, y_position), "RUT 216957820014", fontsize=9, fontname="helv", color=(0.38, 0.44, 0.51))
    y_position += 34
    page, y_position = _draw_section(
        document,
        page,
        y_position,
        "Datos del pago",
        [
            ("Recibo", str(receipt_number)),
            ("Inquilino / pagador", payer_name),
            ("Fecha", payment_date),
            ("Metodo", method),
            ("Referencia", reference or "Sin referencia"),
            ("Monto recibido", format_money(amount)),
            ("Saldo a favor", format_money(unallocated_amount)),
            ("Notas", notes or "Sin notas"),
        ],
    )
    rows = [(label, "Imputacion a deuda", value) for label, value in allocations]
    if not rows:
        rows = [("Pago sin imputar", "Queda como saldo a favor", format_money(unallocated_amount or amount))]
    _draw_table(document, page, y_position, "Detalle imputado", rows)
    return _finish_pdf(document)


def settlement_liquidation_pdf(
    *,
    settlement: dict,
    owner: dict,
) -> bytes:
    document = fitz.open()
    page, y_position = _new_page(document)
    page.insert_text((42, y_position), "Liquidacion mensual al propietario", fontsize=20, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 34
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
) -> bytes:
    document = fitz.open()
    page, y_position = _new_page(document)
    page.insert_text((42, y_position), "Comprobante de retiro / salida", fontsize=20, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 34
    _draw_section(
        document,
        page,
        y_position,
        "Datos del retiro",
        [
            ("Comprobante", str(movement_id)),
            ("Fecha", movement_date),
            ("Persona", person_name or "Sin persona"),
            ("Finca", property_reference or "Sin finca"),
            ("Concepto", concept),
            ("Importe", format_money(amount)),
            ("Origen", origin),
            ("Notas", notes or "Sin notas"),
            ("Emitido", datetime.utcnow().strftime("%Y-%m-%d %H:%M")),
        ],
    )
    return _finish_pdf(document)


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
    page, y_position = _new_page(document)
    page.insert_text((42, y_position), "Comision e I.V.A. generados", fontsize=20, fontname="helv", color=(0.05, 0.13, 0.22))
    y_position += 28
    page.insert_text((42, y_position), f"Periodo: {period or 'todos'} · Generado: {generated_at}", fontsize=9, fontname="helv", color=(0.38, 0.44, 0.51))
    y_position += 24
    total_commission = 0.0
    total_iva = 0.0
    for row in rows:
        commission = float(row.get("commission") or 0)
        iva = float(row.get("iva") or 0)
        total_commission += commission
        total_iva += iva
        page, y_position = _ensure_space(document, page, y_position, 22)
        page.insert_text((52, y_position), str(row.get("payment_date") or row.get("period") or "")[:12], fontsize=8, fontname="helv")
        page.insert_text((130, y_position), str(row.get("owner_name") or "")[:26], fontsize=8, fontname="helv")
        page.insert_text((285, y_position), format_money(commission), fontsize=8, fontname="helv")
        page.insert_text((385, y_position), format_money(iva), fontsize=8, fontname="helv")
        page.insert_text((485, y_position), format_money(commission + iva), fontsize=8, fontname="helv")
        y_position += 14
    page, y_position = _ensure_space(document, page, y_position, 30)
    page.draw_line((42, y_position), (553, y_position), color=(0.75, 0.82, 0.86), width=0.6)
    y_position += 18
    page.insert_text((260, y_position), "Totales", fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    page.insert_text((285, y_position), format_money(total_commission), fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    page.insert_text((385, y_position), format_money(total_iva), fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    page.insert_text((485, y_position), format_money(total_commission + total_iva), fontsize=10, fontname="helv", color=(0.05, 0.13, 0.22))
    return _finish_pdf(document)
