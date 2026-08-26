import assert from "node:assert/strict";

const frontend = String(process.env.FRONTEND_URL || "https://personal-budget-tracker-ru.pages.dev/").replace(/\/?$/, "/");
const api = String(process.env.API_URL || "https://personal-budget-api.bonaqu.workers.dev").replace(/\/$/, "");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function eventually(label, check) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await check();
      console.log(`[smoke] ${label}: ok`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await delay(5000);
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

await eventually("frontend and manifest", async () => {
  const index = await fetch(`${frontend}?smoke=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /<title>Personal Budget Tracker<\/title>/);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);

  const manifestResponse = await fetch(new URL("manifest.webmanifest", frontend), { headers: { "Cache-Control": "no-cache" } });
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
});

await eventually("offline shell and icons", async () => {
  const workerResponse = await fetch(new URL("service-worker.js", frontend), { headers: { "Cache-Control": "no-cache" } });
  assert.equal(workerResponse.status, 200);
  assert.match(await workerResponse.text(), /personal-budget-shell-v\d+-\d{8}-[a-z0-9-]+/);
  for (const path of ["icons/icon-192.png", "icons/icon-512.png"]) {
    const response = await fetch(new URL(path, frontend), { headers: { "Cache-Control": "no-cache" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^image\/png/);
    assert.ok((await response.arrayBuffer()).byteLength > 10000);
  }
});

await eventually("Worker readiness", async () => {
  const response = await fetch(`${api}/health`, { headers: { Origin: new URL(frontend).origin } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "ok");
  assert.equal(body.storage?.status, "ready");
  assert.equal(response.headers.get("x-api-version"), "2");
  assert.ok(response.headers.get("x-request-id"));
});
