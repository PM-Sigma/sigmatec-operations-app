# Team — roles & what to measure

Context for designing role-appropriate views (esp. the employee-management page). **Field** = does
on-site work (visit reports expected). **Office** = no visit-report expectation; don't show "0 visits"
as a gap. Source: user (עידן), 2026-06-23.

| Person | Role | Field/Office | Responsible for | What "doing well" looks like |
|--------|------|--------------|-----------------|------------------------------|
| **עידן** | Product manager + operations supervisor | **Office** | Owns the **operations app** itself; does **all client setups** in the new system; **moves kibbutzim to live (עלו לאוויר)** after setup work + checks, **by priority**; after talking with עמיחי, promotes waiting→priority→live; **opens tasks for אביאם/ניתאי** when there are many alerts or client issues needing field handling. | The **company go-live pipeline** moving (live vs priority vs waiting), not a personal task count. |
| **עמיחי** | CEO | Mostly **office**, occasional field | Knows everything; regulation; install correctness; finding field issues; **marketing / brings new clients**; **sets installation priority**; works with עידן on **non-field client tasks**. | New clients in, priorities set, client issues resolved. |
| **אביאם** | Field **team lead**, expert technician | **Field** | Handles **any fault**; builds **meter conversion plans**; **places the actual orders** (unless a very large order); **manages ניתאי**. | Field throughput: visits, faults handled, conversions, orders placed. |
| **ניתאי** | Field technician #2 | **Field** | Does part of the field tasks; **does NOT install meters**; **does** install **controllers**, deliver equipment, remove comm cards; works sometimes alone, sometimes with אביאם. | Controller installs / equipment / deliveries; visits. |
| **מתניה** | Junior developer | **Office** | Helps עידן **each month-end** with transferring + handling **client accounts (חשבונות)**. | Month-end accounts done; dev support. |

## Design implications (employee page)
- **עידן's card ≠ field card.** Show the **company go-live pipeline** (kibbutzim live / total, by stage, priority queue) + tasks he opened for the field — that's his actual domain. A personal "% of my cards done" is meaningless for him (he's on everything).
- **אביאם / ניתאי** = field cards: visits, field activity. **ניתאי has no meter-install metric.**
- **עידן / מתניה** = office: no visit-report expectation; never flag "0 visits" as a deficiency. **עמיחי** mostly office + occasional field.
- Metrics derivable from current data: visits (by visitor), tasks owned/edited, attendance, orders created, potentials (new clients), distribution. **Not yet tracked** (would need new fields): faults handled, conversion plans, controller-installs vs meter-installs, comm-card removals.
