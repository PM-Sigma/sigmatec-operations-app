# פעולות שטח — page 1: קריאת מודבוס (23.9.2026)

STATUS: 🟡 OPEN — NOT built. Research + design only. Base `origin/main` b9ab18a (2.28).
Resume: (1) get עידן's answers to §11; (2) land the ModbusClient + EMS prerequisites in §9 (other repos, other
owners); (3) verify the golden table in §6 on real hardware, one row per model; (4) only then build the app
packages in §10 on the round-5 design system, after round 5 closes (§12).

## 0. What עידן asked for
A new page **פעולות שטח**. Its first feature is a copy of the old SigmatecOps "פעולות מתקדמות → קריאת מודבוס":
pick a meter from the list OR type it in by hand, read it over Modbus, and show every action and result the old
page showed. The content stays the same; the design may be modernised a little. Hard requirements:
1. The read really works against the **updated ModbusClient**.
2. The meter's IP and connection data come **from EMS** and are verified there.
3. Readings are **scaled per the EMS meter parameters**, with no double multiply or divide. Currents and voltages
   matter most (CT/VT ratios, register scale factors).
4. Manual entry is supported.
5. The page is the home for more field-ops features from the old repo later.

Round-5 rules apply: one React design system, a rewrite and not a port of legacy markup.

## 1. Sources read (read-only)
| Source | Where | What mattered |
|---|---|---|
| Old app | `C:\Users\idann\Projects\Sigmatec-Energy\SigmatecOps` (clone of `Sigmatec-Energy/SigmatecOps`, main 7d3f3cb) | `client/src/pages/ModbusReadPage.js`, `server/routes/modbus.js`, `server/routes/counter.js` (`/counter/list`), `routes/meterTypes.js`, `components/Navigation.js` |
| ModbusClient | `C:\Users\idann\Projects\Sigmatec-Energy\ModbusClient` (master 134262c, 12.7.26) | `server.cs`, `Program.cs` `StartQueryDevice`, `EnergyQueryMessageReader.cs`, `SatecData.cs`, `QueryMessage.cs`, `Config.cs`, `MODERNIZATION_PLAN.md` |
| EMS code | `C:\Users\idann\Projects\EMS SYSTEM` (checkout of `sigmatec-ems`; branch `feature/doral-monthly-report`) + `dev` fetched through `gh api` | `resources/meter-operations/*` (the modbus proxy), `reports.service.ts` (PQ scaling), `upload-readings.service.ts`, `docs/knowledge/meter-readings.md` §5, `docs/db-schema/06-functions/meter_functions.sql` `process_reading` |
| EMS DB | prod RDS, `claude_readonly_pm`, SELECT only | `meters`, `meter_types`, `raw_readings_power_quality`, `raw_readings_electricity_energy`, `meter_operation_logs` (real `modbus_read` responses) |
| PG memory | `C:\Users\idann\Projects\PGadmin\sigmatec-ems-session\` | `key-tables.md`, `gotchas.md` (multipliers) |

`meter-operations` is identical on the local checkout and on `dev` for the Modbus operations. `dev` only adds the
DLMS relay operations and their role/site gate.

## 2. The old page, exactly
**Route** `/modbus-read`, menu group "פעולות מתקדמות" (next to "מונים סלולארים עם תקלה" and "חיפוש לוג DLMS").
Every logged-in user sees it. A non-999 customer only gets their own kibbutz's meters.

**Inputs**
- Radio: `בחר מונה מהרשימה` / `הזנה ידנית`.
- List mode: `בחר קיבוץ *` (legacy MSSQL `T_customers`), then `בחר מונה`. The meter list is `T_Counters` where
  active, `counterType != 99`, **and the IP starts with `10.18`**. Each option reads
  `counterNumber - counterAddress (IP)`. Picking one fills the three fields below, **and they stay editable**.
- Fields: `כתובת IP *` (placeholder 192.168.1.100) · `מספר ID` (placeholder 1) · `סוג מונה *` (legacy
  `T_meterTypes` list).
- Buttons: `בדוק חיבור וקרא נתונים` (loading label `קורא...`) · `PING` (`בודק...`) · `נקה`.
- Validation: `נא למלא כתובת IP וסוג מונה`, `נא למלא כתובת IP`.

**Call path** browser → SigmatecOps Node `/api/modbus/read` (JWT) → ModbusClient `POST http://172.31.6.67:5000/read-meter`
`{IP, DeviceId (default 1), MeterType}` with a 60 s timeout. Ping goes to `/ping` with `{IP}`.

