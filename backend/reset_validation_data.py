from datetime import date

from sqlmodel import Session, SQLModel

from app.config import get_settings
from app.database import engine
from app.models import (
    Contract,
    Person,
    Property,
    PropertyOwnerShare,
    PropertyServiceAccount,
)
from app.services import create_advance_rent_payment, generate_owner_settlements


def main() -> None:
    settings = get_settings()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        owner_a = Person(
            full_name="Ana Propietaria 60",
            document="1.111.111-1",
            mobile="+598 99 111 111",
            email="ana60@example.com",
            person_type="owner",
        )
        owner_b = Person(
            full_name="Carlos Propietario 40",
            document="2.222.222-2",
            mobile="+598 99 222 222",
            email="carlos40@example.com",
            person_type="owner",
        )
        tenant = Person(
            full_name="Jose Hernandez",
            document="3.333.333-3",
            mobile="+598 99 333 333",
            email="jose@example.com",
            person_type="tenant",
        )
        session.add_all([owner_a, owner_b, tenant])
        session.commit()
        for person in [owner_a, owner_b, tenant]:
            session.refresh(person)

        property_obj = Property(
            reference="TEST-60-40",
            address="Apartamento prueba 60/40",
            padron="PAD-6040",
            occupancy_status="alquilada",
            property_type="Apartamento",
            destination="Vivienda",
            notes="Escenario minimo para validar porcentajes, IRPF y pago adelantado.",
        )
        session.add(property_obj)
        session.commit()
        session.refresh(property_obj)

        session.add_all(
            [
                PropertyOwnerShare(
                    property_id=property_obj.id or 0,
                    owner_id=owner_a.id or 0,
                    percentage=60,
                    is_primary=True,
                    irpf_applies=True,
                ),
                PropertyOwnerShare(
                    property_id=property_obj.id or 0,
                    owner_id=owner_b.id or 0,
                    percentage=40,
                    is_primary=False,
                    irpf_applies=True,
                ),
                PropertyServiceAccount(
                    property_id=property_obj.id or 0,
                    service_type="GASTOS_COMUNES",
                    provider="CRVS",
                    account_number="000113000271",
                    payer="tenant",
                    active=True,
                    notes="Referencia de gastos comunes para prueba.",
                ),
            ]
        )

        contract = Contract(
            property_id=property_obj.id or 0,
            tenant_id=tenant.id or 0,
            start_date=date(2026, 5, 1),
            rent_amount=100000,
            payment_type="adelantado",
            rent_payment_timing="adelantado",
            commission_percent=10,
            irpf_applies=True,
            irpf_percent=10,
            payment_origin="normal",
            active=True,
        )
        session.add(contract)
        session.commit()
        session.refresh(contract)

        create_advance_rent_payment(
            session=session,
            contract=contract,
            months=["2026-05", "2026-06"],
            payment_date=date(2026, 5, 5),
            method="transferencia",
            reference="PAGO-ADELANTADO-MAYO-JUNIO",
            notes="Pago adelantado de mayo y junio para validar liquidacion.",
            due_day=10,
        )
        settlements = generate_owner_settlements(session, "2026-05")

        print("Base reiniciada con escenario de validacion.")
        print("Propiedad: TEST-60-40")
        print("Propietarios: Ana 60%, Carlos 40%")
        print("Alquiler mensual: 100000")
        print("Pago adelantado: mayo + junio = 200000")
        print("Liquidacion generada para 2026-05:")
        for settlement in settlements:
            owner = session.get(Person, settlement.owner_id)
            print(
                f"- {owner.full_name if owner else settlement.owner_id}: "
                f"ingreso={settlement.income}, comision={settlement.commission}, "
                f"iva={settlement.iva}, irpf={settlement.irpf}, a_girar={settlement.total_to_transfer}"
            )
        print("Esperado mayo:")
        print("- Ana 60%: ingreso 120000, IRPF 12000")
        print("- Carlos 40%: ingreso 80000, IRPF 8000")


if __name__ == "__main__":
    main()
