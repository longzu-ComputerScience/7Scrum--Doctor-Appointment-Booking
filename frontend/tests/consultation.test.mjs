import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { postConsultation, parseConsultation, responseSource, aiApiStatus, scriptedReplyOptions } = require("../src/lib/consultation-api.ts");
const { ContractApiError } = require("../src/lib/contract-api.ts");
const followUp = { reply: "When did it start?", followUpRequired: true, specialty: null,
  doctors: [], urgent: false, usedAI: false, mode: "controlled-prototype", demoMode: false };
const validDoctor = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "BS. Nguyễn Minh An (Demo)", specialty: "Da liễu",
  bio: "Care for skin", district: "Thủ Đức", address: "Demo Clinic A",
};
const specialty = { ...followUp, reply: "Consider dermatology.", followUpRequired: false,
  specialty: "Da liễu", doctors: [validDoctor], demoMode: true };

test("consultation sends patient-authored turns in order and reads the server's follow-up and specialty", async () => {
  const original = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/consult");
      assert.equal(options.method, "POST");
      requests.push(JSON.parse(options.body));
      return new Response(JSON.stringify(requests.length === 1 ? followUp : specialty), { status: 200 });
    };
    assert.equal((await postConsultation(["I have a rash"])).followUpRequired, true);
    const recommendation = await postConsultation(["I have a rash", "Since yesterday"]);
    assert.equal(recommendation.specialty, "Da liễu");
    assert.equal(recommendation.doctors[0].id, validDoctor.id);
    assert.equal(recommendation.demoMode, true);
    assert.deepEqual(requests, [{ messages: ["I have a rash"] }, { messages: ["I have a rash", "Since yesterday"] }]);
  } finally { globalThis.fetch = original; }
});

test("invalid input and malformed responses cannot appear as successful advice", async () => {
  await assert.rejects(postConsultation(["x"]), error => error instanceof ContractApiError && error.status === 422);
  assert.throws(() => parseConsultation({ ...specialty, urgent: "false" }), ContractApiError);
  assert.throws(() => parseConsultation({ ...specialty, reply: "" }), ContractApiError);
});

test("urgent results keep the service warning and source available to the UI", () => {
  const result = parseConsultation({ ...specialty, doctors: [], urgent: true, reply: "Seek emergency help.", mode: "fallback", usedAI: false });
  assert.equal(result.urgent, true);
  assert.equal(result.reply, "Seek emergency help.");
  assert.equal(responseSource(result), "Fallback");
  assert.equal(responseSource({ ...result, mode: "ai" }), "AI");
});

test("AI API light only confirms the latest successful AI-assisted reply", () => {
  const aiReply = parseConsultation({ ...followUp, usedAI: true, mode: "follow-up" });
  const fallback = parseConsultation({ ...followUp, usedAI: false, mode: "rule-based" });
  assert.equal(aiApiStatus(null, false, false), "unchecked");
  assert.equal(aiApiStatus(aiReply, true, false), "checking");
  assert.equal(aiApiStatus(aiReply, false, false), "connected");
  assert.equal(aiApiStatus(aiReply, false, true), "error");
  assert.equal(aiApiStatus(fallback, false, false), "fallback");
  assert.equal(aiApiStatus({ ...aiReply, urgent: true }, false, false), "fallback");
});



test("sample doctor cards require real catalog-shaped UUID records", () => {
  const parsed = parseConsultation(specialty);
  assert.equal(parsed.doctors[0].id, validDoctor.id);
  assert.equal(parsed.doctors[0].specialty, "Da liễu");
  for (const bad of [
    { ...validDoctor, id: "/admin/approve" },
    { ...validDoctor, name: "" },
    { ...validDoctor, specialty: null },
    { ...validDoctor, address: undefined },
  ]) {
    assert.throws(() => parseConsultation({ ...specialty, doctors: [bad] }), ContractApiError);
  }
  assert.throws(() => parseConsultation({ ...specialty, urgent: true }), ContractApiError);
  assert.throws(() => parseConsultation({ ...specialty, followUpRequired: true }), ContractApiError);
  assert.throws(() => parseConsultation({ ...specialty, specialty: null }), ContractApiError);
});

test("scripted quick replies offer concrete answers to no-AI follow-ups", () => {
  const onset = scriptedReplyOptions("Triệu chứng này bắt đầu từ khi nào?");
  assert.ok(onset.includes("Khoảng 2 ngày"));
  const location = scriptedReplyOptions("Bạn đang gặp triệu chứng chính gì và ở bộ phận nào?");
  assert.ok(location.includes("Nổi mẩn ở da"));
  assert.ok(scriptedReplyOptions("Bạn muốn khám chuyên khoa nào hay khám tổng quát?").includes("Khám tổng quát"));
  for (const choices of [onset, location]) {
    assert.ok(choices.every(x => x.length >= 2 && x.length <= 800));
  }
});
