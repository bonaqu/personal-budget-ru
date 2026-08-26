import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

let core;

beforeAll(() => {
  const coreSource = fs.readFileSync(new URL("../../scripts/01-core.js", import.meta.url), "utf8");
  const storeSource = fs.readFileSync(new URL("../../scripts/04-store.js", import.meta.url), "utf8");
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    structuredClone,
    TextEncoder,
    Intl,
    Date,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(
    `${coreSource}\n${storeSource}\n;globalThis.__storeCore = { Store, Utils, defaultData };`,
    context
  );
  core = context.__storeCore;
});

function transaction({ id, type, amount, date, categoryId, flowKind = "standard" }) {
  return {
    id,
    type,
    amount,
    date,
    categoryId,
    flowKind,
    description: id,
    position: 1,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`
  };
}

describe("monthly balance continuity", () => {
  it("carries the last known final balance across completely empty months", () => {
    const data = core.defaultData();
    data.months["2026-01"] = {
      start: 1000,
      manualStart: true,
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    data.transactions = [
      transaction({ id: "jan-income", type: "income", amount: 500, date: "2026-01-10", categoryId: "inc_salary" }),
      transaction({ id: "jan-expense", type: "expense", amount: 200, date: "2026-01-11", categoryId: "exp_food" })
    ];

    core.Store.setData(data, { save: false });

    expect(core.Store.statsForMonth("2026-01").finalBalance).toBe(1300);
    expect(core.Store.statsForMonth("2026-02").startBalance).toBe(1300);
    expect(core.Store.statsForMonth("2026-03").startBalance).toBe(1300);
    expect(core.Store.statsForMonth("2027-01").startBalance).toBe(1300);
  });

  it("keeps a manual balance in an otherwise empty intermediate month", () => {
    const data = core.defaultData();
    data.months["2026-01"] = {
      start: 1000,
      manualStart: true,
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    data.months["2026-02"] = {
      start: 250,
      manualStart: true,
      updatedAt: "2026-02-01T00:00:00.000Z"
    };

    core.Store.setData(data, { save: false });

    expect(core.Store.statsForMonth("2026-02").finalBalance).toBe(250);
    expect(core.Store.statsForMonth("2026-03").startBalance).toBe(250);
  });
});
