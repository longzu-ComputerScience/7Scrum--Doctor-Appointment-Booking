import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const weekly = require("../src/app/doctor/weekly-schedule-utils.ts");
const schedule = require("../src/app/doctor/schedule-api.ts");
const booking = require("../src/app/doctors/[id]/book/booking-utils.ts");
const { ContractApiError, requestJson, apiMessage } = require("../src/lib/contract-api.ts");
const { vietnamDate, formatScheduleDay, formatScheduleTime } = require("../src/lib/schedule-time.ts");
const doctorId = "11111111-1111-4111-8111-111111111111";
const slotId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const interval = { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" };
const now = new Date("2030-01-01T18:00:00Z"); // Vietnam January 2
const slot = { id: slotId, doctorId, startAt: "2030-01-03T02:00:00Z", endAt: "2030-01-03T02:30:00Z" };
const range = { from: "2030-01-02", to: "2030-01-29" };
async function withFetch(callback, run) {
  const original = globalThis.fetch;
  try { globalThis.fetch = callback; await run(); } finally { globalThis.fetch = original; }
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("shared Vietnam dates and times remain stable across workstation timezones", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh"]) {
      process.env.TZ = timezone;
      assert.equal(vietnamDate(new Date("2030-01-01T18:00:00Z")), "2030-01-02");
      assert.equal(formatScheduleDay("2030-01-01T18:00:00Z"), "02/01/2030");
      assert.equal(formatScheduleTime("2030-01-01T18:00:00Z"), "01:00");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("Vietnam calendar-day validation handles UTC midnight and leap years", () => {
  assert.equal(vietnamDate(new Date("2030-01-01T16:59:59Z")), "2030-01-01");
  assert.equal(vietnamDate(new Date("2030-01-01T17:00:00Z")), "2030-01-02");
  assert.equal(weekly.isCalendarDate("2032-02-29"), true);
  assert.equal(weekly.isCalendarDate("2030-02-29"), false);
});

test("weekly editor requires a day and rejects invalid weekdays and wall times", () => {
  assert.ok(weekly.hasWeeklyErrors(weekly.validateWeeklySchedule([])));
  for (const value of [{ ...interval, dayOfWeek: 0 }, { ...interval, dayOfWeek: 8 }, { ...interval, dayOfWeek: 1.5 },
    { ...interval, startTime: "24:00" }, { ...interval, endTime: "9:30" }]) {
    assert.ok(weekly.hasWeeklyErrors(weekly.validateWeeklySchedule([value])));
  }
});
test("intervals require positive >=30 minute duration in multiples of 30", () => {
  for (const endTime of ["08:30", "09:00", "09:15", "09:45"]) {
    assert.ok(weekly.validateWeeklySchedule([{ ...interval, endTime }]).intervals[0]);
  }
  for (const endTime of ["09:30", "10:00", "23:30"]) {
    assert.equal(weekly.hasWeeklyErrors(weekly.validateWeeklySchedule([{ ...interval, endTime }])), false);
  }
});
test("overlap detection handles nested/unsorted ranges; adjacency and different days are valid", () => {
  const nested = weekly.validateWeeklySchedule([interval, { ...interval, startTime: "10:00", endTime: "11:00" }]);
  assert.ok(nested.intervals[0]); assert.ok(nested.intervals[1]);
  const valid = [{ ...interval, startTime: "13:00", endTime: "17:00" }, interval,
    { ...interval, startTime: "12:00", endTime: "13:00" }, { ...interval, dayOfWeek: 2 }];
  assert.equal(weekly.hasWeeklyErrors(weekly.validateWeeklySchedule(valid)), false);
});
test("update date must be a real future calendar date in Vietnam, independent of host TZ", () => {
  for (const date of ["", "2030-01-01", "2030-01-02", "2030-02-30", "2030-1-03"]) {
    assert.ok(weekly.validateWeeklySchedule([interval], date, now).effectiveDate);
  }
  assert.equal(weekly.hasWeeklyErrors(weekly.validateWeeklySchedule([interval], "2030-01-03", now)), false);
});
test("schedule GET accepts an empty schedule and validates timezone; PUT rejects malformed data", () => {
  assert.deepEqual(schedule.parseSchedule({ timezone: "Asia/Ho_Chi_Minh", effectiveDate: "2030-01-01", weeklyIntervals: [] }, true).weeklyIntervals, []);
  assert.throws(() => schedule.parseSchedule({ timezone: "UTC", effectiveDate: "2030-01-01", weeklyIntervals: [interval] }, true));
  assert.throws(() => schedule.parseSchedule({ effectiveDate: "2030-02-30", weeklyIntervals: [interval] }));
});
test("409 conflicts are structured, date-checked and never derived from raw error text", () => {
  const conflict = { appointmentId, startAt: slot.startAt, endAt: slot.endAt };
  assert.deepEqual(schedule.scheduleConflicts(new ContractApiError(409, { error: "SCHEDULE_CONFLICT", conflicts: [conflict, { ...conflict, startAt: "invalid" }] })), [conflict]);
  assert.deepEqual(schedule.scheduleConflicts(new ContractApiError(409, { error: "private details" })), []);
});
test("422 maps schedule and patient field locations without exposing validation input", () => {
  const failure = new ContractApiError(422, { detail: [
    { loc: ["body", "weeklyIntervals", 1, "endTime"], input: "secret" }, { loc: ["body", "effectiveDate"] }, { loc: ["body", "patientName"] },
  ] });
  assert.ok(schedule.scheduleValidationErrors(failure).intervals[1]);
  assert.ok(schedule.scheduleValidationErrors(failure).effectiveDate);
  assert.ok(booking.bookingFieldErrors(failure).name);
  assert.ok(!JSON.stringify([schedule.scheduleValidationErrors(failure), booking.bookingFieldErrors(failure)]).includes("secret"));
});
test("Doctor PUT sends only the contract body and JWT, and checks the returned saved schedule", async () => {
  const input = { effectiveDate: "2099-01-02", weeklyIntervals: [interval] };
  await withFetch(async (url, options) => {
    assert.equal(url, "/api/doctor/schedule"); assert.equal(options.method, "PUT");
    assert.equal(options.headers.Authorization, "Bearer unit-test-token");
    assert.deepEqual(JSON.parse(options.body), input); assert.equal(options.cache, "no-store");
    return json(input);
  }, async () => assert.deepEqual(await schedule.putDoctorSchedule("unit-test-token", input), input));
  await withFetch(async () => json({ ...input, effectiveDate: "2099-01-03" }), async () => {
    await assert.rejects(schedule.putDoctorSchedule("unit-test-token", input), error => error.status === "invalid");
  });
});
test("public Doctor parsing requires V2 address/district and rejects the old clinic-only response", () => {
  const doctor = { id: doctorId, name: "Unit test doctor", specialty: "Test", bio: "", address: "Test address", district: "Test district" };
  assert.equal(booking.parseBookingDoctor(doctor, doctorId).address, "Test address");
  const { address, ...legacy } = doctor;
  assert.throws(() => booking.parseBookingDoctor({ ...legacy, clinicAddress: address }, doctorId));
});
test("calendar accepts only server-provided 30-minute slots, filters past/out-of-window and preserves slotId", () => {
  const parsed = booking.parseBookingSlots([slot], doctorId, range, now.getTime());
  assert.equal(parsed[0].id, slotId); assert.equal(parsed[0].available, true);
  assert.deepEqual(booking.parseBookingSlots([slot], doctorId, range, Date.parse(slot.startAt)), []);
  assert.deepEqual(booking.parseBookingSlots([slot], doctorId, { from: "2030-01-04", to: "2030-01-05" }, now.getTime()), []);
  assert.throws(() => booking.parseBookingSlots([{ ...slot, endAt: "2030-01-03T03:00:00Z" }], doctorId, range, now.getTime()));
  assert.throws(() => booking.parseBookingSlots([{ ...slot, doctorId: appointmentId }], doctorId, range, now.getTime()));
  assert.throws(() => booking.parseBookingSlots([slot, slot], doctorId, range, now.getTime()));
});
test("overlapping returned slots are rejected rather than generating new frontend IDs", () => {
  assert.throws(() => booking.parseBookingSlots([slot, { ...slot, id: appointmentId, startAt: "2030-01-03T02:15:00Z", endAt: "2030-01-03T02:45:00Z" }], doctorId, range, now.getTime()));
});
test("refetch marks a removed slot unavailable; reappearance restores availability", () => {
  const initial = [{ ...slot, available: true }];
  const gone = booking.reconcileAvailability(initial, [], range, now.getTime());
  assert.equal(gone[0].available, false); assert.equal(gone[0].id, slotId);
  assert.deepEqual(booking.reconcileAvailability(gone, initial, range, now.getTime()), initial);
  assert.deepEqual(booking.reconcileAvailability(initial, [], range, Date.parse(slot.startAt)), []);
});
test("booking window covers exactly 28 Vietnam dates across month/year boundaries", () => {
  assert.deepEqual(booking.bookingRange(new Date("2029-12-31T18:00:00Z")), { from: "2030-01-01", to: "2030-01-28" });
});
test("patient validation normalizes NFC and counts Unicode code points", () => {
  assert.deepEqual(booking.validatePatient("  Nguyễn Test  ", "0900000000", ""), {});
  assert.deepEqual(booking.validatePatient("😀".repeat(100), "0900000000", "😀".repeat(500)), {});
  assert.ok(booking.validatePatient("A", "--- --- --", "x".repeat(501)).name);
  assert.ok(booking.validatePatient("Test", "--- --- --", "").phone);
});
test("missing JWT refuses Doctor and Patient mutations before sending any request", async () => {
  await withFetch(async () => { throw Error("Must not fetch"); }, async () => {
    await assert.rejects(booking.createBooking("", slotId, "Test", "0900000000", ""), error => error.status === 401);
    await assert.rejects(schedule.putDoctorSchedule("", { effectiveDate: "2099-01-02", weeklyIntervals: [interval] }), error => error.status === 401);
  });
});
test("booking sends Patient JWT and slotId; only a valid 201 confirmed body is accepted (isolated HTTP stub)", async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, "/api/appointments"); assert.equal(options.headers.Authorization, "Bearer unit-test-token");
    assert.deepEqual(JSON.parse(options.body), { slotId, patientName: "Test Patient", patientPhone: "0900000000", notes: "" });
    return json({ appointmentId, bookingReference: "UNIT-TEST-ONLY", status: "confirmed" }, 201);
  }, async () => assert.equal((await booking.createBooking("unit-test-token", slotId, " Test Patient ", "0900000000", "")).reference, "UNIT-TEST-ONLY"));
});
test("requested, demo, 200/202, malformed IDs, missing reference and non-JSON success never confirm a booking", async () => {
  const good = { appointmentId, bookingReference: "UNIT-TEST-ONLY", status: "confirmed" };
  const responses = [json({ ...good, status: "requested" }, 201), json({ ...good, demoMode: true }, 201), json(good, 200), json(good, 202),
    json({ ...good, appointmentId: "bad" }, 201), json({ ...good, bookingReference: "" }, 201), new Response("not JSON", { status: 201 })];
  for (const response of responses) await withFetch(async () => response, async () => {
    await assert.rejects(booking.createBooking("test", slotId, "Test", "0900000000", ""), error => error.status === "invalid" && error.uncertain);
  });
});
test("401/403/409/422/503 and non-JSON/network failures stay failures; no automatic POST retry", async () => {
  for (const status of [401, 403, 409, 422, 503]) {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response("proxy failure", { status }); }, async () => {
      await assert.rejects(booking.createBooking("test", slotId, "Test", "0900000000", ""), error => error.status === status);
    });
    assert.equal(calls, 1); assert.ok(apiMessage(new ContractApiError(status)).length > 15);
  }
  await withFetch(async () => { throw new TypeError("private details"); }, async () => {
    await assert.rejects(requestJson("/api/doctor/schedule"), error => error.status === "network" && error.uncertain && !error.message.includes("private"));
  });
});

