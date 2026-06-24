@source:src/lib/server/reconcile.ts @source:src/lib/spending/index.ts
Feature: Reconcile approved proposals into the spending ledger
  Reconcile is the final pipeline stage and the only point where a proposal touches
  the live spending ledger — and only on the user's say-so. The user reviews a
  proposal, may re-categorise rows or drop ones they don't want, then approves the
  rest. Reconcile folds exactly that approved subset into spending and marks the
  inbox item "applied".

  It is deliberately suspicious of its input. The review screen is a client, and a
  client can be tampered with, so Reconcile re-checks that every approved row genuinely
  came from this item before trusting it — categories may be edited, but nothing
  foreign can be smuggled into the ledger.

  Background:
    Given an empty spending ledger
    And a proposed inbox item "stmt-1" offering:
      | id  | description | amount | direction | category |
      | t-1 | Tesco       | 42.50  | out       | groceries |
      | t-2 | Coffee      | 3.20   | out       | dining    |

  Scenario: Approving the whole proposal adds every row and marks it applied
    When the user approves rows "t-1, t-2" from item "stmt-1"
    Then the item status is "applied"
    And the spending ledger contains 2 transactions
    And the ledger total spend is 45.70

  Scenario: Dropping a row during review keeps it out of the ledger
    When the user approves rows "t-1" from item "stmt-1"
    Then the item status is "applied"
    And the spending ledger contains 1 transaction
    And the ledger total spend is 42.50

  Scenario: Re-categorising a row during review is honoured
    When the user approves row "t-1" from item "stmt-1" re-categorised as "shopping"
    Then the spending ledger contains 1 transaction
    And the ledger transaction "Tesco" has category "shopping"

  Scenario: A row that wasn't part of this proposal is rejected
    When the user approves a transaction "t-99" that item "stmt-1" never proposed
    Then reconciliation is rejected
    And the spending ledger is still empty

  Scenario: A row smuggled in from another import is rejected
    When the user approves row "t-1" but re-tagged as imported from item "other"
    Then reconciliation is rejected
    And the spending ledger is still empty

  Scenario: Reconciling the same proposal twice doesn't double-count
    When the user approves rows "t-1, t-2" from item "stmt-1"
    And the user approves rows "t-1, t-2" from item "stmt-1" again
    Then the spending ledger contains 2 transactions
