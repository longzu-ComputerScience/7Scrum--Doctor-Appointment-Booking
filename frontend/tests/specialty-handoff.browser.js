// Run with playwright-cli run-code --filename=frontend/tests/specialty-handoff.browser.js
// Start frontend on :3049 with the fixture public Supabase URL documented in the handoff.
// Real repository backend runs on :8050 without DB credentials (explicit demo responses).
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI evaluates this function expression.
async (page) => {
  await page.unrouteAll({ behavior: "wait" }); // Keep reruns independent after a failed assertion.
  const base = "http://127.0.0.1:3049";
  const sourceCatalog = await (await page.request.get(`${base}/api/doctors?specialty=Dermatology`)).json();
  if (sourceCatalog.demoMode !== true || !sourceCatalog.doctors?.length) throw new Error("Run this suite against the repository demo backend");
  const doctorId = sourceCatalog.doctors[0].id;
  const patientId = "99999999-9999-4999-8999-999999999999";
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const visible = async (locator) => { await locator.waitFor({ state: "visible", timeout: 15000 }); };
  const catalog = () => page.getByRole("region", { name: "Doctor catalog" });
  let submissions = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/appointments")) submissions++; });
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.addInitScript(({ patientId }) => {
    localStorage.setItem("sb-issue49-auth-token", JSON.stringify({ access_token: "issue49-synthetic-session", refresh_token: "issue49-synthetic-refresh",
      token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: patientId, aud: "authenticated", role: "authenticated", email: "qa@example.invalid", app_metadata: {}, user_metadata: {} } }));
  }, { patientId });
  await page.route("**/api/patient/me", route => route.fulfill({ json: { patient: { id: patientId, name: "QA Fixture Patient", phone: "0900000000", email: "qa@example.invalid" } } }));
  await page.goto(`${base}/?specialty=Dermatology#book`);
  await visible(catalog().getByRole("link").first());
  check(await catalog().getByRole("link").count() === 1, "Dermatology must return exactly the repository demo match");
  check((await catalog().innerText()).includes("Dermatology"), "Translated specialty missing");
  await visible(page.getByText("Demo mode:", { exact: false }));
  const bookingLink = page.getByRole("link", { name: /^Book with/ });
  const href = await bookingLink.getAttribute("href");
  check(new URL(href, base).pathname === `/doctors/${doctorId}/book`, "Profile must link to the catalog doctor's existing calendar");
  check(new URL(href, base).searchParams.get("specialty") === "Da liễu", "Booking URL must retain the canonical specialty");
  await page.screenshot({ path: "output/playwright/issue49/discovery-filtered-desktop.png", fullPage: true });

  await page.reload();
  await visible(bookingLink);
  check(await catalog().getByRole("link").count() === 1, "Refresh lost specialty");
  await catalog().getByRole("button", { name: "Dermatology", exact: true }).click();
  await visible(bookingLink); // Clicking the selected filter must not leave an endless loader.
  await bookingLink.click();
  await visible(page.getByRole("dialog"));
  await visible(page.getByRole("button", { name: "Booking unavailable in demo" }));
  check(await page.getByRole("button", { name: "Booking unavailable in demo" }).isDisabled(), "Demo must never enable booking");
  check(page.url().includes(`/doctors/${doctorId}/book?`), "Profile did not open the V2 calendar route");
  await page.screenshot({ path: "output/playwright/issue49/booking-handoff-desktop.png" });
  await page.getByRole("button", { name: "Close booking dialog" }).click();
  await visible(bookingLink);
  check(new URL(page.url()).searchParams.get("specialty") === "Da liễu", "Modal close lost specialty");
  check(new URL(page.url()).searchParams.get("doctor") === doctorId, "Modal close lost selected doctor");

  await catalog().getByRole("link").first().click();
  await visible(page.getByRole("dialog"));
  await page.goBack();
  await visible(bookingLink);
  check(!(await page.getByRole("dialog").isVisible()), "Browser Back did not dismiss calendar");
  await page.goForward();
  await visible(page.getByRole("dialog"));
  await page.reload(); // Hard navigation uses the existing full-page BookingClient.
  await visible(page.getByRole("button", { name: "Close booking dialog" }));
  await page.getByRole("button", { name: "Close booking dialog" }).click();
  await visible(bookingLink);
  check(new URL(page.url()).searchParams.get("doctor") === doctorId, "Refreshed calendar return lost doctor");
  check(new URL(page.url()).searchParams.get("specialty") === "Da liễu", "Refreshed calendar return lost specialty");

  await page.getByRole("button", { name: "Clear recommendation · All specialties" }).click();
  await visible(catalog().getByRole("button", { name: "Cardiology", exact: true }));
  check(new URL(page.url()).searchParams.get("specialty") === null, "Clear left specialty in URL");
  await catalog().getByRole("button", { name: "Cardiology", exact: true }).click();
  await visible(page.getByRole("link", { name: /^Book with/ }));
  check(await catalog().getByRole("link").count() === 1, "Cardiology filter failed");
  await page.goBack();
  await visible(catalog().getByRole("button", { name: "All specialties", exact: true, pressed: true }));
  await page.goBack();
  await visible(page.getByRole("button", { name: "Clear recommendation · All specialties" }));
  check(new URL(page.url()).searchParams.get("specialty") === "Da liễu", "Back did not restore recommendation");

  await page.goto(`${base}/?specialty=Unknown%20specialty#book`);
  await visible(page.getByText("No doctors match your search and specialty.", { exact: false }));
  check(await catalog().getByRole("link").count() === 0, "Empty catalog fabricated a doctor");
  check(await page.getByRole("link", { name: /^Book with/ }).count() === 0, "Empty state offered booking");
  await page.screenshot({ path: "output/playwright/issue49/discovery-empty-desktop.png", fullPage: true });

  // Controlled fault injection: the rest of the app and local backend stay unchanged.
  const catalogPattern = /\/api\/doctors(?:\?.*)?$/;
  await page.route(catalogPattern, route => route.fulfill({ status: 503, json: { error: "private backend detail" } }));
  await page.goto(`${base}/?specialty=Dermatology#book`);
  const errorAlert = page.getByRole("alert").filter({ hasText: "The service is temporarily unavailable" });
  await visible(errorAlert);
  check(!(await errorAlert.innerText()).includes("private backend"), "Raw provider error leaked");
  check(await page.getByRole("link", { name: /^Book with/ }).count() === 0, "Failure fabricated results");
  await page.unroute(catalogPattern);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await visible(bookingLink);

  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  await page.route(catalogPattern, async route => { await catalogGate; await route.fulfill({ json: sourceCatalog }); });
  await page.reload();
  await visible(page.getByText("Loading doctors…", { exact: true }));
  check(await page.getByRole("link", { name: /^Book with/ }).count() === 0, "Loading exposed stale results");
  releaseCatalog();
  await visible(bookingLink);
  await page.unroute(catalogPattern);

  // Even a faulty unfiltered API response must not surface an unrelated doctor.
  const response = await page.request.get(`${base}/api/doctors?specialty=Cardiology`);
  const cardiology = await response.json();
  await page.route(catalogPattern, route => route.fulfill({ json: cardiology }));
  await page.reload();
  await visible(page.getByText("No doctors match your search and specialty.", { exact: false }));
  check(await catalog().getByRole("link").count() === 0, "Client accepted wrong-specialty doctor");
  await page.unroute(catalogPattern);
  check(submissions === 0, "Discovery or demo calendar unexpectedly submitted a booking");
  check(await page.getByText("Your appointment is confirmed", { exact: true }).count() === 0, "Unverified confirmation appeared");
  return { passed: true, backend: "repository demo API", auth: "synthetic fixture", bookingSubmissions: submissions,
    scenarios: ["URL refresh", "profile to V2 calendar", "modal close", "browser back/forward", "refreshed calendar return", "clear recommendation", "filter back", "empty", "503/retry", "loading", "mismatched catalog", "no fabricated booking"] };
}
