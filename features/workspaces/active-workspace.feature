@source: src/lib/server/instance-selection.ts
@source: src/lib/server/instance.ts
Feature: Choosing which workspace is active
  One owner can hold several workspaces — their own, and (say) a child's. A cookie
  remembers which workspace they last switched to, but it is only ever a *hint*: it
  sets the active workspace solely when it still names a workspace the owner holds.
  Anything else — a workspace that no longer exists, or one belonging to someone
  else — is ignored in favour of the default (the oldest owned) workspace. That
  fallback is what keeps a stale or tampered cookie from ever reaching data the
  owner does not own.

  Background:
    Given I own the workspaces "Personal" then "Arlo"

  Scenario: With no preference yet, the default workspace is active
    Given no active-workspace cookie is set
    When the active workspace is resolved
    Then the active workspace is "Personal"

  Scenario: A remembered workspace I own is honoured
    Given the active-workspace cookie points at "Arlo"
    When the active workspace is resolved
    Then the active workspace is "Arlo"

  Scenario: A stale cookie falls back to the default
    Given the active-workspace cookie points at a workspace that no longer exists
    When the active workspace is resolved
    Then the active workspace is "Personal"

  Scenario: A cookie for someone else's workspace is ignored
    Given the active-workspace cookie points at a workspace I do not own
    When the active workspace is resolved
    Then the active workspace is "Personal"