**Ping card "תוצאות PING"**: סיכום (כתובת IP, הצלחות `n / 4`, זמן תגובה ממוצע `Nms` or `לא זמין`), then
פרטי ניסיונות (`ניסיון k:` `Success`/other, green/red, `(Nms)`). When all four fail it shows the banner
`כל הניסיונות נכשלו` / `המכשיר לא זמין או לא מגיב לפינג. בדוק את כתובת IP וחיבור הרשת.`

**Read card "תוצאות קריאה"**
- פרטי חיבור: כתובת IP · מספר מונה (CounterNumber) (`לא זמין`) · מספר ID (`לא מוגדר`) · סוג מונה · סטטוס חיבור
  (`הצלחה` green / `נכשל` red).
- נתוני קריאה, 16 rows. A row is dropped when the value is null/undefined:
  `F1 (קדימה 1)` · `F2 (קדימה 2)` · `F3 (קדימה 3)` · `FT (סה״כ קדימה)` kWh ·
  `R1 (אחורה 1)` · `R2 (אחורה 2)` · `R3 (אחורה 3)` · `RT (סה״כ אחורה)` kWh ·
  `I1/I2/I3 (זרם פאזה n)` A · `V1/V2/V3 (מתח פאזה n)` V · `PF (גורם הספק)` · `CT (כופל במונה)`.
  When nothing comes back: `לא נמצאו נתוני קריאה`.
- פרטי תקשורת: זמן תגובה (`Nms`) · תאריך קריאה (an ISO **UTC** string with the T and Z stripped, so it is 3 hours off).
- Error box `שגיאה בתקשורת:` + the text.

**Error sources**: `[{Error:true, Title, Status, Detail, IP}]` (HTTP 200) → `connectionStatus:'failed'` + Detail;
an axios error → its message; `[null]` → a TypeError (`meterData.F1` on null) that shows up as a raw JS message.

**Scaling**: none. The page shows ModbusClient's numbers as they come. It fetches `iMultiply`/`vMultiply` for the
list and never uses them.

## 3. ModbusClient (updated), as it really behaves
- **What it is**: a .NET 8 console app. With `mode=server` (and `server=true`) it runs the batch loop (login to
  `tgtbt.co.il`, `GetMetersList`, read, `UpdateMetersV2`) **and** an unauthenticated ASP.NET listener on
  `0.0.0.0:5000`: `POST /read-meter {IP, DeviceId(byte), MeterType(int)}` and `POST /ping {IP}`. Modbus TCP to
  port 502. The committed `App.config` says `mode=energy` and `testDeviceId=1`. Under that config the listener would
  not start and every unit ID other than 1 would be skipped, so the deployed config differs from the repo (prod logs
  show successful reads of DeviceId 3, 4 and 6).
- **Where**: the old app points at `172.31.6.67:5000` (a private AWS VPC address; `env.example` shows a public
  `63.33.240.6:5000`). EMS points at `MODBUS_API_URL` (empty in `.env.example`, set in prod). The DLMS relay wrapper
  runs on the same host, port 52002. The meters sit on the cellular APN (`10.185/10.186/10.219.x.x`), which is
  reachable only from inside that VPC.
- **Auth**: none. Nothing but network placement protects it.
- **Timeouts** (12.7 commit): connect 10 s × 3 attempts with 1 s sleeps, read 20 s, write 10 s. The worst case for a
  slow Satec (about 10 register reads) exceeds 120 s.
- **Response**: always HTTP 200 with a JSON array:
  - success: `[QueryMessage]`, where `QueryMessage = {IPAddress, DeviceId, CounterNumber, CallSource, QueryDate,
    F1..F3, FT, R1..R3, RT, I1..I3, V1..V3, PF, CT_Ratio}` (decimals; missing channels come back as 0, not null);
  - connect failure: `[{Error:true, Title:"Meter read error", Status:500, Detail:"Connection timeout: No response from device", IP}]`;
  - read exception with an inner exception: the same shape, `Detail:"Error reading from meter: …"`;
  - any other exception inside a model reader: **`[null]`** (the reader returns null);
  - unsupported type: `[]`.
- **`/read-meter` hard-codes `counterNumber = "XXX"`**, and that sentinel changes behaviour:
  - Satec (legacy codes 8, 9, 12, 17, 19, 30, 32): **only when "XXX"** does it read model/resolution/PT/CT and scale
    V×U1, I×U2, and **energy×U3**. The batch mode (real counter number) returns raw register integers.
  - QNG4 (33): parses the last char of the counter number as the circuit. `int.Parse('X')` throws, so
    **QNG4 can never be read on demand today** (prod: 0 successes, 6 × `[null]`).
  - Carlo Gavazzi / Satec swap "XXX" for the serial read from the device.
- **Register scale per model** (`EnergyQueryMessageReader.cs`, applied before the response):

