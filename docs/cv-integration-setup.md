# TASK-012-B1 — подготовка интеграции CV

Дата: 31 октября 2026. Статус: **подготовлено для независимого ревью**.
Этот файл — инструкция владельцу для последующей отдельно разрешённой фазы B2.
Наличие workflow в `develop` не активирует уведомления из `master`.
В B1 не настраиваются сервисы, секреты и visibility, не вызывается Deploy Hook,
не публикуется сайт. B2/C автоматически не начинаются.

## Подготовленная схема

`Resume/master` → изменение одного из двух approved PDF → GitHub Actions →
Cloudflare Pages Deploy Hook для `portfolio/master` → сборка Portfolio →
защищённое чтение обоих PDF из одного SHA `Resume/master` → статические `/cv/`.

Единственные входные файлы:

- `Releases/EN/Yuriy_Kobylyatskiy_Senior_Unity_Developer_EN.pdf`
- `Releases/RU/Yuriy_Kobylyatskiy_Senior_Unity_Developer_RU.pdf`

Дополнительный EN Unity Developer PDF, DOCX и README не вызывают hook.
Файлы не скачиваются клиентским JavaScript: посетителю выдаются статические PDF.
GitHub API используется только во время сборки, с обязательным токеном; подмена
на публичные raw/blob URL и резервная выдача устаревших CV не предусмотрены.

`.github/workflows/notify-portfolio-cv.yml`:

- только `push` в `master`, два точных пути; нет `workflow_dispatch`, PR или расписания;
- `permissions: contents: read`, checkout без сохранения credentials, Actions закреплены SHA;
- дополнительная проверка repository/ref/event и реального Git diff всего push;
- один POST, запрет redirect, тайм-аут 30 секунд, общий лимит job 5 минут;
- missing/invalid secret, непроверяемый diff, timeout, сеть и не-2xx — ошибка;
- URL, exception transport и body ответа не выводятся; повторных POST автоматически нет;
- параллельное выполнение не прерывает уже начатый запрос. GitHub concurrency может
  заменить ожидающий run более новым; сборка всё равно читает текущий `Resume/master`.

HTTP 2xx означает лишь принятие запроса. Успешный deployment проверяется отдельно.
При timeout сервер уже мог принять запрос: сначала проверить Cloudflare, затем решать
о повторе. Удаление approved PDF вызывает пересборку и закономерный fail-closed сборщика.
Первое создание ветки с нулевым `before` отклоняется: этот workflow рассчитан на
существующий `master`. GitHub path filters имеют платформенный лимит первых 300 файлов;
при необычно большом push владелец отдельно проверяет факт запуска Actions.

## Локальные проверки без Deploy Hook

Node.js 24+, из корня Resume:

```powershell
npm ci --ignore-scripts
npm test
```

`yaml` — только devDependency для настоящего разбора YAML 1.2. Сам notifier использует
только стандартную библиотеку Node.js, ему не нужен `npm install` в production job.
Тесты проверяют workflow, gate, HTTP/timeout/error, отсутствие утечек и Git diff на
изолированном временном репозитории в игнорируемом `.artifacts/task012b1`.
Все HTTP-вызовы подменены; реальные secret/hook в тестах не требуются и не используются.
Не запускайте notifier вручную с настоящим URL для проверки этой фазы.

## Два разных секрета

| Имя | Где хранить | Назначение |
| --- | --- | --- |
| `CV_GITHUB_TOKEN` | Cloudflare Pages, только **Production**, encrypted Secret | Читать Contents выбранного репозитория Resume при сборке Portfolio |
| `CLOUDFLARE_DEPLOY_HOOK` | Resume → Settings → Secrets and variables → Actions → Repository secret | URL запуска сборки Portfolio/master из Actions Resume |

Значения вводит владелец через интерфейс сервиса. Не передавать их в чат, Google Docs,
коммиты, скриншоты, команды терминала или логи. Не использовать `PUBLIC_` префикс.
Не добавлять production token в Preview, frontend, `.env` в Git или GitHub Variables.
В B1 эти секреты не созданы, а доступ к private Resume ещё не подтверждён.

## Инструкция владельцу: выполнять только после ревью и отдельного разрешения B2

1. **Проверить доступ и релизную границу.** Убедиться, что Cloudflare GitHub App имеет
   доступ к `finmagnat/portfolio` и сохранит его при будущем Private; отдельно проверить
   доступ владельца, Нели и Codex. Сейчас visibility не менять. Проверить доступный
   актуальный `Resume/master` и approved PDF после TASK-012-S. Код phase A уже в
   `portfolio/develop`; существующий production `master` пока не содержит все изменения.
   Требуется отдельное разрешение PO на публикацию накопленных TASK-008…012-A.

2. **Создать GitHub fine-grained PAT** в личных GitHub Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token. Resource owner:
   `finmagnat`; Repository access: Only select repositories → `Resume`.
   Repository permissions: **Contents: Read-only**; обязательные Metadata: Read-only.
   Не давать write, administration, workflows или доступ ко всем репозиториям.
   Указать конечный срок действия; записать владельца и напоминание о ротации без
   значения токена. При ротации сначала заменить secret, затем проверить отдельную
   разрешённую сборку и отозвать старый токен. Проверить совместимость с правилами
   аккаунта/организации и необходимость approval, если такие правила появятся.

