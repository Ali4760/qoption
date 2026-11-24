# Build plan

Build a paper-trading prototype with a user trading workspace and a staff admin panel. Keep the fast initial load and same-document navigation observed in the saved dashboards. Use HTML, CSS, and TypeScript with Vite for the browser, and Firebase Authentication, Cloud Functions, and Firestore for the backend. Start locally with the Firebase Emulator Suite. The prototype uses simulated prices, trades, funding requests, and balances.

## Planning documents

| Document | What it defines |
| --- | --- |
| [Product requirements](PRODUCT.md) | Screens, workflows, prototype defaults, and acceptance criteria |
| [Frontend design](DESIGN.md) | Dashboard layouts, navigation, responsive behavior, and shared components |
| [Technical architecture](ARCHITECTURE.md) | Proposed source structure, Firebase deployment, data model, and performance budgets |
| [Security plan](SECURITY.md) | Roles, data boundaries, audit requirements, and release checks |

## Build sequence

| Phase | Work | Done when |
| --- | --- | --- |
| 1. Local foundation | Set up the two Vite entry points, shared styles, route handling, Firebase emulators, and synthetic fixtures. Connect sign-in and separate user and staff entry points. | Both shells run locally. Reloading a deep link and using Back or Forward works. An ordinary user receives no staff data. |
| 2. Trading workflow | Build the asset picker, chart, trade ticket, and confirmation. Connect the simulated quote feed, server-side placement and settlement, wallet ledger, history, and admin trade activity. | A user places a trade and sees the same trade settle in the workspace, history, and admin activity. Repeated requests and settlement retries produce one ledger effect each. |
| 3. Wallet and admin queues | Add synthetic deposits and withdrawals, status and receipt views, client lists and details, dashboard summaries, and review actions. Add indexed filters and cursor pagination. | A user submits a request, finance reviews it, and the user sees the result. Every privileged action is attributable, and list reads stay bounded as seed data grows. |
| 4. Supporting features | Add profile settings, notifications, support messages, seeded leaderboard, and client activity reports. Finish loading, empty, error, and responsive states. | Both dashboards are navigable by keyboard and usable on narrow screens. Supporting screens load their data on demand and preserve context during navigation. |
| 5. Prototype verification | Run the workflow, authorization, concurrency, accessibility, and performance checks. Exercise settlement recovery and document a rollback. | The local release criteria below pass. Any hosted staging release has isolated Firebase resources, monitoring, and an authorized billing decision. |
| 6. TradingView integration | Once the prototype is ready and the user supplies the TradingView product or API details, confirm the chart product, data source, licensing, symbol mapping, and feed behavior. | Chart rendering and quote timestamps pass feed contract tests. Demo settlement follows the server's recorded quote source and rule version. |

## Prototype release criteria

- [ ] A synthetic user can sign in, choose an asset, place a trade, and see the final result alongside its ledger entry and trade history.
- [ ] A synthetic user can request a mock deposit or withdrawal. A finance user can approve or reject it, and both dashboards reflect the same result.
- [ ] Repeated clicks, concurrent requests against one wallet, a delayed settlement task, and a retry after a successful commit preserve the expected balances and state transitions.
- [ ] Admin lists request the first 25 matching records by default. Paging, filtering, refreshing, and returning from a detail view preserve the selected context.
- [ ] Anonymous callers, ordinary users opening admin routes, and staff outside their permitted scope receive no protected data. Verify direct Firestore access and function authorization independently.
- [ ] A cold-cache mobile test measures the time to a usable first view. A separate run measures tab switching and completion of the tab's API fetch. Record the results against the targets in the [technical architecture](ARCHITECTURE.md).
- [ ] Staging, if authorized, uses synthetic data, isolated credentials, reviewed roles, cost alerts, and a verified rollback or restore exercise appropriate to the data being hosted.

## Decisions to carry into implementation

- The first complete demo uses one balance denomination, a small seeded asset catalog, and server-decided trade outcomes. Defaults are recorded in the [product requirements](PRODUCT.md) so they can be reviewed together.
- Use a simulated market feed until the user supplies the TradingView details. Hosting, cloud billing, actual payment providers, and live execution each have their own release decision.
- Begin with an emulator-backed workflow and share a runnable demo locally. A hosted version with deployed Cloud Functions requires the Firebase Blaze plan. [Cloud Functions deployment requirements](https://firebase.google.com/docs/functions/get-started)
