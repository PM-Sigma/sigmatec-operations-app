# Bug bot - home server install

Prerequisite (MAIN, once): `db/feedback_bot.sql` applied, `push-send` redeployed, branch `feat/bugbot` merged to main.

1. **Tools:** Node 22+, Git, and Claude Code (native installer) on the server. Log in once, interactively: run `claude`, complete the login, exit. (Never script the login.)
2. **Clone** (a dedicated clone the bot owns; do not work in it by hand):
   ```
   git clone https://github.com/PM-Sigma/sigmatec-operations-app.git C:\bugbot\repo
   cd C:\bugbot\repo
   npm ci
   npm --prefix app ci
   ```
   Git must be able to push to this repo non-interactively (credential manager already signed in as the repo account).
3. **Keys** - you fill these in yourself, locally:
   ```
   copy scripts\bugbot\.env.example scripts\bugbot\.env
   notepad scripts\bugbot\.env
   ```
   `BUGBOT_SB_URL` (project URL), `BUGBOT_SB_SERVICE_KEY` (service_role key), `BUGBOT_CRON_SECRET` (same value as the edge functions' CRON_SECRET). The file is git-ignored. Do not paste these anywhere else.
4. **Dry run** (claims nothing): `node scripts\bugbot\watch.mjs --dry-run` - should print the open-bug count and what it would do.
5. **Scheduled Task** (start at boot, restart on failure), PowerShell as admin:
   ```
   $a = New-ScheduledTaskAction -Execute "node.exe" -Argument "scripts\bugbot\watch.mjs" -WorkingDirectory "C:\bugbot\repo"
   $t = New-ScheduledTaskTrigger -AtStartup
   $s = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
   Register-ScheduledTask -TaskName "SigmatecBugBot" -Action $a -Trigger $t -Settings $s -User $env:USERNAME -RunLevel Limited
   Start-ScheduledTask -TaskName "SigmatecBugBot"
   ```
   Run it as the same Windows user you used for the Claude login. Keep the clone updated: the bot fetches origin before every bug, but the bot code itself updates with `git pull` (do it occasionally, then restart the task).
6. **Logs:** `scripts\bugbot\.state\bugbot.log` (ids and counts only). **Stop:** `Stop-ScheduledTask SigmatecBugBot` (disable: `Disable-ScheduledTask SigmatecBugBot`). The lock file `.state\watch.lock` is cleared on exit.
7. **First live test:** file a test bug from the app, watch the log, expect a push within minutes. Daily cap is 10 runs (LIMITS in `lib.mjs`).

Optional env: `BUGBOT_CLAUDE` (full path to claude.exe), `BUGBOT_REPO`, `BUGBOT_WORK_ROOT`, `BUGBOT_STATE_DIR`.