3. **Открыть Cloudflare → Workers & Pages → Pages project `yk-developer` → Settings.**
   Это ожидаемые параметры для сверки, а не подтверждение текущего dashboard:

   | Поле | Требуемое значение |
   | --- | --- |
   | Git repository | `finmagnat/portfolio` |
   | Production branch | `master` |
   | Root directory | корень Git-репозитория Portfolio, не локальный путь Windows |
   | Build output directory | `dist` |
   | Node | 24, production variable `NODE_VERSION=24` |
   | Production build command, после согласования релиза | `npm run build:cloudflare` |

   В Variables and Secrets выбрать **Production**, добавить encrypted Secret
   `CV_GITHUB_TOKEN`, значение — PAT из шага 2. Не отмечать Preview. Проверить, что
   переменная доступна именно процессу build. GitHub Actions токен для этого не нужен:
   встроенный `GITHUB_TOKEN` notifier читает только собственный Resume.

4. **Preview policy — рекомендуемый вариант:** Settings → Builds & deployments →
   Preview branch control → **None** (отключить автоматические preview builds,
   включая `develop`; названия полей могут меняться). Сохранить production branch master.
   Проверить также поведение PR previews и исключить автоматические preview rebuilds.
   Не вызывать ручные preview deployments новой production-командой. Текущий wrapper
   намеренно отклоняет `CF_PAGES_BRANCH != master`; отключение preview не обходит gate.
   Production token в Preview не выдавать. Возврат preview требует отдельного решения
   о branch-specific offline build без production token и без ослабления защиты;
   в B1 такой обход не реализован. Обычные локальные build и CI остаются offline.

5. **Создать Deploy Hook**: `yk-developer` → Settings → Builds → Add deploy hook.
   Name: `resume-approved-pdf`; **Branch to build: `master`** репозитория Portfolio.
   Скопировать URL в Resume → Settings → Secrets and variables → Actions → New
   repository secret → Name: `CLOUDFLARE_DEPLOY_HOOK`. Это URL-credential, не API token.
   В интерфейсе только сохранить; не нажимать тестовый запуск без отдельного разрешения.
   При раскрытии URL удалить hook, создать новый и заменить secret. Не помещать URL
   в обычную GitHub Variable, YAML, инструкцию или Google Doc.

6. **Согласовать момент активации.** После принятого B1 и явного разрешения B2 отдельно
   выпустить workflow `Resume/develop → master` и изменения `portfolio/develop → master`
   по Workflow v2, без force push. Изменить production command на `npm run build:cloudflare`
   непосредственно в согласованный момент перед релизом Portfolio; не оставлять старый
   `master` с новой отсутствующей в нём командой. Заранее должны быть готовы token,
   preview policy и approved source PDFs. Изменение настройки само по себе не доказывает
   успешную сборку. Не выполнять пробный production deploy в B1.

   Merge только workflow без изменения approved PDF не обязан запустить notifier.
   Ручной dispatch сейчас намеренно отсутствует. Для контролируемого smoke test без
   изменения утверждённых CV отдельно согласовать ручной hook POST либо добавление
   ограниченного `workflow_dispatch`; не менять PDF только ради запуска.

7. **Приёмка фактической интеграции B2:** проверить завершённый SUCCESS deployment в
   Cloudflare, нужный Portfolio commit и источник Deploy Hook; одного HTTP 2xx мало.
   Проверить 28 маршрутов EN/UA/RU, footer без ссылки «Репозиторий резюме», реальные
   `/cv/Yuriy_Kobylyatskiy_EN.pdf` и `/cv/Yuriy_Kobylyatskiy_RU.pdf`. Проверить
   `Content-Disposition: attachment`, `Content-Type: application/pdf`, revalidation/cache,
   один клик в Windows Chrome/Edge/Firefox и Android Chrome. SHA-256 скачанных PDF
   должен совпадать с approved парой из **одного** фактически зафиксированного SHA
   Resume/master, а не просто с локальными копиями. Проверить логи/HTML/JS/artifacts
   на отсутствие credentials; сам PAT/URL в отчёт не вставлять.

8. **Ошибки и PRIV-001.** Expired/revoked token, недоступный source или privacy-validator
   должны останавливать новую сборку, без stale fallback. Проверять отрицательные
   сценарии на fixtures/непродуктивной среде, не ломать работающий сайт. При неудачной
   сборке проверить, что Cloudflare продолжает отдавать предыдущий успешный deployment;
   при необходимости владелец отдельно принимает решение о rollback. **Только после B2**
   отдельно разрешать C/Private Resume: private source access + опубликованный footer +
   публичные статические HR downloads должны быть проверены. P0 Private Portfolio также
   остаётся отдельной обязательной задачей с проверкой доступов. B1 её не закрывает.

## Что не доказано B1

Read-only скачивание текущего публичного Resume проверяет источник и валидатор, но не
доказывает private-auth, scope/expiry PAT, сохранение секретов, настройки Cloudflare,
успешность hook или production downloads. Dashboard не изменялся и не проверялся под
аккаунтом владельца. Эти проверки относятся к B2/C. Legacy PDF в Portfolio и GitHub
Pages не изменяются; удаление старой инфраструктуры относится к отдельному scope.

## Официальные источники

- [Cloudflare Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
- [Cloudflare Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare environment variables](https://developers.cloudflare.com/pages/configuration/build-image/)
- [GitHub fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub workflow syntax / filters / permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
