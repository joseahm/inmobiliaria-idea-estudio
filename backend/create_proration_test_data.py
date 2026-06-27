from __future__ import annotations

from datetime import date, datetime

from sqlmodel import Session, select

from app.database import engine
from app.models import (
    Contract,
    ContractTenant,
    InvoiceDocument,
    Person,
    Property,
    PropertyOwnerShare,
    PropertyServiceAccount,
)


OWNER_NAME = "TEST PRORRATEO - Propietaria"


SCENARIOS = [
    {
        "key": "16",
        "tenant": "TEST PRORRATEO - Inquilino 16 dias",
        "property": "TEST-PRORR-16",
        "address": "Finca prueba prorrateo 16 dias",
        "account": "OSE-TEST-PRORR-16",
        "contract_start": date(2026, 5, 10),
        "consumption_start": date(2026, 4, 24),
        "consumption_end": date(2026, 5, 25),
        "amount": 2126,
        "expected": "16/32 dias => deuda inquilino $1.063",
    },
    {
        "key": "TODO",
        "tenant": "TEST PRORRATEO - Inquilino periodo completo",
        "property": "TEST-PRORR-TODO",
        "address": "Finca prueba prorrateo periodo completo",
        "account": "OSE-TEST-PRORR-TODO",
        "contract_start": date(2026, 4, 24),
        "consumption_start": date(2026, 4, 24),
        "consumption_end": date(2026, 5, 25),
        "amount": 2126,
        "expected": "32/32 dias => deuda inquilino $2.126",
    },
    {
        "key": "CERO",
        "tenant": "TEST PRORRATEO - Inquilino fuera periodo",
        "property": "TEST-PRORR-CERO",
        "address": "Finca prueba prorrateo fuera de periodo",
        "account": "OSE-TEST-PRORR-CERO",
        "contract_start": date(2026, 5, 28),
        "consumption_start": date(2026, 5, 10),
        "consumption_end": date(2026, 5, 25),
        "amount": 1063,
        "expected": "0/16 dias => deuda inquilino $0",
    },
]


def find_person(session: Session, full_name: str) -> Person | None:
    return session.exec(select(Person).where(Person.full_name == full_name)).first()


def get_or_create_person(session: Session, full_name: str, person_type: str) -> Person:
    person = find_person(session, full_name)
    if person:
        return person
    person = Person(
        legacy_code=f"TEST-{full_name[-10:].replace(' ', '-')}",
        full_name=full_name,
        document=f"TEST-{abs(hash(full_name)) % 100000}",
        mobile="+598 99 000 000",
        email=f"{full_name.lower().replace(' ', '.').replace('-', '')}@test.local",
        person_type=person_type,
    )
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


def get_or_create_property(session: Session, scenario: dict[str, object], owner: Person) -> Property:
    reference = str(scenario["property"])
    property_obj = session.exec(select(Property).where(Property.reference == reference)).first()
    if not property_obj:
        property_obj = Property(
            legacy_code=reference,
            reference=reference,
            address=str(scenario["address"]),
            door_number="100",
            unit_number=str(scenario["key"]),
            padron=f"PAD-{reference}",
            occupancy_status="alquilada",
            property_type="Apartamento",
            destination="Vivienda",
            notes="Datos de prueba para validar prorrateo de consumos.",
        )
        session.add(property_obj)
        session.commit()
        session.refresh(property_obj)

    share = session.exec(
        select(PropertyOwnerShare).where(
            PropertyOwnerShare.property_id == property_obj.id,
            PropertyOwnerShare.owner_id == owner.id,
        )
    ).first()
    if not share:
        share = PropertyOwnerShare(
            property_id=property_obj.id or 0,
            owner_id=owner.id or 0,
            percentage=100,
            is_primary=True,
            irpf_applies=True,
        )
        session.add(share)
        session.commit()

    service = session.exec(
        select(PropertyServiceAccount).where(
            PropertyServiceAccount.property_id == property_obj.id,
            PropertyServiceAccount.service_type == "OSE",
            PropertyServiceAccount.account_number == str(scenario["account"]),
        )
    ).first()
    if not service:
        service = PropertyServiceAccount(
            property_id=property_obj.id or 0,
            service_type="OSE",
            provider="OSE",
            account_number=str(scenario["account"]),
            portal_url="https://facturas.ose.com.uy/SGCv10WebClient/inicio.faces",
            reference_data="Cuenta y ref/cobro de prueba para prorrateo",
            payer="tenant",
            active=True,
            notes="Servicio de prueba para prorrateo.",
        )
        session.add(service)
        session.commit()

    return property_obj


