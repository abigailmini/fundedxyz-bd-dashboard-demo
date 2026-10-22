# FundedXYZ BD & Affiliate Dashboard - Static Demo

Live demo (GitHub Pages): https://abigailmini.github.io/fundedxyz-bd-dashboard-demo/

A fully client-side, **sample-data** preview of the FundedXYZ BD & Affiliate sales dashboard.
No server, no database, no API - everything runs in the browser from `data.js`.

> The production version is the private Node + Express + SQLite app
> (repo: `abigailmini/fundedxyz-bd-dashboard`). This demo mirrors its UI and role logic.

## Demo logins
Password for every account: **demo123**

| Role | Name | Sign-in email | Sees |
|------|------|---------------|------|
| Admin | David Yang | davidyangmini@gmail.com | Everything |
| Admin | Khong Ming Kok | khongming@unitycrypto.com | Everything |
| BD | Kate Morgan | kate.bd@fundedxyz.demo | Her affiliates + team total + her BD commission |
| Affiliate | CupWinner | cupwinner.aff@fundedxyz.demo | Own sales only (code XYZCUPB1F1) |
| Affiliate | XModeMaster | xmode.aff@fundedxyz.demo | Own sales only (code XMODEB1F1) |

Pick any user on the login screen to see exactly what that role sees.

## Features
- Role-scoped views (Admin / BD / Affiliate)
- Totals: Today / 7D / MTD / All
- Sales-over-time chart, BD & affiliate leaderboards
- Per-affiliate table, product breakdown
- CSV export (client-side)
- Admin manage UI (create BD/affiliate/user, assign, set commission) working on local state
- FundedXYZ dark theme + cyan/lime, mobile-friendly

All names, emails, orders and amounts are fictional sample data.
