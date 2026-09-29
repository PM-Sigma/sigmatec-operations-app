# Role / permission audit — 29.9.2026

Live DB, 9 roles (anon, viewer, אביאם, ניתאי, מתניה, אבצן, אליה, עמיחי, עידן). Every probe ran inside `begin … rollback`
(no data changed). App side: `qa/playwright/tests/role-matrix.spec.ts` (mock mode, 360 light+dark, 31 tests/project).

## Findings
| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | High | 3 backup tables from 29.9 had RLS off (anon read/write) | ✅ fixed 29.9 — RLS on, no grants |
| F2 | High | `inventory_push_low_stock` callable by anon (fire a staff push) | ✅ revoked (trigger is DEFINER) |
| F3 | Medium | `push_log` readable by anon + viewer | ✅ read = עידן only |
| F4 | Medium | `alert_mark_seen` callable by anon/viewer, no identity | ✅ staff session required |
| F5 | Medium | `usage_report` / `feedback_admin_update` trusted the client's actor name | ✅ identity from JWT claim |
| F6 | Low | `apply_absence` callable by anon/viewer | ✅ revoked (trigger is DEFINER) |
| F7 | Medium | direct delete on `products` / `kibbutzim` by any staff | ✅ revoked (DEFINER RPC keeps working) |
| F8 | Low | viewer sees Save/⋯ in the inventory product sheet (DB refuses) | 🟡 app fix in progress |
| F9 | Low | פיתוח/סטטיסטיקה reachable for עמיחי/מתניה/אליה by canShowPage but missing from ⋯ | 🟡 app fix in progress |

Fix: `db/fix_role_audit_29_9.sql` (ROLLBACK inside). Post-apply check: anon backup read denied, anon push denied,
staff absence insert OK, staff usage_report spoof denied.

Accepted / by design: viewer reads feedback, delivery_certs, work_sessions and some logs; `cert_by_id` open to anon for
the customer `?cert=` link; push_subscriptions readable across staff (low); anon has table grants but RLS blocks
(blanket revoke = optional hardening).

