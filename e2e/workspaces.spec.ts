import { expect, test, type Page } from "@playwright/test";

/**
 * Workspace isolation, end-to-end through the real UI — the regression guard for
 * the bug where switching workspaces reloaded the server data but left the client
 * showing (and debounced-saving) the *previous* workspace's data, silently writing
 * one workspace's figures into another. The fix keys `FreedomApp` on the active
 * instance so a switch fully remounts (see src/app/page.tsx).
 *
 * Each workspace gets a uniquely-named vision; the test asserts that creating and
 * switching workspaces only ever surfaces that workspace's own vision, never a
 * sibling's. A fresh workspace must land on onboarding, not inherit a dashboard.
 */

const switcher = (page: Page) => page.getByTestId("workspace-switcher");
const menu = (page: Page) => page.getByTestId("workspace-menu");
const onboardingHeadline = (page: Page) =>
  page.getByPlaceholder("Sail the Med with my family every summer");

/** The vision modal auto-opens on load/switch; dismiss it to reach the header. */
async function dismissVision(page: Page) {
  const overlay = page.locator("div.fixed.inset-0.z-50");
  if (!(await overlay.isVisible().catch(() => false))) return;
  const cancel = page.getByRole("button", { name: "Cancel" });
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click(); // onboarding flow
  } else {
    await overlay.click({ position: { x: 5, y: 5 } }); // read-only panel: click-off
  }
  await expect(overlay).toBeHidden();
}

async function openMenu(page: Page) {
  await switcher(page).click();
  await expect(menu(page)).toBeVisible();
}

async function createWorkspace(page: Page, name: string) {
  await openMenu(page);
  await menu(page).getByRole("button", { name: /New workspace/ }).click();
  await page.getByPlaceholder("e.g. Arlo").fill(name);
  await menu(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(menu(page)).toBeHidden();
}

async function switchWorkspace(page: Page, name: string) {
  await openMenu(page);
  await menu(page).getByRole("button", { name }).click();
  await expect(menu(page)).toBeHidden();
}

/** Walk the onboarding flow, stamping a distinctive headline (only it is required). */
async function completeOnboarding(page: Page, headline: string) {
  await expect(onboardingHeadline(page)).toBeVisible();
  await onboardingHeadline(page).fill(headline);
  await page.getByRole("button", { name: "Continue" }).click(); // → motivations
  await page.getByRole("button", { name: "Continue" }).click(); // → FIRE style + spend
  await page.getByRole("button", { name: "Continue" }).click(); // → review
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(onboardingHeadline(page)).toBeHidden();
}

test("switching workspaces never bleeds one workspace's data into another", async ({ page }) => {
  // Unique per run so repeated runs (workspaces accumulate) never collide.
  const run = Date.now();
  const alpha = `Alpha ${run}`;
  const bravo = `Bravo ${run}`;
  const alphaVision = `Alpha vision ${run}`;
  const bravoVision = `Bravo vision ${run}`;

  await page.goto("/");
  await dismissVision(page); // the default workspace may greet us with its own modal

  // Workspace Alpha: fresh → onboarding → give it a distinctive vision.
  await createWorkspace(page, alpha);
  await completeOnboarding(page, alphaVision);

  // Workspace Bravo, created from Alpha. THE regression: a fresh workspace must
  // show onboarding and must NOT carry Alpha's vision across.
  await createWorkspace(page, bravo);
  await expect(onboardingHeadline(page)).toBeVisible();
  await expect(page.getByText(alphaVision)).toHaveCount(0);
  await completeOnboarding(page, bravoVision);

  // Back to Alpha → its own vision auto-opens; Bravo's must be nowhere.
  await switchWorkspace(page, alpha);
  await expect(page.getByText(alphaVision)).toBeVisible();
  await expect(page.getByText(bravoVision)).toHaveCount(0);
  await dismissVision(page);

  // And to Bravo → its own vision; Alpha's must be nowhere.
  await switchWorkspace(page, bravo);
  await expect(page.getByText(bravoVision)).toBeVisible();
  await expect(page.getByText(alphaVision)).toHaveCount(0);
});
