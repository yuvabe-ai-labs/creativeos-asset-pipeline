import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  FullConfig,
  Suite,
} from "@playwright/test/reporter";
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { TEST_STEPS, MODULE_NAMES } from "./test-steps";

const OUTPUT_DIR  = join(process.cwd(), "tests", "report");
const OUTPUT_FILE = join(OUTPUT_DIR, "test-report.xlsx");
const TEST_CASES_FILE = join(OUTPUT_DIR, "test-cases.xlsx");

const TEST_ID_PATTERN = /^([A-Z]+_\d+[a-z]?)\s+(.*)$/;

interface Row {
  index: number;
  suite: string;
  title: string;
  testId: string;
  module: string;
  description: string;
  steps: string;
  browser: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  testStatus: "expected" | "unexpected" | "skipped" | "flaky";
  durationMs: number;
  error: string;
}

const STATUS_LABEL: Record<Row["testStatus"], string> = {
  expected:   "Passed",
  unexpected: "Failed",
  flaky:      "Flaky",
  skipped:    "Skipped",
};

const ROW_COLOR: Record<Row["testStatus"], string> = {
  expected:   "FFD4EDDA",
  unexpected: "FFF8D7DA",
  flaky:      "FFFFF3CD",
  skipped:    "FFE2E3E5",
};

export default class ExcelReporter implements Reporter {
  private rows: Row[] = [];
  private startTime = Date.now();
  private runDate = new Date();
  private stats = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
    this.runDate = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const parts    = test.titlePath().filter(Boolean);
    const title    = parts.at(-1) ?? test.title;
    const suite    = parts.slice(1, -1).join(" › ") || (parts[0] ?? "");
    const error    = result.errors[0]?.message?.split("\n")[0]?.trim() ?? "";
    const browser  = test.parent.project()?.name ?? "";

    const match = title.match(TEST_ID_PATTERN);
    const testId      = match?.[1] ?? "";
    const description = match?.[2] ?? title;
    const modulePrefix = testId.split("_")[0] ?? "";
    const module = MODULE_NAMES[modulePrefix] ?? modulePrefix;
    const steps = (TEST_STEPS[testId] ?? [])
      .map((step, i) => `${i + 1}. ${step}`)
      .join("\n");

    this.stats.total++;
    if (test.outcome() === "expected")   this.stats.passed++;
    if (test.outcome() === "unexpected") this.stats.failed++;
    if (test.outcome() === "skipped")    this.stats.skipped++;
    if (test.outcome() === "flaky")      this.stats.flaky++;