| Legacy code (EMS type) | Model | V | I | PF | Energy | CT handling |
|---|---|---|---|---|---|---|
| 8 (15) | Satec BFM II | ×U1 | ×U2 | raw | ×U3 | group B → resolution always "low" → U=1 |
| 9/17/19/30 (10/11/12/13), 32 (14) | Satec EM133 / 133-LR / PM135 / 175-HV / L123 | ×U1 | ×U2 | **raw (e.g. 1000)** | ×U3 | device CT read, returned as `CT_Ratio`, **not** applied (the meter reports primary) |
| 31 | QLC | ×0.01 | ×0.001 | ×0.001 | ×0.1 (RT = reactive!) | none |
| 33 (22) | QNG4 | ×0.01 | ×0.1 | ×0.001 | ×0.1 | CT primary read, a scaling factor computed and **never applied** |
| 35 (21) | QNG3 | ×0.01 | ×0.001 | ×0.001 | ×0.1 | none |
| 36 (20) | QNG1 | ×0.01 | ×0.001 **× device CT (reg 4001)** | ×0.001 | ×0.1 | CT applied to I only |
| 37 (25) | ABB B23/B24 | ×0.1 | ×0.01 | ×0.001 | ×0.01 | device CT returned, not applied |
| 34/43/44 (23/24/126) | Carlo Gavazzi EM3xx | ×0.1 | ×0.001 | ×0.001 | ×0.1 | none |
| 38 (41) | Fineco EM437 | float | float | **(int)float → 0** | float, F3<1 ⇒ F2→F3 swap | CT read; a `multipleKhsFactor` computed and unused |
| 39/40 (42/43) | Fineco EM737 | float | float | int reg ×1 (0 in prod) | float | CT read, returned |
| 41 (40) | Fineco EM418 | float (V1 only) | float (I1 only) | int ×1 | float | none |
| 45 | Fineco EM115 | float | float | — | float FT/RT | none |

Satec U factors (`SatecData.cs`): resolution low → U1=U2=U3=1. High + PT=1 → U1 0.1, U2 0.01, U3 0.001.
High + PT≠1 → U1 1, U2 0.01, U3 1.

## 4. EMS: where the connection data and parameters live
- **`meters`**: `ip_address` (varchar; IPv4 for 4,500 Modbus meters, **74 are not IPv4**, e.g. an IMEI in
  `1451510`), `device_number` (varchar = Modbus unit ID), `type_code` → `meter_types.code`,
  `communication_type_code` (20 = Modbus-Apn: 5,082 meters; 21 = Modbus: 9), and the multipliers
  `current_multiplier`, `voltage_multiplier`, `power_multiplier`, `power_factor_multiplier`. There is no port column
  (always 502).
- **`meter_types`** holds the same four multipliers as defaults. For all 17 Modbus types, cm = vm = pfm = 1 and
  pm = 1, except **Satec BFM 2 (15): pm = 0.1**.
- **Type → ModbusClient code** is owned by EMS: `LEGACY_MODBUS_METER_TYPE` in
  `meter-operations/operation-registry.ts` (10→9, 11→17, 12→19, 13→30, 14→32, 15→8, 20→36, 21→35, 22→33, 23→34,
  24→43, 25→37, 40→41, 41→38, 42→39, 43→40, 126→44).
- **EMS already proxies ModbusClient**: `POST /v1/meters/:meterId/operations/modbus_read/execute` (and
  `modbus_ping`), guarded by `AuthUserGuard(PRIMARY)` + `RolesGuard(admin, site_manager, operations_manager)`. It
  loads the meter from PG, requires an IP and a mapped type, sends `{IP, DeviceId: parseInt(device_number)||1,
  MeterType}` to `MODBUS_API_URL/read-meter` with a 120 s timeout, and writes a `meter_operation_logs` row. The
  response is that row: `{status: completed|failed, responseData: <ModbusClient array>, errorMessage, createdAt,
  completedAt, executedBy}`. Also `GET …/operations` (what this meter supports) and `GET …/operations/history`.
  In prod: 652 completed `modbus_read`, 22 failed, 5 stuck `in_progress`, the last one today. All six
  `@sigmatec-energy.com` EMS users are `admin`.
  - `completed` does **not** mean a reading. The ModbusClient error array and `[null]` both land as `completed`.
