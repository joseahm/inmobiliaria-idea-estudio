from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class PersonCreate(BaseModel):
    legacy_code: str = ""
    full_name: str
    document: str = ""
    phone: str = ""
    mobile: str = ""
    email: str = ""
    address: str = ""
    person_type: str = "tenant"
    bank_name: str = ""
    bank_account: str = ""
    bank_transfer_commission_applies: bool = False
    bank_transfer_commission_amount: float = 65.0


class PropertyCreate(BaseModel):
    legacy_code: str = ""
    reference: str
    address: str
    door_number: str = ""
    unit_number: str = ""
    padron: str = ""
    occupancy_status: str = "alquilada"
    property_type: str = ""
    destination: str = ""
    ute_account: str = ""
    ose_account: str = ""
    taxes_account: str = ""
    sanitation_account: str = ""
    notes: str = ""
    owner_id: Optional[int] = None
    owner_percentage: float = 100.0
    owner_shares: List["PropertyOwnerShareCreate"] = Field(default_factory=list)


class PropertyOwnerShareCreate(BaseModel):
    owner_id: int
    percentage: float
    is_primary: bool = False
    irpf_applies: bool = True


class PropertyAccountUpdate(BaseModel):
    provider: str
    account: str


class PropertyServiceAccountCreate(BaseModel):
    service_type: str
    provider: str = ""
    account_number: str = ""
    portal_url: str = ""
    reference_data: str = ""
    payer: str = "tenant"
    active: bool = True
    notes: str = ""


class PropertyVisitCreate(BaseModel):
    property_id: int
    interested_name: str
    interested_phone: str = ""
    interested_email: str = ""
    visit_at: str
    status: str = "coordinada"
    contact_message: str = ""
    notification_phone: str = ""
    reminder_minutes_before: int = 60
    notes: str = ""


class InvoiceDocumentCreate(BaseModel):
    provider: str
    account_number: str = ""
    property_id: Optional[int] = None
    service_account_id: Optional[int] = None
    responsible_type: str = "tenant"
    amount: float
    issued_date: Optional[date] = None
    due_date: date
    period: str = ""
    consumption_period_start: Optional[date] = None
    consumption_period_end: Optional[date] = None
    reference_number: str = ""
    meter_number: str = ""
    consumption_amount: float = 0
    consumption_unit: str = ""
    status: str = "pendiente"
    source: str = "manual"
    notes: str = ""


class InvoiceDocumentUpdate(BaseModel):
    provider: str
    account_number: str = ""
    property_id: Optional[int] = None
    service_account_id: Optional[int] = None
    responsible_type: str = "tenant"
    amount: float
    issued_date: Optional[date] = None
    due_date: date
    period: str = ""
    consumption_period_start: Optional[date] = None
    consumption_period_end: Optional[date] = None
    reference_number: str = ""
    meter_number: str = ""
    consumption_amount: float = 0
    consumption_unit: str = ""
    status: str = "pendiente"
    source: str = "manual"
    notes: str = ""


class EmailInboxConfigCreate(BaseModel):
    name: str
    email_address: str
    provider: str = "imap"
    host: str = ""
    port: int = 993
    username: str = ""
    secret_env_var: str = ""
    folder: str = "INBOX"
    active: bool = True
    notes: str = ""


class EmailInboxConfigUpdate(BaseModel):
    name: str
    email_address: str
    provider: str = "imap"
    host: str = ""
    port: int = 993
    username: str = ""
    secret_env_var: str = ""
    folder: str = "INBOX"
    active: bool = True
    notes: str = ""


class EmailProviderRuleCreate(BaseModel):
    provider: str
    sender_pattern: str = ""
    subject_keywords: str = ""
    active: bool = True


class ContractCreate(BaseModel):
    legacy_code: str = ""
    property_id: int
    tenant_id: int
    tenant_ids: List[int] = Field(default_factory=list)
    start_date: date
    end_date: Optional[date] = None
    billing_end_date: Optional[date] = None
    rent_amount: float
    payment_type: str = "adelantado"
    rent_payment_timing: str = "adelantado"
    guarantee_type: str = "sin_garantia"
    guarantee_provider: str = ""
    guarantee_percent: float = 0.0
    rent_regime: str = "libre_contratacion"
    reajustment_index: str = "libre"
    next_reajustment_date: Optional[date] = None
    commission_percent: float = 8.0
    commission_on_rent: bool = True
    commission_on_other_charges: bool = False
    commission_iva_applies: bool = True
    irpf_applies: bool = True
    irpf_percent: float = 10.5
    payment_origin: str = "normal"
    tenant_tax_role: str = "normal"
    resguardo_required: bool = False
    active: bool = True
    create_first_rent_charge: bool = False
    first_rent_amount: float = 0.0
    first_rent_period: str = ""
    first_rent_due_date: Optional[date] = None


