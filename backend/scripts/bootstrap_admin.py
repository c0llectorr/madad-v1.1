"""Bootstrap the first administrator account (run once, after the schema is applied).

Usage, from backend/:
    python scripts/bootstrap_admin.py <username> <password>
Defaults to admin/admin if no arguments are given.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User


def main() -> None:
    username = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin"
    db: Session = SessionLocal()
    if db.query(User).filter(User.username == username).first():
        print(f"User '{username}' already exists — nothing to do.")
        return
    db.add(User(center_id=None, username=username,
                password_hash=hash_password(password), role="administrator",
                is_active=True))
    db.commit()
    print(f"Created administrator '{username}'.")


if __name__ == "__main__":
    main()
