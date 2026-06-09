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

const OUTPUT_DIR  = join(process.cwd(), "tests", "report");
const OUTPUT_FILE = join(OUTPUT_DIR, "test-report.xlsx");

interface Row {
  index: number;
  suite: string;
  title: string;
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
  private stats = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const parts    = test.titlePath().filter(Boolean);
    const title    = parts.at(-1) ?? test.title;
    const suite    = parts.slice(1, -1).join(" › ") || (parts[0] ?? "");
    const error    = result.errors[0]?.message?.split("\n")[0]?.trim() ?? "";

    this.stats.total++;
    if (test.outcome() === "expected")   this.stats.passed++;
    if (test.outcome() === "unexpected") this.stats.failed++;
    if (test.outcome() === "skipped")    this.stats.skipped++;
    if (test.outcome() === "flaky")      this.stats.flaky++;

    this.rows.push({
      index:      this.rows.length + 1,
      suite,
      title,
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

    await workbook.xlsx.writeFile(OUTPUT_FILE);
    console.log(`\n[excel] Report saved → tests/report/test-report.xlsx`);
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
      { header: "#",        key: "index",    width: 6  },
      { header: "Suite",    key: "suite",    width: 36 },
      { header: "Test",     key: "title",    width: 52 },
      { header: "Status",   key: "status",   width: 12 },
      { header: "Duration", key: "duration", width: 12 },
      { header: "Error",    key: "error",    width: 60 },
    ];

    this.styleHeader(sheet.getRow(1), "FF1A1815");
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of this.rows) {
      const added = sheet.addRow({
        index:    row.index,
        suite:    row.suite,
        title:    row.title,
        status:   STATUS_LABEL[row.testStatus],
        duration: this.fmtDuration(row.durationMs),
        error:    row.error,
      });

      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ROW_COLOR[row.testStatus] },
      };
      added.eachCell(cell => { cell.fill = fill; });
    }
  }

  private styleHeader(row: ExcelJS.Row, bgArgb: string) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    row.alignment = { vertical: "middle" };
    row.height = 20;
  }

  private fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
}