    this.rows.push({
      index:      this.rows.length + 1,
      suite,
      title,
      testId,
      module,
      description,
      steps,
      browser,
      status:     result.status,
      testStatus: test.outcome(),
      durationMs: result.duration,
      error,
    });
  }

  async onEnd(_result: FullResult) {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const workbook  = new ExcelJS.Workbook();
    workbook.creator = "CreativeOS Asset Pipeline Test Reporter";
    workbook.created = new Date();

    this.buildSummarySheet(workbook);
    this.buildResultsSheet(workbook);

    const modules = [...new Set(this.rows.map(r => r.module))];
    for (const module of modules) {
      this.buildModuleSheet(workbook, module);
    }

    await workbook.xlsx.writeFile(OUTPUT_FILE);
    console.log(`\n[excel] Report saved → tests/report/test-report.xlsx`);

    const testCasesWorkbook = new ExcelJS.Workbook();
    testCasesWorkbook.creator = "CreativeOS Asset Pipeline Test Reporter";
    testCasesWorkbook.created = new Date();
    this.buildTestCasesSheet(testCasesWorkbook);

    await testCasesWorkbook.xlsx.writeFile(TEST_CASES_FILE);
    console.log(`[excel] Test cases saved → tests/report/test-cases.xlsx`);
  }

  private buildSummarySheet(workbook: ExcelJS.Workbook) {
    const sheet = workbook.addWorksheet("Summary");
    sheet.columns = [
      { header: "Run Date",  key: "date",     width: 22 },
      { header: "Total",     key: "total",     width: 10 },
      { header: "Passed",    key: "passed",    width: 10 },
      { header: "Failed",    key: "failed",    width: 10 },
      { header: "Skipped",   key: "skipped",   width: 10 },
      { header: "Flaky",     key: "flaky",     width: 10 },
      { header: "Duration",  key: "duration",  width: 14 },
    ];

    this.styleHeader(sheet.getRow(1), "FF1A1815");

    const durationMs = Date.now() - this.startTime;
    sheet.addRow({
      date:     new Date().toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      total:    this.stats.total,
      passed:   this.stats.passed,
      failed:   this.stats.failed,
      skipped:  this.stats.skipped,
      flaky:    this.stats.flaky,
      duration: this.fmtDuration(durationMs),
    });
  }

  private buildResultsSheet(workbook: ExcelJS.Workbook) {
    const sheet = workbook.addWorksheet("Test Results");
    sheet.columns = [
      { header: "No.",         key: "index",       width: 6  },
      { header: "Module",      key: "module",      width: 18 },
      { header: "Test ID",     key: "testId",      width: 10 },
      { header: "Test Case",   key: "description", width: 52 },
      { header: "Test Steps",  key: "steps",       width: 70 },
      { header: "Status",      key: "status",      width: 12 },
      { header: "Duration (s)", key: "durationS",  width: 13 },
      { header: "Browser",     key: "browser",     width: 12 },
      { header: "Run Date",    key: "runDate",     width: 20 },
      { header: "Error",       key: "error",       width: 50 },
    ];

    this.styleHeader(sheet.getRow(1), "FF1A1815");
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const runDate = this.fmtRunDate(this.runDate);

    for (const row of this.rows) {
      const added = sheet.addRow({
        index:       row.index,
        module:      row.module,
        testId:      row.testId,
        description: row.description,
        steps:       row.steps,
        status:      STATUS_LABEL[row.testStatus],
        durationS:   Math.round(row.durationMs / 100) / 10,
        browser:     row.browser,
        runDate,
        error:       row.error,
      });

      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ROW_COLOR[row.testStatus] },
      };
      added.eachCell(cell => { cell.fill = fill; });

      const stepsCell = added.getCell("steps");
      stepsCell.alignment = { wrapText: true, vertical: "top" };
      const lineCount = row.steps ? row.steps.split("\n").length : 1;
      added.height = Math.max(20, lineCount * 15);
    }
  }

  /** A single sheet listing every test case grouped by module — no run results. */
  private buildTestCasesSheet(workbook: ExcelJS.Workbook) {
    const sheet = workbook.addWorksheet("Test Cases");
    sheet.columns = [
      { header: "No.",        key: "index",       width: 6  },
      { header: "Module",     key: "module",      width: 18 },
      { header: "Test ID",    key: "testId",      width: 10 },
      { header: "Test Case",  key: "description", width: 52 },
      { header: "Test Steps", key: "steps",       width: 70 },
    ];

    this.styleHeader(sheet.getRow(1), "FF1A1815");
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const modules = [...new Set(this.rows.map(r => r.module))];
    let index = 1;
    for (const module of modules) {
      for (const row of this.rows.filter(r => r.module === module)) {
        const added = sheet.addRow({
          index:       index++,
          module:      row.module,
          testId:      row.testId,
          description: row.description,
          steps:       row.steps,
        });

        const stepsCell = added.getCell("steps");
        stepsCell.alignment = { wrapText: true, vertical: "top" };
        const lineCount = row.steps ? row.steps.split("\n").length : 1;
        added.height = Math.max(20, lineCount * 15);
      }
    }
  }

  private buildModuleSheet(workbook: ExcelJS.Workbook, module: string) {
    const sheet = workbook.addWorksheet(module.slice(0, 31));
    sheet.columns = [
      { header: "No.",          key: "index",      width: 6  },
      { header: "Test ID",      key: "testId",     width: 10 },
      { header: "Test Case",    key: "description", width: 52 },
      { header: "Test Steps",   key: "steps",      width: 70 },
      { header: "Status",       key: "status",     width: 12 },
      { header: "Duration (s)", key: "durationS",  width: 13 },
      { header: "Browser",      key: "browser",    width: 12 },
      { header: "Run Date",     key: "runDate",    width: 20 },
      { header: "Error",        key: "error",      width: 50 },
    ];

    this.styleHeader(sheet.getRow(1), "FF1A1815");
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const runDate = this.fmtRunDate(this.runDate);
    const moduleRows = this.rows.filter(r => r.module === module);

    moduleRows.forEach((row, i) => {
      const added = sheet.addRow({
        index:       i + 1,
        testId:      row.testId,
        description: row.description,
        steps:       row.steps,
        status:      STATUS_LABEL[row.testStatus],
        durationS:   Math.round(row.durationMs / 100) / 10,
        browser:     row.browser,
        runDate,
        error:       row.error,
      });

      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ROW_COLOR[row.testStatus] },
      };
      added.eachCell(cell => { cell.fill = fill; });

      const stepsCell = added.getCell("steps");
      stepsCell.alignment = { wrapText: true, vertical: "top" };
      const lineCount = row.steps ? row.steps.split("\n").length : 1;
      added.height = Math.max(20, lineCount * 15);
    });
  }

  private styleHeader(row: ExcelJS.Row, bgArgb: string) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    row.alignment = { vertical: "middle" };
    row.height = 20;
  }

  private fmtRunDate(d: Date): string {
    const date = d.toLocaleDateString("en-GB"); // d/m/yyyy
    const time = d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
      .toLowerCase();
    return `${date}, ${time}`;
  }

  private fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
}
