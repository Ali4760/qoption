# Product requirements

Deliver a working paper-trading workspace and an admin panel for the same synthetic accounts. The saved dashboards in `user/index.html` and `Admin/admin.html` establish the screen layout and visible controls. The workflow rules below are proposed prototype defaults, since browser snapshots leave server behavior unverified.

## User workspace

| Screen | First-release behavior |
| --- | --- |
| Sign-in and account security | Sign in, sign out, and use the Firebase password-reset flow. View account status and update allowed profile fields. |
| Trade and assets | Choose a symbol, inspect its chart and timeframe, enter an amount and expiry, choose Up or Down, confirm the trade, and see its countdown and outcome. Show the current available demo balance. |
| Wallet | Show available funds and holds. Submit mock deposits and withdrawals using synthetic methods and references. Show request status, amount, date, and a receipt view after processing. |
| Transaction and trade history | Show recent activity first, with paginated history, status filters, and details for a selected record. Display the entry price, expiry, outcome, and net result on a settled trade. |
| Messages and notifications | Open a support thread, read and send plain-text messages, and see trade and wallet updates. Support useful read or unread states. |
| Leaderboard and settings | Show a seeded leaderboard with display aliases. Let users manage display preferences and profile details. |

## Admin panel

| Screen | First-release behavior |
| --- | --- |
| Dashboard | Show assigned clients and counts for pending requests and recent trade activity. Fetch summaries with the staff member's access scope. |
| Clients | Search by client identifier or the supported name prefix, browse filtered pages, and open client details, activity, and support threads. Allow account-status changes only to authorized staff. |
| Deposits and withdrawals | Show separate paginated review queues by status. Open a request and act on it within the assigned role and scope. Record an actor and reason on each decision. |
| Live trades and reports | Show recent trades with symbol, direction, time, and status. Allow a scoped search and a paginated client activity report. All activity in the prototype is simulated. |
| Adjustments and audit | Let authorized finance staff post an explicit demo ledger adjustment with a reason. Show audit events to permitted administrators. |

## Workflow rules

### Simulated trade

Start with a default stake of 10 Demo Credits and expiry choices of 30 seconds, 1 minute, and 5 minutes. Keep these values configurable. The confirmation shows the amount, direction, expiry, and applicable demo payout terms. The server verifies the current price context, wallet funds, account status, and requested terms. It records the accepted entry quote and a fixed expiry. A rejected submission leaves the wallet unchanged and returns an actionable error.

An accepted trade goes from `open` to `settled` with a win, loss, or refund outcome. An Up trade wins when the expiry quote is higher than the entry quote. A Down trade wins when it is lower. Start with a configurable win payout of the stake plus 80% of the stake, rounded to the nearest hundredth of a Demo Credit. A loss consumes the held stake. A tie or an expiry quote unavailable after a proposed five-minute recovery window returns the held stake and records the reason. The trade result derives from recorded prices and the rules active at placement.

### Mock deposit and withdrawal

A mock deposit enters `pending` and credits the demo wallet once when finance approves it. A mock withdrawal enters `pending` and moves the requested amount from available funds to a hold. Approval consumes the hold. Rejection releases it. The user can cancel a pending withdrawal and release its hold. Approval, rejection, and cancellation are terminal decisions, and an already processed request displays its existing result. The prototype uses synthetic funding labels and references in place of payment or bank information.

### Demo balance and account status

Use one prototype denomination labeled **Demo Credits**, displayed to two decimal places. Store its amounts as integer hundredths and record each change in the ledger. Staff adjustments require a reason and appear in the account activity. An account restriction can pause new trades, withdrawals, or both while keeping existing settlement and history visible to the account owner.

## Product acceptance

- Every user action that changes funds shows a pending state on submission and a confirmed or failed result from the backend. An interrupted response can be retried safely.
- A balance shown in the header agrees with the wallet and with the latest completed operations. Holds are visible in the wallet.
- Admin list filters apply to the complete set of permitted records through the server query. The interface supports paging and returns to the previous page state after a detail view.
- A user can tell that the chart, account balance, funding, and trades are simulated. Support messages and leaderboard aliases use invented fixture data.
- Prototype users can complete the trade and funding flows on a phone and desktop using a keyboard or touch.
