"""Exercise real auth and booking through the frontend proxy using a dedicated synthetic doctor.

Requires migrations 005/006 and both local servers. Registration must allow
immediate password login without a confirmation email or an Admin API update. The database owner
must remove the synthetic doctor's booking/schedule rows before deleting it.
"""
import argparse
import json
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.service import get_client  # noqa: E402

STATE_PATH = Path(__file__).resolve().parents[1] / ".auth-integration-state.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    admin = get_client()
    if STATE_PATH.exists():
        parser.error("Reconcile the previous .auth-integration-state.json before running again")
    frontend = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env.local")
    auth_url = frontend["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/auth/v1"
    api_key = frontend["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    suffix = uuid4().hex
    password = secrets.token_urlsafe(24) + "aA1!"
    patient_email = f"auth-patient-{suffix}@example.com"
    doctor_email = f"auth-doctor-{suffix}@example.com"
    state = {"doctorId": None, "patientEmail": patient_email, "doctorEmail": doctor_email,
             "password": password, "userIds": []}

    def save():
        STATE_PATH.write_text(json.dumps(state), encoding="utf-8")

    save()
    with httpx.Client(base_url=args.base_url, timeout=30) as api, httpx.Client(timeout=20) as auth:
        def request(method, path, expected=200, token=None, body=None, certificate=None):
            content = {"json": body} if certificate is None else {
                "data": {"details": json.dumps(body)}, "files": {"evidence": certificate},
            }
            response = api.request(method, path, headers={"Authorization": f"Bearer {token}"} if token else {},
                                   **content)
            if response.status_code != expected:
                raise RuntimeError(f"{method} {path}: expected {expected}, received {response.status_code}")
            return response.json()

        def login(email, supplied_password=password):
            return auth.post(f"{auth_url}/token?grant_type=password", headers={"apikey": api_key},
                             json={"email": email, "password": supplied_password})

        assert request("GET", "/api/health")["databaseConfigured"] is True
        request("GET", "/api/auth/me", 401)
        request("GET", "/api/auth/me", 401, "invalid-token")
        patient = request("POST", "/api/auth/patients/register", 201, body={
            "email": patient_email, "password": password, "name": "Auth Integration Patient", "phone": "0900000000",
        })
        state["userIds"].append(patient["userId"])
        save()
        patient_login = login(patient_email)
        assert patient_login.status_code == 200
        patient_token = patient_login.json()["access_token"]
        assert login(patient_email, "wrong-password").status_code == 400
        identity = request("GET", "/api/auth/me", token=patient_token)
        assert identity["role"] == "patient" and identity["patient"]["id"] == patient["userId"]
        request("GET", "/api/doctor/me", 403, patient_token)
        request("POST", "/api/auth/patients/register", 409, body={
            "email": patient_email, "password": password, "name": "Auth Integration Patient", "phone": "0900000000",
        })
        print("PASS: real patient registration, immediate password login without email confirmation and database identity")

        weekly = [{"dayOfWeek": day, "startTime": "09:00", "endTime": "10:00"} for day in range(1, 8)]
        doctor_payload = {"email": doctor_email, "password": password, "name": "Auth Integration Doctor",
                          "phone": "0900000000", "address": "Synthetic integration address", "specialty": "Test",
                          "certificateName": "Synthetic certificate", "certificateIssuer": "Synthetic test issuer",
                          "certificateNumber": f"TEST-{suffix}"}
        request("POST", "/api/auth/doctors/register", 422, body=doctor_payload,
                certificate=("bad.pdf", b"invalid document", "application/pdf"))
        assert not any(user.email == doctor_email for user in admin.auth.admin.list_users())
        certificate = ("certificate.pdf", b"%PDF-1.7\nSynthetic integration certificate\n%%EOF", "application/pdf")
        registered_doctor = request("POST", "/api/auth/doctors/register", 201, body=doctor_payload, certificate=certificate)
        doctor_id = registered_doctor["doctorId"]
        state["doctorId"] = doctor_id
        save()
        doctor_user = admin.table("doctor_accounts").select("auth_user_id").eq("doctor_id", doctor_id).execute().data[0]
        state["userIds"].append(doctor_user["auth_user_id"])
        save()
        doctor_login = login(doctor_email)
        assert doctor_login.status_code == 200
        doctor_token = doctor_login.json()["access_token"]
        assert request("GET", "/api/auth/me", token=doctor_token)["role"] == "doctor"
        request("GET", "/api/patient/me", 403, doctor_token)
        request("GET", "/api/doctor/schedule", 404, doctor_token)
        details = admin.table("doctor_registration_details").select("document_path,certificate_number").eq(
            "doctor_id", doctor_id).execute().data[0]
        state["documentPath"] = details["document_path"]
        save()
        assert details["certificate_number"] == doctor_payload["certificateNumber"]
        assert admin.storage.from_("doctor-certificates").download(details["document_path"]) == certificate[1]
        request("POST", "/api/auth/doctors/register", 409, body=doctor_payload, certificate=certificate)
        tomorrow = (datetime.now(timezone(timedelta(hours=7))) + timedelta(days=1)).date().isoformat()
        request("PUT", "/api/doctor/schedule", token=doctor_token,
                body={"effectiveDate": tomorrow, "weeklyIntervals": weekly})
        assert request("GET", "/api/doctor/schedule", token=doctor_token)["weeklyIntervals"] == weekly
        print("PASS: personal/certificate registration, saved private document, role isolation and first schedule setup")

        availability = request("GET", f"/api/doctors/{doctor_id}/slots")
        assert availability["demoMode"] is False and availability["slots"]
        booking_body = {"slotId": availability["slots"][0]["id"], "patientName": "Spoofed name",
                        "patientPhone": "0999999999", "notes": "Synthetic auth integration verification"}
        request("POST", "/api/appointments", 403, doctor_token, booking_body)
        booking = request("POST", "/api/appointments", 201, patient_token, booking_body)
        state["appointmentId"] = booking["appointmentId"]
        save()
        assert booking["status"] == "confirmed"
        request("POST", "/api/appointments", 409, patient_token, booking_body)
        appointments = request("GET", "/api/doctor/appointments?view=upcoming", token=doctor_token)["appointments"]
        appointment = next(row for row in appointments if row["id"] == booking["appointmentId"])
        assert appointment["patientName"] == "Auth Integration Patient" and appointment["patientPhone"] == "0900000000"
        notices = request("GET", "/api/doctor/notifications", token=doctor_token)["notifications"]
        notice = next(row for row in notices if row["appointmentId"] == booking["appointmentId"])
        request("PATCH", f"/api/doctor/notifications/{notice['id']}", token=doctor_token, body={"read": True})
        request("PATCH", f"/api/doctor/appointments/{booking['appointmentId']}", token=doctor_token,
                body={"status": "cancelled"})
        print("PASS: patient JWT booking, duplicate refusal, database profile snapshot, doctor dashboard and notification")

        later = (datetime.now(timezone(timedelta(hours=7))) + timedelta(days=2)).date().isoformat()
        updated = [{**row, "endTime": "11:00"} for row in weekly]
        request("PUT", "/api/doctor/schedule", token=doctor_token,
                body={"effectiveDate": later, "weeklyIntervals": updated})
        assert request("GET", "/api/doctor/schedule", token=doctor_token)["weeklyIntervals"] == updated
        refresh = auth.post(f"{auth_url}/token?grant_type=refresh_token", headers={"apikey": api_key},
                            json={"refresh_token": patient_login.json()["refresh_token"]})
        assert refresh.status_code == 200
        refreshed_token = refresh.json()["access_token"]
        assert request("GET", "/api/auth/me", token=refreshed_token)["role"] == "patient"
        logout = auth.post(f"{auth_url}/logout?scope=local", headers={"apikey": api_key,
                                                                  "Authorization": f"Bearer {refreshed_token}"})
        assert logout.status_code == 204
        print("PASS: schedule updates, session refresh and sign out")
        print("Synthetic credentials retained in backend/.auth-integration-state.json for browser verification/cleanup.")


if __name__ == "__main__":
    main()
