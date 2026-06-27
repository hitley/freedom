@source:src/lib/spending/index.ts @source:src/lib/spending/types.ts
Feature: A bottom-up budget from recurring expenses
  Most outgoings are structured — a monthly rent direct debit, quarterly water, the
  annual car service — and the user already keeps a rough monthly figure from prior
  averages. Modelling those commitments as recurring expenses turns that figure into
  something the app derives: each commitment normalises to a monthly-equivalent cost,
  and summed they form a stable, forward-looking budget. Unlike annualising a short
  window of observed transactions, a budget of known commitments doesn't lurch with a
  noisy month.

  The same commitments then drive reconciliation: each expected occurrence is paired
  with the actual transaction that settled it (a confirmed link), or flagged overdue
  once its date passes unmatched, or still due if it's upcoming.

  Scenario: Each commitment normalises to a monthly-equivalent cost
    Given the recurring expenses:
      | payee      | category      | estimate | freq    | interval |
      | Rent       | housing       | 1350.00  | monthly | 1        |
      | Water      | utilities     | 165.00   | monthly | 3        |
      | Car service| transport     | 420.00   | monthly | 12       |
    Then the monthly budget is 1440.00
    And the annual budget is 17280.00

  Scenario: Inactive commitments are left out of the budget
    Given the recurring expenses:
      | payee     | category      | estimate | freq    | interval | active |
      | Rent      | housing       | 1350.00  | monthly | 1        | true   |
      | Old gym   | health        | 40.00    | monthly | 1        | false  |
    Then the monthly budget is 1350.00

  Scenario: A linked actual reconciles its occurrence and reports variance
    Given a recurring "Rent" expense of 1350.00 due monthly on day 1
    And a "Rent" payment of 1375.00 on "2026-01-01" linked to that occurrence
    When I reconcile the window "2026-01-01" to "2026-01-31" as of "2026-01-15"
    Then the occurrence on "2026-01-01" is "matched"
    And its variance is 25.00

  Scenario: A passed occurrence with no payment is overdue
    Given a recurring "Rent" expense of 1350.00 due monthly on day 1
    When I reconcile the window "2026-01-01" to "2026-02-28" as of "2026-02-15"
    Then the occurrence on "2026-01-01" is "overdue"
    And the occurrence on "2026-02-01" is "overdue"

  Scenario: A fitting transaction is suggested, then confirmed into a match
    A real payment that lands near an expected occurrence, in the same category and
    within the amount band, is offered as a suggestion — never applied automatically.
    Confirming it records the link, so the occurrence then reads as matched.
    Given a recurring "Rent" expense of 1350.00 due monthly on day 1
    And a "Rent paid" transaction of 1350.00 on "2026-01-02" in "housing"
    When I look for matches to the occurrence on "2026-01-01"
    Then the transaction "Rent paid" is suggested
    When I confirm the suggested match
    Then the occurrence on "2026-01-01" is "matched"
