from typing import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings


settings = get_settings()
engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    apply_sqlite_poc_migrations()


def apply_sqlite_poc_migrations() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    is_postgres = engine.dialect.name == "postgresql"
    bool_false = "BOOLEAN NOT NULL DEFAULT false" if is_postgres else "BOOLEAN NOT NULL DEFAULT 0"
    bool_true = "BOOLEAN NOT NULL DEFAULT true" if is_postgres else "BOOLEAN NOT NULL DEFAULT 1"
    migrations = {
        "person": [
            ("legacy_code", "VARCHAR NOT NULL DEFAULT ''"),
            ("bank_name", "VARCHAR NOT NULL DEFAULT ''"),
            ("bank_account", "VARCHAR NOT NULL DEFAULT ''"),
            ("bank_transfer_commission_applies", bool_false),
            ("bank_transfer_commission_amount", "FLOAT NOT NULL DEFAULT 65"),
        ],
        "property": [
            ("legacy_code", "VARCHAR NOT NULL DEFAULT ''"),
            ("neighborhood", "VARCHAR NOT NULL DEFAULT ''"),
            ("door_number", "VARCHAR NOT NULL DEFAULT ''"),
            ("unit_number", "VARCHAR NOT NULL DEFAULT ''"),
            ("occupancy_status", "VARCHAR NOT NULL DEFAULT 'alquilada'"),
            ("property_type", "VARCHAR NOT NULL DEFAULT ''"),
            ("destination", "VARCHAR NOT NULL DEFAULT ''"),
        ],
        "propertyserviceaccount": [
            ("portal_url", "VARCHAR NOT NULL DEFAULT ''"),
            ("reference_data", "VARCHAR NOT NULL DEFAULT ''"),
        ],
        "invoicedocument": [
            ("issued_date", "DATE DEFAULT NULL"),
            ("consumption_period_start", "DATE DEFAULT NULL"),
            ("consumption_period_end", "DATE DEFAULT NULL"),
            ("reference_number", "VARCHAR NOT NULL DEFAULT ''"),
            ("meter_number", "VARCHAR NOT NULL DEFAULT ''"),
            ("consumption_amount", "FLOAT NOT NULL DEFAULT 0"),
            ("consumption_unit", "VARCHAR NOT NULL DEFAULT ''"),
        ],
        "contract": [
            ("legacy_code", "VARCHAR NOT NULL DEFAULT ''"),
            ("billing_end_date", "DATE DEFAULT NULL"),
            ("rent_payment_timing", "VARCHAR NOT NULL DEFAULT 'adelantado'"),
            ("guarantee_type", "VARCHAR NOT NULL DEFAULT 'sin_garantia'"),
            ("guarantee_provider", "VARCHAR NOT NULL DEFAULT ''"),
            ("guarantee_percent", "FLOAT NOT NULL DEFAULT 0"),
            ("rent_regime", "VARCHAR NOT NULL DEFAULT 'libre_contratacion'"),
            ("reajustment_index", "VARCHAR NOT NULL DEFAULT 'libre'"),
            ("next_reajustment_date", "DATE DEFAULT NULL"),
            ("commission_on_rent", bool_true),
            ("commission_on_other_charges", bool_false),
            ("commission_iva_applies", bool_true),
            ("tenant_tax_role", "VARCHAR NOT NULL DEFAULT 'normal'"),
            ("resguardo_required", bool_false),
        ],
        "charge": [
            ("responsible_type", "VARCHAR NOT NULL DEFAULT 'tenant'"),
            ("accrual_period", "VARCHAR NOT NULL DEFAULT ''"),
            ("settlement_period", "VARCHAR NOT NULL DEFAULT ''"),
            ("owner_charge_id", "INTEGER DEFAULT NULL"),
            ("notify_tenant", bool_false),
            ("notify_always", bool_false),
            ("consumption_period_start", "DATE DEFAULT NULL"),
            ("consumption_period_end", "DATE DEFAULT NULL"),
            ("proration_days", "INTEGER NOT NULL DEFAULT 0"),
            ("proration_total_days", "INTEGER NOT NULL DEFAULT 0"),
        ],
        "propertyownershare": [
            ("is_primary", bool_false),
            ("irpf_applies", bool_true),
        ],
        "payment": [
            ("status", "VARCHAR NOT NULL DEFAULT 'confirmado'"),
        ],
        "paymentallocation": [
            ("status", "VARCHAR NOT NULL DEFAULT 'confirmado'"),
        ],
        "cashmovement": [
            ("reversal_of_id", "INTEGER DEFAULT NULL"),
        ],
        "ownercharge": [
            ("period_from", "DATE DEFAULT NULL"),
            ("period_to", "DATE DEFAULT NULL"),
            ("split_by_ownership", bool_false),
            ("reversal_of_id", "INTEGER DEFAULT NULL"),
        ],
        "ownersettlement": [
            ("expenses", "FLOAT NOT NULL DEFAULT 0"),
            ("bank_transfer_fee", "FLOAT NOT NULL DEFAULT 0"),
            ("paid_at", "TIMESTAMP DEFAULT NULL"),
        ],
        "tenantcredit": [
            ("status", "VARCHAR NOT NULL DEFAULT 'disponible'"),
        ],
        "propertyvisit": [
            ("notification_phone", "VARCHAR NOT NULL DEFAULT ''"),
        ],
    }

    with engine.begin() as connection:
        for table_name, columns in migrations.items():
            if table_name not in table_names:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns:
                if column_name not in existing_columns:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
