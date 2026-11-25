# Example PRD (brownfield mode)

This is an example of the structure only. The facts and numbers are invented. Copy the structure, not the content.
The same example continues in `plan-architecture` and `plan-slice-epic`.

```markdown
---
type: prd
slug: back-in-stock-alerts
status: agreed
version: 2
date: 2026-11-20
author: jdoe
sources: [https://github.com/<owner>/<repo>/issues/<n>]
mode: brownfield
areas: [TBD]
---

# PRD — Back-in-stock email alerts

## 1. Problem statement

When a product is out of stock, store customers leave the product page with no way to come back when it returns.
Store owners lose those sales and cannot tell how many customers wanted the product.

## 2. Evidence

- Store-owner request: "customers email us asking when sizes come back". (source: GitHub issue)
- Assumption — about 1 in 10 visitors of an out-of-stock page would leave an email. Validate by: sign-ups in month 1.

## 3. Why build it

Today the customer must remember to check again, or email the store. The platform already sends transactional
email and tracks stock per product, so an alert closes the gap without a new channel.

## 4. Hypothesis

We believe an "email me when it's back" option on out-of-stock products will cause store customers to return when
stock is restocked, resulting in recovered sales.
We are RIGHT if 15% of alert emails lead to an order within 7 days, measured over the first 2 months.
We are WRONG if fewer than 2% of out-of-stock page visitors sign up in the first month.

## 5. Target users and job to be done

- Primary user: a store customer on the page of an out-of-stock product.
- Job: "As a store customer, when the product I want is out of stock, I want to be emailed when it is back so that
  I can buy it without checking again."
- Secondary: the store owner, who sees how many alerts each product has.
- Not for: back-in-stock alerts by SMS or push; wishlists.
- Fork scope: every client (white-label core). Copy in `es` and `en`.

## 6. MVP

A sign-up on out-of-stock product pages, one email when stock returns, and an admin count of pending alerts per product.

## 7. Success metrics

| Metric                                 | Target                    | How measured                |
| -------------------------------------- | ------------------------- | --------------------------- |
| Orders within 7 days of an alert email | 15% of emails sent        | order and email logs        |
| Sign-ups on out-of-stock pages         | 2% of visitors in month 1 | sign-up count vs page views |

## 8. Non-goals

- No SMS or push. No price-drop alerts. No wishlist.

## 9. Open questions

- [ ] Do guests need to confirm their email (double opt-in)? (business, legal)
- [ ] Expensive to undo: when the alert is triggered and how emails are throttled. → plan-architecture
```

## Good and bad pairs

|            | Bad                                                       | Good                                                                                        |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Problem    | "Add a notify-me button to the product page."             | "Customers leave out-of-stock pages with no way to come back, so the store loses the sale." |
| Metric     | "Better engagement."                                      | "Orders within 7 days of an alert email: 15% of emails sent, from order and email logs."    |
| Hypothesis | "We believe alerts will help customers." (no RIGHT/WRONG) | The block in section 4 above.                                                               |
