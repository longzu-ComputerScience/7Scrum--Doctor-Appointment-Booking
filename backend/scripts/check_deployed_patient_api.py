"""Non-destructive smoke test for a deployed backend origin.

Requires no Supabase credentials or user JWT. An unauthenticated request to
GET /api/patient/appointments must return 401 when the feature is installed.
"""
import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def inspect(url: str):
    request = Request(url, headers={"Accept": "application/json", "Cache-Control": "no-store"})
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, response.headers, response.read(2000)
    except HTTPError as exc:
        return exc.code, exc.headers, exc.read(2000)


def check(origin: str) -> int:
    if not origin.startswith("https://") or "/" in origin.removeprefix("https://").strip("/"):
        print("Expected an HTTPS origin without any path or /api suffix")
        return 2
    origin = origin.rstrip("/")
    try:
        health_status, health_headers, health_body = inspect(origin + "/api/health")
        route_status, route_headers, route_body = inspect(origin + "/api/patient/appointments")
    except (URLError, TimeoutError) as exc:
        print("Cannot reach backend:", type(exc).__name__)
        return 1

    print("GET /api/health ->", health_status)
    print("GET /api/patient/appointments (no token) ->", route_status)
    try:
        health = json.loads(health_body)
    except (ValueError, UnicodeDecodeError):
        health = None
    feature_header = health_headers.get("X-Carely-Backend-Capabilities", "")
    if (health_status == 200 and isinstance(health, dict) and health.get("status") == "ok"
            and "patient-appointments-v1" in feature_header and route_status == 401):
        print("PASS: deployed FastAPI supports authenticated Patient appointments.")
        return 0
    if route_status == 404:
        print("FAIL: this backend does not expose /api/patient/appointments. Deploy PR backend first.")
    elif health_status == 200 and feature_header == "":
        print("FAIL: this backend does not advertise patient-appointments-v1; check deployed commit.")
    elif b"<!DOCTYPE html" in health_body or b"<!DOCTYPE html" in route_body:
        print("FAIL: received HTML instead of FastAPI JSON; check proxy and deployment protection.")
    else:
        print("FAIL: backend capability/status mismatch. Check Render/Vercel routing.")
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend_origin", help="e.g. https://your-render-preview.onrender.com")
    args = parser.parse_args()
    sys.exit(check(args.backend_origin))


if __name__ == "__main__":
    main()
