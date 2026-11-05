import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const api = require("../src/lib/fe1-api.ts");
const { ContractApiError } = require("../src/lib/contract-api.ts");
const { parseCatalog, catalogPath } = require("../src/lib/doctor-catalog.ts");
const { subscribeDoctorChanges } = require("../src/lib/doctor-realtime.ts");
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const appointment = { id, doctorId: id, patientName: "Synthetic Patient", patientPhone: "0900000000",
  startAt: "2030-01-02T02:00:00Z", endAt: "2030-01-02T02:30:00Z", status: "confirmed" };
const notification = { id, appointmentId: id, patientName: "Synthetic Patient", startAt: appointment.startAt,
  endAt: appointment.endAt, createdAt: "2030-01-01T01:00:00Z", readAt: null };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  try { globalThis.fetch = handler; await run(); } finally { globalThis.fetch = original; }
}

test("Patient identity comes from a Bearer-authenticated profile, never a role supplied by the UI", async () => {
  await withFetch(async (path, options) => {
    assert.equal(path, "/api/auth/me"); assert.equal(options.headers.Authorization, "Bearer patient-jwt"); assert.equal(options.cache, "no-store");
    return json({ role: "patient", patient: { id, name: "Test", phone: "0900000000", email: "test@example.invalid" } });
  }, async () => assert.equal((await api.loadIdentity("patient-jwt")).role, "patient"));
});
test("Doctor identity comes from one verified backend identity request", async () => {
  const paths = [];
  await withFetch(async path => { paths.push(path); return json({ role: "doctor", doctor: { id, name: "Test Doctor", specialty: "Test", active: true } }); }, async () => {
    const result = await api.loadIdentity("doctor-jwt"); assert.equal(result.role, "doctor"); assert.equal(result.doctor.id, id);
  });
  assert.deepEqual(paths, ["/api/auth/me"]);
});
test("401, 503 and malformed patient profiles never become a Doctor session", async () => {
  for (const status of [401, 503, 200]) {
    let calls = 0;
    await withFetch(async () => { calls++; return json({}, status); }, async () => {
      await assert.rejects(api.loadIdentity("token"), ContractApiError); assert.equal(calls, 1);
    });
  }
});
test("Upcoming removes past/exact-now/terminal rows and sorts future confirmed ascending", () => {
  const now = Date.parse("2030-01-02T01:00:00Z");
  const rows = [appointment, { ...appointment, id: "earlier", startAt: "2030-01-02T01:30:00Z" },
    { ...appointment, id: "past", startAt: "2030-01-01T01:00:00Z" }, { ...appointment, id: "now", startAt: "2030-01-02T01:00:00Z" },
    { ...appointment, id: "cancelled", status: "cancelled" }, { ...appointment, id: "completed", status: "completed" }];
  assert.deepEqual(api.upcomingAppointments(rows, now).map(row => row.id), ["earlier", id]); assert.equal(rows[0], appointment);
});
test("Reject cross-doctor appointments, legacy statuses, duplicates and malformed dates", () => {
  for (const row of [{ ...appointment, doctorId: other }, { ...appointment, status: "requested" },
    { ...appointment, startAt: "2030-01-02 09:00" }, { ...appointment, endAt: appointment.startAt }, { ...appointment, patientPhone: 900000000 }]) {
    assert.throws(() => api.parseAppointments({ appointments: [row] }, id), ContractApiError);
  }
  assert.throws(() => api.parseAppointments({ appointments: [appointment, appointment] }, id), ContractApiError);
  assert.deepEqual(api.parseAppointments({ appointments: [] }, id), []);
});
test("Notifications preserve persisted read state and exact appointment identity", () => {
  const read = { ...notification, id: other, appointmentId: other, readAt: "2030-01-01T01:10:00Z", createdAt: "2030-01-01T01:05:00Z" };
  const result = api.parseNotifications({ notifications: [notification, read] });
  assert.equal(result[0].appointmentId, other); assert.equal(result[0].readAt, read.readAt); assert.equal(result[1].readAt, null);
  assert.throws(() => api.parseNotifications({ notifications: [{ ...notification, appointmentId: "../../other" }] }), ContractApiError);
});
test("Mark-read uses PATCH and validates the matching persisted receipt", async () => {
  await withFetch(async (path, options) => {
    assert.equal(path, `/api/doctor/notifications/${id}`); assert.equal(options.method, "PATCH");
    assert.equal(options.headers.Authorization, "Bearer token"); assert.deepEqual(JSON.parse(options.body), { read: true });
    return json({ notification: { id, readAt: "2030-01-01T01:10:00Z" } });
  }, async () => assert.equal(await api.markNotificationRead(id, "token"), "2030-01-01T01:10:00Z"));
  await withFetch(async () => json({ notification: { id: other, readAt: "2030-01-01T01:10:00Z" } }), async () => {
    await assert.rejects(api.markNotificationRead(id, "token"), ContractApiError);
  });
});
test("Status updates send no doctor identity and cannot succeed on mismatch or conflict", async () => {
  await withFetch(async (path, options) => {
    assert.equal(path, `/api/doctor/appointments/${id}`); assert.deepEqual(JSON.parse(options.body), { status: "completed" });
    return json({ appointment: { id, status: "completed" } });
  }, async () => api.updateAppointment(id, "completed", "token"));
  for (const response of [json({ appointment: { id: other, status: "completed" } }), json({}, 409)]) {
    await withFetch(async () => response, async () => assert.rejects(api.updateAppointment(id, "completed", "token"), ContractApiError));
  }
});
test("Patient registration normalizes names/contact, preserves password and uses only contract keys", async () => {
  const value = { name: "  Nguye\u0302\u0303n Test  ", email: " test@example.invalid ", phone: " 0900000000 ", password: " private password ", confirmation: " private password ", invitationCode: "unused" };
  await withFetch(async (path, options) => {
    assert.equal(path, "/api/auth/patients/register"); assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { name: value.name.normalize("NFC").trim(), email: "test@example.invalid", phone: "0900000000", password: value.password });
    return json({ userId: id }, 201);
  }, async () => api.registerAccount("patient", value, []));
});
test("Doctor registration sends the invitation and chosen working hours to the real contract", async () => {
  const weeklyIntervals = [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];
  const value = { email: " doctor@example.invalid ", password: "exact password ", invitationCode: "  " + "i".repeat(43) + "  ", name: "ignored", phone: "ignored" };
  await withFetch(async (path, options) => {
    assert.equal(path, "/api/auth/doctors/register");
    assert.deepEqual(JSON.parse(options.body), { email: "doctor@example.invalid", password: value.password, invitationCode: "i".repeat(43), weeklyIntervals });
    return json({ doctorId: id }, 201);
  }, async () => api.registerAccount("doctor", value, weeklyIntervals));
});

