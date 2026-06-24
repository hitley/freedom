# Extract bank statements into reviewable proposals

The ingestion pipeline turns a dropped artifact into structured facts in four
stages: Capture → Extract → Propose → Reconcile. This is the Extract → Propose
stage. It reads a captured CSV statement and parses it — deterministically, no
AI — into draft transactions for the user to review.
The cardinal rule of this stage: it never touches the live spending ledger. It
only ever moves the inbox item to "proposed" and hangs the drafts off it. Money
the user can see only changes later, at Reconcile, and only on their approval.

::: tip Executable specification
Every scenario below is run as a test. If it appears here, it passes — the docs are generated from the same `.feature` files the test suite executes.
:::

**Validated against:** `src/lib/server/extract.ts`, `src/lib/spending/csv.ts`, `src/lib/spending/index.ts`

## Background

_Applies to every scenario below._

- **Given** an empty spending ledger

## A clean statement becomes a proposal ready for review

- **Given** a pending CSV inbox item "stmt-1" containing:

  ```
  Date,Description,Amount
  2026-01-05,Tesco,-42.50
  2026-01-06,Salary,3200.00
  ```
- **When** the item is processed
- **Then** the item status is "proposed"
- **And** 2 transactions are proposed
- **And** the live spending ledger is still empty
- **And** every proposed transaction is traceable back to item "stmt-1"

## A row already in the ledger is recognised as a duplicate, not re-proposed

- **Given** the ledger already contains a "Tesco" spend of 42.50 on "2026-01-05"
- **And** a pending CSV inbox item "stmt-2" containing:

  ```
  Date,Description,Amount
  2026-01-05,Tesco,-42.50
  2026-01-07,Coffee,-3.20
  ```
- **When** the item is processed
- **Then** the item status is "proposed"
- **And** 1 transaction is proposed
- **And** the proposal reports 1 duplicate

## A file with unrecognisable columns fails with a helpful reason

- **Given** a pending CSV inbox item "stmt-3" containing:

  ```
  lorem,ipsum
  dolor,sit
  ```
- **When** the item is processed
- **Then** the item status is "failed"
- **And** the failure reason mentions the columns it needs

## Free-text notes can't be auto-extracted yet

- **Given** a pending TEXT inbox item "note-1" containing:

  ```
  Remember to log the holiday spend
  ```
- **When** the item is processed
- **Then** the item status is "failed"

## An already-proposed item is left untouched when processed again

- **Given** a proposed inbox item "stmt-4"
- **When** the item is processed
- **Then** the item status is "proposed"
