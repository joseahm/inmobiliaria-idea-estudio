from sqlmodel import SQLModel

from app.database import engine
from app.seed import seed_demo_data
from sqlmodel import Session


def main() -> None:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_demo_data(session)


if __name__ == "__main__":
    main()
