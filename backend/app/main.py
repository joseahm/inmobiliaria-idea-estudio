from __future__ import annotations

import csv
import email
from email.header import decode_header, make_header
from email.utils import parseaddr
import io
import imaplib
import os
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from .config import get_settings
from .database import create_db_and_tables, engine, get_session
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
    OwnerCharge,
    Payment,
    PaymentAllocation,
    Person,
    Property,
    PropertyOwnerShare,
    PropertyServiceAccount,
    PropertyVisit,
    PublicPaymentLink,
    Reminder,
    RetentionVoucher,
    TenantCredit,
)
from .schemas import (
    AdvanceRentPaymentCreate,
    AllocationRequest,
    BulkMonthlyRequest,
    ChargeCreate,
    ChargeUpdate,
    CashMovementCreate,
    ContractCreate,
    ContractReajustmentApplyRequest,
    ContractReajustmentPreviewRequest,
    EmailInboxConfigCreate,
    EmailInboxConfigUpdate,
    EmailProviderRuleCreate,
    InvoiceDocumentCreate,
    InvoiceDocumentUpdate,
    LoginRequest,
    OwnerChargeCreate,
    PaymentCreate,
    PaymentIntentCreate,
    PaymentReallocationRequest,
    PersonCreate,
    PropertyAccountUpdate,
    PropertyCreate,
    PropertyServiceAccountCreate,
    PropertyVisitCreate,
    PublicLinkCreate,
    RetentionVoucherCreate,
    RetentionVoucherUpdate,
    ReminderPreviewRequest,
    SettlementGenerateRequest,
    SettlementPayRequest,
    VoidRequest,
)
from .security import create_access_token, verify_demo_credentials
from .seed import seed_demo_data
from .reajustment import CAJA_NOTARIAL_REAJUSTMENT_URL, indice_reajuste_alquileres_factor
from .pdf import (
    cash_withdrawal_pdf,
    commission_iva_report_pdf,
    format_money as pdf_money,
    payment_receipt_pdf,
    settlement_liquidation_pdf,
    tenant_debtors_report_pdf,
)
from .services import (
    attachment_to_dict,
    audit_log,
    audit_log_to_dict,
    analyze_invoice_text,
    apply_manual_proration_to_charge_data,
    apply_allocations,
    build_reminder_message,
    cash_movement_to_dict,
    charge_to_dict,
    contract_primary_tenant_id,
    contract_billing_end_date,
    contract_to_dict,
    create_cash_movement_for_owner_charge,
    create_cash_movement_for_owner_settlement,
    create_cash_movement_for_payment,
    create_advance_rent_payment,
    create_charge_from_invoice,
    create_first_rent_charge,
    create_owner_charge_for_tenant_charge,
    create_owner_charge_from_invoice,
    email_import_run_to_dict,
    email_inbox_to_dict,
    email_rule_to_dict,
    extract_text_from_invoice_upload,
    find_service_account_match,
    generate_monthly_charges,
    generate_owner_settlements,
    compare_institutional_reconciliation,
    decode_institutional_file,
    institutional_reconciliation_rows,
    parse_institutional_liquidation_rows,
    money,
    invoice_document_to_dict,
    owner_charge_to_dict,
    paid_amount_for_charge,
    person_debt_summary,
    property_service_to_dict,
    property_visit_to_dict,
    public_link_charge_ids,
    refresh_all_charge_statuses,
    refresh_charge_status,
    remaining_for_charge,
    retention_voucher_to_dict,
    owner_settlement_cash_movements,
    reverse_cash_movement,
    settlement_to_dict,
    sync_proration_difference_owner_charge,
    tenant_credit_to_dict,
    unallocated_amount_for_payment,
    void_owner_charge,
    void_payment,
    duplicate_charge_candidates,
    duplicate_owner_charge_candidates,
)


settings = get_settings()

CONTRACT_RUNTIME_FIELDS = {
    "tenant_ids",
    "create_first_rent_charge",
    "first_rent_amount",
    "first_rent_period",
    "first_rent_due_date",
}
app = FastAPI(title="Sistema Inmobiliaria Salgueiro", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    if settings.seed_demo_data_on_startup:
        with Session(engine) as session:
            seed_demo_data(session)


def not_found(message: str) -> HTTPException:
    return HTTPException(status_code=404, detail=message)


def ensure_not_referenced(has_reference: bool, message: str) -> None:
    if has_reference:
        raise HTTPException(status_code=400, detail=message)


def normalize_property_owner_shares(
    session: Session,
    payload: PropertyCreate,
) -> List[Dict[str, Any]]:
    owner_shares = payload.owner_shares or []
    if not owner_shares and payload.owner_id:
        owner_shares = [
            {
                "owner_id": payload.owner_id,
                "percentage": payload.owner_percentage,
                "is_primary": True,
                "irpf_applies": True,
            }
        ]
    normalized: List[Dict[str, Any]] = []
    seen_owner_ids: set[int] = set()
    for index, share in enumerate(owner_shares):
        owner_id = share.owner_id if hasattr(share, "owner_id") else share["owner_id"]
        percentage = share.percentage if hasattr(share, "percentage") else share["percentage"]
        is_primary = share.is_primary if hasattr(share, "is_primary") else share.get("is_primary", False)
        irpf_applies = share.irpf_applies if hasattr(share, "irpf_applies") else share.get("irpf_applies", True)
        if owner_id in seen_owner_ids:
            raise HTTPException(status_code=400, detail="No se puede repetir el mismo propietario en una finca.")
        owner = session.get(Person, owner_id)
        if not owner or owner.person_type == "tenant":
            raise HTTPException(status_code=400, detail="Seleccioná propietarios válidos para la finca.")
        if percentage <= 0 or percentage > 100:
            raise HTTPException(status_code=400, detail="Cada propietario debe tener un porcentaje mayor a 0 y menor o igual a 100.")
        seen_owner_ids.add(owner_id)
        normalized.append(
            {
                "owner_id": owner_id,
                "percentage": percentage,
                "is_primary": is_primary or index == 0,
                "irpf_applies": irpf_applies,
            }
        )
    total_percentage = sum(share["percentage"] for share in normalized)
    if normalized and abs(total_percentage - 100) > 0.01:
        raise HTTPException(status_code=400, detail="Los porcentajes de propietarios deben sumar 100%.")
    return normalized


def ensure_charges_can_notify(session: Session, charge_ids: List[int]) -> None:
    for charge_id in charge_ids:
        charge = session.get(Charge, charge_id)
        if not charge:
            raise not_found("Deuda no encontrada")
        contract = session.get(Contract, charge.contract_id)
        property_obj = session.get(Property, contract.property_id) if contract else None
        if not contract or not contract.active:
            raise HTTPException(status_code=400, detail="No se puede avisar una deuda sin contrato activo.")
        if property_obj and property_obj.occupancy_status != "alquilada":
            raise HTTPException(status_code=400, detail="No se puede avisar una deuda de una finca no alquilada.")


def in_optional_date_range(value: date, from_date: Optional[date], to_date: Optional[date]) -> bool:
    if from_date and value < from_date:
        return False
    if to_date and value > to_date:
        return False
    return True


def normalized_concept(value: str) -> str:
    return (value or "").strip().lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")


def property_owner_shares_or_primary(session: Session, property_id: int, owner_id: Optional[int] = None) -> List[PropertyOwnerShare]:
    shares = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == property_id)
    ).all()
    if owner_id:
        shares = [share for share in shares if share.owner_id == owner_id]
    return shares


def payment_allocation_report_rows(
    session: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    tenant_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    only_rent: bool = False,
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    settings = get_settings()
    payments = session.exec(select(Payment)).all()
    for payment in payments:
        if payment.status != "confirmado" or not in_optional_date_range(payment.payment_date, from_date, to_date):
            continue
        if tenant_id and payment.person_id != tenant_id:
            continue
        payer = session.get(Person, payment.person_id)
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
            if tenant_id and charge.responsible_person_id != tenant_id:
                continue
            is_rent = normalized_concept(charge.concept) == "alquiler"
            if only_rent and not is_rent:
                continue
            contract = session.get(Contract, charge.contract_id)
            if not contract:
                continue
            if not contract.active:
                continue
            property_obj = session.get(Property, contract.property_id)
            shares = property_owner_shares_or_primary(session, contract.property_id, owner_id)
            if owner_id and not shares:
                continue
            commission_applies = contract.commission_on_rent if is_rent else contract.commission_on_other_charges
            commission_total = allocation.amount * (contract.commission_percent / 100) if commission_applies else 0
            iva_total = commission_total * (settings.iva_percent / 100) if contract.commission_iva_applies else 0
            irpf_total = 0.0
            owner_names: List[str] = []
            owner_documents: List[str] = []
            share_rows: List[Dict[str, object]] = []
            for share in shares:
                owner = session.get(Person, share.owner_id)
                owner_amount = allocation.amount * (share.percentage / 100)
                owner_commission = commission_total * (share.percentage / 100)
                owner_iva = iva_total * (share.percentage / 100)
                should_apply_irpf = (
                    contract.irpf_applies
                    and share.irpf_applies
                    and contract.payment_origin == "normal"
                )
                owner_irpf = owner_amount * (contract.irpf_percent / 100) if should_apply_irpf else 0
                irpf_total += owner_irpf
                owner_names.append(owner.full_name if owner else "")
                owner_documents.append(owner.document if owner else "")
                share_rows.append(
                    {
                        "owner_id": share.owner_id,
                        "owner_name": owner.full_name if owner else "",
                        "owner_document": owner.document if owner else "",
                        "owner_legacy_code": owner.legacy_code if owner else "",
                        "owner_percentage": money(share.percentage),
                        "owner_amount": money(owner_amount),
                        "commission": money(owner_commission),
                        "iva": money(owner_iva),
                        "irpf": money(owner_irpf),
                    }
                )
            rows.append(
                {
                    "payment_id": payment.id,
                    "payment_date": payment.payment_date.isoformat(),
                    "tenant_id": charge.responsible_person_id,
                    "tenant_name": payer.full_name if payer else "",
                    "tenant_legacy_code": payer.legacy_code if payer else "",
                    "property_id": contract.property_id,
                    "property_reference": property_obj.reference if property_obj else "",
                    "property_address": property_obj.address if property_obj else "",
                    "property_padron": property_obj.padron if property_obj else "",
                    "contract_id": contract.id,
                    "contract_code": contract.legacy_code,
                    "charge_id": charge.id,
                    "concept": charge.concept,
                    "description": charge.description,
                    "period": charge.period or charge.accrual_period,
                    "accrual_period": charge.accrual_period or charge.period,
                    "amount": money(allocation.amount),
                    "commission": money(commission_total),
                    "iva": money(iva_total),
                    "irpf": money(irpf_total),
                    "total_billed": money(commission_total + iva_total),
                    "method": payment.method,
                    "reference": payment.reference,
                    "owner_names": [name for name in owner_names if name],
                    "owner_documents": [document for document in owner_documents if document],
                    "owners": share_rows,
                }
            )
    return sorted(rows, key=lambda row: (str(row["payment_date"]), str(row["tenant_name"]), str(row["concept"])))


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


def safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", filename or "archivo")
    return cleaned[:120] or "archivo"


def pdf_response(filename: str, content: bytes) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={safe_filename(filename)}"},
    )


def parse_visit_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Fecha y hora de visita inválida") from exc


def apply_guarantee_defaults(data: Dict[str, Any]) -> Dict[str, Any]:
    guarantee_type = str(data.get("guarantee_type") or "").lower()
    tenant_tax_role = str(data.get("tenant_tax_role") or "").lower()
    if guarantee_type == "anda":
        data["guarantee_percent"] = 2.0
        data["payment_origin"] = "ANDA"
    elif guarantee_type in {"contaduria", "contaduría"}:
        data["guarantee_percent"] = 3.0
        data["payment_origin"] = "Contaduria"
    if tenant_tax_role == "cede":
        data["payment_origin"] = "CEDE"
        data["resguardo_required"] = True
    return data


def apply_rent_regime_defaults(data: Dict[str, Any]) -> Dict[str, Any]:
    rent_regime = str(data.get("rent_regime") or "").lower()
    if rent_regime == "regimen_legal":
        data["reajustment_index"] = "indice_reajuste_alquileres"
    elif rent_regime == "libre_contratacion" and str(data.get("reajustment_index") or "") == "indice_reajuste_alquileres":
        data["reajustment_index"] = "libre"
    return data


