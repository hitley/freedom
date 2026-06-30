@source:src/lib/spending/index.ts @source:src/lib/spending/types.ts
Feature: Reading a year of spend from observed transactions
  "What does a year of my life actually cost?" is the number that feeds the vision's
  target spend, the magic number, and ultimately the freedom date. Rather than make
  the user guess it, the spending component derives it from real transactions — scaling
  whatever window of statements they've imported up to a full year.

  Two things must be true for that number to be trustworthy: it counts only genuine
  outgoings (never money shuffled between the user's own accounts, never income), and
  it annualises honestly from the observed window.

  Scenario: Annualised spend scales the observed window to a full year
    Given the transactions:
      | date       | description | amount | direction | category  |
      | 2026-01-01 | Rent        | 600.00 | out       | housing   |
      | 2026-12-31 | Rent        | 400.00 | out       | housing   |
    Then the annualised spend is 1000.00

  Scenario: Transfers between my own accounts are never spend
    Given the transactions:
      | date       | description     | amount  | direction | category  |
      | 2026-03-01 | Groceries       | 100.00  | out       | groceries |
      | 2026-03-02 | Move to savings | 5000.00 | out       | transfer  |
    Then the total spend is 100.00

  Scenario: Income is never counted as spend
    Given the transactions:
      | date       | description | amount  | direction | category  |
      | 2026-03-01 | Salary      | 3200.00 | in        | income    |
      | 2026-03-05 | Dining      | 60.00   | out       | dining    |
    Then the total spend is 60.00
    And the total income is 3200.00

  Scenario: A refund is not mistaken for a duplicate of the matching spend
    Given an existing spend of 40.00 described "Acme Store" on "2026-04-01"
    And an incoming refund of 40.00 described "Acme Store" on "2026-04-01"
    When the incoming batch is deduped against the ledger
    Then 1 transaction is treated as new
    And 0 transactions are treated as duplicates
