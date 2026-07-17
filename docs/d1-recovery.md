# Восстановление Cloudflare D1

## Безопасная репетиция

Репетиция работает только с отдельной базой `personal-budget-recovery-drill`. Скрипт проверяет имя, UUID и маркер `RECOVERY_DRILL_ONLY`; production-база `personal-budget-ru-db` находится в блок-листе.

```powershell
npm run drill:d1-recovery
```

Сценарий применяет актуальные миграции к тестовой БД, создаёт контрольную запись, сохраняет Time Travel bookmark, изменяет запись, восстанавливает БД и чтением подтверждает возврат исходного значения. Последний отчёт и журналы сохраняются только локально в `.codex-local/recovery-drill/`.

На рабочем компьютере зарегистрирована задача `PersonalBudget-D1RecoveryDrill`, которая выполняет этот сценарий раз в четыре недели. Проверить её можно так:

```powershell
Get-ScheduledTask -TaskName "PersonalBudget-D1RecoveryDrill"
Get-Content ".codex-local\recovery-drill\latest.json" -Raw
```

## Production-инцидент

Production никогда не восстанавливается автоматически.

1. Зафиксировать время инцидента в UTC и остановить любые ручные изменения данных.
2. Экспортировать текущее состояние D1 в приватную папку вне репозитория:

   ```powershell
   $backupRoot = "D:\PrivateBackups\PersonalBudget"
   New-Item -ItemType Directory -Force $backupRoot | Out-Null
   npx wrangler d1 export personal-budget-ru-db --remote `
     --output "$backupRoot\before-restore.sql" `
     --config ".codex-local\cloudflare-api\wrangler.jsonc"
   ```

3. Получить bookmark непосредственно перед инцидентом и отдельно сохранить текущую bookmark:

   ```powershell
   $incidentUtc = "YYYY-MM-DDTHH:MM:SSZ"
   npx wrangler d1 time-travel info personal-budget-ru-db --timestamp $incidentUtc --json `
     --config ".codex-local\cloudflare-api\wrangler.jsonc"
   npx wrangler d1 time-travel info personal-budget-ru-db --json `
     --config ".codex-local\cloudflare-api\wrangler.jsonc"
   ```

4. Проверить UTC-время, bookmark и имя `personal-budget-ru-db` вторым человеком или повторным чтением команды.
5. Только после проверки вручную выполнить разрушительный restore, затем проверить `/health`, список миграций и вход в приложение:

   ```powershell
   $bookmark = "BOOKMARK_BEFORE_INCIDENT"
   npx wrangler d1 time-travel restore personal-budget-ru-db --bookmark $bookmark --json `
     --config ".codex-local\cloudflare-api\wrangler.jsonc"
   ```

6. Сохранить возвращённый `previous_bookmark`: он позволяет отменить ошибочно выбранное восстановление.

Актуальная документация Cloudflare: <https://developers.cloudflare.com/d1/reference/time-travel/>.
