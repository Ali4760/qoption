# Security plan

Protect account access, keep staff actions within role and client scope, and make every change to a demo balance traceable. Use OWASP ASVS to review authentication, authorization, validation, and logging controls. Keep staging populated with synthetic accounts and records. [OWASP ASVS](https://asvs.owasp.org/)

## Trust boundaries and controls

| Risk | Planned control |
| --- | --- |
| Stolen or abused account | Use Firebase Authentication for sign-in and recovery. Require MFA for hosted staff accounts. Verify the chosen Firebase Auth configuration supports the staff factor before hosting. Require recent authentication for sensitive staff actions and revoke sessions after staff removal or compromise. |
| Cross-account data access | Derive the user identity from the verified Auth token. Scope each user query to that identity. Verify staff role, active status, and permitted client scope on each staff operation, including list queries, reports, and receipts. |
| Direct Firestore access | Start with default-deny client rules. The Admin SDK bypasses those rules, so every function must authorize its own scope and use narrowly assigned service account permissions. Test the two boundaries separately. [Firestore security rules](https://firebase.google.com/docs/firestore/security/rules-conditions) |
| Duplicate decisions or balance changes | Use transaction-scoped idempotency, explicit state transitions, and append-only ledger events. Revalidate access and account restrictions in the transaction when a competing change could invalidate the action. |
| Bad or manipulated input | Validate fields and limits on the server. Derive prices, expiry, status, payout, and audit identity from trusted state. Render messages and comments as plain text. Use a restrictive Content Security Policy and review its allowed origins when adding TradingView. |
| Expensive or abusive requests | Enforce bounded page sizes, request-size limits, and per-user limits on sensitive writes. Enable and verify App Check enforcement on hosted callable endpoints as an additional protection. Apply role checks independently. [Firebase App Check](https://firebase.google.com/docs/app-check) |
| Stale prices and delayed settlement | Reject stale entry quotes, record quote provenance and expiry, and reconcile overdue trades through a bounded recovery path. Settle using the quote for the recorded expiry time. |

## Role and access matrix

| Role | Permitted actions |
| --- | --- |
| User | View own profile, wallet, trades, receipts, notifications, and messages. Submit own demo trade and funding requests, cancel an eligible withdrawal, and update permitted profile fields. |
| Support | View permitted client summaries and manage scoped support threads. View only the account details needed for support. |
| Finance | View permitted funding records, approve or reject mock requests, and post authorized adjustments with a reason. |
| Admin | View scoped dashboard summaries, client accounts, trade activity, reports, and audit records. Manage client restrictions and staff-to-client assignments. Finance permissions apply only when explicitly assigned. Provision staff roles through a trusted operator workflow. |
| Settlement worker | Resolve due simulated trades and apply the corresponding ledger entries. Invoke through private task or scheduled triggers backed by dedicated service identity. |

Start with separate named accounts for each staff role. Treat client route visibility as a usability feature and verify permissions independently on every backend operation. Remove cached private views on sign-out or access changes. Return scoped response fields so internal notes and audit data reach only the relevant staff.

## Receipts, secrets, and logs

- Generate synthetic receipt views from approved demo records. Check ownership or staff scope when serving each view. Use invented names, references, and funding details in seed data and screenshots.
- Keep market-data credentials and other server secrets in managed secret storage for hosted environments. Use local emulator values during development and commit placeholder configuration only. Use runtime service identities in deployed functions and review privileged IAM grants.
- Log privileged changes with actor UID, action, target, reason, timestamp, and correlation ID. Limit logged amounts and identifiers to fields needed for support and reconciliation. Keep credentials, tokens, and message bodies out of logs. Review access and retention for audit records.
- Serve over HTTPS. Keep private data out of shared caches and apply same-origin controls to browser entry points. Use authenticated callable requests for state-changing operations. Review explicit CSRF protections if introducing cookie-authenticated endpoints later.

## Verification before a hosted prototype

- [ ] Test anonymous access, cross-user access, direct Firestore access, out-of-scope support staff, finance role checks, and a disabled staff account with a previously issued token.
- [ ] Test tampered IDs, cursors, amounts, roles, timestamps, stale quotes, repeated request IDs, and two actors trying to decide the same pending request.
- [ ] Confirm a wallet cannot spend or withdraw funds it already has on hold. Exercise worker retries, partial delivery failures, and double settlement attempts.
- [ ] Verify staff MFA enforcement, App Check enforcement, restrictive IAM, and secret and log exposure in staging. Review dependency advisories and security headers before sharing the hosted demo.
- [ ] Check monitoring for denied admin actions, repeated write failures, overdue trades, balance discrepancies, and unusually high reads or spend. Rehearse revoking a staff session and restoring synthetic data or replaying it from a known-good seed.

Any future release with actual funds needs a separate design and review for payments, reconciliation, auditing, data retention, identity verification, and applicable requirements for its launch jurisdictions.
