# Frontend design

Keep the interaction pattern that makes the reference dashboards feel fast. Give the trading screen a persistent chart and trade ticket. Give the admin screen a persistent sidebar, a summary view, and focused work queues. Design original components and branding around the information hierarchy in the two captures.

## Trading workspace

| Region | Desktop | Mobile |
| --- | --- | --- |
| Navigation and header | Compact sidebar, current asset, balance, and notification access. Keep the shell mounted while navigating. | Collapsible navigation and a compact header with asset and balance. Ensure the menu closes after navigation and restores focus when dismissed. |
| Chart and assets | Chart fills the main workspace. Put the asset picker and timeframe controls next to the chart title. Keep loading and error states within the chart frame. | Full-width chart with compact timeframe controls. Put the asset picker in a dismissible sheet and keep chart gestures separate from page scrolling. |
| Trade ticket | Dedicated panel with amount, expiry, direction controls, estimated demo return, and confirmation. | Stack the ticket below the chart and keep access to the main trade action within reach. Use a confirmation sheet with the amount, expiry, and direction visible together. |
| Wallet and history | Use tables for recent records, inline status labels, and a detail panel for an individual trade or request. | Use compact record cards or scrollable tables with labeled columns. Give details and forms a single-column layout. |

The chart gets a reserved height before its code or data arrives. Keep the trade ticket usable for setup while loading. Enable confirmation when an acceptable server price and wallet state are available. Use clear notices for a stale feed, insufficient demo funds, and a pending or settled trade. Show the actual quote and outcome in the confirmation or result view as appropriate.

## Admin workspace

- Use a collapsible sidebar with **Dashboard**, **Clients**, **Deposits**, **Withdrawals**, and **Trades**. Expose reports, messaging, and audit views to the relevant staff roles.
- Put useful counts at the top of the summary. Link pending counts to the corresponding queue with its status filter selected.
- Place search, filters, result states, and pagination in consistent positions across tables. Use **Previous** and **Next** for cursor pagination. Keep the current filters and page when a user returns from a detail panel.
- Open client and request details in a side panel on desktop and a full-width view on mobile. Keep actionable fields beside the decision buttons. Require a reason for decisions and balance adjustments.
- Show which data is refreshing and when it was last updated if freshness affects a decision. Keep existing rows visible during a background refresh and show a recoverable error if it fails.

## Visual system

- Use a dark navy or charcoal trading shell, subtly brighter surfaces, a restrained blue accent, and strong text contrast. Use matching spacing, type, and status tokens in the admin panel. Start with a system sans-serif stack and tabular numerals for amounts and prices.
- Use text and icons alongside positive, negative, pending, and neutral colors. Use short labels such as **Up**, **Down**, **Pending**, and **Demo Credits**. Keep labels consistent across user and admin views.
- Define reusable sidebar, header, button, input, dialog, table, chart frame, status badge, activity row, pagination, and notification components. Reserve fixed space for incremental loading and avoid animated effects that delay access to controls.
- Target WCAG 2.2 AA. Check contrast, keyboard operation, focus visibility, accessible field labels and error messages, reduced-motion handling, and chart value alternatives. Announce significant outcomes without continuously announcing market ticks or countdown updates. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Navigation and screen states

Each dashboard has its own HTML entry point. Its internal routes update the view and browser history without a new document request. Allow links to a specific screen or authorized record. Preserve meaningful filters in the URL, restore transient list state from session memory, and clear private state on sign-out. Keep sensitive search terms and opaque pagination tokens out of URLs.

Design each data view for initial loading, populated results, no matching records, delayed updates, error with retry, and expired session. Show a useful first frame within the [performance targets](ARCHITECTURE.md#performance-and-cost-targets). Reserve full-screen blocking states for entry or authorization, and scope routine loading indicators to the component waiting for data.