test("Doctor registration refuses empty/overlapping hours before sending a mutation", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return json({ doctorId: id }, 201); }, async () => {
    for (const intervals of [[], [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }, { dayOfWeek: 1, startTime: "11:00", endTime: "13:00" }]]) {
      await assert.rejects(api.registerAccount("doctor", {}, intervals), error => error.status === 422);
    }
    assert.equal(calls, 0);
  });
});

test("Invitation refusal stays a failure and has an actionable message", async () => {
  await withFetch(async () => json({ error: "Access denied" }, 403), async () => {
    await assert.rejects(api.registerAccount("doctor", { email: "doctor@example.invalid", password: "test-password", invitationCode: "i".repeat(43) },
      [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }]), error => {
      assert.match(api.registrationMessage(error), /invitation.*expired/i); return true;
    });
  });
});
test("Registration rejects ambiguous/wrong 2xx success and does not retry mutations", async () => {
  for (const response of [json({ userId: id }), json({ userId: "not-an-id" }, 201), json({}, 503)]) {
    let calls = 0;
    await withFetch(async () => { calls++; return response; }, async () => {
      await assert.rejects(api.registerAccount("patient", { name: "Test", email: "test@example.invalid", phone: "0900000000", password: "test-password" }, []), ContractApiError);
      assert.equal(calls, 1);
    });
  }
});
test("Form validation checks patient details and requires an invitation rather than doctor self-asserted credentials", () => {
  const base = { name: "😀".repeat(100), email: "test@example.invalid", phone: "+84 (90) 123-4567", password: "test-password", confirmation: "test-password", invitationCode: "i".repeat(43) };
  assert.deepEqual(api.registrationErrors(base, "patient"), {});
  const errors = api.registrationErrors({ ...base, name: "😀".repeat(101), phone: "---------", confirmation: "wrong" }, "patient");
  assert.ok(errors.name && errors.phone && errors.confirmation);
  assert.ok(api.registrationErrors({ ...base, invitationCode: " " }, "doctor").invitationCode);
  assert.deepEqual(api.registrationErrors({ ...base, name: "", phone: "" }, "doctor"), {});
});
test("Return URLs cannot leave the origin or cross role boundaries", () => {
  for (const path of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/doctor", "/patient/login", "/%2fevil.invalid"]) assert.equal(api.safeReturnTo(path, "patient"), "/");
  assert.equal(api.safeReturnTo(`/doctors/${id}/book`, "patient"), `/doctors/${id}/book`);
  assert.equal(api.safeReturnTo(`/doctor/appointments/${id}`, "doctor"), `/doctor/appointments/${id}`);
  assert.equal(api.safeReturnTo("/patient/profile", "doctor"), "/doctor");
  assert.equal(api.safeReturnTo("/patient/profile", "patient"), "/patient/profile");
});
test("Catalog rejects invalid rows, excludes inactive doctors and retains rating/certificates", () => {
  const doctor = { id, name: "Synthetic Doctor", specialty: "Test", bio: "", address: "Test address", district: "Test", rating: 4.5, ratingCount: 2, certificates: [] };
  const data = parseCatalog({ doctors: [doctor, { ...doctor, id: other, active: false }], demoMode: false });
  assert.deepEqual(data.doctors, [doctor]);
  assert.throws(() => parseCatalog({ doctors: [{ ...doctor, rating: "4.5" }], demoMode: false }), ContractApiError);
  assert.throws(() => parseCatalog({ doctors: [{ ...doctor, id: "bad" }], demoMode: false }), ContractApiError);
  const path = new URL(catalogPath("Da liễu", "Nguyễn & Test"), "http://localhost");
  assert.equal(path.searchParams.get("specialty"), "Da liễu"); assert.equal(path.searchParams.get("keyword"), "Nguyễn & Test");
});
test("Realtime is scoped, refetches on every reconnect, and ignores events after unsubscribe", () => {
  const listeners = []; let channelStatus; let changes = 0, reconnects = 0, removed = 0;
  const channel = { on(type, filter, callback) { listeners.push({ type, filter, callback }); return this; }, subscribe(callback) { channelStatus = callback; return this; } };
  const client = { channel() { return channel; }, removeChannel() { removed++; return Promise.resolve(); } };
  const stop = subscribeDoctorChanges(client, id, true, () => changes++, () => reconnects++);
  assert.equal(listeners.length, 4);
  for (const listener of listeners) { assert.equal(listener.filter.filter, `doctor_id=eq.${id}`); listener.callback(); }
  channelStatus("SUBSCRIBED"); channelStatus("CHANNEL_ERROR"); channelStatus("SUBSCRIBED");
  assert.equal(changes, 4); assert.equal(reconnects, 2);
  stop(); listeners[0].callback(); channelStatus("SUBSCRIBED");
  assert.equal(removed, 1); assert.equal(changes, 4); assert.equal(reconnects, 2);
});
