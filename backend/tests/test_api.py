from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import app
from app.models import Charge, Contract
from app.seed import seed_demo_data


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_demo_data(session)

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_login_and_dashboard(client):
    response = client.post(
        "/auth/login",
        json={"email": "admin@salgueiro.test", "password": "admin123"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]

    dashboard = client.get("/dashboard/summary")
    assert dashboard.status_code == 200
    assert dashboard.json()["open_charges"] >= 1


def test_create_charge_and_pay_partially_then_fully(client):
    contracts = client.get("/contracts").json()
    contract_id = contracts[0]["id"]
    tenant_id = contracts[0]["tenant_id"]

    charge_response = client.post(
        "/charges",
        json={
            "contract_id": contract_id,
            "responsible_person_id": tenant_id,
            "concept": "UTE",
            "description": "Factura demo",
            "amount": 1000,
            "due_date": date.today().isoformat(),
            "period": f"{date.today().year}-{date.today().month:02d}",
            "origin": "manual",
        },
    )
    assert charge_response.status_code == 200
    charge = charge_response.json()
    assert charge["status"] == "pendiente"

    partial = client.post(
        "/payments",
        json={
            "person_id": tenant_id,
            "amount": 400,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "parcial",
            "notes": "",
            "allocations": [{"charge_id": charge["id"], "amount": 400}],
        },
    )
    assert partial.status_code == 200
    assert partial.json()["cash_movement"]["movement_type"] == "entrada"
    assert partial.json()["cash_movement"]["amount"] == 400
    refreshed = [item for item in client.get("/charges").json() if item["id"] == charge["id"]][0]
    assert refreshed["status"] == "parcial"
    assert refreshed["remaining_amount"] == 600

    complete = client.post(
        "/payments",
        json={
            "person_id": tenant_id,
            "amount": 600,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "saldo",
            "notes": "",
            "allocations": [{"charge_id": charge["id"], "amount": 600}],
        },
    )
    assert complete.status_code == 200
    refreshed = [item for item in client.get("/charges").json() if item["id"] == charge["id"]][0]
    assert refreshed["status"] == "pagado"


def test_cash_movements_include_payments_and_manual_movements(client):
    manual = client.post(
        "/cash-movements/manual",
        json={
            "movement_date": date.today().isoformat(),
            "movement_type": "salida",
            "amount": 250,
            "concept": "Ajuste caja demo",
            "person_id": None,
            "property_id": None,
            "notes": "Movimiento manual",
        },
    )
    assert manual.status_code == 200
    assert manual.json()["origin"] == "manual"

    movements = client.get("/cash-movements").json()
    assert any(item["origin"] == "payment" for item in movements)
    assert any(item["origin"] == "manual" and item["amount"] == 250 for item in movements)


def test_owner_charge_creates_cash_movement_and_discounts_settlement(client):
    owners = [item for item in client.get("/persons").json() if item["person_type"] in {"owner", "both"}]
    properties = client.get("/properties").json()
    payload = {
        "owner_id": owners[0]["id"],
        "property_id": properties[0]["id"],
        "concept": "PRIMARIA",
        "description": "Primaria pagada por administracion",
        "amount": 1200,
        "charge_date": date.today().isoformat(),
        "period": f"{date.today().year}-{date.today().month:02d}",
        "paid_by_agency": True,
        "generates_commission": True,
        "commission_percent": 3,
    }
    created = client.post("/owner-charges", json=payload)
    assert created.status_code == 200
    assert created.json()["cash_movement"]["movement_type"] == "salida"

    period = f"{date.today().year}-{date.today().month:02d}"
    settlements = client.post("/settlements/owners/generate", json={"period": period})
    assert settlements.status_code == 200
    owner_settlement = next(item for item in settlements.json() if item["owner_id"] == owners[0]["id"])
    assert owner_settlement["expenses"] >= 1200


def test_bulk_monthly_avoids_duplicates(client):
    period = f"{date.today().year}-{date.today().month:02d}"
    first = client.post("/charges/bulk-monthly", json={"period": period, "due_day": 10})
    assert first.status_code == 200
    second = client.post("/charges/bulk-monthly", json={"period": period, "due_day": 10})
    assert second.status_code == 200
    assert second.json()["created"] == 0


def test_invoice_scan_extracts_provider_amount_due_date_and_contract(client):
    invoice_text = """
    UTE
    Cuenta UTE-11001
    Total a pagar $ 2.345,67
    Vencimiento 23/05/2026
    """
    response = client.post(
        "/invoice-scan/analyze",
        files={"file": ("factura_ute.txt", invoice_text, "text/plain")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["concept"] == "UTE"
    assert payload["amount"] == 2345.67
    assert payload["due_date"] == "2026-05-23"
    assert payload["matched_contract_id"]


def test_invoice_scan_extracts_pdf_text(client):
    import fitz

    document = fitz.open()
    page = document.new_page()
    page.insert_text(
        (72, 72),
        "OSE\nCuenta OSE-22002\nTotal a pagar $ 1.890,50\nVencimiento 24/05/2026",
    )
    pdf_bytes = document.tobytes()
    document.close()

    response = client.post(
        "/invoice-scan/analyze",
        files={"file": ("factura_ose.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["concept"] == "OSE"
    assert payload["amount"] == 1890.5
    assert payload["due_date"] == "2026-05-24"
    assert payload["matched_contract_id"]
    assert payload["analysis_source"] == "pdf-text"


def test_invoice_scan_understands_real_ute_pdf_layout(client):
    import fitz

    document = fitz.open()
    page = document.new_page()
    page.insert_text(
        (72, 72),
        """
        UTE ADHERIDA AL CLEARING DE INFORMES
        HERNANDEZ MOLINA, JOSE AMBROSIO
        e-Ticket Credito
        5605195954
        05/05/2026
        T 7721189
        21/04/2026
        05/06/2026
        CARGO FIJO
        324,90
        Importe Gravado 22%
        2.494,09
        IVA Tasa Basica 22%
        548,70
        Total
        3.368,00
        IMPORTE TOTAL
        $3.368,00
        56051959544560580470068
        *000000000336800*
        """,
    )
    pdf_bytes = document.tobytes()
    document.close()

    response = client.post(
        "/invoice-scan/analyze",
        files={"file": ("e-Ticket Credito_T 7721189.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["concept"] == "UTE"
    assert payload["account"] == "5605195954"
    assert payload["amount"] == 3368
    assert payload["due_date"] == "2026-05-05"


def test_invoice_scan_demo_ute_account_prefers_account_line(client):
    invoice_text = """
    UTE
    Nro. de Cuenta: UTE-11002
    CARGO FIJO 324,90
    IVA Tasa Basica 22% 548,70
    Vencimiento: 25/05/2026
    Importe Total: $ 3.368,00
    """
    response = client.post(
        "/invoice-scan/analyze",
        files={"file": ("factura_ute_demo.txt", invoice_text, "text/plain")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["account"] == "UTE-11002"
    assert payload["matched_contract_id"]
    assert payload["amount"] == 3368


def test_update_and_delete_charge_without_payments(client):
    contract = client.get("/contracts").json()[0]
    created = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "OTROS",
            "description": "Cargo editable",
            "amount": 500,
            "due_date": date.today().isoformat(),
            "period": f"{date.today().year}-{date.today().month:02d}",
            "origin": "manual",
        },
    ).json()

    updated = client.patch(
        f"/charges/{created['id']}",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "UTE",
            "description": "Cargo actualizado",
            "amount": 750,
            "due_date": date.today().isoformat(),
            "period": f"{date.today().year}-{date.today().month:02d}",
            "origin": "manual",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["amount"] == 750
    assert updated.json()["concept"] == "UTE"

    deleted = client.delete(f"/charges/{created['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"


def test_property_account_association_updates_matching_fields(client):
    owner = next(item for item in client.get("/persons").json() if item["person_type"] in {"owner", "both"})
    created = client.post(
        "/properties",
        json={
            "reference": "TEST-001",
            "address": "Test 123",
            "padron": "PAD-TEST",
            "ute_account": "",
            "ose_account": "",
            "taxes_account": "",
            "sanitation_account": "",
            "notes": "",
            "owner_id": owner["id"],
            "owner_percentage": 100,
        },
    )
    assert created.status_code == 200
    property_id = created.json()["id"]

    associated = client.patch(
        f"/properties/{property_id}/account",
        json={"provider": "UTE", "account": "5605195954"},
    )
    assert associated.status_code == 200
    assert associated.json()["property"]["ute_account"] == "5605195954"

    deleted = client.delete(f"/properties/{property_id}")
    assert deleted.status_code == 200


def test_irpf_not_applied_for_anda_in_settlement(client):
    contracts = client.get("/contracts").json()
    anda_contract = next(item for item in contracts if item["payment_origin"] == "ANDA")
    charges = client.get("/charges").json()
    charge = next(item for item in charges if item["contract_id"] == anda_contract["id"])

    client.post(
        "/payments",
        json={
            "person_id": anda_contract["tenant_id"],
            "amount": charge["remaining_amount"],
            "payment_date": date.today().isoformat(),
            "method": "ANDA",
            "reference": "ANDA demo",
            "notes": "",
            "allocations": [{"charge_id": charge["id"], "amount": charge["remaining_amount"]}],
        },
    )
    period = f"{date.today().year}-{date.today().month:02d}"
    settlements = client.post(
        "/settlements/owners/generate", json={"period": period}
    )
    assert settlements.status_code == 200
    assert any(item["irpf"] == 0 for item in settlements.json())


def test_seed_has_two_month_payment_one_cash_entry_and_settlement_lines(client):
    period = f"{date.today().year}-{date.today().month:02d}"
    charges = client.get("/charges").json()
    sofia_rent_charges = [
        item
        for item in charges
        if item["tenant_name"] == "Sofia Martinez" and item["concept"] == "ALQUILER"
    ]
    assert len(sofia_rent_charges) >= 2
    assert all(item["status"] == "pagado" for item in sofia_rent_charges[:2])

    cash = client.get("/cash-movements").json()
    sofia_entries = [
        item
        for item in cash
        if item["person_name"] == "Sofia Martinez" and item["amount"] == 44000
    ]
    assert len(sofia_entries) == 1

    settlements = client.post("/settlements/owners/generate", json={"period": period})
    assert settlements.status_code == 200
    rows = settlements.json()
    assert rows
    assert any(item["lines"] for item in rows)
    shared_lines = [
        line
        for item in rows
        for line in item["lines"]
        if line["property_reference"] == "FIN-003" and line["concept"] == "ALQUILER"
    ]
    assert shared_lines
    assert {line["owner_percentage"] for line in shared_lines} == {50}


def test_payment_with_credit_keeps_unallocated_amount(client):
    contracts = client.get("/contracts").json()
    contract = contracts[0]
    payment = client.post(
        "/payments",
        json={
            "person_id": contract["tenant_id"],
            "amount": 1000,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "adelanto sin deuda",
            "notes": "",
            "allocations": [],
        },
    )
    assert payment.status_code == 200
    assert payment.json()["unallocated_amount"] == 1000
    assert payment.json()["cash_movement"]["amount"] == 1000


def test_void_payment_creates_cash_reversal_and_reopens_charge(client):
    contracts = client.get("/contracts").json()
    contract = contracts[0]
    charge = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "ALQUILER",
            "description": "Anulacion test",
            "amount": 1000,
            "due_date": date.today().isoformat(),
            "period": f"{date.today().year}-{date.today().month:02d}",
            "origin": "manual",
        },
    ).json()
    payment = client.post(
        "/payments",
        json={
            "person_id": contract["tenant_id"],
            "amount": 1000,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "pago a anular",
            "notes": "",
            "allocations": [{"charge_id": charge["id"], "amount": 1000}],
        },
    ).json()
    assert client.get("/charges").json()[-1]
    voided = client.post(f"/payments/{payment['id']}/void", json={"reason": "error de carga"})
    assert voided.status_code == 200
    assert voided.json()["cash_reversal"]["movement_type"] == "salida"
    reopened = next(item for item in client.get("/charges").json() if item["id"] == charge["id"])
    assert reopened["status"] != "pagado"


def test_reallocate_payment_moves_allocation_without_touching_cash(client):
    contract = client.get("/contracts").json()[0]
    period = f"{date.today().year}-{date.today().month:02d}"
    wrong_charge = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "GASTOS_COMUNES",
            "description": "Imputada por error",
            "amount": 1000,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    correct_charge = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "UTE",
            "description": "Destino correcto",
            "amount": 1000,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    payment = client.post(
        "/payments",
        json={
            "person_id": contract["tenant_id"],
            "amount": 1000,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "pago corregible",
            "notes": "",
            "allocations": [{"charge_id": wrong_charge["id"], "amount": 1000}],
        },
    ).json()
    cash_before = [
        item
        for item in client.get("/cash-movements").json()
        if item["origin"] == "payment" and item["origin_id"] == payment["id"]
    ]
    assert len(cash_before) == 1

    detail = client.get(f"/payments/{payment['id']}/detail")
    assert detail.status_code == 200
    assert any(item["charge_id"] == wrong_charge["id"] for item in detail.json()["allocations"])

    reallocated = client.post(
        f"/payments/{payment['id']}/reallocate",
        json={
            "reason": "El pago correspondia a UTE",
            "allocations": [{"charge_id": correct_charge["id"], "amount": 1000}],
        },
    )
    assert reallocated.status_code == 200
    assert reallocated.json()["allocations"][0]["charge_id"] == correct_charge["id"]
    charges = client.get("/charges").json()
    wrong_refreshed = next(item for item in charges if item["id"] == wrong_charge["id"])
    correct_refreshed = next(item for item in charges if item["id"] == correct_charge["id"])
    assert wrong_refreshed["status"] != "pagado"
    assert correct_refreshed["status"] == "pagado"
    cash_after = [
        item
        for item in client.get("/cash-movements").json()
        if item["origin"] == "payment" and item["origin_id"] == payment["id"]
    ]
    assert cash_after == cash_before


def test_reallocate_payment_can_correct_amount_with_cash_adjustment(client):
    contract = client.get("/contracts").json()[0]
    period = f"{date.today().year}-{date.today().month:02d}"
    wrong_charge = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "UTE",
            "description": "Importe e imputacion erronea",
            "amount": 500,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    correct_charge = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "GASTOS_COMUNES",
            "description": "Pago real",
            "amount": 600,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    payment = client.post(
        "/payments",
        json={
            "person_id": contract["tenant_id"],
            "amount": 500,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "pago con importe mal cargado",
            "notes": "",
            "allocations": [{"charge_id": wrong_charge["id"], "amount": 500}],
        },
    ).json()

    reallocated = client.post(
        f"/payments/{payment['id']}/reallocate",
        json={
            "reason": "Entraron 600 para gastos comunes",
            "corrected_amount": 600,
            "allocations": [{"charge_id": correct_charge["id"], "amount": 600}],
        },
    )
    assert reallocated.status_code == 200
    assert reallocated.json()["amount"] == 600
    assert reallocated.json()["allocations"][0]["charge_id"] == correct_charge["id"]

    charges = client.get("/charges").json()
    wrong_refreshed = next(item for item in charges if item["id"] == wrong_charge["id"])
    correct_refreshed = next(item for item in charges if item["id"] == correct_charge["id"])
    assert wrong_refreshed["status"] != "pagado"
    assert correct_refreshed["status"] == "pagado"

    movements = [
        item
        for item in client.get("/cash-movements").json()
        if item["origin"] in {"payment", "payment_adjustment"} and item["origin_id"] == payment["id"]
    ]
    net_cash = sum(item["amount"] if item["movement_type"] == "entrada" else -item["amount"] for item in movements)
    assert net_cash == 600
    assert any(item["origin"] == "payment_adjustment" and item["amount"] == 100 for item in movements)


def test_reallocate_payment_to_real_debt_balance_reopens_wrong_debt(client):
    contract = client.get("/contracts").json()[0]
    period = f"{date.today().year}-{date.today().month:02d}"
    common_expenses = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "GASTOS_COMUNES",
            "description": "Deuda real",
            "amount": 4400,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    ute = client.post(
        "/charges",
        json={
            "contract_id": contract["id"],
            "responsible_person_id": contract["tenant_id"],
            "concept": "UTE",
            "description": "Deuda imputada por error",
            "amount": 1500,
            "due_date": date.today().isoformat(),
            "period": period,
            "origin": "manual",
        },
    ).json()
    payment = client.post(
        "/payments",
        json={
            "person_id": contract["tenant_id"],
            "amount": 1500,
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "pago mal imputado",
            "notes": "",
            "allocations": [{"charge_id": ute["id"], "amount": 1500}],
        },
    ).json()

    reallocated = client.post(
        f"/payments/{payment['id']}/reallocate",
        json={
            "reason": "Entraron 4400 para gastos comunes",
            "corrected_amount": 4400,
            "allocations": [{"charge_id": common_expenses["id"], "amount": 4400}],
        },
    )
    assert reallocated.status_code == 200

    charges = client.get("/charges").json()
    common_expenses_refreshed = next(item for item in charges if item["id"] == common_expenses["id"])
    ute_refreshed = next(item for item in charges if item["id"] == ute["id"])
    assert common_expenses_refreshed["status"] == "pagado"
    assert common_expenses_refreshed["remaining_amount"] == 0
    assert ute_refreshed["status"] != "pagado"
    assert ute_refreshed["remaining_amount"] == 1500

    movements = [
        item
        for item in client.get("/cash-movements").json()
        if item["origin"] in {"payment", "payment_adjustment"} and item["origin_id"] == payment["id"]
    ]
    net_cash = sum(item["amount"] if item["movement_type"] == "entrada" else -item["amount"] for item in movements)
    assert net_cash == 4400
    assert any(item["origin"] == "payment_adjustment" and item["amount"] == 2900 for item in movements)


def test_split_owner_charge_is_discounted_by_owner_percentage(client):
    period = f"{date.today().year}-{date.today().month:02d}"
    properties = client.get("/properties").json()
    shared_property = next(item for item in properties if item["reference"] == "FIN-003")
    owner_ids = [owner["id"] for owner in shared_property["owners"]]
    created = client.post(
        "/owner-charges",
        json={
            "owner_id": owner_ids[0],
            "property_id": shared_property["id"],
            "concept": "PRIMARIA",
            "description": "Primaria dividida",
            "amount": 10000,
            "charge_date": date.today().isoformat(),
            "period": period,
            "paid_by_agency": True,
            "generates_commission": False,
            "commission_percent": 0,
            "split_by_ownership": True,
        },
    )
    assert created.status_code == 200
    settlements = client.post("/settlements/owners/generate", json={"period": period}).json()
    primary_lines = [
        line
        for item in settlements
        for line in item["lines"]
        if line["concept"] == "PRIMARIA"
    ]
    assert len(primary_lines) == 2
    assert {line["expense_amount"] for line in primary_lines} == {5000}


def test_property_detail_services_and_service_crud(client):
    property_item = client.get("/properties").json()[0]
    detail = client.get(f"/properties/{property_item['id']}/detail")
    assert detail.status_code == 200
    assert "services" in detail.json()

    created = client.post(
        f"/properties/{property_item['id']}/services",
        json={
            "service_type": "PRIMARIA",
            "provider": "DGI",
            "account_number": "PRI-TEST",
            "payer": "owner",
            "active": True,
            "notes": "Servicio test",
        },
    )
    assert created.status_code == 200
    assert created.json()["account_number"] == "PRI-TEST"

    updated = client.patch(
        f"/properties/{property_item['id']}/services/{created.json()['id']}",
        json={
            "service_type": "PRIMARIA",
            "provider": "DGI",
            "account_number": "PRI-TEST-2",
            "payer": "owner",
            "active": False,
            "notes": "Servicio test actualizado",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["active"] is False


def test_advance_rent_payment_creates_future_charges_and_one_cash_entry(client):
    contract = client.get("/contracts").json()[0]
    response = client.post(
        "/payments/advance-rent",
        json={
            "contract_id": contract["id"],
            "months": ["2026-07", "2026-08"],
            "payment_date": date.today().isoformat(),
            "method": "transferencia",
            "reference": "adelanto julio agosto",
            "notes": "",
            "due_day": 10,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["payment"]["amount"] == contract["rent_amount"] * 2
    assert len(payload["charges"]) == 2
    assert payload["cash_movement"]["amount"] == payload["payment"]["amount"]
    assert "Alquiler 2026-07" in payload["cash_movement"]["concept"]
    assert "Alquiler 2026-08" in payload["cash_movement"]["concept"]


def test_attachment_audit_and_accounting_exports(client):
    charge = client.get("/charges").json()[0]
    uploaded = client.post(
        f"/attachments/charge/{charge['id']}",
        files={"file": ("comprobante.txt", b"comprobante", "text/plain")},
    )
    assert uploaded.status_code == 200
    attachments = client.get(f"/attachments/charge/{charge['id']}")
    assert attachments.status_code == 200
    assert attachments.json()[0]["filename"] == "comprobante.txt"

    audit = client.get("/audit-log")
    assert audit.status_code == 200
    assert any(item["action"] == "attach_file" for item in audit.json())

    period = f"{date.today().year}-{date.today().month:02d}"
    client.post("/settlements/owners/generate", json={"period": period})
    accounting = client.get(f"/exports/accounting.csv?period={period}")
    assert accounting.status_code == 200
    assert "commission" in accounting.text
    dgi = client.get(f"/exports/dgi-irpf.csv?period={period}")
    assert dgi.status_code == 200
    assert "irpf_withheld" in dgi.text


def test_bank_transfer_fee_discounts_owner_settlement(client):
    owner = next(item for item in client.get("/persons").json() if item["person_type"] in {"owner", "both"})
    updated = client.patch(
        f"/persons/{owner['id']}",
        json={
            "legacy_code": owner["legacy_code"],
            "full_name": owner["full_name"],
            "document": owner["document"],
            "phone": owner.get("phone") or "",
            "mobile": owner["mobile"],
            "email": owner["email"],
            "address": owner.get("address") or "",
            "person_type": owner["person_type"],
            "bank_name": "Santander",
            "bank_account": "Cuenta test",
            "bank_transfer_commission_applies": True,
            "bank_transfer_commission_amount": 65,
        },
    )
    assert updated.status_code == 200
    period = f"{date.today().year}-{date.today().month:02d}"
    settlements = client.post("/settlements/owners/generate", json={"period": period}).json()
    owner_settlement = next(item for item in settlements if item["owner_id"] == owner["id"])
    expected_total = round(
        owner_settlement["income"]
        - owner_settlement["expenses"]
        - owner_settlement["commission"]
        - owner_settlement["iva"]
        - owner_settlement["irpf"]
        - 65,
        2,
    )
    assert owner_settlement["bank_transfer_fee"] == 65
    assert owner_settlement["total_to_transfer"] == expected_total


def test_regenerating_settlement_refreshes_bank_transfer_fee(client):
    owner = next(item for item in client.get("/persons").json() if item["person_type"] in {"owner", "both"})
    period = f"{date.today().year}-{date.today().month:02d}"

    first_rows = client.post("/settlements/owners/generate", json={"period": period}).json()
    first_settlement = next(item for item in first_rows if item["owner_id"] == owner["id"])
    assert first_settlement["bank_transfer_fee"] in {0, owner.get("bank_transfer_commission_amount", 0)}

    updated = client.patch(
        f"/persons/{owner['id']}",
        json={
            "legacy_code": owner["legacy_code"],
            "full_name": owner["full_name"],
            "document": owner["document"],
            "phone": owner.get("phone") or "",
            "mobile": owner["mobile"],
            "email": owner["email"],
            "address": owner.get("address") or "",
            "person_type": owner["person_type"],
            "bank_name": "Itau",
            "bank_account": "Cuenta actualizada",
            "bank_transfer_commission_applies": True,
            "bank_transfer_commission_amount": 29,
        },
    )
    assert updated.status_code == 200

    regenerated = client.post("/settlements/owners/generate", json={"period": period})
    assert regenerated.status_code == 200
    owner_settlement = next(item for item in regenerated.json() if item["owner_id"] == owner["id"])
    expected_total = round(
        owner_settlement["income"]
        - owner_settlement["expenses"]
        - owner_settlement["commission"]
        - owner_settlement["iva"]
        - owner_settlement["irpf"]
        - 29,
        2,
    )
    assert owner_settlement["bank_transfer_fee"] == 29
    assert owner_settlement["total_to_transfer"] == expected_total


def test_pdf_receipts_liquidations_and_withdrawals(client):
    payment_id = client.get("/dashboard/summary").json()["recent_payments"][0]["id"]
    receipt = client.get(f"/payments/{payment_id}/receipt.pdf")
    assert receipt.status_code == 200
    assert receipt.headers["content-type"].startswith("application/pdf")
    assert receipt.content.startswith(b"%PDF")

    period = f"{date.today().year}-{date.today().month:02d}"
    settlement = client.post("/settlements/owners/generate", json={"period": period}).json()[0]
    liquidation = client.get(f"/settlements/owners/{settlement['id']}/liquidation.pdf")
    assert liquidation.status_code == 200
    assert liquidation.content.startswith(b"%PDF")
    withdrawal = client.get(f"/settlements/owners/{settlement['id']}/withdrawal.pdf")
    assert withdrawal.status_code == 200
    assert withdrawal.content.startswith(b"%PDF")

    movement = client.post(
        "/cash-movements/manual",
        json={
            "movement_date": date.today().isoformat(),
            "movement_type": "salida",
            "amount": 500,
            "concept": "Retiro propietario test",
            "person_id": settlement["owner_id"],
            "property_id": None,
            "notes": "PDF test",
        },
    ).json()
    movement_pdf = client.get(f"/cash-movements/{movement['id']}/withdrawal.pdf")
    assert movement_pdf.status_code == 200
    assert movement_pdf.content.startswith(b"%PDF")


def test_email_inbox_rejects_real_password_in_secret_field(client):
    response = client.post(
        "/email-inboxes",
        json={
            "name": "Gmail mal configurado",
            "email_address": "demo@gmail.com",
            "provider": "imap",
            "host": "imap.gmail.com",
            "port": 993,
            "username": "demo@gmail.com",
            "secret_env_var": "abcd efgh ijkl mnop",
            "folder": "INBOX",
            "active": True,
            "notes": "",
        },
    )
    assert response.status_code == 400
    assert "FACTURAS_EMAIL_PASSWORD" in response.json()["detail"]
