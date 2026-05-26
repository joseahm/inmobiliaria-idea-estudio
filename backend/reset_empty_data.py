from sqlmodel import SQLModel

from app.database import engine
import app.models  # noqa: F401


def main() -> None:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    print("Base reiniciada vacia. Tablas creadas sin datos.")


if __name__ == "__main__":
    main()
