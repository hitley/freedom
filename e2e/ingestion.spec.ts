import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The ingestion pipeline, end-to-end through the real UI — the one journey that no
 * domain-level spec can cover, because it only exists when Capture → Extract →
 * Propose → Reconcile, React state, the server actions, and the database are all
 * wired together (see design-notes/002).
 *
 * Drop a bank-statement CSV into the Inbox, Process it, Review the proposal, approve
 * it, and confirm the spend rows arrive in Spending tagged "imported".
 */

const statementCsv = readFileSync(
  path.join(__dirname, "fixtures", "statement.csv"),
  "utf8",
);

/**
 * A fresh dev workspace opens on the vision onboarding flow, which gates the rest of
 * the app. Walk it (only the headline is required) so the Inbox/Spending tabs mount.
 * Idempotent: if the workspace already has a vision, this is a no-op.
 */
async function ensurePastOnboarding(page: Page) {
  const headline = page.getByPlaceholder("Sail the Med with my family every summer");
  if (!(await headline.isVisible().catch(() => false))) return;

  await headline.fill("Retire early and sail");
  await page.getByRole("button", { name: "Continue" }).click(); // → motivations
  await page.getByRole("button", { name: "Continue" }).click(); // → FIRE style + spend
  await page.getByRole("button", { name: "Continue" }).click(); // → review
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
}

test("a captured CSV statement reconciles into the spending ledger", async ({ page }) => {
  await page.goto("/");
  await ensurePastOnboarding(page);

  // --- Capture: drop the statement into the Inbox by pasting the CSV ---
  await page.getByRole("button", { name: "Inbox" }).click();
  await page.getByPlaceholder("May statement").fill("May statement (e2e)");
  await page.locator("textarea").fill(statementCsv);
  await page.getByRole("button", { name: "Add to inbox" }).click();

  // The queued item offers a Process action once captured.
  const processButton = page.getByRole("button", { name: "Process" }).first();
  await expect(processButton).toBeVisible();

  // --- Extract → Propose: deterministic CSV parse, deduped ---
  await processButton.click();
  await expect(page.getByText(/ready to review/i)).toBeVisible();

  // --- Reconcile: review the proposal and approve it into spending ---
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: /Add \d+ to spending/ }).click();

  // --- Confirm the spend rows landed in Spending, tagged as imported ---
  await page.getByRole("button", { name: "Spending" }).click();
  const tesco = page.getByText("Tesco Superstore");
  await expect(tesco).toBeVisible();
  await expect(page.getByText("· imported").first()).toBeVisible();
  // Salary is income, not spend — it still imports, but as an `in` row.
  await expect(page.getByText("Caffe Nero")).toBeVisible();
});