- **How EMS scales** (the rules to mirror):
  - Energy (`process_reading`): `effective = raw × (meter.pm × type.pm) × meter.vm × meter.cm`. The meter-type
    vm/cm are **deliberately not applied** (EMS's fix for its "10,000× bug"). Raw stays raw in the DB.
  - PQ report (`reports.service.ts getPowerQualityReadings`): `I × meter.cm × type.cm`, `V × meter.vm × type.vm`,
    `PF × meter.pfm × type.pfm`. This disagrees with `process_reading` on type multipliers, but it is harmless today
    because every Modbus type has 1 there.
  - The upload screen shows the meter face as `raw × total multiplier` (the same composition as energy).
- **Meaning of `current_multiplier`**: a correction on top of what the device reports. The device already applies
  its own CT. Evidence: ABB `1557654` (cm 200) reports I ≈ 0.56 A and its sibling `1557650` (cm 1) reports ≈ 130 A
  on the same board, so 0.56 × 200 = 112 A. Satec `1536013` reports `CT_Ratio: 50` while cm = 1.

## 5. The scaling finding: where double (or missing) scaling happens
Checked against real prod data: `meter_operation_logs` responses vs `raw_readings_*` rows of the same meter at the
same moment.

| # | Where | What happens | Evidence | Effect if the new page copies the old one |
|---|---|---|---|---|
| S1 | ModbusClient Satec server mode, energy × U3 | High-resolution Satec at PT=1 gets energy ×0.001 | L123 `1239859`: on-demand FT **28.141** vs EMS raw **28141.000** at 15:30 → ratio **1000.0000**. Same for EM133 `1536013` (12.66 vs 11,970) and 133-LR `1241607` (40.196 vs 39,588). Low-res PM135 `1672005`: ratio 0.9999. EMS daily consumption (≈29 kWh/day at ≈2.5 A) confirms EMS's kWh is the right one | **The old page shows high-res Satec kWh 1000× too small today.** U3 is Satec's *power* unit, not an energy unit |
| S2 | Satec PF | Raw in both modes (`1000` = 1.000, `969` = 0.969) | every Satec log row | "PF 1000" on screen |
| S3 | Satec BFM II | Resolution is forced "low", so V and I come back in device units (V 2354 = 235.4 V) while EMS carries BFM energy at `type.pm = 0.1` | `1787612-6`: V 2354, I 1118; EMS PQ for BFM `11347931`: V 2336, I 18179 | V shows 10× high. Energy is right only if the 0.1 type multiplier is applied |
| S4 | QNG1 | ModbusClient multiplies I by the device CT (reg 4001), and EMS then multiplies by `meter.cm` (0.4/0.5 on some meters) | `17313044-1` PQ I1 2302.976 × cm 0.4 = 921 A; V2 2.56 V, V3 0 look like a wrong register map. On-demand QNG1 has never succeeded (0 of 3) | A possible **double CT**. Don't trust QNG1 currents until a clamp meter confirms them |
| S5 | QNG4 | `/read-meter` can't pass the counter number → `[null]` | 0 of 6 on-demand successes | The read fails. The fix is in ModbusClient |
| S6 | Fineco EM437/EM737/EM418 PF | `(int)float` / int register → 0 | PF 0 in every Fineco log row | Show "—", never "0" |
| S7 | `CT_Ratio` in the response | The device's internal setting | Satec CT 50/2500 with cm 1 | **Never multiply by it.** It is informational only (the old "CT (כופל במונה)" row) |
| S8 | Meter-type vm/cm | EMS energy ignores them, the EMS PQ report applies them | code | Apply meter-level only. Add a contract test: every Modbus type has type vm = cm = 1 |
| S9 | Old app | Picks the meter and then lets the user edit IP/type freely. Filters the list to `10.18*` | code | The 148 meters on `10.219.x` (where many of today's successful reads are) are missing from the old list |

**Rule for the new page: exactly two scaling layers, each in exactly one place.**
- **L0 — register → engineering units**: belongs to **ModbusClient** and nowhere else. The app never re-derives
  register scale. Known ModbusClient defects (S1, S2, S3, S5, S6) are fixed **in ModbusClient**, and ModbusClient adds
  `"Units": "eng-v2"` to the response. Until a response carries that marker, the page shows the affected fields with
  a ⚠ "לא מאומת" tag and the EMS cross-check (below). It never "corrects" them itself, so a later ModbusClient fix
  can't turn into a double correction.
- **L1 — EMS meter parameters**: a single pure module `app/src/lib/fieldops/modbusScale.ts` mirrors EMS exactly:
  - `I = I_dev × meter.current_multiplier`
  - `V = V_dev × meter.voltage_multiplier`
  - `kWh = E_dev × (meter.power_multiplier × type.power_multiplier) × meter.voltage_multiplier × meter.current_multiplier`
    (the `process_reading` total, equal to the EMS meter face)
  - `PF = PF_dev` (EMS never applies pfm to readings)
  - `kW (משוער) = PF × Σ(Vᵢ×Iᵢ)/1000` on the L1 values, labelled "משוער". ModbusClient reads no power register.
  - `CT_Ratio`: shown, never used. Meter-type vm/cm: never used.
  - Null/NaN/0 multiplier → 1 (EMS's `COALESCE`/`num()` rule).
- **Cross-check (the safety net, shipped on day one)**: next to FT the page shows EMS's last raw reading × the same
  total multiplier (`meter.lastTransmission`, already returned by the EMS meter list). If live/EMS falls outside
  0.9–1.1 (FT only, cumulative), it shows `⚠ פער מול EMS ×N`. That would have caught S1 at once.

## 6. Golden table (L1 in → expected on screen)
`dev` = what `/read-meter` returns; `mult` = EMS row. Rows marked ✅ are confirmed against EMS raw data; 🔧 need the
ModbusClient fix first; 🔎 need a clamp-meter/hardware check before they are frozen as goldens.

| # | Meter (EMS type) | mult cm/vm/pm·typePm | dev in | Expected display | Status |
|---|---|---|---|---|---|
| G1 | Satec PM135 `1672005` (12), low-res | 1/1/1·1 | FT 169404, V 235/234/234, I 166/139/113, PF 1000 | FT 169,404 kWh · V 235/234/234 · I 166/139/113 A · PF 1.000 · kW≈97.98 | ✅ (EMS raw 169,395) |
| G2 | Satec L123 `1239859` (14), high-res PT=1 | 1/1/1·1 | today: FT 28.141, V1 226, I1 0.08, PF 1000 · after fix: FT 28141 | FT **28,141** kWh · V1 226.0 V · I1 0.08 A · PF 1.000 | 🔧 S1 (EMS raw 28,141.000) |
| G3 | Satec EM133 `1536013` (10), high-res | 1/1/1·1 | today: FT 12.66, V 229.9/223.9/221.5, I 2.58/0.85/8.24, CT 50 | FT ≈12,660 kWh after fix · V as-is · I as-is · kW≈2.61 · "CT 50" shown only | 🔧 S1 |
| G4 | Satec 175/135 HV `1748022` (13), PT≠1 | 1/1/1·1 | FT 10323, V 13078/13196/13383, I 65/58/63, PF 969 | FT 10,323 kWh · V 13,078 V (phase, primary) · I 65 A · PF 0.969 | 🔎 |
| G5 | Satec BFM II `1787612-6` (15) | 1/1/1·**0.1** | FT 16166, V 2354, I 1118 | FT 1,616.6 kWh (pm 0.1) · V 235.4 V · I (units unknown) | 🔧 S3 + 🔎 |
| G6 | CG EM341 `001219Y` (24) | 1/1/1·1 | FT 5721.9, V 238.4/239/239, I 0/0/0.018, PF 0.792 | as-is · kW≈0.0034 | ✅ (EMS raw 5,721.9) |
| G7 | CG EM331 `119056A` (126) | 1/1/1·1 | FT 602336, RT 29438.8, I 1.024, PF 0.137 | as-is | ✅ (EMS raw 602,336) |
| G8 | Fineco EM737 Direct `23829321` (43) | 1/1/1·1 | FT 48736.14, I 7.146/4.457/3.439, V 229/231.3/232, PF 0 | as-is · PF "—" | ✅ energy (48,735.859) / 🔧 S6 PF |
| G9 | Fineco EM437-X `26042098` (41) | 1/1/1·1 | FT 61.69, I 0.097/11.465/0.863, CT 0 | as-is · PF "—" | ✅ (59.35 an hour earlier) |
| G10 | ABB B23/24 `1557654` (25) | **200**/1/1·1 | I 0.56/0.42/0.54, V 229.7/229.5/230.1, FT 17127.221, PF −0.866 | I **112/84/108** A · FT **3,425,444.2** kWh · V as-is · kW≈−60.49 | 🔎 (values from EMS PQ; ABB never read on demand) |
| G11 | QNG4 `21055523-3` (22) | **0.2**/1/1·1 | I 29.7/544.7/328.1, FT 214808.297 | I 5.94/108.94/65.62 A · FT 42,961.66 kWh | 🔧 S5 + 🔎 |
| G12 | QNG1 `17313044-1` (20) | **0.4**/1/1·1 | I1 2302.976 (already ×device CT) | I1 921.19 A **only if** the clamp meter agrees; otherwise S4 is real and the rule changes | 🔎 S4 |
| G13 | any, `[{Error:true,…}]` | — | Connection timeout | סטטוס נכשל + Detail, no readings table | ✅ |
| G14 | any, `[null]` | — | — | `המונה לא החזיר נתונים — ייתכן שסוג המונה ב-EMS שגוי` | ✅ |
| G15 | multiplier null / 0 | null/0 | FT 100 | FT 100 (treated as 1) | ✅ |

The goldens run as a vitest table in `modbusScale.test.ts`. A second test replays the stored JSON of G1–G11 through
`parse → scale → rows` and checks the exact strings and units the page renders.

## 7. Feature parity: old page vs new page
| Old | New | Change |
|---|---|---|
| Menu "פעולות מתקדמות → קריאת מודבוס" | Page **פעולות שטח**, first tab/card **קריאת מודבוס**; the page is a hub for later cards (§13) | New home |
| Radio בחר מונה מהרשימה / הזנה ידנית | Same two modes (segmented control) | — |
| בחר קיבוץ (legacy `T_customers`) | בחר קיבוץ from EMS sites (`emsGateway().listSites()`) | EMS is the source |
| בחר מונה: active, not type 99, **IP `10.18*`**, label `מספר - כתובת (IP)` | EMS meters of the site with a Modbus `typeCode`, an IP, role ≠ 999, **IPv4 in the APN allowlist** (§11 Q3), label `serial · address · IP · ID n`, searchable | Fixes S9; unit ID shown because 32 IP+unit pairs are shared |
| Fields editable after picking | List mode: IP / ID / סוג מונה **read-only** and marked "מ-EMS". Changing them means switching to manual | Requirement 2 |
| הזנה ידנית: free IP/ID/type | IP + ID (+ type). **Verified against EMS before reading** (§8.3) | Requirement 2 + 4 |
| בדוק חיבור וקרא נתונים / PING / נקה | Same three buttons, same labels. One request at a time; the button shows elapsed seconds while waiting (a read can take up to 2 minutes) | UX |
| Ping card: IP, הצלחות n/4, זמן תגובה ממוצע, per-attempt rows, all-failed banner | Identical content | — |
| Read card, פרטי חיבור: IP, CounterNumber, ID, סוג מונה, סטטוס | Same, plus the EMS serial next to the device's CounterNumber with ✓ / `⚠ המונה שענה אינו המונה ב-EMS` (prefix match, like ModbusClient's own check) | New safety check |
| נתוני קריאה: 16 rows, raw ModbusClient values | The same 16 rows in the same order. **Two value columns**: `מהמונה` (L0) and `אחרי כופל EMS` (L1). Multiplier chips on top (`כופל זרם ×0.2` …). PF 0 from Fineco shows "—". Plus one derived row `הספק משוער (kW)` | Requirement 3 |
| — | Cross-check line: `קריאה אחרונה ב-EMS: … (לפני X דק׳)` + mismatch ⚠ | Catches S1-type bugs |
| פרטי תקשורת: זמן תגובה, תאריך קריאה (UTC, 3 h off) | Response time from EMS `completedAt − createdAt`, date in Israel time | Bug fix |
| Error box `שגיאה בתקשורת:` | Same box. Adds distinct texts for: EMS session expired (the app's ONE session funnel), meter has no IP / type not mapped (EMS 400), not allowed (403), timeout, `[null]`, `[]` (unsupported type) | Clear errors |
| — | `היסטוריה` strip: the last 5 EMS operations on this meter (`GET …/operations/history`) | Free with EMS logging |
| Everyone logged in | Staff with an EMS session only (§8.4) | Security |

## 8. Design
### 8.1 Data flow
```
FieldOps island (React, round-5 design system)
  │  emsGateway().modbusMeters(siteId) / .modbusRead(meterId) / .modbusPing(meterId) / .meterOpsHistory(meterId)
  ▼
lib/ems/adapters/rest.ts  ── reads (sites, meters) keep sigma.emsApi (Apps Script proxy, 20 s)
  │                        ── read/ping/history go to the new Edge Function (the proxy's 20 s abort is too short)
  ▼
Supabase Edge Function `field-ops`  (POST {token, mode, meterId})
  • emsValid(token)  • meterId must be a UUID  • mode ∈ {read, ping, history}  • body forwarded to EMS is ALWAYS {}
  • GET  {EMS}/v1/meters/{id}                              → the EMS context used for scaling (fresh, at read time)
  • POST {EMS}/v1/meters/{id}/operations/modbus_read/execute   (user's own bearer, 125 s)
  ▼
EMS NestJS meter-operations  (RolesGuard; IP/unit/type from PG; type→legacy code map; writes meter_operation_logs)
  ▼
ModbusClient /read-meter (AWS VPC, :5000)  ──Modbus TCP :502 over APN──►  meter
```
The function returns `{ meter: {id, serial, address, site, ip, unit, typeCode, typeKey, typeName, cm, vm, pm, typePm,
lastTransmission}, log: {status, responseData, errorMessage, createdAt, completedAt} }`. It never scales and never
reshapes `responseData`. The page parses and scales it in `modbusScale.ts`, the one scaling place.

Why not call ModbusClient from the Edge Function directly? Supabase can't reach the VPC. Exposing `:5000` publicly
would put an unauthenticated "read or ping any IP" endpoint on the internet. EMS already owns the IP, the type map,
the role check and the audit log.

### 8.2 Timeouts
EMS → ModbusClient is 120 s. Edge Function → EMS is 125 s (inside Supabase's 150 s wall clock). The browser aborts
at 140 s. The UI shows a live "קורא… 37 ש׳" counter and a cancel link; cancel only drops the wait, and EMS still
logs the result. Ping: EMS 60 s, function 65 s.

### 8.3 Manual entry, verified in EMS
1. The user types IP (+ ID, default 1) and optionally a type.
2. The function resolves `(ip, unit)` to an EMS meter (needs §9 E2; until then the user must also pick the kibbutz,
   and the match runs on that site's Modbus meter list, max 616 meters).
3. Exactly one match → read through that meterId. Show `אומת מול EMS: <serial> · <address>`. A typed type that
   differs from EMS gives `⚠ ב-EMS רשום <type>`, and the EMS type wins.
4. Several matches (a shared IP+unit, e.g. L123 phases or QNG4 circuits) → the user picks the meter.
5. No match → **blocked in v1**: `הכתובת לא רשומה ב-EMS — עדכן את המונה ב-EMS או בקש קריאה חד-פעמית`. An
   unregistered meter can only be read once EMS offers an ad-hoc read (§11 Q1).

The function never forwards a user-typed IP anywhere. The IP that reaches ModbusClient always comes from PG.

### 8.4 Security
- **Who**: EMS session required (`emsValid`). EMS enforces admin / site_manager / operations_manager. In the app,
  only staff roles see the page; the viewer PIN never does (the gate list is §11 Q2).
- **What the function can do**: an allowlist of `modbus_read`, `modbus_ping` and history. It can never reach
  `dlms_*` or `chint_*`.
- **Input**: only `meterId` (UUID) and `mode`. No IP, no params. This also neutralises EMS finding F1 from our side.
- **Load**: one in-flight read per user (client + function). Each read is a TCP session to the meter, and single-socket
  gateways reject a second one while the batch poller is connected (`Connection timeout`). That error text gets a
  hint: `ייתכן שהמונה בקריאה אוטומטית — נסה שוב בעוד דקה`.
- **Audit**: EMS `meter_operation_logs` (who, when, request, response). No new table in Supabase.
- **CORS**: the shared `_shared/http.ts` origin rule (app origin + githack + localhost), as in `github`.

Findings to hand to the other repos' owners (not fixed here):
- **F1 (EMS, both `dev` and the local checkout)**: `executeOperation` builds
  `mergedParams = {meterIpAddress: meter.ipAddress, meterSerialNumber, …, ...dto.params}`, so **caller params
  override the PG values**. Any admin/site_manager/ops_manager can aim `modbus_read`/`modbus_ping` at any IP. They
  can also send `dlms_disconnect` to a different IP/serial than the meter the role+site gate approved. Fix: spread
  `dto.params` first, or reserve the `meter*` keys.
- **F2 (ModbusClient)**: the listener on `0.0.0.0:5000` has no auth. Confirm its security group admits only the EMS
  backend.
- **F3 (ModbusClient repo)**: `App.config` and `appsettings.Local.json` commit live credentials (API user/password,
  the Netzer SQL Server connection string). Rotate them and move them to secrets.
- **F4 (EMS)**: a `[null]` or error-array reply is logged as `completed`, and 5 `modbus_read` rows are stuck
  `in_progress`. The app handles both. EMS should map them to `failed`.

## 9. Prerequisites outside this repo
| # | Repo / owner | Change | Size |
|---|---|---|---|
| M1 | ModbusClient (ivzan) | `MeterRequest` gets an optional `CounterNumber`. Stop keying scaling on the `"XXX"` sentinel; use an explicit `Scaled=true` for the on-demand path (fixes S5) | 0.5 d |
| M2 | ModbusClient | Satec: energy is **not** multiplied by U3 (S1); PF ×0.001 (S2); BFM V/I units (S3); Fineco PF as a real float (S6); add `"Units":"eng-v2"` | 1 d |
| M3 | ModbusClient | A reader exception → `[{Error:true, Detail}]` instead of `[null]` | 0.25 d |
| M4 | field (אביאם/ניתאי) | One clamp-meter + meter-display check per model for G4, G5, G10, G11, G12. Freeze the goldens | 1–2 d, in parallel |
| E1 | EMS (sigmatec-ems) | F1 params-override fix | 0.25 d |
| E2 | EMS | `GET /meters?ipAddress=&deviceNumber=` filter (manual mode without picking a site) | 0.25 d |
| E3 | EMS (optional, Q1) | Ad-hoc read `POST /meter-operations/modbus/adhoc {ip, unit, emsTypeCode}`: admin/ops only, IP in the APN allowlist, logged with `meter=null` | 0.5–1 d |

The page can ship **without** M1–M3. Satec energy then carries the ⚠ tag, QNG4 fails with a clear message, and the
cross-check guards the numbers. It must **not** ship without E1 being at least filed. The function never sends params,
so the app itself is safe either way.

## 10. App packages (after round 5; each on its own `feat/` branch)
| Pkg | Content | Tests | Est. |
|---|---|---|---|
| F1 | `supabase/functions/field-ops` (read/ping/history, allowlist, timeouts, CORS) | Deno unit test: rejects IP/params, rejects non-UUID, forwards `{}`, maps EMS 401/403/400/timeout | 0.5 d |
| F2 | Gateway ops `modbusMeters`, `modbusRead`, `modbusPing`, `meterOpsHistory` + mappers | `rest.test.ts` URL goldens + mapper goldens (EMS meter JSON → `EmsModbusMeter`) | 0.5 d |
| F3 | `lib/fieldops/modbusScale.ts` + `parseModbusResponse` | §6 golden table; contract test "all Modbus meter_types have vm=cm=1" (from a fixture of the EMS types response) | 0.5 d |
| F4 | `FieldOps` island: hub + קריאת מודבוס card (both modes, ping, read, results, history), nav entry, role gate | vitest render goldens for each state (G1–G15); Playwright: list read, manual verified read, manual unknown IP blocked, timeout, `[null]`; overlap sweep 390→3840 | 1.5 d |
| F5 | Docs: CHANGELOG, backlog, INDEX, graph rebuild | — | 0.25 d |

**App total ≈ 3.25 days.** Prerequisites ≈ 2–2.5 days of other people's time, plus field checks, all in parallel.

## 11. Open questions for עידן
1. **Unregistered meters**: should manual entry read a meter that isn't in EMS (a new install)? If yes, ask EMS for E3.
   If no, v1 blocks it (§8.3).
2. **Who sees the page**: עידן, עמיחי, אביאם, ניתאי, מתניה? אבצן / אליה? (EMS lets every admin through.)
3. **APN allowlist**: which IP ranges are really reachable from ModbusClient? The data has 10.185 (1,657),
   10.186 (1,954), 10.219 (148), 10.170 (83), and also 10.10 (277), 10.2 (183), 192.168 (194). Are the last three LAN
   addresses behind a gateway, and so not readable?
4. **Satec energy**: do you agree EMS's kWh is the truth (S1: the old page shows 1000× less)? Who owns the ModbusClient
   fix: Ivzan or us?
5. **QNG1 currents** (S4): do you know whether `current_multiplier` on QNG1 meters (0.4/0.5) is a correction to the
   device CT or the full CT? A clamp reading on `17313044-1` settles it.
6. **kW**: is `הספק משוער` (PF × ΣV·I) useful, or do you want real power, which means ModbusClient reads the P
   registers?
7. **L123 / QNG4 multi-circuit**: show one card per circuit (serial `-1..-4`, `01..03`) or only the chosen one?
8. **Next cards on the page** (§13): which old-app feature comes second?

## 12. Timing: follow round 5, don't join it
Round 5 is one closed series ("nothing starts until this whole plan is closed"). Its weights are fixed. Its Phase 2
design system and the S shell must exist before any new React page is built. Adding a package now would break the
series' own gate, and it would be built on primitives that are about to change. **Recommendation: this is the first
feature after the unfreeze.** Meanwhile the prerequisites (M1–M4, E1–E3) run **now**, in parallel, in the other
repos and in the field, and they don't touch this repo. When round 5 closes, F1–F5 are about 3 days on a ready design
system, with ModbusClient already fixed and the goldens already frozen.

## 13. Home for later field-ops features (from the old repo's menu, candidates only)
`מונים סלולארים עם תקלה` (`CellularMetersNotTransmittingPage`, alerts `/alerts/dlms-modbus`) · `חיפוש לוג DLMS` ·
`סטטוס מונה` · `החלפת מונה` / `מונה חדש` / `עריכת מונה` (these write to EMS and need their own spec) ·
`תיקון היסטוריה` / `לוגי Dialer` (customer 999 only). EMS also exposes DLMS relay and Chint valve operations, which
are **control** actions. They stay out of this page unless עידן rules otherwise, in a spec of their own.