class ContractReajustmentPreviewRequest(BaseModel):
    at_date: Optional[date] = None
    factor_override: Optional[float] = None
    channel: str = "whatsapp"


class ContractReajustmentApplyRequest(BaseModel):
    at_date: date
    factor_override: Optional[float] = None
    update_next_reajustment_date: bool = True


class ChargeCreate(BaseModel):
    contract_id: int
    responsible_person_id: Optional[int] = None
    responsible_type: str = "tenant"
    concept: str
    description: str = ""
    amount: float
    due_date: date
    period: str = ""
    accrual_period: str = ""
    settlement_period: str = ""
    notify_tenant: bool = False
    notify_always: bool = False
    consumption_period_start: Optional[date] = None
    consumption_period_end: Optional[date] = None
    apply_proration: bool = False
    proration_base_amount: Optional[float] = None
    create_owner_charge_for_proration_difference: bool = False
    proration_difference_paid_by_agency: bool = False
    create_owner_charge: bool = False
    owner_charge_concept: str = ""
    owner_charge_paid_by_agency: bool = False
    owner_charge_split_by_ownership: bool = True
    allow_duplicate: bool = False
    origin: str = "manual"


class ChargeUpdate(BaseModel):
    contract_id: int
    responsible_person_id: Optional[int] = None
    responsible_type: str = "tenant"
    concept: str
    description: str = ""
    amount: float
    due_date: date
    period: str = ""
    accrual_period: str = ""
    settlement_period: str = ""
    notify_tenant: bool = False
    notify_always: bool = False
    consumption_period_start: Optional[date] = None
    consumption_period_end: Optional[date] = None
    apply_proration: bool = False
    proration_base_amount: Optional[float] = None
    create_owner_charge_for_proration_difference: bool = False
    proration_difference_paid_by_agency: bool = False
    create_owner_charge: bool = False
    owner_charge_concept: str = ""
    owner_charge_paid_by_agency: bool = False
    owner_charge_split_by_ownership: bool = True
    allow_duplicate: bool = False
    origin: str = "manual"


class BulkMonthlyRequest(BaseModel):
    period: str
    due_day: int = 10


class AllocationCreate(BaseModel):
    charge_id: int
    amount: float


class PaymentCreate(BaseModel):
    person_id: int
    amount: float
    payment_date: date
    method: str = "transferencia"
    reference: str = ""
    notes: str = ""
    allocations: List[AllocationCreate] = []


class AdvanceRentPaymentCreate(BaseModel):
    contract_id: int
    months: List[str]
    payment_date: date
    method: str = "transferencia"
    reference: str = ""
    notes: str = ""
    due_day: int = 10


class OwnerChargeCreate(BaseModel):
    owner_id: int
    property_id: int
    concept: str
    description: str = ""
    amount: float
    charge_date: date
    period: str = ""
    period_from: Optional[date] = None
    period_to: Optional[date] = None
    paid_by_agency: bool = True
    generates_commission: bool = False
    commission_percent: float = 0
    split_by_ownership: bool = False
    allow_duplicate: bool = False


class CashMovementCreate(BaseModel):
    movement_date: date
    movement_type: str
    amount: float
    concept: str
    person_id: Optional[int] = None
    property_id: Optional[int] = None
    notes: str = ""


class AllocationRequest(BaseModel):
    allocations: List[AllocationCreate]


class PaymentReallocationRequest(BaseModel):
    allocations: List[AllocationCreate]
    corrected_amount: Optional[float] = None
    reason: str = "Correccion de imputacion operativa"


class VoidRequest(BaseModel):
    reason: str = "Anulacion operativa"


class ReminderPreviewRequest(BaseModel):
    person_id: Optional[int] = None
    charge_ids: List[int]
    channel: str = "whatsapp"


class PublicLinkCreate(BaseModel):
    person_id: int
    charge_ids: List[int]
    days_valid: int = 14


class PaymentIntentCreate(BaseModel):
    payer_name: str = ""
    message: str = ""


class SettlementGenerateRequest(BaseModel):
    period: str


class SettlementPayRequest(BaseModel):
    movement_date: date = Field(default_factory=date.today)
    notes: str = ""


class RetentionVoucherCreate(BaseModel):
    contract_id: int
    owner_id: Optional[int] = None
    period: str
    source: str = "CEDE"
    amount: float = 0
    due_date: Optional[date] = None
    status: str = "pendiente"
    received_at: Optional[date] = None
    notes: str = ""


class RetentionVoucherUpdate(BaseModel):
    status: str = "pendiente"
    received_at: Optional[date] = None
    notes: str = ""
