const summaryPath = Deno.env.get("GITHUB_STEP_SUMMARY");
if (!summaryPath) throw new Error("GITHUB_STEP_SUMMARY is unavailable");
const safe = [
  "## Disposable integration test summary",
  "",
  `- Run: ${Deno.env.get("GITHUB_RUN_ID") || "unknown"}`,
  `- Attempt: ${Deno.env.get("GITHUB_RUN_ATTEMPT") || "unknown"}`,
  "- Target: runner-local Supabase only",
  "- Evidence: workflow step names and pass/fail status in this job",
  "- Secrets, credentials, tokens, passwords, and environment dumps are intentionally excluded.",
  "",
].join("\n");
await Deno.writeTextFile(summaryPath, safe, { append: true });
