import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

let core;

beforeAll(() => {
  const source = fs.readFileSync(new URL("../../scripts/01-core.js", import.meta.url), "utf8");
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
  vm.runInContext(`${source}\n;globalThis.__core = { Utils, defaultData, normalizeData, mergeData, mergeMonthMeta, validateBackupPayload, comparableDataSignature, addTombstone };`, context);
  core = context.__core;
});

describe("money and local calendar rules", () => {
  it("accepts comma or dot with at most two decimals and rejects trailing garbage", () => {
    expect(core.Utils.parseAmount("100,25")).toBe(100.25);
    expect(core.Utils.parseAmount("100.25")).toBe(100.25);
    expect(core.Utils.parseAmount("100abc")).toBe(0);
    expect(core.Utils.parseAmount("1.234")).toBe(0);
    expect(core.Utils.roundMoney(Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it("validates real calendar dates including leap years", () => {
    expect(core.Utils.isISODate("2024-02-29")).toBe(true);
    expect(core.Utils.isISODate("2023-02-29")).toBe(false);
    expect(core.Utils.isISODate("2026-13-01")).toBe(false);
    expect(core.Utils.isISODate("2026-04-31")).toBe(false);
  });

  it("uses correct Russian count forms", () => {
    expect(core.Utils.formatCount(1, "операция", "операции", "операций")).toBe("1 операция");
    expect(core.Utils.formatCount(2, "операция", "операции", "операций")).toBe("2 операции");
    expect(core.Utils.formatCount(5, "операция", "операции", "операций")).toBe("5 операций");
    expect(core.Utils.formatCount(11, "операция", "операции", "операций")).toBe("11 операций");
    expect(core.Utils.formatCount(21, "операция", "операции", "операций")).toBe("21 операция");
  });

  it("uses the prepositional Russian month form in sentences", () => {
    expect(core.Utils.monthLabelPrepositional("2026-01")).toBe("январе 2026 г.");
    expect(core.Utils.monthLabelPrepositional("2026-08")).toBe("августе 2026 г.");
    expect(core.Utils.monthLabelPrepositional("2026-12")).toBe("декабре 2026 г.");
  });
});

describe("normalization and merge safety", () => {
  it("keeps two legitimate identical operations when their IDs differ", () => {
    const raw = core.defaultData();
    raw.transactions = ["tx-a", "tx-b"].map((id) => ({
      id,
      type: "expense",
      amount: 100,
      categoryId: "exp_food",
      description: "Обед",
      date: "2026-07-10",
      position: 1,
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z"
    }));
    expect(core.normalizeData(raw).transactions).toHaveLength(2);
  });

  it("uses the newer month-start mode even when the newer value is automatic zero", () => {
    const olderManual = { start: 500, manualStart: true, updatedAt: "2026-07-01T00:00:00.000Z" };
    const newerAuto = { start: 0, manualStart: false, updatedAt: "2026-07-02T00:00:00.000Z" };
    expect(core.mergeMonthMeta(olderManual, newerAuto)).toMatchObject({ start: 0, manualStart: false });
  });

  it("keeps deletions through a merge by applying tombstones", () => {
    const cloud = core.defaultData();
    cloud.transactions = [{
      id: "tx-delete",
      type: "expense",
      amount: 50,
      categoryId: "exp_food",
      description: "Удалить",
      date: "2026-07-10",
      position: 1,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }];
    const local = core.normalizeData(cloud);
    core.addTombstone(local, "transactions", "tx-delete", "2026-07-02T00:00:00.000Z");
    local.transactions = [];
    expect(core.mergeData(cloud, local).transactions).toHaveLength(0);
  });
});

describe("backup validation", () => {
  it("rejects invalid dates, duplicate IDs, wrong amount types and attribute-injection IDs", () => {
    const base = core.defaultData();
    base.transactions = [{ id: "bad\" onmouseover=alert(1)", type: "expense", amount: {}, date: "2026-02-31" }];
    expect(() => core.validateBackupPayload({ format: "personal-budget-tracker", data: base })).toThrow();

    const duplicate = core.defaultData();
    duplicate.transactions = [
      { id: "same", type: "expense", amount: 1, date: "2026-07-01" },
      { id: "same", type: "expense", amount: 2, date: "2026-07-02" }
    ];
    expect(() => core.validateBackupPayload({ format: "personal-budget-tracker", data: duplicate })).toThrow(/повторяется ID/);
  });

  it("round-trips a versioned state without changing its signature", () => {
    const data = core.normalizeData(core.defaultData());
    const backup = { format: "personal-budget-tracker", schemaVersion: 4, data };
    core.validateBackupPayload(backup);
    expect(core.comparableDataSignature(core.normalizeData(backup))).toBe(core.comparableDataSignature(data));
  });

  it("migrates a legacy monthly backup without losing start mode or operation kind", () => {
    const legacy = {
      settings: { theme: "light", categories: [{ id: "legacy-food", name: "Еда", type: "expense", color: "#123456" }] },
      "2024-02": {
        start: 1250.5,
        manualStart: true,
        expenses: [{ id: "legacy-expense", day: 31, amount: "99,25", desc: "Обед", category: "Еда" }],
        debts: [{ id: "legacy-debt", day: 1, amount: 500, desc: "Кредит" }]
      }
    };
    expect(core.validateBackupPayload(legacy).format).toBe("legacy");
    const migrated = core.normalizeData(legacy);
    expect(migrated.months["2024-02"]).toMatchObject({ start: 1250.5, manualStart: true });
    expect(migrated.transactions.find((item) => item.id === "legacy-expense")).toMatchObject({
      date: "2024-02-29",
      amount: 99.25,
      flowKind: "standard"
    });
    expect(migrated.transactions.find((item) => item.id === "legacy-debt")?.flowKind).toBe("debt");
  });
});
