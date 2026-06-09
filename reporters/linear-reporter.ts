import type { Reporter, TestCase, TestResult, FullConfig, Suite } from "@playwright/test/reporter";
import { config } from "dotenv";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "path";

config({ path: path.join(process.cwd(), ".env") });

const LINEAR_API = "https://api.linear.app/graphql";

interface FailedTest {
  suite: string;
  testName: string;
  filePath: string;
  errorLine: string;
  screenshotPath: string | null;
  videoPath: string | null;
}

export default class LinearReporter implements Reporter {
  private disabled = false;
  private apiKey = "";
  private teamId = "";
  private projectId = "";
  private failures: FailedTest[] = [];

  onBegin(_config: FullConfig, _suite: Suite) {
    this.apiKey    = process.env.LINEAR_API_KEY    ?? "";
    this.teamId    = process.env.LINEAR_TEAM_ID    ?? "";
    this.projectId = process.env.LINEAR_PROJECT_ID ?? "";

    if (!this.apiKey || !this.teamId || !this.projectId) {
      console.warn(
        "[linear] Missing LINEAR_API_KEY / LINEAR_TEAM_ID / LINEAR_PROJECT_ID — issue creation disabled"
      );
      this.disabled = true;
      return;
    }

    console.log("[linear] Reporter ready — will file issues for any failures");
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.disabled) return;
    if (result.status !== "failed" && result.status !== "timedOut") return;
    if (result.retry < test.retries) return;

    const parts    = test.titlePath().filter(Boolean);
    const testName = parts.at(-1) ?? test.title;
    const suite    = parts.slice(1, -1).join(" › ") || (parts[0] ?? "");

    const rawError = result.errors[0]?.message ?? `Timed out after ${result.duration}ms`;
    const errorLine = rawError
      .replace(/\x1b\[[0-9;]*m/g, "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("\n");

    const screenshot = result.attachments.find(
      a => a.name === "screenshot" && a.path && existsSync(a.path)
    );
    const video = result.attachments.find(
      a => a.name === "video" && a.path && existsSync(a.path)
    );

    this.failures.push({
      suite,
      testName,
      filePath: test.location.file,
      errorLine,
      screenshotPath: screenshot?.path ?? null,
      videoPath: video?.path ?? null,
    });
  }

  async onEnd() {
    if (this.disabled || this.failures.length === 0) return;

    console.log(`\n[linear] Filing ${this.failures.length} issue(s)...`);

    for (const f of this.failures) {
      try {
        let screenshotUrl: string | null = null;
        if (f.screenshotPath) {
          screenshotUrl = await this.uploadFile(f.screenshotPath, "image/png");
        }

        let videoUrl: string | null = null;
        if (f.videoPath) {
          videoUrl = await this.uploadFile(f.videoPath, "video/webm");
        }

        const environment = process.env.CI ? "CI (GitHub Actions)" : "Local";
        const runDate = new Date().toLocaleString("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });

        const title = `[Test Failure] ${f.suite} › ${f.testName}`;
        const description = [
          `**Suite:** ${f.suite}`,
          `**Test:** ${f.testName}`,
          `**File:** \`${f.filePath}\``,
          `**Environment:** ${environment}`,
          `**Run Date:** ${runDate}`,
          "",
          "**Error:**",
          "```",
          f.errorLine,
          "```",
          ...(screenshotUrl
            ? ["", "**Screenshot:**", `![Screenshot](${screenshotUrl})`]
            : []),
          ...(videoUrl
            ? ["", `🎥 [Watch test recording](${videoUrl})`]
            : []),
        ].join("\n");

        const id = await this.createIssue(title, description);
        const attachments = [screenshotUrl && "screenshot", videoUrl && "video"].filter(Boolean).join(" + ");
        console.log(`  ✓ ${id} — ${f.suite} › ${f.testName}${attachments ? ` (${attachments} attached)` : ""}`);
      } catch (err) {
        console.error(`  ✗ Could not create issue for "${f.testName}":`, (err as Error).message);
      }
    }
  }

  private async uploadFile(filePath: string, contentType: string): Promise<string> {
    const filename = path.basename(filePath);
    const size     = statSync(filePath).size;

    const mutation = `
      mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
        fileUpload(contentType: $contentType, filename: $filename, size: $size) {
          uploadFile {
            uploadUrl
            assetUrl
            headers { key value }
          }
        }
      }
    `;

    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query: mutation, variables: { contentType, filename, size } }),
    });

    const json = (await res.json()) as {
      data?: { fileUpload?: { uploadFile?: { uploadUrl: string; assetUrl: string; headers: { key: string; value: string }[] } } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) throw new Error(`fileUpload: ${json.errors[0].message}`);
    const uploadFile = json.data?.fileUpload?.uploadFile;
    if (!uploadFile) throw new Error("fileUpload returned no uploadFile");

    const fileBuffer = readFileSync(filePath);
    const uploadHeaders: Record<string, string> = { "Content-Type": contentType };
    for (const h of uploadFile.headers) uploadHeaders[h.key] = h.value;

    const uploadRes = await fetch(uploadFile.uploadUrl, {
      method: "PUT",
      headers: uploadHeaders,
      body: fileBuffer,
    });

    if (!uploadRes.ok) throw new Error(`File upload failed: ${uploadRes.status}`);

    return uploadFile.assetUrl;
  }

  private async createIssue(title: string, description: string): Promise<string> {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { identifier url }
        }
      }
    `;

    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            teamId: this.teamId,
            projectId: this.projectId,
            title,
            description,
          },
        },
      }),
    });

    const json = (await res.json()) as {
      data?: { issueCreate?: { success: boolean; issue?: { identifier: string } } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) throw new Error(json.errors[0].message);
    if (!json.data?.issueCreate?.success) throw new Error("issueCreate returned success=false");

    return json.data.issueCreate.issue?.identifier ?? "?";
  }
}
