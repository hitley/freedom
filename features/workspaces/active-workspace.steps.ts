import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { resolveActiveInstanceId } from "@/lib/server/instance-selection";

// A pure-component spec: the active-workspace decision is lifted into
// `resolveActiveInstanceId` precisely so it can be pinned with no DB, cookies, or
// auth. The full `instance.ts` resolver just feeds this the owned list + cookie.
const feature = await loadFeature("features/workspaces/active-workspace.feature");

describeFeature(feature, ({ Background, Scenario }) => {
  let owned: { id: string; name: string }[];
  let hinted: string | null | undefined;

  const idFor = (name: string) => owned.find((w) => w.name === name)?.id ?? null;
  const resolvedName = () => {
    const id = resolveActiveInstanceId(hinted, owned);
    return owned.find((w) => w.id === id)?.name ?? null;
  };

  Background(({ Given }) => {
    Given('I own the workspaces {string} then {string}', (_, first: string, second: string) => {
      // Oldest first — index 0 is the historical default.
      owned = [
        { id: `id-${first}`, name: first },
        { id: `id-${second}`, name: second },
      ];
      hinted = undefined;
    });
  });

  Scenario("With no preference yet, the default workspace is active", ({ Given, When, Then }) => {
    Given("no active-workspace cookie is set", () => {
      hinted = undefined;
    });
    When("the active workspace is resolved", () => {});
    Then("the active workspace is {string}", (_, name: string) => {
      expect(resolvedName()).toBe(name);
    });
  });

  Scenario("A remembered workspace I own is honoured", ({ Given, When, Then }) => {
    Given("the active-workspace cookie points at {string}", (_, name: string) => {
      hinted = idFor(name) ?? undefined;
    });
    When("the active workspace is resolved", () => {});
    Then("the active workspace is {string}", (_, name: string) => {
      expect(resolvedName()).toBe(name);
    });
  });

  Scenario("A stale cookie falls back to the default", ({ Given, When, Then }) => {
    Given("the active-workspace cookie points at a workspace that no longer exists", () => {
      hinted = "id-deleted-workspace";
    });
    When("the active workspace is resolved", () => {});
    Then("the active workspace is {string}", (_, name: string) => {
      expect(resolvedName()).toBe(name);
    });
  });

  Scenario("A cookie for someone else's workspace is ignored", ({ Given, When, Then }) => {
    Given("the active-workspace cookie points at a workspace I do not own", () => {
      // A real id, but never present in *my* owned list.
      hinted = "id-someone-elses-workspace";
    });
    When("the active workspace is resolved", () => {});
    Then("the active workspace is {string}", (_, name: string) => {
      expect(resolvedName()).toBe(name);
    });
  });
});
