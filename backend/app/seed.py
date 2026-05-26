from datetime import date, timedelta

from sqlmodel import Session, select

from .config import get_settings
from .models import (
    CashMovement,
    Charge,
    Contract,
    EmailInboxConfig,
    EmailProviderRule,
    OwnerCharge,
    Payment,
    PaymentAllocation,
    Person,
    Property,
    PropertyOwnerShare,
    PropertyServiceAccount,
    InvoiceDocument,
)
from .services import refresh_all_charge_statuses


def seed_demo_data(session: Session) -> None:
    if session.exec(select(Person)).first():
        return

    settings = get_settings()

    owner_1 = Person(
        legacy_code="1",
        full_name="Ana Rodriguez",
        document="3.456.789-1",
        mobile="+598 99 111 222",
        email="ana@example.com",
        address="Bulevar Artigas 1200",
        person_type="owner",
    )
    owner_2 = Person(
        legacy_code="2",
        full_name="Carlos Pereira",
        document="2.987.654-3",
        mobile="+598 98 333 444",
        email="carlos@example.com",
        address="Av. Italia 3200",
        person_type="owner",
    )
    tenant_1 = Person(
        legacy_code="101",
        full_name="Lucia Fernandez",
        document="4.111.222-5",
        mobile="+598 94 555 666",
        email="lucia@example.com",
        address="Mercedes 1432",
        person_type="tenant",
    )
    tenant_2 = Person(
        legacy_code="102",
        full_name="Martin Silva",
        document="5.444.333-2",
        mobile="+598 91 777 888",
        email="martin@example.com",
        address="Rivera 2850",
        person_type="tenant",
    )
    tenant_3 = Person(
        legacy_code="103",
        full_name="Sofia Martinez",
        document="6.222.555-8",
        mobile="+598 92 111 000",
        email="sofia@example.com",
        address="Canelones 980",
        person_type="tenant",
    )
    session.add_all([owner_1, owner_2, tenant_1, tenant_2, tenant_3])
    session.commit()
    for person in [owner_1, owner_2, tenant_1, tenant_2, tenant_3]:
        session.refresh(person)

    property_1 = Property(
        legacy_code="11",
        reference="FIN-001",
        address="Apartamento Pocitos - Av. Brasil 2450",
        padron="123456",
        occupancy_status="alquilada",
        property_type="apartamento",
        destination="vivienda",
        ute_account="UTE-11001",
        ose_account="OSE-22001",
        taxes_account="IMM-33001",
        notes="Unidad con gastos comunes mensuales.",
    )
    property_2 = Property(
        legacy_code="12",
        reference="FIN-002",
        address="Casa Parque Batlle - Garibaldi 1900",
        padron="654321",
        occupancy_status="alquilada",
        property_type="casa",
        destination="vivienda",
        ute_account="UTE-11002",
        ose_account="OSE-22002",
        taxes_account="IMM-33002",
        notes="Inquilino paga tributos directo; se controla.",
    )
    property_3 = Property(
        legacy_code="13",
        reference="FIN-003",
        address="Padron matriz Centro - Colonia 1200 Unidad 2",
        padron="888777",
        occupancy_status="alquilada",
        property_type="apartamento",
        destination="vivienda",
        ute_account="UTE-11003",
        ose_account="OSE-AGUA-MATRIZ",
        taxes_account="IMM-33003",
        notes="Agua compartida entre tres unidades.",
    )
    session.add_all([property_1, property_2, property_3])
    session.commit()
    for property_obj in [property_1, property_2, property_3]:
        session.refresh(property_obj)

    session.add_all(
        [
            PropertyServiceAccount(property_id=property_1.id or 0, service_type="UTE", provider="UTE", account_number="UTE-11001", payer="tenant", active=True),
            PropertyServiceAccount(property_id=property_1.id or 0, service_type="OSE", provider="OSE", account_number="OSE-22001", payer="tenant", active=True),
            PropertyServiceAccount(property_id=property_1.id or 0, service_type="TRIBUTOS", provider="IMM", account_number="IMM-33001", payer="owner", active=True),
            PropertyServiceAccount(property_id=property_2.id or 0, service_type="UTE", provider="UTE", account_number="UTE-11002", payer="tenant", active=True),
            PropertyServiceAccount(property_id=property_2.id or 0, service_type="OSE", provider="OSE", account_number="OSE-22002", payer="tenant", active=True),
            PropertyServiceAccount(property_id=property_3.id or 0, service_type="OSE", provider="OSE", account_number="OSE-AGUA-MATRIZ", payer="agency", active=True, notes="Agua matriz repartida entre unidades."),
            PropertyServiceAccount(property_id=property_3.id or 0, service_type="SANEAMIENTO", provider="IMM", account_number="SAN-88003", payer="owner", active=True),
        ]
    )
    session.commit()

    session.add_all(
        [
            PropertyOwnerShare(
                property_id=property_1.id or 0, owner_id=owner_1.id or 0, percentage=100, is_primary=True
            ),
            PropertyOwnerShare(
                property_id=property_2.id or 0, owner_id=owner_2.id or 0, percentage=100, is_primary=True
            ),
            PropertyOwnerShare(
                property_id=property_3.id or 0, owner_id=owner_1.id or 0, percentage=50, is_primary=True
            ),
            PropertyOwnerShare(
                property_id=property_3.id or 0, owner_id=owner_2.id or 0, percentage=50
            ),
        ]
    )
    session.commit()

    today = date.today()
    period = f"{today.year}-{today.month:02d}"
    next_month = today.month + 1 if today.month < 12 else 1
    next_year = today.year if today.month < 12 else today.year + 1
    next_period = f"{next_year}-{next_month:02d}"
    previous_month = today.month - 1 if today.month > 1 else 12
    previous_year = today.year if today.month > 1 else today.year - 1
    previous_period = f"{previous_year}-{previous_month:02d}"
    start = date(today.year, max(today.month - 2, 1), 1)
    contract_1 = Contract(
        legacy_code="5001",
        property_id=property_1.id or 0,
        tenant_id=tenant_1.id or 0,
        start_date=start,
        rent_amount=32000,
        rent_payment_timing="adelantado",
        commission_percent=settings.default_commission_percent,
        irpf_applies=True,
        irpf_percent=settings.default_irpf_percent,
        payment_origin="normal",
    )
    contract_2 = Contract(
        legacy_code="5002",
        property_id=property_2.id or 0,
        tenant_id=tenant_2.id or 0,
        start_date=start,
        rent_amount=28500,
        rent_payment_timing="vencido",
        commission_percent=7,
        irpf_applies=True,
        irpf_percent=settings.default_irpf_percent,
        payment_origin="ANDA",
    )
    contract_3 = Contract(
        legacy_code="5003",
        property_id=property_3.id or 0,
        tenant_id=tenant_3.id or 0,
        start_date=start,
        rent_amount=22000,
        rent_payment_timing="adelantado",
        commission_percent=settings.default_commission_percent,
        irpf_applies=False,
        irpf_percent=settings.default_irpf_percent,
        payment_origin="normal",
    )
    session.add_all([contract_1, contract_2, contract_3])
    session.commit()
    for contract in [contract_1, contract_2, contract_3]:
        session.refresh(contract)

    charges = [
        Charge(
            contract_id=contract_1.id or 0,
            responsible_person_id=tenant_1.id or 0,
            concept="ALQUILER",
            description="Alquiler del mes actual",
            amount=32000,
            due_date=today.replace(day=10) if today.day > 10 else today + timedelta(days=5),
            period=period,
            accrual_period=period,
            settlement_period=period,
            origin="recurrente",
        ),
        Charge(
            contract_id=contract_1.id or 0,
            responsible_person_id=tenant_1.id or 0,
            concept="GASTOS_COMUNES",
            description="Gastos comunes Torre Sur",
            amount=4800,
            due_date=today - timedelta(days=6),
            period=period,
            accrual_period=period,
            settlement_period=period,
            origin="manual",
        ),
        Charge(
            contract_id=contract_2.id or 0,
            responsible_person_id=tenant_2.id or 0,
            concept="UTE",
            description="Factura UTE controlada por administracion",
            amount=2300,
            due_date=today + timedelta(days=4),
            period=period,
            accrual_period=period,
            settlement_period=period,
            origin="manual",
        ),
        Charge(
            contract_id=contract_3.id or 0,
            responsible_person_id=tenant_3.id or 0,
            concept="OSE",
            description="Agua padron matriz dividida entre unidades",
            amount=500,
            due_date=today - timedelta(days=2),
            period=period,
            accrual_period=period,
            settlement_period=period,
            origin="manual",
        ),
        Charge(
            contract_id=contract_3.id or 0,
            responsible_person_id=tenant_3.id or 0,
            concept="ALQUILER",
            description="Alquiler mes actual finca con dos propietarios 50/50",
            amount=22000,
            due_date=today + timedelta(days=8),
            period=period,
            accrual_period=period,
            settlement_period=period,
            origin="recurrente",
        ),
        Charge(
            contract_id=contract_3.id or 0,
            responsible_person_id=tenant_3.id or 0,
            concept="ALQUILER",
            description="Alquiler mes siguiente pagable adelantado",
            amount=22000,
            due_date=date(next_year, next_month, 10),
            period=next_period,
            accrual_period=next_period,
            settlement_period=next_period,
            origin="recurrente",
        ),
        Charge(
            contract_id=contract_2.id or 0,
            responsible_person_id=tenant_2.id or 0,
            concept="ALQUILER",
            description="Saldo alquiler mes anterior",
            amount=28500,
            due_date=today - timedelta(days=20),
            period=previous_period,
            accrual_period=previous_period,
            settlement_period=period,
            origin="recurrente",
        ),
    ]
    session.add_all(charges)
    session.commit()
    for charge in charges:
        session.refresh(charge)

    payment = Payment(
        person_id=tenant_1.id or 0,
        amount=16000,
        payment_date=today,
        method="transferencia",
        reference="BROU parcial Lucia",
        notes="Pago parcial del alquiler.",
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    session.add(
        PaymentAllocation(
            payment_id=payment.id or 0,
            charge_id=charges[0].id or 0,
            amount=16000,
        )
    )
    session.commit()
    session.add(
        CashMovement(
            movement_date=today,
            movement_type="entrada",
            amount=16000,
            concept="Pago de inquilino",
            person_id=tenant_1.id or 0,
            origin="payment",
            origin_id=payment.id or 0,
            notes="BROU parcial Lucia",
        )
    )
    advance_payment = Payment(
        person_id=tenant_3.id or 0,
        amount=44000,
        payment_date=today,
        method="transferencia",
        reference="BROU Sofia dos meses",
        notes="Pago de dos alquileres: mes actual y mes siguiente.",
    )
    session.add(advance_payment)
    session.commit()
    session.refresh(advance_payment)
    session.add_all(
        [
            PaymentAllocation(
                payment_id=advance_payment.id or 0,
                charge_id=charges[4].id or 0,
                amount=22000,
            ),
            PaymentAllocation(
                payment_id=advance_payment.id or 0,
                charge_id=charges[5].id or 0,
                amount=22000,
            ),
        ]
    )
    session.add(
        CashMovement(
            movement_date=today,
            movement_type="entrada",
            amount=44000,
            concept="Pago de inquilino",
            person_id=tenant_3.id or 0,
            origin="payment",
            origin_id=advance_payment.id or 0,
            notes="BROU Sofia dos meses",
        )
    )
    credit_payment = Payment(
        person_id=tenant_2.id or 0,
        amount=35000,
        payment_date=today,
        method="efectivo",
        reference="Caja Martin saldo y adelanto",
        notes="Cancela saldo anterior y deja saldo a favor sin imputar.",
    )
    session.add(credit_payment)
    session.commit()
    session.refresh(credit_payment)
    session.add(
        PaymentAllocation(
            payment_id=credit_payment.id or 0,
            charge_id=charges[6].id or 0,
            amount=28500,
        )
    )
    session.add(
        CashMovement(
            movement_date=today,
            movement_type="entrada",
            amount=35000,
            concept="Pago de inquilino",
            person_id=tenant_2.id or 0,
            origin="payment",
            origin_id=credit_payment.id or 0,
            notes="Queda saldo sin imputar: 6500",
        )
    )
    owner_charge = OwnerCharge(
        owner_id=owner_1.id or 0,
        property_id=property_1.id or 0,
        concept="CONTRIBUCION",
        description="Contribucion inmobiliaria pagada por la administracion",
        amount=3200,
        charge_date=today,
        period=period,
        paid_by_agency=True,
        generates_commission=True,
        commission_percent=3,
    )
    session.add(owner_charge)
    session.commit()
    session.refresh(owner_charge)
    session.add(
        CashMovement(
            movement_date=today,
            movement_type="salida",
            amount=owner_charge.amount,
            concept=f"Gasto propietario: {owner_charge.concept}",
            person_id=owner_1.id or 0,
            property_id=property_1.id or 0,
            origin="owner_charge",
            origin_id=owner_charge.id or 0,
            notes=owner_charge.description,
        )
    )
    shared_owner_charge = OwnerCharge(
        owner_id=owner_1.id or 0,
        property_id=property_3.id or 0,
        concept="SANEAMIENTO",
        description="Saneamiento finca con dos propietarios, repartido 50/50",
        amount=6000,
        charge_date=today,
        period=period,
        paid_by_agency=True,
        generates_commission=True,
        commission_percent=3,
        split_by_ownership=True,
    )
    session.add(shared_owner_charge)
    session.commit()
    session.refresh(shared_owner_charge)
    session.add(
        CashMovement(
            movement_date=today,
            movement_type="salida",
            amount=shared_owner_charge.amount,
            concept=f"Gasto propietario: {shared_owner_charge.concept}",
            property_id=property_3.id or 0,
            origin="owner_charge",
            origin_id=shared_owner_charge.id or 0,
            notes=shared_owner_charge.description,
        )
    )
    session.add_all(
        [
            EmailInboxConfig(
                name="Correo central de facturas",
                email_address=settings.invoices_email_address,
                provider="imap",
                host=settings.invoices_email_host,
                port=993,
                username=settings.invoices_email_username,
                secret_env_var=settings.invoices_email_secret_env_var,
                folder=settings.invoices_email_folder,
                active=True,
                notes="Correo de prueba configurado desde backend/.env.",
            ),
            InvoiceDocument(
                provider="UTE",
                account_number="UTE-11001",
                property_id=property_1.id or 0,
                service_account_id=1,
                responsible_type="tenant",
                amount=3368,
                due_date=today + timedelta(days=12),
                period=period,
                status="pendiente",
                source="email",
                charge_id=None,
                notes="Factura recibida por correo central pendiente de convertir en deuda.",
            ),
            InvoiceDocument(
                provider="SANEAMIENTO",
                account_number="SAN-88003",
                property_id=property_3.id or 0,
                service_account_id=7,
                responsible_type="owner",
                amount=6000,
                due_date=today + timedelta(days=15),
                period=period,
                status="pendiente",
                source="email",
                owner_charge_id=shared_owner_charge.id,
                notes="Factura asociada a gasto propietario repartido.",
            ),
        ]
    )
    session.commit()
    inbox = session.exec(select(EmailInboxConfig)).first()
    if inbox and inbox.id:
        session.add_all(
            [
                EmailProviderRule(inbox_id=inbox.id, provider="UTE", sender_pattern="ute", subject_keywords="factura", active=True),
                EmailProviderRule(inbox_id=inbox.id, provider="OSE", sender_pattern="ose", subject_keywords="factura", active=True),
                EmailProviderRule(inbox_id=inbox.id, provider="GASTOS_COMUNES", sender_pattern="administracion", subject_keywords="gastos", active=True),
            ]
        )
        session.commit()
    refresh_all_charge_statuses(session, charges)
