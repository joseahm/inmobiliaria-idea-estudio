from datetime import datetime, timedelta
from typing import Dict

import jwt

from .config import get_settings


def create_access_token(subject: str) -> str:
    settings = get_settings()
    payload: Dict[str, object] = {
        "sub": subject,
        "exp": datetime.utcnow() + timedelta(hours=12),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_demo_credentials(email: str, password: str) -> bool:
    settings = get_settings()
    return (
        email.lower() == settings.demo_admin_email.lower()
        and password == settings.demo_admin_password
    )