test("booking reads use the bounded public URL, no-store, runtime checks and demo flag", async () => {
  const seen = [];
  await withFetch(async (url, options) => {
    seen.push(url); assert.equal(options.cache, "no-store"); assert.equal(options.headers.Authorization, undefined);
    return url.includes("/slots?") ? json({ slots: [slot], demoMode: true }) : json({ doctor: {
      id: doctorId, name: "Unit Test", specialty: "Test", bio: "", address: "Test address", district: "Test district",
    }, demoMode: false });
  }, async () => {
    const data = await booking.loadBookingData(doctorId, undefined, range);
    assert.equal(data.demo, true); assert.equal(data.slots[0].id, slotId);
  });
  assert.ok(seen.includes(`/api/doctors/${doctorId}/slots?from=2030-01-02&to=2030-01-29`));
});
test("Patient prefill loads only authenticated /api/patient/me and checks the profile shape", async () => {
  const patient = { id: appointmentId, name: "Unit Test", phone: "0900000000", email: "test@example.invalid" };
  await withFetch(async (url, options) => {
    assert.equal(url, "/api/patient/me"); assert.equal(options.headers.Authorization, "Bearer unit-test-token");
    return json({ patient });
  }, async () => assert.deepEqual(await booking.loadPatientProfile("unit-test-token"), patient));
  await withFetch(async () => json({ patient: { ...patient, phone: 900000000 } }), async () => {
    await assert.rejects(booking.loadPatientProfile("unit-test-token"), error => error.status === "invalid");
  });
});