def maybe_create_first_rent_charge(
    session: Session,
    contract: Contract,
    payload: ContractCreate,
) -> None:
    if not payload.create_first_rent_charge:
        return
    period = str(payload.first_rent_period or "").strip()
    if not period:
        raise HTTPException(status_code=400, detail="Indicá el mes/año del primer alquiler.")
    try:
        create_first_rent_charge(
            session,
            contract,
            float(payload.first_rent_amount or 0),
            period,
            payload.first_rent_due_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def is_non_brou_bank(bank_name: str) -> bool:
    normalized = str(bank_name or "").lower()
    return bool(normalized.strip()) and "brou" not in normalized and "republica" not in normalized and "república" not in normalized


def apply_person_bank_defaults(payload: PersonCreate, data: Dict[str, Any]) -> Dict[str, Any]:
    if data.get("person_type") not in {"owner", "both"}:
        data["bank_transfer_commission_applies"] = False
        return data
    if data.get("bank_transfer_commission_amount", 0) < 0:
        data["bank_transfer_commission_amount"] = 0
    if (
        "bank_transfer_commission_applies" not in payload.model_fields_set
        and is_non_brou_bank(str(data.get("bank_name") or ""))
    ):
        data["bank_transfer_commission_applies"] = True
    return data


def upsert_contract_tenants(
    session: Session,
    contract_id: int,
    primary_tenant_id: int,
    tenant_ids: List[int],
) -> None:
    normalized = [int(item) for item in tenant_ids if int(item) > 0]
    if primary_tenant_id not in normalized:
        normalized.insert(0, int(primary_tenant_id))
    seen = set()
    unique_ids: List[int] = []
    for item in normalized:
        if item in seen:
            continue
        seen.add(item)
        unique_ids.append(item)

    existing = session.exec(
        select(ContractTenant).where(ContractTenant.contract_id == contract_id)
    ).all()
    for link in existing:
        session.delete(link)
    session.commit()

    for person_id in unique_ids:
        person = session.get(Person, person_id)
        if not person:
            raise HTTPException(status_code=400, detail=f"Titular {person_id} no existe")
        if person.person_type == "owner":
            raise HTTPException(status_code=400, detail="Un titular de contrato no puede ser solo propietario")
        session.add(
            ContractTenant(
                contract_id=contract_id,
                person_id=person_id,
                is_primary=person_id == int(primary_tenant_id),
            )
        )
    session.commit()


def find_duplicate_invoice(
    session: Session,
    provider: str,
    account_number: str,
    amount: float,
    due_date: date,
) -> Optional[InvoiceDocument]:
    invoices = session.exec(
        select(InvoiceDocument).where(
            InvoiceDocument.provider == provider,
            InvoiceDocument.due_date == due_date,
            InvoiceDocument.status != "anulada",
        )
    ).all()
    for invoice in invoices:
        same_amount = abs(float(invoice.amount or 0) - float(amount or 0)) < 0.01
        same_account = bool(account_number and invoice.account_number and invoice.account_number == account_number)
        weak_same = not account_number and not invoice.account_number
        if same_amount and (same_account or weak_same):
            return invoice
    return None


def normalize_phone(value: str) -> str:
    return re.sub(r"[^\d]", "", value or "")


def add_years_safe(value: date, years: int = 1) -> date:
    target_year = int(value.year) + int(years)
    for day in range(int(value.day), 0, -1):
        try:
            return date(target_year, int(value.month), day)
        except ValueError:
            continue
    return date(target_year, int(value.month), 1)


def reajustment_index_date(contract: Contract, at_date: date) -> date:
    if contract.rent_payment_timing != "vencido":
        return at_date
    if at_date.month == 1:
        return date(at_date.year - 1, 12, 1)
    return date(at_date.year, at_date.month - 1, 1)


def parse_analysis_date(value: object) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


def create_invoice_document_from_bytes(
    session: Session,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    source: str,
    notes: str = "Factura importada",
) -> Dict[str, object]:
    extracted = extract_text_from_invoice_upload(
        file_bytes=file_bytes,
        content_type=content_type,
        filename=filename,
    )
    analysis = analyze_invoice_text(
        session=session,
        text=str(extracted["text"]),
        filename=filename,
        content_type=content_type,
        warnings=list(extracted["warnings"]),
    )
    service = find_service_account_match(session, str(analysis.get("account") or ""), str(analysis.get("provider") or ""))
    property_id = service.property_id if service else analysis.get("matched_property_id")
    due_date = datetime.fromisoformat(str(analysis.get("due_date") or datetime.utcnow().date().isoformat())).date()
    provider = str(analysis.get("concept") or analysis.get("provider") or "OTROS")
    account_number = str(analysis.get("account") or analysis.get("matched_account") or "")
    amount = float(analysis.get("amount") or 0)
    period = str(analysis.get("period") or due_date.strftime("%Y-%m"))
    duplicate = find_duplicate_invoice(session, provider, account_number, amount, due_date)
    if duplicate:
        return {"invoice": duplicate, "analysis": analysis}
    invoice = InvoiceDocument(
        provider=provider,
        account_number=account_number,
        property_id=int(property_id) if property_id else None,
        service_account_id=service.id if service else None,
        responsible_type=service.payer if service else "tenant",
        amount=amount,
        issued_date=parse_analysis_date(analysis.get("issued_date")),
        due_date=due_date,
        period=period,
        consumption_period_start=parse_analysis_date(analysis.get("consumption_period_start")),
        consumption_period_end=parse_analysis_date(analysis.get("consumption_period_end")),
        reference_number=str(analysis.get("reference_number") or ""),
        meter_number=str(analysis.get("meter_number") or ""),
        consumption_amount=float(analysis.get("consumption_amount") or 0),
        consumption_unit=str(analysis.get("consumption_unit") or ""),
        status="pendiente",
        source=source,
        raw_text_preview=str(analysis.get("raw_text_preview") or "")[:1200],
        notes=notes,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    folder = os.path.join("uploads", "invoice", str(invoice.id))
    os.makedirs(folder, exist_ok=True)
    stored_filename = safe_filename(filename or "factura")
    storage_path = os.path.join(folder, f"{uuid4().hex}_{stored_filename}")
    with open(storage_path, "wb") as target:
        target.write(file_bytes)
    attachment = Attachment(
        entity_type="invoice",
        entity_id=invoice.id or 0,
        filename=stored_filename,
        content_type=content_type,
        storage_path=storage_path,
        notes=notes,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    invoice.attachment_id = attachment.id
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return {"invoice": invoice, "analysis": analysis}


def create_invoice_document_from_text(
    session: Session,
    text: str,
    filename: str,
    source: str,
    notes: str,
) -> Optional[InvoiceDocument]:
    analysis = analyze_invoice_text(
        session=session,
        text=text,
        filename=filename,
        content_type="text/plain",
        warnings=[],
    )
    if not analysis.get("amount") and not analysis.get("due_date"):
        return None
    service = find_service_account_match(session, str(analysis.get("account") or ""), str(analysis.get("provider") or ""))
    property_id = service.property_id if service else analysis.get("matched_property_id")
    due_date = datetime.fromisoformat(str(analysis.get("due_date") or datetime.utcnow().date().isoformat())).date()
    provider = str(analysis.get("concept") or analysis.get("provider") or "OTROS")
    account_number = str(analysis.get("account") or analysis.get("matched_account") or "")
    amount = float(analysis.get("amount") or 0)
    period = str(analysis.get("period") or due_date.strftime("%Y-%m"))
    duplicate = find_duplicate_invoice(session, provider, account_number, amount, due_date)
    if duplicate:
        return duplicate
    invoice = InvoiceDocument(
        provider=provider,
        account_number=account_number,
        property_id=int(property_id) if property_id else None,
        service_account_id=service.id if service else None,
        responsible_type=service.payer if service else "tenant",
        amount=amount,
        issued_date=parse_analysis_date(analysis.get("issued_date")),
        due_date=due_date,
        period=period,
        consumption_period_start=parse_analysis_date(analysis.get("consumption_period_start")),
        consumption_period_end=parse_analysis_date(analysis.get("consumption_period_end")),
        reference_number=str(analysis.get("reference_number") or ""),
        meter_number=str(analysis.get("meter_number") or ""),
        consumption_amount=float(analysis.get("consumption_amount") or 0),
        consumption_unit=str(analysis.get("consumption_unit") or ""),
        status="pendiente",
        source=source,
        raw_text_preview=str(analysis.get("raw_text_preview") or "")[:1200],
        notes=notes,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    audit_log(session, "invoice", invoice.id, "import_email_body", notes)
    return invoice


def secret_from_env_or_file(secret_name: str) -> Optional[str]:
    if not secret_name:
        return None
    value = os.environ.get(secret_name)
    if value:
        return value.replace("\xa0", " ").strip()
    env_path = os.path.join(os.getcwd(), ".env")
    if not os.path.exists(env_path):
        return None
    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, raw_value = line.split("=", 1)
            if key.strip() == secret_name:
                return raw_value.strip().strip('"').strip("'").replace("\xa0", " ").strip()
    return None


def primary_email_inbox(session: Session) -> Optional[EmailInboxConfig]:
    inboxes = session.exec(
        select(EmailInboxConfig).where(EmailInboxConfig.active == True)  # noqa: E712
    ).all()
    if not inboxes:
        return None
    configured_email = settings.invoices_email_address.strip().lower()
    configured_username = settings.invoices_email_username.strip().lower()
    for inbox in inboxes:
        if inbox.email_address.strip().lower() in {configured_email, configured_username}:
            return inbox
        if inbox.username.strip().lower() in {configured_email, configured_username}:
            return inbox
    return inboxes[0]


def ensure_secret_env_var_name(secret_env_var: str) -> None:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", secret_env_var or ""):
        raise HTTPException(
            status_code=400,
            detail=(
                "En Variable de clave va el nombre de la variable del .env "
                "(ej: FACTURAS_EMAIL_PASSWORD), no la contraseña real."
            ),
        )


@app.post("/auth/login")
def login(payload: LoginRequest) -> Dict[str, object]:
    if not verify_demo_credentials(payload.email, payload.password):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    return {
        "access_token": create_access_token(payload.email),
        "token_type": "bearer",
        "user": {"email": payload.email, "name": "Admin demo"},
    }


@app.get("/dashboard/summary")
def dashboard_summary(session: Session = Depends(get_session)) -> Dict[str, object]:
    charges = session.exec(select(Charge)).all()
    refresh_all_charge_statuses(session, charges)
    payments = session.exec(select(Payment)).all()
    cash_movements = session.exec(select(CashMovement)).all()
    contracts = session.exec(select(Contract).where(Contract.active == True)).all()  # noqa: E712
    pending_vouchers = session.exec(
        select(RetentionVoucher).where(RetentionVoucher.status == "pendiente")
    ).all()
    today = datetime.utcnow().date()
    month_prefix = f"{today.year}-{today.month:02d}-"

    pending_total = sum(remaining_for_charge(session, charge) for charge in charges if charge.status != "pagado")
    overdue_total = sum(remaining_for_charge(session, charge) for charge in charges if charge.status == "vencido")
    collected_month = sum(
        payment.amount
        for payment in payments
        if payment.payment_date.isoformat().startswith(month_prefix)
    )
    cash_in_month = sum(
        movement.amount
        for movement in cash_movements
        if movement.status == "confirmado"
        and movement.movement_type == "entrada"
        and movement.movement_date.isoformat().startswith(month_prefix)
    )
    cash_out_month = sum(
        movement.amount
        for movement in cash_movements
        if movement.status == "confirmado"
        and movement.movement_type == "salida"
        and movement.movement_date.isoformat().startswith(month_prefix)
    )
    due_soon = [
        charge_to_dict(session, charge)
        for charge in charges
        if charge.status in {"pendiente", "parcial"}
        and today <= charge.due_date <= today + timedelta(days=7)
    ][:6]
    overdue_charges = [
        charge_to_dict(session, charge)
        for charge in charges
        if charge.status in {"vencido", "parcial"}
        and remaining_for_charge(session, charge) > 0
    ][:8]
    reajustments_due_soon = [
        {
            **contract_to_dict(session, contract),
            "days_left": (contract.next_reajustment_date - today).days if contract.next_reajustment_date else None,
        }
        for contract in contracts
        if contract.next_reajustment_date
        and today <= contract.next_reajustment_date <= today + timedelta(days=30)
    ]
    reajustments_due_soon = sorted(
        reajustments_due_soon,
        key=lambda item: (item.get("next_reajustment_date") or "", item.get("id") or 0),
    )[:6]
    recent_payments = sorted(payments, key=lambda item: item.payment_date, reverse=True)[:6]

    return {
        "pending_total": money(pending_total),
        "overdue_total": money(overdue_total),
        "collected_month": money(collected_month),
        "open_charges": len([charge for charge in charges if charge.status != "pagado"]),
        "cash_in_month": money(cash_in_month),
        "cash_out_month": money(cash_out_month),
        "cash_balance_month": money(cash_in_month - cash_out_month),
        "due_soon": due_soon,
        "overdue_charges": overdue_charges,
        "reajustments_due_soon": reajustments_due_soon,
        "retention_vouchers_pending": [retention_voucher_to_dict(session, item) for item in pending_vouchers[:8]],
        "recent_payments": [
            {
                "id": payment.id,
                "person_name": session.get(Person, payment.person_id).full_name
                if session.get(Person, payment.person_id)
                else "",
                "payment_date": payment.payment_date.isoformat(),
                "amount": money(payment.amount),
                "method": payment.method,
                "reference": payment.reference,
            }
            for payment in recent_payments
        ],
    }


@app.get("/persons")
def list_persons(
    person_type: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    query = select(Person)
    people = session.exec(query).all()
    if person_type:
        people = [
            person
            for person in people
            if person.person_type == person_type or person.person_type == "both"
        ]
    return [person_debt_summary(session, person) for person in people]


@app.post("/persons")
def create_person(payload: PersonCreate, session: Session = Depends(get_session)) -> Dict[str, Any]:
    data = apply_person_bank_defaults(payload, payload.model_dump())
    person = Person(**data)
    session.add(person)
    session.commit()
    session.refresh(person)
    return person_debt_summary(session, person)


@app.patch("/persons/{person_id}")
def update_person(
    person_id: int, payload: PersonCreate, session: Session = Depends(get_session)
) -> Dict[str, Any]:
    person = session.get(Person, person_id)
    if not person:
        raise not_found("Persona no encontrada")
    data = apply_person_bank_defaults(payload, payload.model_dump())
    for key, value in data.items():
        setattr(person, key, value)
    session.add(person)
    session.commit()
    session.refresh(person)
    return person_debt_summary(session, person)


@app.get("/persons/{person_id}/detail")
def person_detail(person_id: int, session: Session = Depends(get_session)) -> Dict[str, object]:
    person = session.get(Person, person_id)
    if not person:
        raise not_found("Persona no encontrada")
    charges = session.exec(
        select(Charge).where(Charge.responsible_person_id == person_id)
    ).all()
    refresh_all_charge_statuses(session, charges)
    payments = session.exec(
        select(Payment).where(Payment.person_id == person_id)
    ).all()
    contracts = session.exec(
        select(Contract).where(Contract.tenant_id == person_id)
    ).all()
    reminders = session.exec(
        select(Reminder).where(Reminder.person_id == person_id)
    ).all()
    return {
        "person": person_debt_summary(session, person),
        "charges": [charge_to_dict(session, charge) for charge in charges],
        "payments": [
            {
                "id": payment.id,
                "payment_date": payment.payment_date.isoformat(),
                "amount": money(payment.amount),
                "method": payment.method,
                "reference": payment.reference,
                "notes": payment.notes,
            }
            for payment in payments
        ],
        "contracts": [contract_to_dict(session, contract) for contract in contracts],
        "reminders": [
            {
                "id": reminder.id,
                "channel": reminder.channel,
                "status": reminder.status,
                "message": reminder.message,
                "created_at": reminder.created_at.isoformat(),
                "sent_at": reminder.sent_at.isoformat() if reminder.sent_at else None,
            }
            for reminder in reminders
        ],
    }


@app.delete("/persons/{person_id}")
def delete_person(person_id: int, session: Session = Depends(get_session)) -> Dict[str, str]:
    person = session.get(Person, person_id)
    if not person:
        raise not_found("Persona no encontrada")
    ensure_not_referenced(
        bool(session.exec(select(Contract).where(Contract.tenant_id == person_id)).first())
        or bool(session.exec(select(PropertyOwnerShare).where(PropertyOwnerShare.owner_id == person_id)).first())
        or bool(session.exec(select(Charge).where(Charge.responsible_person_id == person_id)).first())
        or bool(session.exec(select(Payment).where(Payment.person_id == person_id)).first())
        or bool(session.exec(select(Reminder).where(Reminder.person_id == person_id)).first())
        or bool(session.exec(select(PublicPaymentLink).where(PublicPaymentLink.person_id == person_id)).first())
        or bool(session.exec(select(OwnerSettlement).where(OwnerSettlement.owner_id == person_id)).first()),
        "No se puede eliminar una persona con contratos, propiedades, deudas, pagos o historial asociado.",
    )
    session.delete(person)
    session.commit()
    return {"status": "deleted"}


@app.get("/properties")
def list_properties(session: Session = Depends(get_session)) -> List[Dict[str, object]]:
    properties = session.exec(select(Property)).all()
    result = []
    for property_obj in properties:
        shares = session.exec(
            select(PropertyOwnerShare).where(
                PropertyOwnerShare.property_id == property_obj.id
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
                        "is_primary": share.is_primary,
                        "irpf_applies": share.irpf_applies,
                    }
                )
        data = property_obj.model_dump()
        data["owners"] = owners
        services = session.exec(
            select(PropertyServiceAccount).where(PropertyServiceAccount.property_id == property_obj.id)
        ).all()
        data["services"] = [property_service_to_dict(service) for service in services]
        result.append(data)
    return result


@app.post("/properties")
def create_property(
    payload: PropertyCreate, session: Session = Depends(get_session)
) -> Dict[str, Any]:
    data = payload.model_dump(exclude={"owner_id", "owner_percentage", "owner_shares"})
    property_obj = Property(**data)
    session.add(property_obj)
    session.commit()
    session.refresh(property_obj)
    owner_shares = normalize_property_owner_shares(session, payload)
    for share in owner_shares:
        session.add(
            PropertyOwnerShare(
                property_id=property_obj.id or 0,
                owner_id=share["owner_id"],
                percentage=share["percentage"],
                is_primary=share["is_primary"],
                irpf_applies=share["irpf_applies"],
            )
        )
    session.commit()
    session.refresh(property_obj)
    return property_obj.model_dump()


@app.patch("/properties/{property_id}")
def update_property(
    property_id: int, payload: PropertyCreate, session: Session = Depends(get_session)
) -> Dict[str, Any]:
    property_obj = session.get(Property, property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    for key, value in payload.model_dump(exclude={"owner_id", "owner_percentage", "owner_shares"}).items():
        setattr(property_obj, key, value)
    session.add(property_obj)
    shares = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == property_id)
    ).all()
    for share in shares:
        session.delete(share)
    owner_shares = normalize_property_owner_shares(session, payload)
    for share in owner_shares:
        session.add(
            PropertyOwnerShare(
                property_id=property_id,
                owner_id=share["owner_id"],
                percentage=share["percentage"],
                is_primary=share["is_primary"],
                irpf_applies=share["irpf_applies"],
            )
        )
    session.commit()
    session.refresh(property_obj)
    return property_obj.model_dump()


@app.patch("/properties/{property_id}/account")
def update_property_account(
    property_id: int,
    payload: PropertyAccountUpdate,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    property_obj = session.get(Property, property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    provider = payload.provider.upper()
    field_by_provider = {
        "UTE": "ute_account",
        "OSE": "ose_account",
        "TRIBUTOS": "taxes_account",
        "SANEAMIENTO": "sanitation_account",
    }
    field = field_by_provider.get(provider, "notes")
    if field == "notes":
        property_obj.notes = f"{property_obj.notes}\nCuenta {provider}: {payload.account}".strip()
    else:
        setattr(property_obj, field, payload.account)
    session.add(property_obj)
    session.commit()
    session.refresh(property_obj)
    contract = session.exec(
        select(Contract).where(Contract.property_id == property_id, Contract.active == True)  # noqa: E712
    ).first()
    return {
        "property": property_obj.model_dump(),
        "matched_contract": contract_to_dict(session, contract) if contract else None,
    }


@app.get("/properties/{property_id}/detail")
def property_detail(property_id: int, session: Session = Depends(get_session)) -> Dict[str, object]:
    property_obj = session.get(Property, property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    services = session.exec(
        select(PropertyServiceAccount).where(PropertyServiceAccount.property_id == property_id)
    ).all()
    contracts = session.exec(select(Contract).where(Contract.property_id == property_id)).all()
    contract_ids = [contract.id for contract in contracts if contract.id]
    charges = session.exec(select(Charge)).all()
    charges = [charge for charge in charges if charge.contract_id in contract_ids]
    owner_charges = session.exec(
        select(OwnerCharge).where(OwnerCharge.property_id == property_id)
    ).all()
    cash_movements = session.exec(
        select(CashMovement).where(CashMovement.property_id == property_id)
    ).all()
    attachments = session.exec(
        select(Attachment).where(Attachment.entity_type == "property", Attachment.entity_id == property_id)
    ).all()
    base = next(item for item in list_properties(session=session) if item["id"] == property_id)
    return {
        "property": base,
        "services": [property_service_to_dict(service) for service in services],
        "contracts": [contract_to_dict(session, contract) for contract in contracts],
        "charges": [charge_to_dict(session, charge) for charge in charges],
        "owner_charges": [owner_charge_to_dict(session, item) for item in owner_charges],
        "cash_movements": [cash_movement_to_dict(session, item) for item in cash_movements],
        "attachments": [attachment_to_dict(item) for item in attachments],
    }


@app.post("/properties/{property_id}/services")
def create_property_service(
    property_id: int,
    payload: PropertyServiceAccountCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    property_obj = session.get(Property, property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    if payload.payer not in {"tenant", "owner", "agency"}:
        raise HTTPException(status_code=400, detail="Pagador invalido")
    service = PropertyServiceAccount(property_id=property_id, **payload.model_dump())
    session.add(service)
    session.commit()
    session.refresh(service)
    audit_log(session, "property_service", service.id, "create", f"Servicio {service.service_type} para finca {property_id}")
    return property_service_to_dict(service)


@app.patch("/properties/{property_id}/services/{service_id}")
def update_property_service(
    property_id: int,
    service_id: int,
    payload: PropertyServiceAccountCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    service = session.get(PropertyServiceAccount, service_id)
    if not service or service.property_id != property_id:
        raise not_found("Servicio no encontrado")
    for key, value in payload.model_dump().items():
        setattr(service, key, value)
    session.add(service)
    session.commit()
    session.refresh(service)
    audit_log(session, "property_service", service.id, "update", f"Servicio {service.service_type} actualizado")
    return property_service_to_dict(service)


@app.delete("/properties/{property_id}/services/{service_id}")
def delete_property_service(
    property_id: int,
    service_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    service = session.get(PropertyServiceAccount, service_id)
    if not service or service.property_id != property_id:
        raise not_found("Servicio no encontrado")
    session.delete(service)
    session.commit()
    audit_log(session, "property_service", service_id, "delete", f"Servicio {service_id} eliminado")
    return {"status": "deleted"}


@app.delete("/properties/{property_id}")
def delete_property(property_id: int, session: Session = Depends(get_session)) -> Dict[str, str]:
    property_obj = session.get(Property, property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    ensure_not_referenced(
        bool(session.exec(select(Contract).where(Contract.property_id == property_id)).first()),
        "No se puede eliminar una propiedad con contratos asociados.",
    )
    shares = session.exec(
        select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == property_id)
    ).all()
    for share in shares:
        session.delete(share)
    session.delete(property_obj)
    session.commit()
    return {"status": "deleted"}


@app.get("/property-visits")
def list_property_visits(
    status: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    query = select(PropertyVisit)
    if status:
        query = query.where(PropertyVisit.status == status)
    visits = session.exec(query).all()
    return [
        property_visit_to_dict(session, visit)
        for visit in sorted(visits, key=lambda item: item.visit_at)
    ]


@app.post("/property-visits")
def create_property_visit(
    payload: PropertyVisitCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    property_obj = session.get(Property, payload.property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    data = payload.model_dump()
    data["visit_at"] = parse_visit_datetime(data["visit_at"])
    if not data.get("contact_message"):
        data["contact_message"] = (
            f"Hola {data['interested_name']}, te escribo para confirmar la visita a "
            f"{property_obj.reference} el {data['visit_at'].strftime('%d/%m/%Y a las %H:%M')}."
        )
    visit = PropertyVisit(**data)
    session.add(visit)
    session.commit()
    session.refresh(visit)
    return property_visit_to_dict(session, visit)


@app.patch("/property-visits/{visit_id}")
def update_property_visit(
    visit_id: int, payload: PropertyVisitCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    visit = session.get(PropertyVisit, visit_id)
    if not visit:
        raise not_found("Visita no encontrada")
    property_obj = session.get(Property, payload.property_id)
    if not property_obj:
        raise not_found("Propiedad no encontrada")
    data = payload.model_dump()
    data["visit_at"] = parse_visit_datetime(data["visit_at"])
    for key, value in data.items():
        setattr(visit, key, value)
    session.add(visit)
    session.commit()
    session.refresh(visit)
    return property_visit_to_dict(session, visit)


@app.delete("/property-visits/{visit_id}")
def delete_property_visit(visit_id: int, session: Session = Depends(get_session)) -> Dict[str, str]:
    visit = session.get(PropertyVisit, visit_id)
    if not visit:
        raise not_found("Visita no encontrada")
    session.delete(visit)
    session.commit()
    return {"status": "deleted"}


@app.get("/contracts")
def list_contracts(session: Session = Depends(get_session)) -> List[Dict[str, object]]:
    contracts = session.exec(select(Contract)).all()
    return [contract_to_dict(session, contract) for contract in contracts]


@app.post("/contracts")
def create_contract(
    payload: ContractCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    if payload.active:
        existing_contracts = session.exec(
            select(Contract).where(
                Contract.property_id == payload.property_id,
                Contract.active == True,  # noqa: E712
            )
        ).all()
        for existing in existing_contracts:
            existing.active = False
            existing.end_date = payload.start_date - timedelta(days=1)
            existing.billing_end_date = payload.start_date - timedelta(days=1)
            session.add(existing)
    data = apply_rent_regime_defaults(apply_guarantee_defaults(payload.model_dump(exclude=CONTRACT_RUNTIME_FIELDS)))
    contract = Contract(**data)
    session.add(contract)
    session.commit()
    session.refresh(contract)
    upsert_contract_tenants(
        session,
        int(contract.id or 0),
        int(payload.tenant_id),
        [payload.tenant_id, *payload.tenant_ids],
    )
    maybe_create_first_rent_charge(session, contract, payload)
    return contract_to_dict(session, contract)


@app.patch("/contracts/{contract_id}")
def update_contract(
    contract_id: int, payload: ContractCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    contract = session.get(Contract, contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    if contract.active and not payload.active:
        pending_charges = [
            charge
            for charge in session.exec(select(Charge).where(Charge.contract_id == contract_id)).all()
            if remaining_for_charge(session, charge) > 0
        ]
        if pending_charges:
            details = ", ".join(
                f"#{charge.id} {charge.concept} {charge.period or charge.due_date.isoformat()} saldo {remaining_for_charge(session, charge)}"
                for charge in pending_charges[:4]
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    "No se puede marcar el contrato como vencido/inactivo porque tiene deudas pendientes. "
                    f"Regularizá o anulá primero: {details}."
                ),
            )
    if payload.active:
        existing_contracts = session.exec(
            select(Contract).where(
                Contract.property_id == payload.property_id,
                Contract.active == True,  # noqa: E712
                Contract.id != contract_id,
            )
        ).all()
        for existing in existing_contracts:
            existing.active = False
            existing.end_date = payload.start_date - timedelta(days=1)
            existing.billing_end_date = payload.start_date - timedelta(days=1)
            session.add(existing)
    for key, value in apply_rent_regime_defaults(apply_guarantee_defaults(payload.model_dump(exclude=CONTRACT_RUNTIME_FIELDS))).items():
        setattr(contract, key, value)
    session.add(contract)
    session.commit()
    session.refresh(contract)
    upsert_contract_tenants(
        session,
        int(contract.id or 0),
        int(payload.tenant_id),
        [payload.tenant_id, *payload.tenant_ids],
    )
    maybe_create_first_rent_charge(session, contract, payload)
    return contract_to_dict(session, contract)


@app.delete("/contracts/{contract_id}")
def delete_contract(contract_id: int, session: Session = Depends(get_session)) -> Dict[str, str]:
    contract = session.get(Contract, contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    ensure_not_referenced(
        bool(session.exec(select(Charge).where(Charge.contract_id == contract_id)).first()),
        "No se puede eliminar un contrato con deudas asociadas.",
    )
    session.delete(contract)
    session.commit()
    return {"status": "deleted"}


@app.post("/contracts/{contract_id}/reajustment/preview")
def preview_contract_reajustment(
    contract_id: int,
    payload: ContractReajustmentPreviewRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    contract = session.get(Contract, contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    if not contract.active:
        raise HTTPException(status_code=400, detail="No se puede reajustar un contrato vencido o inactivo.")
    at_date = payload.at_date or contract.next_reajustment_date or datetime.utcnow().date()
    index_date = reajustment_index_date(contract, at_date)
    factor: Optional[float] = payload.factor_override
    source_url = ""
    if factor is None and contract.reajustment_index == "indice_reajuste_alquileres":
        factor = indice_reajuste_alquileres_factor(index_date.year, index_date.month)
        source_url = CAJA_NOTARIAL_REAJUSTMENT_URL
    if factor is None:
        raise HTTPException(
            status_code=400,
            detail="No se pudo obtener el índice de reajuste. Ingrese un factor manual o revise el índice del contrato.",
        )

    contract_data = contract_to_dict(session, contract)
    tenants = list(contract_data.get("tenants") or [])
    primary_mobile = next((item.get("mobile") for item in tenants if str(item.get("mobile") or "").strip()), "")
    primary_email = next((item.get("email") for item in tenants if str(item.get("email") or "").strip()), "")
    tenant_names = ", ".join([str(item.get("full_name") or "").strip() for item in tenants if str(item.get("full_name") or "").strip()])
    if not tenant_names:
        tenant_names = contract_data.get("tenant_name") or ""

    old_rent = float(contract.rent_amount or 0)
    factor_value = float(factor)
    new_rent = money(old_rent * factor_value)
    percent = round((factor_value - 1.0) * 100.0, 2)

    message_lines = [
        f"Hola {tenant_names.split()[0] if tenant_names else ''},",
        f"Te informamos el reajuste de alquiler del contrato {contract.legacy_code or contract.id}.",
        f"Propiedad: {contract_data.get('property_reference')} · {contract_data.get('property_address')}",
        f"Fecha de reajuste: {at_date.isoformat()}",
        f"Índice: {contract.reajustment_index} ({index_date.month:02d}/{index_date.year})",
        f"Criterio de cobro: {contract.rent_payment_timing}",
        f"Factor: {factor_value:.4f} ({percent:+.2f}%)",
        f"Alquiler anterior: ${money(old_rent):,.2f}",
        f"Nuevo alquiler: ${new_rent:,.2f}",
        "Gracias, Inmobiliaria Salgueiro.",
    ]
    message = "\n".join(message_lines)

    phone = normalize_phone(str(primary_mobile))
    whatsapp_url = f"https://wa.me/{phone}?text={quote(message)}" if phone else ""
    mailto_url = (
        f"mailto:{primary_email}?subject={quote('Aviso de reajuste de alquiler')}&body={quote(message)}"
        if primary_email
        else ""
    )
    return {
        "contract": contract_data,
        "at_date": at_date.isoformat(),
        "index_period": f"{index_date.year}-{index_date.month:02d}",
        "index_month": index_date.month,
        "index_year": index_date.year,
        "rent_payment_timing": contract.rent_payment_timing,
        "factor": round(factor_value, 6),
        "percent": percent,
        "old_rent_amount": money(old_rent),
        "new_rent_amount": new_rent,
        "source_url": source_url,
        "message": message,
        "whatsapp_url": whatsapp_url,
        "mailto_url": mailto_url,
    }


@app.post("/contracts/{contract_id}/reajustment/apply")
def apply_contract_reajustment(
    contract_id: int,
    payload: ContractReajustmentApplyRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    contract = session.get(Contract, contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    preview = preview_contract_reajustment(
        contract_id=contract_id,
        payload=ContractReajustmentPreviewRequest(at_date=payload.at_date, factor_override=payload.factor_override),
        session=session,
    )
    contract.rent_amount = float(preview["new_rent_amount"])
    if payload.update_next_reajustment_date:
        contract.next_reajustment_date = add_years_safe(payload.at_date, 1)
    session.add(contract)
    session.commit()
    session.refresh(contract)
    audit_log(
        session,
        "contract",
        contract.id,
        "reajustment_apply",
        f"Reajuste {payload.at_date.isoformat()} factor {preview['factor']} -> {preview['new_rent_amount']}",
    )
    return {"contract": contract_to_dict(session, contract), "preview": preview}


@app.get("/charges")
def list_charges(
    status: Optional[str] = Query(default=None),
    person_id: Optional[int] = Query(default=None),
    search: str = "",
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    charges = session.exec(select(Charge)).all()
    refresh_all_charge_statuses(session, charges)
    rows = [charge_to_dict(session, charge) for charge in charges]
    if status and status != "todas":
        rows = [row for row in rows if row["status"] == status]
    if person_id:
        rows = [row for row in rows if row["responsible_person_id"] == person_id]
    if search:
        needle = search.lower()
        rows = [
            row
            for row in rows
            if needle in str(row["tenant_name"]).lower()
            or needle in str(row["property_address"]).lower()
            or needle in str(row["concept"]).lower()
        ]
    return sorted(rows, key=lambda row: str(row["due_date"]))


@app.post("/charges")
def create_charge(
    payload: ChargeCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    contract = session.get(Contract, payload.contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    owner_charge_options = {
        "create_owner_charge": payload.create_owner_charge,
        "owner_charge_concept": payload.owner_charge_concept,
        "owner_charge_paid_by_agency": payload.owner_charge_paid_by_agency,
        "owner_charge_split_by_ownership": payload.owner_charge_split_by_ownership,
    }
    duplicate_allowed = payload.allow_duplicate
    proration_options = {
        "apply_proration": payload.apply_proration,
        "proration_base_amount": payload.proration_base_amount,
        "create_owner_charge_for_proration_difference": payload.create_owner_charge_for_proration_difference,
        "proration_difference_paid_by_agency": payload.proration_difference_paid_by_agency,
    }
    data = payload.model_dump(exclude=set(owner_charge_options.keys()) | set(proration_options.keys()) | {"allow_duplicate"})
    if data["responsible_person_id"] is None:
        data["responsible_person_id"] = contract_primary_tenant_id(session, contract)
    if not data["accrual_period"]:
        data["accrual_period"] = data["period"]
    if not data["settlement_period"]:
        data["settlement_period"] = data["period"]
    apply_manual_proration_to_charge_data(
        data,
        contract,
        bool(proration_options["apply_proration"]),
        proration_options["proration_base_amount"],
    )
    charge = Charge(**data)
    duplicates = duplicate_charge_candidates(session, charge)
    if duplicates and not duplicate_allowed:
        first = charge_to_dict(session, duplicates[0])
        raise HTTPException(
            status_code=409,
            detail=(
                "Posible duplicado: ya existe una deuda "
                f"{first['concept']} de {first['tenant_name']} para "
                f"{first['property_reference']} período {first['period'] or first['due_date']} "
                f"con saldo {first['remaining_amount']}. Confirmá si igual querés guardarla."
            ),
        )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    refresh_charge_status(session, charge)
    session.commit()
    if owner_charge_options["create_owner_charge"]:
        create_owner_charge_for_tenant_charge(
            session,
            charge,
            concept=str(owner_charge_options["owner_charge_concept"] or charge.concept),
            paid_by_agency=bool(owner_charge_options["owner_charge_paid_by_agency"]),
            split_by_ownership=bool(owner_charge_options["owner_charge_split_by_ownership"]),
        )
        session.refresh(charge)
    sync_proration_difference_owner_charge(
        session,
        charge,
        proration_options["proration_base_amount"],
        bool(proration_options["create_owner_charge_for_proration_difference"]),
        paid_by_agency=bool(proration_options["proration_difference_paid_by_agency"]),
        concept=str(owner_charge_options["owner_charge_concept"] or charge.concept),
        split_by_ownership=True,
    )
    return charge_to_dict(session, charge)


@app.patch("/charges/{charge_id}")
def update_charge(
    charge_id: int,
    payload: ChargeUpdate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    charge = session.get(Charge, charge_id)
    if not charge:
        raise not_found("Deuda no encontrada")
    contract = session.get(Contract, payload.contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    owner_charge_options = {
        "create_owner_charge": payload.create_owner_charge,
        "owner_charge_concept": payload.owner_charge_concept,
        "owner_charge_paid_by_agency": payload.owner_charge_paid_by_agency,
        "owner_charge_split_by_ownership": payload.owner_charge_split_by_ownership,
    }
    duplicate_allowed = payload.allow_duplicate
    proration_options = {
        "apply_proration": payload.apply_proration,
        "proration_base_amount": payload.proration_base_amount,
        "create_owner_charge_for_proration_difference": payload.create_owner_charge_for_proration_difference,
        "proration_difference_paid_by_agency": payload.proration_difference_paid_by_agency,
    }
    data = payload.model_dump(exclude=set(owner_charge_options.keys()) | set(proration_options.keys()) | {"allow_duplicate"})
    if data["responsible_person_id"] is None:
        data["responsible_person_id"] = contract_primary_tenant_id(session, contract)
    if not data["accrual_period"]:
        data["accrual_period"] = data["period"]
    if not data["settlement_period"]:
        data["settlement_period"] = data["period"]
    apply_manual_proration_to_charge_data(
        data,
        contract,
        bool(proration_options["apply_proration"]),
        proration_options["proration_base_amount"],
    )
    draft = Charge(**{**data, "id": charge.id})
    duplicates = duplicate_charge_candidates(session, draft, exclude_id=charge.id)
    if duplicates and not duplicate_allowed:
        first = charge_to_dict(session, duplicates[0])
        raise HTTPException(
            status_code=409,
            detail=(
                "Posible duplicado: ya existe una deuda "
                f"{first['concept']} de {first['tenant_name']} para "
                f"{first['property_reference']} período {first['period'] or first['due_date']} "
                f"con saldo {first['remaining_amount']}. Confirmá si igual querés guardarla."
            ),
        )
    for key, value in data.items():
        setattr(charge, key, value)
    session.add(charge)
    session.commit()
    session.refresh(charge)
    refresh_charge_status(session, charge)
    session.commit()
    if charge.owner_charge_id:
        owner_charge = session.get(OwnerCharge, charge.owner_charge_id)
        if owner_charge:
            owner_charge.concept = charge.concept
            owner_charge.description = f"Traslado desde deuda #{charge.id}: {charge.description or charge.concept}"
            owner_charge.amount = charge.amount
            owner_charge.charge_date = charge.due_date
            owner_charge.period = charge.settlement_period or charge.period or charge.due_date.strftime("%Y-%m")
            session.add(owner_charge)
            session.commit()
    if owner_charge_options["create_owner_charge"]:
        create_owner_charge_for_tenant_charge(
            session,
            charge,
            concept=str(owner_charge_options["owner_charge_concept"] or charge.concept),
            paid_by_agency=bool(owner_charge_options["owner_charge_paid_by_agency"]),
            split_by_ownership=bool(owner_charge_options["owner_charge_split_by_ownership"]),
        )
        session.refresh(charge)
    sync_proration_difference_owner_charge(
        session,
        charge,
        proration_options["proration_base_amount"],
        bool(proration_options["create_owner_charge_for_proration_difference"]),
        paid_by_agency=bool(proration_options["proration_difference_paid_by_agency"]),
        concept=str(owner_charge_options["owner_charge_concept"] or charge.concept),
        split_by_ownership=True,
    )
    return charge_to_dict(session, charge)


@app.delete("/charges/{charge_id}")
def delete_charge(charge_id: int, session: Session = Depends(get_session)) -> Dict[str, str]:
    charge = session.get(Charge, charge_id)
    if not charge:
        raise not_found("Deuda no encontrada")
    ensure_not_referenced(
        bool(session.exec(select(PaymentAllocation).where(PaymentAllocation.charge_id == charge_id)).first())
        or bool(session.exec(select(Reminder).where(Reminder.charge_id == charge_id)).first())
        or any(
            charge_id in public_link_charge_ids(link.charge_ids_csv)
            for link in session.exec(select(PublicPaymentLink)).all()
        ),
        "No se puede eliminar una deuda con pagos, recordatorios o links asociados.",
    )
    session.delete(charge)
    session.commit()
    return {"status": "deleted"}


@app.post("/charges/bulk-monthly")
def bulk_monthly(
    payload: BulkMonthlyRequest, session: Session = Depends(get_session)
) -> Dict[str, object]:
    try:
        created = generate_monthly_charges(session, payload.period, payload.due_day)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"created": len(created), "charges": [charge_to_dict(session, item) for item in created]}


@app.post("/invoice-scan/analyze")
async def analyze_invoice_upload(
    file: UploadFile = File(...), session: Session = Depends(get_session)
) -> Dict[str, object]:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    extracted = extract_text_from_invoice_upload(
        file_bytes=file_bytes,
        content_type=file.content_type or "",
        filename=file.filename or "",
    )
    return analyze_invoice_text(
        session=session,
        text=str(extracted["text"]),
        filename=file.filename or "",
        content_type=file.content_type or "",
        warnings=list(extracted["warnings"]),
    ) | {
        "ocr_available": extracted["ocr_available"],
        "analysis_source": extracted["analysis_source"],
    }


@app.get("/invoice-documents")
def list_invoice_documents(
    status: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
    property_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    invoices = session.exec(select(InvoiceDocument)).all()
    if status and status != "todos":
        invoices = [item for item in invoices if item.status == status]
    if provider and provider != "todos":
        invoices = [item for item in invoices if item.provider.upper() == provider.upper()]
    if property_id:
        invoices = [item for item in invoices if item.property_id == property_id]
    return [
        invoice_document_to_dict(session, invoice)
        for invoice in sorted(invoices, key=lambda item: (item.due_date, item.id or 0), reverse=True)
    ]


def enrich_invoice_data_from_service(session: Session, data: Dict[str, Any]) -> Dict[str, Any]:
    service = None
    if data.get("service_account_id"):
        service = session.get(PropertyServiceAccount, data["service_account_id"])
    if not service and data.get("account_number"):
        service = find_service_account_match(session, str(data.get("account_number")), str(data.get("provider", "")))
    if service:
        data["service_account_id"] = service.id
        data["property_id"] = service.property_id
        data["responsible_type"] = service.payer
    if not data.get("period") and data.get("due_date"):
        data["period"] = data["due_date"].strftime("%Y-%m")
    return data


@app.post("/invoice-documents")
def create_invoice_document(
    payload: InvoiceDocumentCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    data = enrich_invoice_data_from_service(session, payload.model_dump())
    invoice = InvoiceDocument(**data)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    audit_log(session, "invoice", invoice.id, "create", f"Factura {invoice.provider} {invoice.account_number}")
    return invoice_document_to_dict(session, invoice)


@app.patch("/invoice-documents/{invoice_id}")
def update_invoice_document(
    invoice_id: int,
    payload: InvoiceDocumentUpdate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    invoice = session.get(InvoiceDocument, invoice_id)
    if not invoice:
        raise not_found("Factura no encontrada")
    data = enrich_invoice_data_from_service(session, payload.model_dump())
    for key, value in data.items():
        setattr(invoice, key, value)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    audit_log(session, "invoice", invoice.id, "update", f"Factura {invoice.provider} actualizada")
    return invoice_document_to_dict(session, invoice)


@app.delete("/invoice-documents/{invoice_id}")
def delete_invoice_document(
    invoice_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    invoice = session.get(InvoiceDocument, invoice_id)
    if not invoice:
        raise not_found("Factura no encontrada")
    if invoice.charge_id or invoice.owner_charge_id:
        invoice.status = "anulada"
        invoice.notes = (invoice.notes + "\n" if invoice.notes else "") + "Factura anulada; el cargo vinculado se conserva."
        session.add(invoice)
        session.commit()
        audit_log(session, "invoice", invoice.id, "void", f"Factura {invoice.id} anulada")
        return {"status": "anulada", "invoice": invoice_document_to_dict(session, invoice)}
    session.delete(invoice)
    session.commit()
    audit_log(session, "invoice", invoice_id, "delete", f"Factura {invoice_id} eliminada")
    return {"status": "deleted"}


@app.post("/invoice-documents/{invoice_id}/create-charge")
def create_charge_from_invoice_endpoint(
    invoice_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    invoice = session.get(InvoiceDocument, invoice_id)
    if not invoice:
        raise not_found("Factura no encontrada")
    if invoice.responsible_type == "tenant":
        charge = create_charge_from_invoice(session, invoice)
        if not charge:
            raise HTTPException(status_code=400, detail="No se pudo crear deuda: falta contrato activo o datos de finca.")
        return {"invoice": invoice_document_to_dict(session, invoice), "charge": charge_to_dict(session, charge)}
    owner_charge = create_owner_charge_from_invoice(session, invoice)
    if not owner_charge:
        raise HTTPException(status_code=400, detail="No se pudo crear debito a propietario.")
    return {"invoice": invoice_document_to_dict(session, invoice), "owner_charge": owner_charge_to_dict(session, owner_charge)}


@app.post("/invoice-documents/{invoice_id}/split-by-padron")
def split_invoice_by_padron_endpoint(
    invoice_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    invoice = session.get(InvoiceDocument, invoice_id)
    if not invoice:
        raise not_found("Factura no encontrada")
    if invoice.charge_id or invoice.owner_charge_id or invoice.status == "convertida":
        raise HTTPException(status_code=400, detail="La factura ya fue convertida. Anulá o revisá la factura antes de fraccionarla.")
    if not invoice.property_id:
        raise HTTPException(status_code=400, detail="La factura necesita una finca asociada para buscar el padrón.")
    base_property = session.get(Property, invoice.property_id)
    if not base_property or not base_property.padron:
        raise HTTPException(status_code=400, detail="La finca asociada no tiene padrón cargado.")
    related_properties = session.exec(select(Property).where(Property.padron == base_property.padron)).all()
    related_properties = sorted(related_properties, key=lambda item: (item.reference, item.id or 0))
    if len(related_properties) < 2:
        raise HTTPException(status_code=400, detail="No hay otras fincas con el mismo padrón para fraccionar.")
    portion = money(invoice.amount / len(related_properties))
    created_charges: List[Charge] = []
    created_owner_charges: List[OwnerCharge] = []
    missing_contracts: List[str] = []
    period = invoice.period or invoice.due_date.strftime("%Y-%m")
    concept = invoice.provider.upper()
    for property_obj in related_properties:
        description = (
            f"Factura {invoice.provider} cuenta {invoice.account_number} · "
            f"fraccionada por padrón {base_property.padron} entre {len(related_properties)} fincas"
        )
        if invoice.responsible_type == "tenant":
            contracts = session.exec(
                select(Contract).where(
                    Contract.property_id == property_obj.id,
                    Contract.active == True,  # noqa: E712
                )
            ).all()
            valid_contracts = [
                contract
                for contract in contracts
                if contract.start_date <= invoice.due_date
                and (contract_billing_end_date(contract) is None or contract_billing_end_date(contract) >= invoice.due_date)
            ]
            contract = sorted(valid_contracts or contracts, key=lambda item: (item.start_date, item.id or 0), reverse=True)[0] if contracts else None
            if not contract:
                missing_contracts.append(f"{property_obj.reference} - {property_obj.address}")
                continue
            charge = Charge(
                contract_id=contract.id or 0,
                responsible_person_id=contract_primary_tenant_id(session, contract),
                responsible_type="tenant",
                concept=concept,
                description=description,
                amount=portion,
                due_date=invoice.due_date,
                period=period,
                accrual_period=period,
                settlement_period=period,
                consumption_period_start=invoice.consumption_period_start,
                consumption_period_end=invoice.consumption_period_end,
                origin="invoice_padron_split",
            )
            session.add(charge)
            created_charges.append(charge)
            continue
        share = session.exec(
            select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == property_obj.id)
        ).first()
        if not share:
            missing_contracts.append(f"{property_obj.reference} - {property_obj.address} sin propietario")
            continue
        owner_charge = OwnerCharge(
            owner_id=share.owner_id,
            property_id=property_obj.id or 0,
            concept=concept,
            description=description,
            amount=portion,
            charge_date=invoice.due_date,
            period=period,
            paid_by_agency=False,
            generates_commission=False,
            split_by_ownership=True,
        )
        session.add(owner_charge)
        created_owner_charges.append(owner_charge)
    if missing_contracts:
        session.rollback()
        raise HTTPException(
            status_code=400,
            detail="No se pudo fraccionar porque faltan datos en: " + "; ".join(missing_contracts[:6]),
        )
    if not created_charges and not created_owner_charges:
        raise HTTPException(status_code=400, detail="No se crearon cargos con el padrón seleccionado.")
    session.commit()
    for charge in created_charges:
        session.refresh(charge)
    for owner_charge in created_owner_charges:
        session.refresh(owner_charge)
    if created_charges:
        invoice.charge_id = created_charges[0].id
    if created_owner_charges:
        invoice.owner_charge_id = created_owner_charges[0].id
    invoice.status = "convertida"
    invoice.notes = (
        (invoice.notes + "\n" if invoice.notes else "")
        + f"Fraccionada por padrón {base_property.padron}: "
        + ", ".join(
            [f"deuda #{charge.id}" for charge in created_charges]
            + [f"debito propietario #{owner_charge.id}" for owner_charge in created_owner_charges]
        )
    )
    session.add(invoice)
    session.commit()
    audit_log(session, "invoice", invoice.id, "split_by_padron", invoice.notes)
    return {
        "invoice": invoice_document_to_dict(session, invoice),
        "charges": [charge_to_dict(session, charge) for charge in created_charges],
        "owner_charges": [owner_charge_to_dict(session, owner_charge) for owner_charge in created_owner_charges],
    }


@app.post("/invoice-documents/import")
async def import_invoice_document(
    file: UploadFile = File(...),
    source: str = "manual",
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    result = create_invoice_document_from_bytes(
        session=session,
        file_bytes=file_bytes,
        filename=file.filename or "factura",
        content_type=file.content_type or "",
        source=source,
        notes="Importada desde adjunto",
    )
    invoice = result["invoice"]
    analysis = result["analysis"]
    audit_log(session, "invoice", invoice.id, "import", f"Factura importada desde {source}")
    return {"invoice": invoice_document_to_dict(session, invoice), "analysis": analysis}


@app.get("/email-inboxes")
def list_email_inboxes(session: Session = Depends(get_session)) -> List[Dict[str, object]]:
    inboxes = session.exec(select(EmailInboxConfig)).all()
    return [email_inbox_to_dict(session, inbox) for inbox in inboxes]


@app.get("/email-inboxes/setup-status")
def email_setup_status(session: Session = Depends(get_session)) -> Dict[str, object]:
    inbox = primary_email_inbox(session)
    secret_name = inbox.secret_env_var if inbox else settings.invoices_email_secret_env_var
    secret = secret_from_env_or_file(secret_name)
    rules = (
        session.exec(select(EmailProviderRule).where(EmailProviderRule.inbox_id == inbox.id)).all()
        if inbox and inbox.id
        else []
    )
    return {
        "email_address": inbox.email_address if inbox else settings.invoices_email_address,
        "host": inbox.host if inbox else settings.invoices_email_host,
        "folder": inbox.folder if inbox else settings.invoices_email_folder,
        "secret_env_var": secret_name,
        "has_inbox": bool(inbox),
        "has_secret": bool(secret and "pegar-aca" not in secret.lower()),
        "has_rules": bool(rules),
        "rules_count": len(rules),
        "ready": bool(inbox and secret and "pegar-aca" not in secret.lower() and rules),
    }


@app.post("/email-inboxes")
def create_email_inbox(
    payload: EmailInboxConfigCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    ensure_secret_env_var_name(payload.secret_env_var)
    inbox = EmailInboxConfig(**payload.model_dump())
    session.add(inbox)
    session.commit()
    session.refresh(inbox)
    audit_log(session, "email_inbox", inbox.id, "create", f"Bandeja {inbox.email_address}")
    return email_inbox_to_dict(session, inbox)


@app.patch("/email-inboxes/{inbox_id}")
def update_email_inbox(
    inbox_id: int,
    payload: EmailInboxConfigUpdate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    inbox = session.get(EmailInboxConfig, inbox_id)
    if not inbox:
        raise not_found("Bandeja no encontrada")
    ensure_secret_env_var_name(payload.secret_env_var)
    for key, value in payload.model_dump().items():
        setattr(inbox, key, value)
    session.add(inbox)
    session.commit()
    session.refresh(inbox)
    audit_log(session, "email_inbox", inbox.id, "update", f"Bandeja {inbox.email_address} actualizada")
    return email_inbox_to_dict(session, inbox)


@app.delete("/email-inboxes/{inbox_id}")
def delete_email_inbox(
    inbox_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    inbox = session.get(EmailInboxConfig, inbox_id)
    if not inbox:
        raise not_found("Bandeja no encontrada")
    rules = session.exec(select(EmailProviderRule).where(EmailProviderRule.inbox_id == inbox_id)).all()
    for rule in rules:
        session.delete(rule)
    session.delete(inbox)
    session.commit()
    audit_log(session, "email_inbox", inbox_id, "delete", f"Bandeja {inbox_id} eliminada")
    return {"status": "deleted"}


@app.post("/email-inboxes/{inbox_id}/rules")
def create_email_rule(
    inbox_id: int,
    payload: EmailProviderRuleCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    inbox = session.get(EmailInboxConfig, inbox_id)
    if not inbox:
        raise not_found("Bandeja no encontrada")
    rule = EmailProviderRule(inbox_id=inbox_id, **payload.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    audit_log(session, "email_rule", rule.id, "create", f"Regla {rule.provider} para {inbox.email_address}")
    return email_rule_to_dict(rule)


@app.delete("/email-inboxes/{inbox_id}/rules/{rule_id}")
def delete_email_rule(
    inbox_id: int,
    rule_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    rule = session.get(EmailProviderRule, rule_id)
    if not rule or rule.inbox_id != inbox_id:
        raise not_found("Regla no encontrada")
    session.delete(rule)
    session.commit()
    audit_log(session, "email_rule", rule_id, "delete", f"Regla {rule_id} eliminada")
    return {"status": "deleted"}


def email_matches_rule(sender: str, subject: str, rule: EmailProviderRule) -> bool:
    sender_needle = strip_rule_text(rule.sender_pattern)
    sender_ok = not sender_needle or sender_needle in strip_rule_text(sender) or sender_needle in strip_rule_text(subject)
    keywords = [item.strip().lower() for item in rule.subject_keywords.split(",") if item.strip()]
    subject_ok = not keywords or all(strip_rule_text(keyword) in strip_rule_text(subject) for keyword in keywords)
    return sender_ok and subject_ok


def strip_rule_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def decode_email_header(value: str) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:  # noqa: BLE001
        return value


def extract_email_body_text(message: email.message.Message) -> str:
    chunks: List[str] = []
    for part in message.walk():
        if part.get_filename():
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        charset = part.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="replace")
        if content_type == "text/html":
            text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
            text = re.sub(r"</p\s*>", "\n", text, flags=re.I)
            text = re.sub(r"<[^>]+>", " ", text)
        chunks.append(text)
    return "\n".join(chunks).strip()


@app.post("/email-inboxes/{inbox_id}/scan")
def scan_email_inbox(
    inbox_id: int,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    inbox = session.get(EmailInboxConfig, inbox_id)
    if not inbox:
        raise not_found("Bandeja no encontrada")
    run = EmailImportRun(inbox_id=inbox_id, status="running")
    session.add(run)
    session.commit()
    session.refresh(run)
    password = secret_from_env_or_file(inbox.secret_env_var or "")
    if password and inbox.host.lower().endswith("gmail.com"):
        password = password.replace(" ", "")
    if not inbox.active or not inbox.host or not inbox.username or not inbox.secret_env_var or not password:
        run.status = "config_pendiente"
        run.finished_at = datetime.utcnow()
        run.notes = "Falta host, usuario o variable de entorno con la clave/app-password del correo."
        session.add(run)
        session.commit()
        session.refresh(run)
        return {"run": email_import_run_to_dict(run), "invoices": []}

    rules = session.exec(
        select(EmailProviderRule).where(
            EmailProviderRule.inbox_id == inbox_id,
            EmailProviderRule.active == True,  # noqa: E712
        )
    ).all()
    created: List[InvoiceDocument] = []
    messages_seen = 0
    messages_checked = 0
    messages_ignored = 0
    try:
        with imaplib.IMAP4_SSL(inbox.host, inbox.port) as mailbox:
            mailbox.login(inbox.username, password)
            mailbox.select(inbox.folder or "INBOX")
            _, search_data = mailbox.search(None, "ALL")
            message_ids = (search_data[0].split() if search_data and search_data[0] else [])[-25:]
            for message_id in message_ids:
                _, fetch_data = mailbox.fetch(message_id, "(RFC822)")
                if not fetch_data or not fetch_data[0]:
                    continue
                messages_checked += 1
                raw_message = fetch_data[0][1]
                message = email.message_from_bytes(raw_message)
                sender = decode_email_header(str(message.get("From", "")))
                sender_email = parseaddr(sender)[1]
                subject = decode_email_header(str(message.get("Subject", "")))
                if rules and not any(email_matches_rule(sender, subject, rule) for rule in rules):
                    messages_ignored += 1
                    continue
                messages_seen += 1
                message_created: List[InvoiceDocument] = []
                for part in message.walk():
                    filename = part.get_filename()
                    payload = part.get_payload(decode=True)
                    if not filename or not payload:
                        continue
                    lower_name = filename.lower()
                    if not lower_name.endswith((".pdf", ".png", ".jpg", ".jpeg", ".txt")):
                        continue
                    content_type = part.get_content_type() or "application/octet-stream"
                    result = create_invoice_document_from_bytes(
                        session=session,
                        file_bytes=payload,
                        filename=filename,
                        content_type=content_type,
                        source="email",
                        notes=f"Importada desde correo {sender}",
                    )
                    invoice = result["invoice"]
                    if invoice not in created and invoice not in message_created:
                        created.append(invoice)
                        message_created.append(invoice)
                if not message_created:
                    body_text = extract_email_body_text(message)
                    if body_text:
                        body_invoice = create_invoice_document_from_text(
                            session=session,
                            text=f"{subject}\n{sender}\n{body_text}",
                            filename=f"correo-{message_id.decode() if isinstance(message_id, bytes) else message_id}.txt",
                            source="email_body",
                            notes=f"Importada desde cuerpo del correo {sender_email or sender}",
                        )
                        if body_invoice and body_invoice not in created:
                            created.append(body_invoice)
            inbox.last_checked_at = datetime.utcnow()
            run.status = "ok"
            run.messages_seen = messages_seen
            run.invoices_created = len(created)
            run.finished_at = datetime.utcnow()
            run.notes = f"Escaneo completado. Correos recientes revisados: {messages_checked}. Ignorados por reglas: {messages_ignored}."
            session.add(inbox)
            session.add(run)
            session.commit()
    except Exception as exc:  # noqa: BLE001
        run.status = "error"
        run.finished_at = datetime.utcnow()
        run.messages_seen = messages_seen
        run.invoices_created = len(created)
        run.notes = f"{str(exc)[:420]} | revisados={messages_checked} ignorados={messages_ignored}"
        session.add(run)
        session.commit()
    session.refresh(run)
    return {
        "run": email_import_run_to_dict(run),
        "invoices": [invoice_document_to_dict(session, invoice) for invoice in created],
    }


@app.post("/payments")
def create_payment(
    payload: PaymentCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    payment = Payment(**payload.model_dump(exclude={"allocations"}))
    session.add(payment)
    session.commit()
    session.refresh(payment)
    if payload.allocations:
        try:
            apply_allocations(
                session,
                payment,
                [allocation.model_dump() for allocation in payload.allocations],
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    cash_movement = create_cash_movement_for_payment(session, payment)
    return {
        "id": payment.id,
        "person_id": payment.person_id,
        "payment_date": payment.payment_date.isoformat(),
        "amount": money(payment.amount),
        "allocated_amount": money(payment.amount - unallocated_amount_for_payment(session, payment)),
        "unallocated_amount": unallocated_amount_for_payment(session, payment),
        "method": payment.method,
        "reference": payment.reference,
        "notes": payment.notes,
        "status": payment.status,
        "cash_movement": cash_movement_to_dict(session, cash_movement),
    }


def payment_candidate_charges(session: Session, payment: Payment) -> List[Charge]:
    contract_ids = {
        link.contract_id
        for link in session.exec(
            select(ContractTenant).where(ContractTenant.person_id == payment.person_id)
        ).all()
    }
    current_allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    current_charge_ids = {allocation.charge_id for allocation in current_allocations}
    candidate_map: Dict[int, Charge] = {}
    for charge in session.exec(select(Charge)).all():
        if (
            charge.responsible_person_id == payment.person_id
            or charge.contract_id in contract_ids
            or charge.id in current_charge_ids
        ):
            candidate_map[charge.id or 0] = charge
    return sorted(
        candidate_map.values(),
        key=lambda item: (item.due_date, item.contract_id, item.id or 0),
    )


def payment_detail_to_dict(session: Session, payment: Payment) -> Dict[str, object]:
    payer = session.get(Person, payment.person_id)
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    current_by_charge: Dict[int, float] = {}
    allocation_rows: List[Dict[str, object]] = []
    for allocation in allocations:
        charge = session.get(Charge, allocation.charge_id)
        current_by_charge[allocation.charge_id] = money(current_by_charge.get(allocation.charge_id, 0) + allocation.amount)
        allocation_rows.append(
            {
                "id": allocation.id,
                "charge_id": allocation.charge_id,
                "amount": money(allocation.amount),
                "charge": charge_to_dict(session, charge) if charge else None,
            }
        )
    candidate_rows = []
    for charge in payment_candidate_charges(session, payment):
        charge_row = charge_to_dict(session, charge)
        current_amount = current_by_charge.get(charge.id or 0, 0)
        candidate_rows.append(
            {
                **charge_row,
                "current_payment_amount": money(current_amount),
                "available_for_payment": money(charge_row["remaining_amount"] + current_amount),
            }
        )
    allocated_amount = money(sum(allocation.amount for allocation in allocations))
    return {
        "id": payment.id,
        "person_id": payment.person_id,
        "person_name": payer.full_name if payer else "",
        "payment_date": payment.payment_date.isoformat(),
        "amount": money(payment.amount),
        "allocated_amount": allocated_amount,
        "unallocated_amount": money(payment.amount - allocated_amount),
        "method": payment.method,
        "reference": payment.reference,
        "notes": payment.notes,
        "status": payment.status,
        "allocations": allocation_rows,
        "candidate_charges": candidate_rows,
    }


def payment_cash_net(session: Session, payment_id: int) -> float:
    movements = session.exec(
        select(CashMovement).where(
            CashMovement.origin.in_(["payment", "payment_adjustment"]),
            CashMovement.origin_id == payment_id,
            CashMovement.status == "confirmado",
        )
    ).all()
    total = 0.0
    for movement in movements:
        total += movement.amount if movement.movement_type == "entrada" else -movement.amount
    return money(total)


def sync_tenant_credit_for_payment(session: Session, payment: Payment) -> None:
    credit = session.exec(
        select(TenantCredit).where(TenantCredit.payment_id == payment.id)
    ).first()
    unallocated = unallocated_amount_for_payment(session, payment)
    if unallocated > 0:
        if credit:
            credit.amount = unallocated
            credit.remaining_amount = unallocated
            credit.status = "disponible"
            credit.notes = "Saldo a favor actualizado por correccion de pago."
            session.add(credit)
        else:
            session.add(
                TenantCredit(
                    person_id=payment.person_id,
                    payment_id=payment.id,
                    amount=unallocated,
                    remaining_amount=unallocated,
                    notes="Saldo a favor generado por correccion de pago.",
                )
            )
    elif credit and credit.status == "disponible":
        credit.remaining_amount = 0
        credit.status = "agotado"
        credit.notes = "Saldo a favor agotado por correccion de pago."
        session.add(credit)


@app.get("/payments/{payment_id}/detail")
def payment_detail(payment_id: int, session: Session = Depends(get_session)) -> Dict[str, object]:
    payment = session.get(Payment, payment_id)
    if not payment:
        raise not_found("Pago no encontrado")
    return payment_detail_to_dict(session, payment)


@app.post("/payments/{payment_id}/reallocate")
def reallocate_payment_endpoint(
    payment_id: int,
    payload: PaymentReallocationRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    payment = session.get(Payment, payment_id)
    if not payment:
        raise not_found("Pago no encontrado")
    if payment.status != "confirmado":
        raise HTTPException(status_code=400, detail="No se puede corregir un pago anulado")

    current_allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    current_total = money(sum(allocation.amount for allocation in current_allocations))
    if current_total <= 0:
        raise HTTPException(status_code=400, detail="El pago no tiene imputaciones para corregir")

    corrected_amount = money(payload.corrected_amount if payload.corrected_amount is not None else payment.amount)
    if corrected_amount <= 0:
        raise HTTPException(status_code=400, detail="El monto real cobrado debe ser mayor a cero")

    requested = [
        {"charge_id": int(item.charge_id), "amount": money(float(item.amount))}
        for item in payload.allocations
        if money(float(item.amount)) > 0
    ]
    requested_total = money(sum(item["amount"] for item in requested))
    if requested_total > corrected_amount + 0.01:
        raise HTTPException(
            status_code=400,
            detail="La nueva imputacion no puede superar el monto real cobrado.",
        )

    old_by_charge: Dict[int, float] = {}
    affected_charge_ids = set()
    for allocation in current_allocations:
        old_by_charge[allocation.charge_id] = money(old_by_charge.get(allocation.charge_id, 0) + allocation.amount)
        affected_charge_ids.add(allocation.charge_id)

    for item in requested:
        charge = session.get(Charge, item["charge_id"])
        if not charge:
            raise HTTPException(status_code=400, detail="Deuda destino no encontrada")
        available = money(remaining_for_charge(session, charge) + old_by_charge.get(charge.id or 0, 0))
        if item["amount"] > available + 0.01:
            raise HTTPException(status_code=400, detail=f"La deuda {charge.concept} no tiene saldo suficiente para imputar")

    old_summary = ", ".join(f"{allocation.charge_id}:{money(allocation.amount)}" for allocation in current_allocations)
    for allocation in current_allocations:
        allocation.status = "reimputado"
        session.add(allocation)
    for item in requested:
        session.add(
            PaymentAllocation(
                payment_id=payment.id or 0,
                charge_id=item["charge_id"],
                amount=item["amount"],
                status="confirmado",
            )
        )
        affected_charge_ids.add(item["charge_id"])
    old_payment_amount = money(payment.amount)
    payment.amount = corrected_amount
    session.add(payment)
    session.commit()

    for charge_id in affected_charge_ids:
        charge = session.get(Charge, charge_id)
        if charge:
            refresh_charge_status(session, charge)
    sync_tenant_credit_for_payment(session, payment)
    session.commit()

    cash_before_adjustment = payment_cash_net(session, payment.id or 0)
    cash_difference = money(corrected_amount - cash_before_adjustment)
    if abs(cash_difference) > 0.01:
        base_movement = session.exec(
            select(CashMovement).where(
                CashMovement.origin == "payment",
                CashMovement.origin_id == payment.id,
            )
        ).first()
        session.add(
            CashMovement(
                movement_date=date.today(),
                movement_type="entrada" if cash_difference > 0 else "salida",
                amount=abs(cash_difference),
                concept=f"Ajuste de pago #{payment.id}",
                person_id=payment.person_id,
                property_id=base_movement.property_id if base_movement else None,
                origin="payment_adjustment",
                origin_id=payment.id,
                notes=payload.reason,
            )
        )
        session.commit()

    new_summary = ", ".join(f"{item['charge_id']}:{item['amount']}" for item in requested)
    audit_log(
        session,
        "payment",
        payment.id,
        "reallocate",
        f"{payload.reason} | monto {old_payment_amount}->{corrected_amount} | antes {old_summary} | despues {new_summary}",
    )
    return payment_detail_to_dict(session, payment)


@app.get("/payments/{payment_id}/receipt.pdf")
def download_payment_receipt(payment_id: int, session: Session = Depends(get_session)) -> StreamingResponse:
    payment = session.get(Payment, payment_id)
    if not payment:
        raise not_found("Pago no encontrado")
    payer = session.get(Person, payment.person_id)
    allocations = session.exec(
        select(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment.id,
            PaymentAllocation.status == "confirmado",
        )
    ).all()
    receipt_lines = []
    receipt_property = None
    receipt_owner_code = ""
    for allocation in allocations:
        charge = session.get(Charge, allocation.charge_id)
        if not charge:
            continue
        contract = session.get(Contract, charge.contract_id)
        property_obj = session.get(Property, contract.property_id) if contract else None
        if property_obj and not receipt_property:
            receipt_property = property_obj
            share = session.exec(
                select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == property_obj.id)
            ).first()
            owner = session.get(Person, share.owner_id) if share else None
            receipt_owner_code = owner.legacy_code if owner else ""
        receipt_lines.append(
            (
                f"{charge.concept} {charge.period}".strip(),
                pdf_money(allocation.amount)
                if isinstance(allocation.amount, (int, float))
                else str(allocation.amount),
            )
        )
        if property_obj:
            receipt_lines[-1] = (
                f"{receipt_lines[-1][0]} · Fin {property_obj.reference} - {property_obj.address}",
                receipt_lines[-1][1],
            )
    content = payment_receipt_pdf(
        receipt_number=payment.id or payment_id,
        payer_name=f"Inq {payer.legacy_code or 's/n'} - {payer.full_name}" if payer else "Sin persona",
        payment_date=payment.payment_date.isoformat(),
        amount=payment.amount,
        method=payment.method,
        reference=payment.reference,
        notes=payment.notes,
        allocations=receipt_lines,
        unallocated_amount=unallocated_amount_for_payment(session, payment),
        tenant_code=payer.legacy_code if payer else "",
        owner_code=receipt_owner_code,
        property_reference=receipt_property.reference if receipt_property else "",
        property_address=receipt_property.address if receipt_property else "",
    )
    return pdf_response(f"recibo_pago_{payment.id or payment_id}.pdf", content)


@app.get("/tenant-credits")
def list_tenant_credits(
    person_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    credits = session.exec(select(TenantCredit)).all()
    if person_id:
        credits = [credit for credit in credits if credit.person_id == person_id]
    return [tenant_credit_to_dict(session, credit) for credit in credits]


@app.get("/institutional-reconciliations/{institution}")
def institutional_reconciliation(
    institution: str,
    period: str = Query(default=""),
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    selected_period = period or datetime.utcnow().strftime("%Y-%m")
    normalized = institution.lower()
    if normalized not in {"anda", "contaduria", "contaduría", "cgn"}:
        raise HTTPException(status_code=400, detail="Institucion no soportada")
    return institutional_reconciliation_rows(session, normalized, selected_period)


@app.post("/institutional-reconciliations/{institution}/import")
async def import_institutional_reconciliation(
    institution: str,
    period: str = Query(default=""),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    selected_period = period or datetime.utcnow().strftime("%Y-%m")
    normalized = institution.lower()
    if normalized not in {"anda", "contaduria", "contaduría", "cgn"}:
        raise HTTPException(status_code=400, detail="Institucion no soportada")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    decoded = decode_institutional_file(file_bytes, file.filename or "liquidacion", file.content_type or "")
    imported_rows = parse_institutional_liquidation_rows(str(decoded.get("text") or ""))
    result = compare_institutional_reconciliation(
        session,
        normalized,
        selected_period,
        imported_rows,
        filename=file.filename or "liquidacion",
        warnings=list(decoded.get("warnings") or []),
    )
    audit_log(
        session,
        "institutional_reconciliation",
        None,
        "import",
        f"Liquidacion {institution} {selected_period}: {len(imported_rows)} filas detectadas",
    )
    return result


@app.post("/payments/advance-rent")
def create_advance_rent_payment_endpoint(
    payload: AdvanceRentPaymentCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    contract = session.get(Contract, payload.contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    try:
        result = create_advance_rent_payment(
            session=session,
            contract=contract,
            months=payload.months,
            payment_date=payload.payment_date,
            method=payload.method,
            reference=payload.reference,
            notes=payload.notes,
            due_day=payload.due_day,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payment = result["payment"]
    return {
        "payment": {
            "id": payment.id,
            "person_id": payment.person_id,
            "payment_date": payment.payment_date.isoformat(),
            "amount": money(payment.amount),
            "method": payment.method,
            "reference": payment.reference,
            "notes": payment.notes,
            "status": payment.status,
        },
        "charges": [charge_to_dict(session, charge) for charge in result["charges"]],
        "cash_movement": cash_movement_to_dict(session, result["cash_movement"]),
    }


@app.post("/payments/{payment_id}/allocate")
def allocate_payment(
    payment_id: int, payload: AllocationRequest, session: Session = Depends(get_session)
) -> Dict[str, object]:
    payment = session.get(Payment, payment_id)
    if not payment:
        raise not_found("Pago no encontrado")
    try:
        apply_allocations(
            session,
            payment,
            [allocation.model_dump() for allocation in payload.allocations],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@app.post("/payments/{payment_id}/void")
def void_payment_endpoint(
    payment_id: int,
    payload: VoidRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    payment = session.get(Payment, payment_id)
    if not payment:
        raise not_found("Pago no encontrado")
    try:
        reversal = void_payment(session, payment, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "anulado", "cash_reversal": cash_movement_to_dict(session, reversal)}


@app.get("/cash-movements")
def list_cash_movements(
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    movement_type: Optional[str] = Query(default=None),
    person_id: Optional[int] = Query(default=None),
    property_id: Optional[int] = Query(default=None),
    origin: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    movements = session.exec(select(CashMovement)).all()
    if date_from:
        movements = [item for item in movements if item.movement_date.isoformat() >= date_from]
    if date_to:
        movements = [item for item in movements if item.movement_date.isoformat() <= date_to]
    if movement_type and movement_type != "todos":
        movements = [item for item in movements if item.movement_type == movement_type]
    if person_id:
        movements = [item for item in movements if item.person_id == person_id]
    if property_id:
        movements = [item for item in movements if item.property_id == property_id]
    if origin and origin != "todos":
        movements = [item for item in movements if item.origin == origin]
    return [
        cash_movement_to_dict(session, movement)
        for movement in sorted(movements, key=lambda item: (item.movement_date, item.id or 0), reverse=True)
    ]


@app.post("/cash-movements/manual")
def create_manual_cash_movement(
    payload: CashMovementCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    if payload.movement_type not in {"entrada", "salida"}:
        raise HTTPException(status_code=400, detail="Tipo de movimiento invalido")
    movement = CashMovement(
        **payload.model_dump(),
        origin="manual",
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    return cash_movement_to_dict(session, movement)


@app.get("/cash-movements/{movement_id}/withdrawal.pdf")
def download_cash_withdrawal(movement_id: int, session: Session = Depends(get_session)) -> StreamingResponse:
    movement = session.get(CashMovement, movement_id)
    if not movement:
        raise not_found("Movimiento de caja no encontrado")
    if movement.movement_type != "salida":
        raise HTTPException(status_code=400, detail="Solo se genera retiro PDF para salidas de caja")
    person = session.get(Person, movement.person_id) if movement.person_id else None
    property_obj = session.get(Property, movement.property_id) if movement.property_id else None
    property_label = f"Fin {property_obj.reference} - {property_obj.address}" if property_obj else ""
    extra_rows = []
    if movement.origin == "owner_settlement" and movement.origin_id:
        settlement = session.get(OwnerSettlement, movement.origin_id)
        if settlement:
            settlement_data = settlement_to_dict(session, settlement)
            extra_rows = [
                ("Total liquidacion", pdf_money(settlement.total_to_transfer)),
                ("Retirado registrado", pdf_money(settlement_data["paid_amount"])),
                ("Saldo posterior", f"{pdf_money(settlement_data['balance_after_payment'])} · {str(settlement_data['balance_status']).replace('_', ' ')}"),
            ]
    content = cash_withdrawal_pdf(
        movement_id=movement.id or movement_id,
        movement_date=movement.movement_date.isoformat(),
        concept=movement.concept,
        person_name=person.full_name if person else "",
        property_reference=property_label,
        amount=movement.amount,
        origin=movement.origin,
        notes=movement.notes,
        extra_rows=extra_rows,
    )
    return pdf_response(f"retiro_caja_{movement.id or movement_id}.pdf", content)


@app.get("/owner-charges")
def list_owner_charges(
    period: Optional[str] = Query(default=None),
    owner_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    owner_charges = session.exec(select(OwnerCharge)).all()
    if period:
        owner_charges = [item for item in owner_charges if item.period == period]
    if owner_id:
        owner_charges = [item for item in owner_charges if item.owner_id == owner_id]
    return [owner_charge_to_dict(session, item) for item in owner_charges]


@app.post("/owner-charges")
def create_owner_charge(
    payload: OwnerChargeCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    owner = session.get(Person, payload.owner_id)
    property_obj = session.get(Property, payload.property_id)
    if not owner:
        raise not_found("Propietario no encontrado")
    if not property_obj:
        raise not_found("Finca no encontrada")
    duplicate_allowed = payload.allow_duplicate
    data = payload.model_dump(exclude={"allow_duplicate"})
    if not data["period"]:
        data["period"] = data["charge_date"].strftime("%Y-%m")

    shares: List[PropertyOwnerShare] = []
    if payload.split_by_ownership:
        shares = session.exec(
            select(PropertyOwnerShare).where(PropertyOwnerShare.property_id == payload.property_id)
        ).all()

    owner_charges_to_create: List[OwnerCharge] = []
    if shares:
        base_amount = money(data["amount"])
        for share in shares:
            row_data = data.copy()
            row_data["owner_id"] = share.owner_id
            row_data["amount"] = money(base_amount * (share.percentage / 100))
            row_data["split_by_ownership"] = False
            description = str(row_data.get("description") or "").strip()
            share_note = f"Repartido automáticamente: {share.percentage:g}% de {base_amount}"
            row_data["description"] = f"{description} · {share_note}" if description else share_note
            owner_charges_to_create.append(OwnerCharge(**row_data))
    else:
        data["split_by_ownership"] = False
        owner_charges_to_create.append(OwnerCharge(**data))

    for owner_charge in owner_charges_to_create:
        duplicates = duplicate_owner_charge_candidates(session, owner_charge)
        if duplicates and not duplicate_allowed:
            first = owner_charge_to_dict(session, duplicates[0])
            raise HTTPException(
                status_code=409,
                detail=(
                    "Posible duplicado: ya existe un débito "
                    f"{first['concept']} para {first['owner_name']} / "
                    f"{first['property_reference']} período {first['period'] or first['charge_date']} "
                    f"por {first['amount']}. Confirmá si igual querés guardarlo."
                ),
            )

    for owner_charge in owner_charges_to_create:
        session.add(owner_charge)
    session.commit()
    responses = []
    for owner_charge in owner_charges_to_create:
        session.refresh(owner_charge)
        movement = create_cash_movement_for_owner_charge(session, owner_charge)
        response = owner_charge_to_dict(session, owner_charge)
        response["cash_movement"] = cash_movement_to_dict(session, movement) if movement else None
        responses.append(response)

    if len(responses) == 1:
        return responses[0]
    return {
        "created": len(responses),
        "charges": responses,
        "cash_movements": [item["cash_movement"] for item in responses if item.get("cash_movement")],
        "split_by_ownership": True,
    }


@app.post("/owner-charges/{owner_charge_id}/void")
def void_owner_charge_endpoint(
    owner_charge_id: int,
    payload: VoidRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    owner_charge = session.get(OwnerCharge, owner_charge_id)
    if not owner_charge:
        raise not_found("Debito a propietario no encontrado")
    try:
        reversal = void_owner_charge(session, owner_charge, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "status": "anulado",
        "cash_reversal": cash_movement_to_dict(session, reversal) if reversal else None,
    }


@app.post("/reminders/preview")
def reminder_preview(
    payload: ReminderPreviewRequest, session: Session = Depends(get_session)
) -> Dict[str, object]:
    ensure_charges_can_notify(session, payload.charge_ids)
    try:
        preview = build_reminder_message(session, payload.charge_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    person = preview["person"]
    return {
        "person_id": person.id if person else payload.person_id,
        "channel": payload.channel,
        "message": preview["message"],
        "whatsapp_url": preview["whatsapp_url"],
    }


@app.post("/reminders/simulate-send")
def reminder_simulate_send(
    payload: ReminderPreviewRequest, session: Session = Depends(get_session)
) -> Dict[str, object]:
    preview = reminder_preview(payload, session)
    person_id = int(preview["person_id"])
    reminders = []
    for charge_id in payload.charge_ids:
        reminder = Reminder(
            charge_id=charge_id,
            person_id=person_id,
            channel=payload.channel,
            message=str(preview["message"]),
            status="simulado",
            sent_at=datetime.utcnow(),
        )
        session.add(reminder)
        reminders.append(reminder)
    session.commit()
    return {"created": len(reminders), **preview}


@app.post("/public-links")
def create_public_link(
    payload: PublicLinkCreate, session: Session = Depends(get_session)
) -> Dict[str, object]:
    person = session.get(Person, payload.person_id)
    if not person:
        raise not_found("Persona no encontrada")
    ensure_charges_can_notify(session, payload.charge_ids)
    token = uuid4().hex[:18]
    link = PublicPaymentLink(
        token=token,
        person_id=payload.person_id,
        charge_ids_csv=",".join(str(charge_id) for charge_id in payload.charge_ids),
        expires_at=datetime.utcnow() + timedelta(days=payload.days_valid),
    )
    session.add(link)
    session.commit()
    session.refresh(link)
    return {
        "token": token,
        "url": f"http://localhost:5173/public/{token}",
        "expires_at": link.expires_at.isoformat(),
    }


@app.get("/public/{token}")
def public_link(token: str, session: Session = Depends(get_session)) -> Dict[str, object]:
    link = session.exec(
        select(PublicPaymentLink).where(PublicPaymentLink.token == token)
    ).first()
    if not link:
        raise not_found("Link no encontrado")
    if link.expires_at < datetime.utcnow():
        link.status = "expirado"
        session.add(link)
        session.commit()
    person = session.get(Person, link.person_id)
    charge_ids = public_link_charge_ids(link.charge_ids_csv)
    charges = [
        charge_to_dict(session, charge)
        for charge in [session.get(Charge, charge_id) for charge_id in charge_ids]
        if charge
    ]
    return {
        "status": link.status,
        "person": person.model_dump() if person else None,
        "charges": charges,
        "total": money(sum(row["remaining_amount"] for row in charges)),
        "expires_at": link.expires_at.isoformat(),
    }


@app.post("/public/{token}/payment-intent")
def public_payment_intent(
    token: str,
    payload: PaymentIntentCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    link = session.exec(
        select(PublicPaymentLink).where(PublicPaymentLink.token == token)
    ).first()
    if not link:
        raise not_found("Link no encontrado")
    link.status = "intencion_pago"
    session.add(link)
    session.commit()
    return {
        "status": "intencion_pago",
        "message": "Pago simulado registrado. En una integracion real aca impactaria la pasarela.",
        "payer_name": payload.payer_name,
    }


@app.post("/attachments/{entity_type}/{entity_id}")
async def upload_attachment(
    entity_type: str,
    entity_id: int,
    file: UploadFile = File(...),
    notes: str = "",
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    allowed = {"property", "person", "contract", "charge", "payment", "owner_charge", "settlement"}
    if entity_type not in allowed:
        raise HTTPException(status_code=400, detail="Tipo de adjunto invalido")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    folder = os.path.join("uploads", entity_type, str(entity_id))
    os.makedirs(folder, exist_ok=True)
    filename = safe_filename(file.filename or "archivo")
    storage_path = os.path.join(folder, f"{uuid4().hex}_{filename}")
    with open(storage_path, "wb") as target:
        target.write(file_bytes)
    attachment = Attachment(
        entity_type=entity_type,
        entity_id=entity_id,
        filename=filename,
        content_type=file.content_type or "",
        storage_path=storage_path,
        notes=notes,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    audit_log(session, entity_type, entity_id, "attach_file", filename)
    return attachment_to_dict(attachment)


@app.get("/attachments/{entity_type}/{entity_id}")
def list_attachments(
    entity_type: str,
    entity_id: int,
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    attachments = session.exec(
        select(Attachment).where(Attachment.entity_type == entity_type, Attachment.entity_id == entity_id)
    ).all()
    return [attachment_to_dict(item) for item in attachments]


@app.get("/audit-log")
def list_audit_log(
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    rows = session.exec(select(AuditLog)).all()
    if entity_type:
        rows = [row for row in rows if row.entity_type == entity_type]
    if entity_id:
        rows = [row for row in rows if row.entity_id == entity_id]
    return [audit_log_to_dict(row) for row in sorted(rows, key=lambda item: item.created_at, reverse=True)]


@app.get("/settlements/owners")
def list_owner_settlements(
    period: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    settlements = session.exec(select(OwnerSettlement)).all()
    if period:
        settlements = [settlement for settlement in settlements if settlement.period == period]
    return [settlement_to_dict(session, settlement) for settlement in settlements]


@app.post("/settlements/owners/generate")
def generate_settlements(
    payload: SettlementGenerateRequest, session: Session = Depends(get_session)
) -> List[Dict[str, object]]:
    settlements = generate_owner_settlements(session, payload.period)
    return [settlement_to_dict(session, settlement) for settlement in settlements]


@app.get("/settlements/owners/{settlement_id}/liquidation.pdf")
def download_owner_settlement_liquidation(
    settlement_id: int, session: Session = Depends(get_session)
) -> StreamingResponse:
    settlement = session.get(OwnerSettlement, settlement_id)
    if not settlement:
        raise not_found("Liquidacion no encontrada")
    owner = session.get(Person, settlement.owner_id)
    content = settlement_liquidation_pdf(
        settlement=settlement_to_dict(session, settlement),
        owner=person_debt_summary(session, owner) if owner else {},
    )
    return pdf_response(f"liquidacion_{settlement.period}_{settlement.owner_id}.pdf", content)


@app.get("/settlements/owners/{settlement_id}/withdrawal.pdf")
def download_owner_settlement_withdrawal(
    settlement_id: int, session: Session = Depends(get_session)
) -> StreamingResponse:
    settlement = session.get(OwnerSettlement, settlement_id)
    if not settlement:
        raise not_found("Liquidacion no encontrada")
    owner = session.get(Person, settlement.owner_id)
    settlement_data = settlement_to_dict(session, settlement)
    content = cash_withdrawal_pdf(
        movement_id=settlement.id or settlement_id,
        movement_date=settlement.created_at.date().isoformat(),
        concept=f"Retiro/liquidacion propietario {settlement.period}",
        person_name=owner.full_name if owner else "",
        property_reference="Liquidacion mensual / varias fincas",
        amount=float(settlement_data["paid_amount"] or settlement.total_to_transfer),
        origin="settlement",
        notes=f"Comision bancaria: {pdf_money(settlement.bank_transfer_fee)}",
        extra_rows=[
            ("Total liquidacion", pdf_money(settlement.total_to_transfer)),
            ("Retirado registrado", pdf_money(settlement_data["paid_amount"])),
            ("Saldo posterior", f"{pdf_money(settlement_data['balance_after_payment'])} · {str(settlement_data['balance_status']).replace('_', ' ')}"),
        ],
    )
    return pdf_response(f"retiro_{settlement.period}_{settlement.owner_id}.pdf", content)


@app.post("/settlements/owners/{settlement_id}/pay")
def pay_owner_settlement(
    settlement_id: int,
    payload: SettlementPayRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    settlement = session.get(OwnerSettlement, settlement_id)
    if not settlement:
        raise not_found("Liquidacion no encontrada")
    try:
        movement = create_cash_movement_for_owner_settlement(
            session,
            settlement,
            movement_date=payload.movement_date,
            amount=payload.amount,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session.refresh(settlement)
    return {
        "settlement": settlement_to_dict(session, settlement),
        "cash_movement": cash_movement_to_dict(session, movement),
    }


@app.post("/settlements/owners/{settlement_id}/payments/{movement_id}/void")
def void_owner_settlement_payment(
    settlement_id: int,
    movement_id: int,
    payload: VoidRequest,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    settlement = session.get(OwnerSettlement, settlement_id)
    if not settlement:
        raise not_found("Liquidacion no encontrada")
    movement = session.get(CashMovement, movement_id)
    if not movement or movement.origin != "owner_settlement" or movement.origin_id != settlement.id:
        raise not_found("Retiro no encontrado para esta liquidacion")
    try:
        reversal = reverse_cash_movement(session, movement, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remaining_movements = owner_settlement_cash_movements(session, settlement)
    if remaining_movements:
        settlement.status = "emitida"
        settlement.paid_at = max(item.created_at for item in remaining_movements)
    else:
        settlement.status = "borrador"
        settlement.paid_at = None
    session.add(settlement)
    session.commit()
    session.refresh(settlement)
    audit_log(session, "settlement", settlement.id, "void_payment", f"Anulado retiro {movement_id}; reversa {reversal.id}")
    return {
        "settlement": settlement_to_dict(session, settlement),
        "reversal": cash_movement_to_dict(session, reversal),
    }


@app.get("/retention-vouchers")
def list_retention_vouchers(
    period: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    vouchers = session.exec(select(RetentionVoucher)).all()
    if period:
        vouchers = [item for item in vouchers if item.period == period]
    if status and status != "todos":
        vouchers = [item for item in vouchers if item.status == status]
    return [retention_voucher_to_dict(session, item) for item in vouchers]


@app.post("/retention-vouchers")
def create_retention_voucher(
    payload: RetentionVoucherCreate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    contract = session.get(Contract, payload.contract_id)
    if not contract:
        raise not_found("Contrato no encontrado")
    voucher = RetentionVoucher(**payload.model_dump())
    session.add(voucher)
    session.commit()
    session.refresh(voucher)
    audit_log(session, "retention_voucher", voucher.id, "create", f"Resguardo {voucher.source} {voucher.period}")
    return retention_voucher_to_dict(session, voucher)


@app.patch("/retention-vouchers/{voucher_id}")
def update_retention_voucher(
    voucher_id: int,
    payload: RetentionVoucherUpdate,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    voucher = session.get(RetentionVoucher, voucher_id)
    if not voucher:
        raise not_found("Resguardo no encontrado")
    voucher.status = payload.status
    voucher.received_at = payload.received_at
    voucher.notes = payload.notes
    session.add(voucher)
    session.commit()
    session.refresh(voucher)
    audit_log(session, "retention_voucher", voucher.id, "update", f"Resguardo {voucher.status}")
    return retention_voucher_to_dict(session, voucher)


@app.get("/reports/tenant-collections")
def tenant_collections_report(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    tenant_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    return payment_allocation_report_rows(session, from_date=from_date, to_date=to_date, tenant_id=tenant_id)


@app.get("/reports/commission-iva")
def commission_iva_report(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    owner_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in payment_allocation_report_rows(session, from_date=from_date, to_date=to_date, owner_id=owner_id):
        if float(row.get("commission") or 0) <= 0 and float(row.get("iva") or 0) <= 0:
            continue
        owner_items = [item for item in row["owners"] if not owner_id or item["owner_id"] == owner_id]
        for owner in owner_items:
            rows.append(
                {
                    **{key: value for key, value in row.items() if key != "owners"},
                    "owner_id": owner["owner_id"],
                    "owner_name": owner["owner_name"],
                    "owner_document": owner["owner_document"],
                    "owner_percentage": owner["owner_percentage"],
                    "owner_amount": owner["owner_amount"],
                    "commission": owner["commission"],
                    "iva": owner["iva"],
                    "irpf": owner["irpf"],
                    "total_billed": money(float(owner["commission"]) + float(owner["iva"])),
                }
            )
    return rows


@app.get("/reports/tenant-debtors")
def tenant_debtors_report_json(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    tenant_id: Optional[int] = Query(default=None),
    owner_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    charges = session.exec(select(Charge)).all()
    refresh_all_charge_statuses(session, charges)
    rows: List[Dict[str, object]] = []
    for charge in charges:
        if charge.status == "pagado" or remaining_for_charge(session, charge) <= 0:
            continue
        if tenant_id and charge.responsible_person_id != tenant_id:
            continue
        if not in_optional_date_range(charge.due_date, from_date, to_date):
            continue
        contract = session.get(Contract, charge.contract_id)
        if owner_id and contract and not property_owner_shares_or_primary(session, contract.property_id, owner_id):
            continue
        charge_row = charge_to_dict(session, charge)
        owners = []
        if contract:
            for share in property_owner_shares_or_primary(session, contract.property_id):
                owner = session.get(Person, share.owner_id)
                owners.append(
                    {
                        "owner_id": share.owner_id,
                        "owner_name": owner.full_name if owner else "",
                        "owner_percentage": money(share.percentage),
                    }
                )
        charge_row["owners"] = owners
        rows.append(charge_row)
    return sorted(rows, key=lambda row: (str(row["tenant_name"]), str(row["due_date"])))


@app.get("/reports/owner-balances")
def owner_balances_report(
    until_date: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    owners = session.exec(select(Person).where(Person.person_type.in_(["owner", "both"]))).all()
    rows: List[Dict[str, object]] = []
    for owner in owners:
        settlements = session.exec(select(OwnerSettlement).where(OwnerSettlement.owner_id == owner.id)).all()
        total_liquidated = 0.0
        total_paid = 0.0
        last_period = ""
        for settlement in settlements:
            if until_date and settlement.created_at.date() > until_date:
                continue
            last_period = max(last_period, settlement.period)
            total_liquidated += settlement.total_to_transfer
            movements = session.exec(
                select(CashMovement).where(
                    CashMovement.origin == "owner_settlement",
                    CashMovement.origin_id == settlement.id,
                    CashMovement.status == "confirmado",
                )
            ).all()
            total_paid += sum(movement.amount for movement in movements)
        rows.append(
            {
                "owner_id": owner.id,
                "owner_name": owner.full_name,
                "owner_document": owner.document,
                "owner_legacy_code": owner.legacy_code,
                "last_period": last_period,
                "total_liquidated": money(total_liquidated),
                "total_paid": money(total_paid),
                "balance": money(total_liquidated - total_paid),
            }
        )
    return sorted(rows, key=lambda row: str(row["owner_name"]))


@app.get("/reports/owner-rents-by-document")
def owner_rents_by_document_report(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    owner_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for row in payment_allocation_report_rows(
        session,
        from_date=from_date,
        to_date=to_date,
        owner_id=owner_id,
        only_rent=True,
    ):
        owner_items = [item for item in row["owners"] if not owner_id or item["owner_id"] == owner_id]
        for owner in owner_items:
            rows.append(
                {
                    "payment_id": row["payment_id"],
                    "payment_date": row["payment_date"],
                    "period": row["accrual_period"] or row["period"],
                    "owner_id": owner["owner_id"],
                    "owner_name": owner["owner_name"],
                    "owner_document": owner["owner_document"],
                    "owner_legacy_code": owner["owner_legacy_code"],
                    "tenant_name": row["tenant_name"],
                    "tenant_legacy_code": row["tenant_legacy_code"],
                    "property_reference": row["property_reference"],
                    "property_address": row["property_address"],
                    "owner_percentage": owner["owner_percentage"],
                    "gross_amount": row["amount"],
                    "owner_amount": owner["owner_amount"],
                    "irpf": owner["irpf"],
                }
            )
    return sorted(rows, key=lambda item: (str(item["owner_name"]), str(item["period"]), str(item["payment_date"])))


@app.get("/reports/tenant-debtors.pdf")
def download_tenant_debtors_report(session: Session = Depends(get_session)) -> StreamingResponse:
    charges = session.exec(select(Charge)).all()
    refresh_all_charge_statuses(session, charges)
    rows = [
        charge_to_dict(session, charge)
        for charge in charges
        if charge.status != "pagado" and remaining_for_charge(session, charge) > 0
    ]
    rows = sorted(rows, key=lambda item: (str(item.get("tenant_name") or ""), str(item.get("property_address") or ""), str(item.get("due_date") or "")))
    content = tenant_debtors_report_pdf(rows=rows, generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M"))
    return pdf_response("inquilinos_deudores.pdf", content)


@app.get("/reports/commission-iva.pdf")
def download_commission_iva_report(
    period: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    settlements = list_owner_settlements(period=period, session=session)
    rows: List[Dict[str, object]] = []
    for settlement in settlements:
        for line in settlement.get("lines", []):
            if float(line.get("commission") or 0) <= 0 and float(line.get("iva") or 0) <= 0:
                continue
            rows.append(
                {
                    "period": settlement["period"],
                    "owner_name": settlement["owner_name"],
                    "payment_date": line.get("payment_date") or line.get("period"),
                    "commission": line.get("commission"),
                    "iva": line.get("iva"),
                }
            )
    content = commission_iva_report_pdf(
        rows=rows,
        period=period or "",
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    return pdf_response(f"comision_iva_{period or 'todos'}.pdf", content)


def csv_response(filename: str, headers: List[str], rows: List[Dict[str, object]]) -> StreamingResponse:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=headers)
    writer.writeheader()
    for row in rows:
        writer.writerow({header: row.get(header, "") for header in headers})
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/exports/charges.csv")
def export_charges(session: Session = Depends(get_session)) -> StreamingResponse:
    rows = list_charges(status=None, person_id=None, search="", session=session)
    headers = [
        "id",
        "tenant_name",
        "property_reference",
        "concept",
        "amount",
        "paid_amount",
        "remaining_amount",
        "due_date",
        "status",
    ]
    return csv_response("deudas.csv", headers, rows)


@app.get("/exports/settlements.csv")
def export_settlements(session: Session = Depends(get_session)) -> StreamingResponse:
    rows = list_owner_settlements(period=None, session=session)
    headers = [
        "id",
        "owner_name",
        "period",
        "income",
        "expenses",
        "commission",
        "iva",
        "irpf",
        "bank_transfer_fee",
        "total_to_transfer",
        "status",
    ]
    return csv_response("liquidaciones.csv", headers, rows)


@app.get("/exports/accounting.csv")
def export_accounting(period: Optional[str] = Query(default=None), session: Session = Depends(get_session)) -> StreamingResponse:
    settlements = list_owner_settlements(period=period, session=session)
    rows: List[Dict[str, object]] = []
    for settlement in settlements:
        for line in settlement.get("lines", []):
            rows.append(
                {
                    "period": settlement["period"],
                    "owner_name": settlement["owner_name"],
                    "property_reference": line["property_reference"],
                    "tenant_name": line["tenant_name"],
                    "concept": line["concept"],
                    "accrual_period": line["accrual_period"],
                    "payment_date": line["payment_date"],
                    "owner_percentage": line["owner_percentage"],
                    "income": line["owner_amount"],
                    "expense": line["expense_amount"],
                    "commission": line["commission"],
                    "iva": line["iva"],
                    "irpf": line["irpf"],
                    "net_amount": line["net_amount"],
                }
            )
    headers = [
        "period",
        "owner_name",
        "property_reference",
        "tenant_name",
        "concept",
        "accrual_period",
        "payment_date",
        "owner_percentage",
        "income",
        "expense",
        "commission",
        "iva",
        "irpf",
        "net_amount",
    ]
    return csv_response("contabilidad.csv", headers, rows)


@app.get("/exports/dgi-irpf.csv")
def export_dgi_irpf(period: Optional[str] = Query(default=None), session: Session = Depends(get_session)) -> StreamingResponse:
    settlements = list_owner_settlements(period=period, session=session)
    rows: List[Dict[str, object]] = []
    for item in settlements:
        taxable_lines = [line for line in item.get("lines", []) if line.get("irpf", 0) > 0]
        taxable_income = money(sum(float(line["owner_amount"]) for line in taxable_lines))
        irpf_withheld = money(sum(float(line["irpf"]) for line in taxable_lines))
        if irpf_withheld <= 0:
            continue
        rows.append(
            {
                "period": item["period"],
                "owner_name": item["owner_name"],
                "taxable_income": taxable_income,
                "irpf_withheld": irpf_withheld,
                "source_lines": len(taxable_lines),
                "status": item["status"],
            }
        )
    return csv_response("dgi_irpf.csv", ["period", "owner_name", "taxable_income", "irpf_withheld", "source_lines", "status"], rows)