def get_or_create_contract(session: Session, scenario: dict[str, object], property_obj: Property, tenant: Person) -> Contract:
    contract = session.exec(
        select(Contract).where(
            Contract.property_id == property_obj.id,
            Contract.tenant_id == tenant.id,
        )
    ).first()
    if not contract:
        contract = Contract(
            legacy_code=f"CTR-{scenario['property']}",
            property_id=property_obj.id or 0,
            tenant_id=tenant.id or 0,
            start_date=scenario["contract_start"],
            end_date=None,
            rent_amount=30000,
            payment_type="adelantado",
            rent_payment_timing="adelantado",
            guarantee_type="sin_garantia",
            rent_regime="libre_contratacion",
            reajustment_index="libre",
            commission_percent=8,
            irpf_applies=True,
            irpf_percent=10.5,
            payment_origin="normal",
            active=True,
        )
        session.add(contract)
        session.commit()
        session.refresh(contract)
    else:
        contract.start_date = scenario["contract_start"]
        contract.end_date = None
        contract.active = True
        session.add(contract)
        session.commit()
        session.refresh(contract)

    link = session.exec(
        select(ContractTenant).where(
            ContractTenant.contract_id == contract.id,
            ContractTenant.person_id == tenant.id,
        )
    ).first()
    if not link:
        link = ContractTenant(contract_id=contract.id or 0, person_id=tenant.id or 0, is_primary=True)
        session.add(link)
        session.commit()
    return contract


def create_pending_invoice(session: Session, scenario: dict[str, object], property_obj: Property) -> InvoiceDocument:
    marker = f"TEST_DATA_PRORRATEO_{scenario['key']}"
    pending = session.exec(
        select(InvoiceDocument).where(
            InvoiceDocument.notes.contains(marker),
            InvoiceDocument.status == "pendiente",
        )
    ).first()
    if pending:
        return pending

    existing_count = len(
        session.exec(
            select(InvoiceDocument).where(InvoiceDocument.notes.contains(marker))
        ).all()
    )
    invoice = InvoiceDocument(
        provider="OSE",
        account_number=str(scenario["account"]),
        property_id=property_obj.id,
        responsible_type="tenant",
        amount=float(scenario["amount"]),
        issued_date=date(2026, 5, 26),
        due_date=date(2026, 6, 8),
        period="2026-05",
        consumption_period_start=scenario["consumption_start"],
        consumption_period_end=scenario["consumption_end"],
        reference_number=f"330145674-{scenario['key']}-{existing_count + 1}",
        meter_number=f"TEST{scenario['key']}",
        consumption_amount=32,
        consumption_unit="m3",
        status="pendiente",
        source="manual",
        notes=f"{marker} creado {datetime.now().isoformat(timespec='seconds')}",
        raw_text_preview=(
            f"Factura OSE test {scenario['key']} cuenta {scenario['account']} "
            f"periodo {scenario['consumption_start']} a {scenario['consumption_end']}"
        ),
    )
    service = session.exec(
        select(PropertyServiceAccount).where(
            PropertyServiceAccount.property_id == property_obj.id,
            PropertyServiceAccount.account_number == str(scenario["account"]),
        )
    ).first()
    if service:
        invoice.service_account_id = service.id
        invoice.responsible_type = service.payer
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def main() -> None:
    with Session(engine) as session:
        owner = get_or_create_person(session, OWNER_NAME, "owner")
        print("Datos de prueba de prorrateo local")
        print(f"Propietaria: {owner.full_name} (id {owner.id})")
        for scenario in SCENARIOS:
            tenant = get_or_create_person(session, str(scenario["tenant"]), "tenant")
            property_obj = get_or_create_property(session, scenario, owner)
            contract = get_or_create_contract(session, scenario, property_obj, tenant)
            invoice = create_pending_invoice(session, scenario, property_obj)
            print()
            print(f"- {scenario['property']} / {tenant.full_name}")
            print(f"  Contrato id {contract.id}: inicio {contract.start_date}")
            print(
                f"  Factura id {invoice.id}: total ${invoice.amount:.0f}, "
                f"consumo {invoice.consumption_period_start} a {invoice.consumption_period_end}, "
                f"estado {invoice.status}"
            )
            print(f"  Esperado al tocar Crear cargo: {scenario['expected']}")
        print()
        print("Entrar a Facturas y buscar TEST-PRORR u OSE-TEST-PRORR.")


if __name__ == "__main__":
    main()