## Table matrix
| table | anon | viewer | staff* | עמיחי | עידן |
|---|---|---|---|---|---|
| app_admins | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| attendance | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| auth_attempts | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ |
| calendar_absences_bak_r9 | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ |
| calendar_absences | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / S·UD ✅ | SIUD / S·UD ✅ | SIUD / S·UD ✅ |
| company_holidays | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| day_plans | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| daylog_corrections | ---- / ---- ✅ | ---- / ---- ✅ | -I-- / -·-- ✅ | -I-- / -·-- ✅ | -I-- / -·-- ✅ |
| delivery_certs | ---- / ---- ✅ | S--- / S--- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ |
| dev_status_log | ---- / ---- ✅ | S--- / S--- ✅ | SI-- / SI-- ✅ | SI-- / SI-- ✅ | SI-- / SI-- ✅ |
| ems_cache | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| ems_queue | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| ems_task_events | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| ems_task_state | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| feedback | ---- / ---- ✅ | SI-- / ··-- ✅ | SI-- / ··-- ✅ | SI-- / ··-- ✅ | SI-- / ··-- ✅ |
| field_checkins | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| generators | ---- / ---- ✅ | S--- / S--- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ |
| internal_tasks_bak_test_29_9 | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ |
| internal_tasks | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| inventory_alerts | ---- / ---- ✅ | S--- / S--- ✅ | SI-- / SI-- ✅ | SI-- / SI-- ✅ | SI-- / SI-- ✅ |
| kibbutz_details | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| kibbutz_health | ---- / ---- ✅ | S--- / ·--- ✅ | SIUD / ···· ✅ | SIUD / ···· ✅ | SIUD / ···· ✅ |
| kibbutz_meeting_notes | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| kibbutzim_region_section_bak_29_9 | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ | ---- / SIUD ❌ |
| kibbutzim | ---- / ---- ✅ | S--- / S--- ✅ | SIU- / SIUD ❌ | SIU- / SIUD ❌ | SIU- / SIUD ❌ |
| meeting_events | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| meeting_sessions | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| meter_burns | ---- / ---- ✅ | S--- / S--- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ | SIU- / SIU- ✅ |
| movements | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| onboarding_steps | ---- / ---- ✅ | S--- / ·--- ✅ | SIUD / ···· ✅ | SIUD / ···· ✅ | SIUD / ···· ✅ |
| onboarding_templates | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| orders | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| parse_corrections | ---- / ---- ✅ | ---- / ---- ✅ | -I-- / -I-- ✅ | -I-- / -I-- ✅ | -I-- / -I-- ✅ |
| potentials | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| products | ---- / ---- ✅ | S--- / S--- ✅ | SIU- / SIUD ❌ | SIU- / SIUD ❌ | SIU- / SIUD ❌ |
| push_log | ---- / S--- ❌ | ---- / S--- ❌ | ---- / S--- ❌ | ---- / S--- ❌ | S--- / S--- ✅ |
| push_subscriptions | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| reading_runs | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| reading_sites | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| reading_sources | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| reading_values | ---- / ---- ✅ | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| regions | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| requirements | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| returns | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| settings | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| site_contacts | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| staff_identities | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ | ---- / ---- ✅ |
| stock_recounts | ---- / ---- ✅ | S--- / ·--- ✅ | SI-- / ··-- ✅ | SI-- / ··-- ✅ | SI-- / ··-- ✅ |
| tasks | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| transcribe_log | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |
| usage_events | ---- / ---- ✅ | -I-- / -I-- ✅ | -I-- / -I-- ✅ | -I-- / -I-- ✅ | -I-- / -I-- ✅ |
| user_settings | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| visit_drafts | ---- / ---- ✅ | S--- / S--- ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ | SIUD / SIUD ✅ |
| visits | --~~ / --~~ ✅ | S-~~ / S-~~ ✅ | SI~~ / SI~~ ✅ | SI~~ / SI~~ ✅ | SI~~ / SI~~ ✅ |
| work_sessions_log | ---- / ---- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ | S--- / S--- ✅ |


## Rule / RPC probes
| probe | anon | viewer | staff* | עמיחי | עידן |
|---|---|---|---|---|---|
| X_ca_ins_self | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_ins_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_ins_null_event | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_ins_null_vac | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_upd_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_upd_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_upd_null_event | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_upd_null_vac | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_del_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_del_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_del_null_event | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ca_del_null_vac | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_sd_sel_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_sd_sel_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_sd_ins_self | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_sd_ins_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_sd_upd_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_sd_upd_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_msg_sel_to_me | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_msg_sel_to_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_msg_ins_from_self | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_msg_ins_from_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_msg_upd_mine | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_msg_upd_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_ws_sel_own | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_sel_other | deny / deny ✅ | allow / allow ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_ins_self | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_ins_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_upd_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_upd_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_del_own | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_ws_del_other | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| X_visit_upd_recent | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_visit_del_recent | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_kb_upd_region | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_kb_upd_section | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_kb_upd_display | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_rd_raw | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ |
| X_rd_runs | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_rd_values | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_rd_sites | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| X_rd_sources | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| R_alert_mark_seen | deny / allow ❌ | deny / allow ❌ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| R_apply_absence | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ |
| R_cert_by_id | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| R_feedback_admin_update | deny / deny ✅ | deny / allow ❌ | deny / allow ❌ | allow / allow ✅ | allow / allow ✅ |
| R_usage_report | deny / deny ✅ | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ | allow / allow ✅ |
| R_staff_devices_report | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ |
| R_ems_apply_snapshot | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ | allow / allow ✅ |
| R_set_kibbutz_section | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ | allow / allow ✅ |
| R_inv_preview | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ |
| R_inv_delete | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | deny / deny ✅ | allow / allow ✅ |
| R_push_low_stock(exec priv) | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ | deny / allow ❌ |
