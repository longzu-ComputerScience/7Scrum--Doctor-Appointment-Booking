import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );

const doctorApi = require("../src/app/doctor/doctor-api.ts");
const { ContractApiError, apiMessage } = require("../src/lib/contract-api.ts");

const doctorId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const slotId = "22222222-2222-4222-8222-222222222222";

async function withFetch(callback, run) {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = callback;
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("doctor-api: getDoctorProfile rejects missing or empty token before network call", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; throw new Error("Unexpected request"); }, async () => {
  await assert.rejects(
    () => doctorApi.getDoctorProfile(""),
    (err) => err instanceof ContractApiError && err.status === 401
  );
  await assert.rejects(
    () => doctorApi.getDoctorProfile("   "),
    (err) => err instanceof ContractApiError && err.status === 401
  );
  });
  assert.equal(calls, 0);
});

test("doctor-api: getDoctorProfile parses valid doctor profile and extracts fields", async () => {
  await withFetch(
    async (url, init) => {
      assert.equal(url, "/api/doctor/me");
      assert.equal(init?.headers?.Authorization, "Bearer test-jwt-token");
      return jsonResponse({
        doctor: {
          id: doctorId,
          name: "Dr. Nguyen Minh An",
          specialty: "Cardiology",
          bio: "Senior Cardiologist",
          address: "123 Healthcare Blvd",
          district: "District 1",
          rating: 4.9,
          ratingCount: 42,
        },
      });
    },
    async () => {
      const profile = await doctorApi.getDoctorProfile("test-jwt-token");
      assert.equal(profile.id, doctorId);
      assert.equal(profile.name, "Dr. Nguyen Minh An");
      assert.equal(profile.specialty, "Cardiology");
      assert.equal(profile.district, "District 1");
      assert.equal(profile.rating, 4.9);
      assert.equal(profile.ratingCount, 42);
    }
  );
});

test("doctor-api: getDoctorProfile rejects malformed profile or missing UUID", async () => {
  await withFetch(
    async () => jsonResponse({ doctor: { id: "not-a-uuid", name: "Dr. Bad Data" } }),
    async () => {
      await assert.rejects(
        () => doctorApi.getDoctorProfile("test-token"),
        (err) => err instanceof ContractApiError && err.status === "invalid"
      );
    }
  );

  await withFetch(
    async () => jsonResponse({ invalidKey: {} }),
    async () => {
      await assert.rejects(
        () => doctorApi.getDoctorProfile("test-token"),
        (err) => err instanceof ContractApiError && err.status === "invalid"
      );
    }
  );
});

test("doctor-api: listDoctorAppointments rejects missing token before network call", async () => {
  await assert.rejects(
    () => doctorApi.listDoctorAppointments(""),
    (err) => err instanceof ContractApiError && err.status === 401
  );
});

test("doctor-api: listDoctorAppointments parses valid appointments list", async () => {
  await withFetch(
    async (url, init) => {
      assert.equal(url, "/api/doctor/appointments");
      assert.equal(init?.headers?.Authorization, "Bearer valid-token");
      return jsonResponse({
        appointments: [
          {
            id: appointmentId,
            slotId: slotId,
            patientName: "Nguyen Van A",
            patientPhone: "0901234567",
            startAt: "2026-11-10T02:00:00Z",
            status: "confirmed",
          },
        ],
      });
    },
    async () => {
      const list = await doctorApi.listDoctorAppointments("valid-token");
      assert.equal(list.length, 1);
      assert.equal(list[0].id, appointmentId);
      assert.equal(list[0].slotId, slotId);
      assert.equal(list[0].patientName, "Nguyen Van A");
      assert.equal(list[0].patientPhone, "0901234567");
      assert.equal(list[0].status, "confirmed");
    }
  );
});

test("doctor-api: listDoctorAppointments accepts empty list without fabricating records", async () => {
  await withFetch(
    async () => jsonResponse({ appointments: [] }),
    async () => {
      const list = await doctorApi.listDoctorAppointments("valid-token");
      assert.deepEqual(list, []);
    }
  );
});

test("doctor-api: listDoctorAppointments safely maps HTTP errors without leaking raw bodies", async () => {
  await withFetch(
    async () => new Response("Internal Server Error", { status: 503 }),
    async () => {
      await assert.rejects(
        () => doctorApi.listDoctorAppointments("valid-token"),
        (err) => {
          assert.equal(err instanceof ContractApiError, true);
          assert.equal(apiMessage(err).includes("unavailable"), true);
          return true;
        }
      );
    }
  );
});

test("doctor-api: 401 and 403 reject protected reads without exposing error payloads", async () => {
  for (const status of [401, 403]) {
    await withFetch(async () => jsonResponse({ error: "private server details" }, status), async () => {
      for (const read of [doctorApi.getDoctorProfile, doctorApi.listDoctorAppointments]) {
        await assert.rejects(() => read("sdk-access-token"), error => {
          assert.equal(error.status, status);
          assert.equal(apiMessage(error).includes("private server details"), false);
          return true;
        });
      }
    });
  }
});

test("doctor-api: malformed appointments never become confirmed visits", async () => {
  const valid = { id: appointmentId, slotId, patientName: "Test patient", startAt: "2026-11-10T02:00:00Z", status: "confirmed" };
  for (const changes of [{ status: undefined }, { status: "requested" }, { startAt: "invalid" }, { startAt: "2026-11-10T02:00:00" }, { slotId: "invalid" }]) {
    await withFetch(async () => jsonResponse({ appointments: [{ ...valid, ...changes }] }), async () => {
      await assert.rejects(() => doctorApi.listDoctorAppointments("sdk-access-token"), error => error.status === "invalid");
    });
  }
});

test("upcoming appointments include only future confirmed visits, sorted without mutating source", () => {
  const now = Date.parse("2026-11-05T00:00:00Z");
  const source = [
    { id: "later", status: "confirmed", startAt: "2026-11-07T02:00:00Z" },
    { id: "past", status: "confirmed", startAt: "2026-11-04T02:00:00Z" },
    { id: "cancelled", status: "cancelled", startAt: "2026-11-06T02:00:00Z" },
    { id: "completed", status: "completed", startAt: "2026-11-06T02:00:00Z" },
    { id: "earlier", status: "confirmed", startAt: "2026-11-06T02:00:00Z" },
    { id: "now", status: "confirmed", startAt: "2026-11-05T00:00:00Z" },
  ];
  const original = structuredClone(source);
  assert.deepEqual(doctorApi.upcomingAppointments(source, now).map(item => item.id), ["earlier", "later"]);
  assert.deepEqual(source, original);
});
