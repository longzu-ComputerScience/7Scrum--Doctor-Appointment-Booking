"""Issue a one-time invitation using backend credentials; never expose this as a public API."""
import argparse
import hashlib
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.service import get_client  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--doctor-id", type=UUID, required=True, help="Existing active, unlinked doctor profile")
    parser.add_argument("--email", required=True, help="Email the doctor will use to register")
    parser.add_argument("--hours", type=int, default=72, help="Validity in hours (1-720; default 72)")
    args = parser.parse_args()
    email = args.email.strip().lower()
    if not 1 <= args.hours <= 720 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 320:
        parser.error("Use a valid email and --hours between 1 and 720")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=args.hours)
    try:
        get_client().rpc("issue_doctor_registration_invite", {
            "p_doctor_id": str(args.doctor_id), "p_email": email,
            "p_token_hash": "\\x" + hashlib.sha256(token.encode()).hexdigest(),
            "p_expires_at": expires.isoformat(),
        }).execute()
    except Exception as exc:
        messages = {
            "PT404": "Doctor profile is missing or inactive.",
            "PT409": "This doctor or email already has an account. Use sign in instead.",
            "PT422": "Invalid invitation details.",
            "PGRST202": "Apply migration 006 before issuing an invitation.",
        }
        print(messages.get(getattr(exc, "code", None), "Invitation could not be issued. Check backend configuration."),
              file=sys.stderr)
        return 1
    print(f"Invitation code (shown once): {token}")
    print(f"Expires: {expires.isoformat()}")
    print("Give this code privately to the doctor. Register at /doctor/register with the invited email.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
