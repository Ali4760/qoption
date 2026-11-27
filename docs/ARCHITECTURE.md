# Technical architecture

Use two small Vite-built HTML, CSS, and TypeScript entry points with shared components. Serve both from Firebase Hosting and give each its own route fallback. Firebase Authentication provides identity. Callable Cloud Functions provide typed application operations and use the Firebase Admin SDK to read and write Firestore. The prototype sends all application reads and writes through these functions, giving client queries and privileged actions the same server-side authorization boundary. [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config) · [Callable functions](https://firebase.google.com/docs/functions/callable)

## Proposed source layout

The existing `user/` and `Admin/` directories hold the reference captures. The implementation will use the locations below.

```text
README.md                        Local setup and operating instructions
package.json                     Workspace commands and dependencies
.env.example                     Placeholder configuration only
firebase.json                    Hosting routes and emulator configuration
firestore.rules                  Access policy for direct Firestore requests
firestore.indexes.json           Composite indexes under version control
apps/web/user/                   User HTML entry point and views
apps/web/advin.html              Admin sign-in and workspace entry point
apps/web/shared/                 UI components, routing helpers, and API client
functions/src/                   Auth, market data, trade, wallet, and admin services
packages/contracts/              Shared request and response schemas
scripts/seed-demo.ts             Synthetic accounts, trades, and funding records
tests/                           Workflow, security, and concurrency checks
```

## Firestore data model

| Collection | Purpose and key fields |
| --- | --- |
| `profiles`, `staff` | Display information and account restrictions. Staff records carry active status, role, and access scope. Firebase Authentication holds credentials. |
| `wallets`, `ledgerEntries` | Wallet totals and holds, plus append-only entries with wallet ID, owner UID, linked operation, deltas, and timestamp. Scope one demo wallet to each user. |
| `trades` | Owner UID, asset, side, stake, quote and rules versions, entry time and price, due time, and final status, price, and result. |
| `fundingRequests` | Owner UID, type, demo amount, status, creation time, review decision, and synthetic receipt reference. |
| `instruments` | Supported symbols, display names, tick precision, and trading configuration. |
| `supportThreads`, `notifications` | Scoped support conversations and user notifications. Store messages as individual subcollection documents. |
| `operationReceipts`, `auditEvents` | Scoped idempotency keys and request fingerprints, plus traceable administrative records with actor, action, target, reason, and correlation ID. |

Use UTC timestamps, integer hundredths for Demo Credits, and prices normalized to integer ticks for each instrument. Validate numeric ranges and results before persisting them. Calculate the wallet's available and held balances from a materialized wallet document updated with its ledger entries in the same transaction. Run a reconciliation check against the ledger in tests and staging.

## Server operations and consistency

1. Verify identity and access scope, then validate payloads and normalize inputs. List operations accept a validated filter set, stable sort, and opaque cursor. Derive the allowed account scope on the server.
2. For operations that change funds, require a client-generated request ID. Scope it to the actor and operation. In one Firestore transaction, read the receipt and relevant records, verify the applicable state and balance, then write the state change, ledger entry, and receipt. Record the audit event in the same transaction when required. Return the prior result on an identical retry and reject a reused ID with different inputs.
3. Place a trade using a server-selected quote and fixed expiry. Store the quote source, rule version, and demo payout terms. When the workspace sees an expired countdown, it requests a server refresh. That request and a bounded scheduled sweep use the same settlement logic. The server resolves the quote for the recorded expiry time and changes the trade and wallet in one transaction. A transaction that finds a terminal trade returns without writing. Keep external I/O out of retryable transaction callbacks. [Firestore transaction behavior](https://firebase.google.com/docs/firestore/transaction-data-contention) · [Scheduled Firebase functions](https://firebase.google.com/docs/functions/schedule-functions)
4. The emulator integration test advances the due time on a synthetic trade, then calls the regular workspace refresh concurrently. The server checks the balance and applies one settlement ledger entry.

## Market data and TradingView

Define a market-data interface for instrument metadata, current quotes, and historical bars at a specified interval. Keep the chart renderer behind a separate interface. For the prototype, use one deterministic server-side simulation to supply chart data and resolve entry and expiry quotes. Use versioned seeds and a fixed clock in tests so chart and settlement results can be reproduced. Refresh the active chart with bounded requests and keep high-frequency chart data outside Firestore.

When the user supplies TradingView details, confirm the product and access terms, source of market data, symbol mapping, supported intervals, exchange timestamps, stale-data policy, and request limits. Advanced Charts and Lightweight Charts require a data source. Adding a chart renderer leaves server-side settlement under the recorded provider and rule version. [TradingView charting product comparison](https://www.tradingview.com/charting-library-docs/latest/getting_started/product-comparison/)

## Performance and cost targets

- Ship a small first-view shell and load the chart and secondary views in separate chunks. Reserve the chart's space. Fetch the current screen's data after auth is ready and reuse the visible view's recent results within the signed-in session.
- Return 25 list rows by default and enforce a ceiling of 50. Use `limit()` and `startAfter()` with a stable order and a unique secondary sort. Match indexes to scoped filters and sort fields. Validate cursor shape and bind cursors to the current scope and filters. Dashboard summaries fetch scoped counts and totals through dedicated queries. Verify their index-read costs as the data grows. [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors)
- Refresh only active views that need fresh data. Pause updates while the tab is hidden, deduplicate in-flight calls, and discard stale responses after a route or session change. Keep public static assets cacheable and private responses out of shared caches.
- On a production build with a cold cache and a fixed midrange mobile network profile, aim for the first signed-in dashboard view to be usable within **2 seconds**. Measure the time to render an internal view and the time for its fresh data separately. Aim for the view frame within **100 ms** on a warm navigation, then track the data request latency. Use LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1 at the 75th percentile as field targets once enough measurements exist. [Core Web Vitals](https://web.dev/articles/vitals)
- Verify that fetching a page consumes a bounded number of document reads with a larger synthetic dataset. Track function latency and errors, overdue settlements, Firestore reads and writes, and spending by environment. Set spending alerts and review services with usage limits when hosting is approved. [Firestore billing](https://firebase.google.com/docs/firestore/pricing) · [Firebase billing FAQ](https://firebase.google.com/support/faq)

## Environments and operations

Start with Auth, Firestore, Functions, and Hosting emulators and seed scripts. If hosted staging is approved, deploy to its own Firebase project with synthetic data, environment-specific service accounts, and Functions near the chosen Firestore region. Review billing and quotas for Functions, Hosting, Auth features, and the scheduled reconciliation. Public hosting with deployed Cloud Functions requires Blaze. Keep rules and indexes versioned, check readiness before deploying code that uses new indexes, and use backward-compatible data changes where a rollback may be needed. [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite) · [Cloud Functions deployment](https://firebase.google.com/docs/functions/get-started)
