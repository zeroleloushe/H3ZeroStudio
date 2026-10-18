<div align="center">

# 🎬 H3ZeroStudio

**Таймлайн-редактор в стиле CapCut для MiniMax H3 прямо внутри ComfyUI**

Длинные ролики из отрезков, у каждого свой промпт и референсы. Отрезки продолжают друг друга без швов, а персонажи остаются теми же.

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-custom%20node-6c47ff.svg)](https://github.com/comfyanonymous/ComfyUI)
[![MiniMax H3](https://img.shields.io/badge/model-MiniMax%20H3-ff6a3d.svg)](#-модели)
[![Plain JS](https://img.shields.io/badge/UI-plain%20JS%20·%20offline-f7df1e.svg)](#)
[![Tests](https://img.shields.io/badge/tests-78%20passed-2ea44f.svg)](#-тесты)

[Возможности](#-возможности) · [Установка](#-установка) · [Модели](#-модели) · [Как пользоваться](#-как-пользоваться) · [Горячие клавиши](#-горячие-клавиши) · [FAQ](#-faq) · [English](#-english) · [Благодарности](#-благодарности-и-лицензии)

</div>

![Редактор H3ZeroStudio](docs/images/editor.webp)

<p align="center"><i>Редактор на 21:9 (3389×1288): ассеты, плеер, карточка отрезка, таймлайн с дублями, маркерами, дорожкой «Аудио» и «Музыка».</i></p>

<table>
<tr>
<td width="50%"><img src="docs/images/live.webp" alt="Живое превью во время генерации"><br><sub><b>Генерация:</b> живое превью шага (taeh3), графики σ / Δ, статус в шапке</sub></td>
<td width="50%"><img src="docs/images/graph.webp" alt="Нода на графе ComfyUI"><br><sub><b>На графе:</b> компактная нода с превью, полосой отрезков и прогрессом</sub></td>
</tr>
</table>

![Таймлайн](docs/images/timeline.webp)

---

## ✨ Возможности

- 🎞️ **Таймлайн как в видеоредакторе.**
  - Отрезки, линейка, плейхед, масштаб от 1/16 до 64×.
  - Длина меняется по сетке H3 **17k+5** кадров.
  - Разрезать, дублировать и продлить. Шов между клипами тянется (roll edit, с `Shift` — ripple).
  - Миниатюры кадров и скраб-превью при наведении.
- 🔗 **Продление без швов.**
  - Хвост латента предыдущего отрезка фиксируется в начале следующего.
  - Последний кадр идёт референсом, звук продолжается через нативную audio denoise mask H3.
  - «Новая сцена» — обычная монтажная склейка.
- 🖼️ **Ассеты и референсы.**
  - Категории: персонажи, локации, прочее, аудио.
  - Перетаскивание на клип и Ctrl+V.
  - Автонумерация `<Picture N>`, лимит H3 — 9 картинок на отрезок.
- 🎭 **Дубли (takes).**
  - До 12 вариантов на отрезок. Выбранный дубль идёт в склейку и в продолжение.
  - Изменившиеся зависимые отрезки помечаются «изменён».
- 🎵 **Звук.**
  - Дорожка **«Аудио»** фиксирует звук: видео подстраивается под ритм и липсинк.
  - Дорожка **«Музыка»** — фон, который подмешивается в итог.
  - Стыки сшиваются с точностью до сэмпла.
- ✎/✦ **Два этапа.** Быстрый черновик в малом размере, затем чистовик: латентный апскейл и короткая доработка с сохранением звука 1:1.
- ↑ **Апскейл отрезка и всего ролика.** Обученный латентный апскейлер H3, RTX Video Super Resolution или синхронные плитки (SyncTile).
- 👁️ **Живое превью** каждого шага через tiny VAE `taeh3` со звуком, графики σ / Δ и время шага.
- 📌 **Маркеры.** Заметка, событие `At 3.2s: …`, усиление персонажа. Маркер конца ролика обрезает итог ровно по нему.
- 🗂️ **Галерея и проекты.**
  - Все результаты с фильтрами, избранным и A/B-сравнением.
  - Проекты сохраняются автоматически; есть экспорт и импорт zip с ассетами.
- 💾 **Кэш по хэшу параметров.** Перегенерируется только то, что изменилось. Прогресс не теряется при перезагрузке вкладки.
- 📖 **«Справка»** прямо в редакторе: 26 разделов с поиском.
- ⌨️ **Undo/Redo и горячие клавиши.**
- 🔌 **Офлайн.** Интерфейс на чистом JS/DOM, без сторонних библиотек и CDN.

## 📦 Установка

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/zeroleloushe/H3ZeroStudio.git ComfyUI-H3ZeroStudio
```

Дальше:
- **Зависимости ставить не нужно.** Используются torch, numpy, Pillow, PyAV и aiohttp, которые уже есть в ComfyUI (`requirements.txt` пустой, там только опции).
- **Нужен ComfyUI с нативной поддержкой MiniMax H3**, то есть свежая версия.
- **Перезапустите ComfyUI.** Нода появится в категории `MiniMax H3/H3ZeroStudio` под именем **«H3ZeroStudio · Таймлайн»**.

<details>
<summary>Windows (portable / Easy-Install), embedded Python</summary>

```bat
cd ComfyUI\custom_nodes
git clone https://github.com/zeroleloushe/H3ZeroStudio.git ComfyUI-H3ZeroStudio
rem опционально, для RTX VSR:
..\..\python_embeded\python.exe -m pip install nvidia-vfx
```
</details>

## 🧩 Модели

| Что | Файл | Папка | Нужно? |
|---|---|---|---|
| MiniMax H3 (модель, текстовый энкодер, video VAE, audio VAE) | штатные файлы H3 для ComfyUI | `models/diffusion_models`, `models/text_encoders`, `models/vae` | **обязательно** (без audio VAE — только видео) |
| Обученный латентный апскейлер H3 | `minimax_h3_latent_upscaler_3d_bf16.safetensors` ([HF](https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler)) | `models/latent_upscale_models` | для 2 этапов и апскейла (метод по умолчанию) |
| ↳ нода апскейлера | [Comfyui_Minimax_h3_latent_Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler) (нода `MinimaxH3LatentUpscaler3D`) | `custom_nodes` | вместе с моделью |
| RTX Video Super Resolution | пакет `nvidia-vfx` (`pip install nvidia-vfx`) и видеокарта NVIDIA RTX | — | опционально: метод «качество» и запасной вариант |
| Tiny VAE для превью | `taeh3.safetensors` ([madebyollin/taehv](https://github.com/madebyollin/taehv/tree/main/safetensors)) | `models/vae_approx` | опционально: без него превью грубое (latent → RGB) |

Папки ищутся стандартно через `folder_paths`, поэтому пути из `extra_model_paths.yaml` тоже работают. Что найдено, видно в редакторе: **«Настройки» → «Модели»**.

Если для чистовика или апскейла нет ни обученного апскейлера, ни RTX VSR, генерация остановится до сэмплинга с понятной ошибкой.

## 🚀 Как пользоваться

1. **Соберите граф.**
   - Добавьте ноду **«H3ZeroStudio · Таймлайн»**.
   - Подключите `model` (можно с turbo LoRA: 4–8 шагов, CFG 1), `clip`, `vae` и `audio_vae`.
   - Вход `audio` необязателен: свой звук можно загрузить и в ассеты.
2. Нажмите **«Развернуть»** (или двойной клик по ноде). Редактор откроется на всё окно.
3. **Загрузите ассеты** — персонажей, локации, аудио — и перетащите их на клипы.
4. **Напишите промпт** каждому отрезку и выберите связь:
   - **«Продление»** продолжает предыдущий отрезок;
   - **«Новая сцена»** — монтажная склейка.
5. **Запустите.**
   - **«Сгенерировать»** (`Ctrl+Enter`) — весь ролик.
   - Кнопки на клипе: **«Сгенерировать»** / **«Ещё дубль»** — только этот отрезок.
6. **Доведите результат.** Выбирайте лучшие дубли, правьте отрезки (перегенерируется только изменённое) и делайте чистовик или апскейл.
7. **Заберите выходы ноды:**
   - `images` (24 fps);
   - `audio`;
   - `latent` — склеенный AV-латент, например для H3 Windowed Refine.

Проект целиком живёт внутри workflow, в скрытом виджете ноды: отрезки, дубли, маркеры, аудио, настройки. Копии проектов лежат в `output/h3zerostudio/_projects`.

<table>
<tr>
<td width="34%"><img src="docs/images/segment_card.webp" alt="Карточка отрезка"><br><sub><b>Карточка отрезка:</b> связь, длительность, промпт, референсы, дубли</sub></td>
<td width="33%"><img src="docs/images/context_menu.webp" alt="Контекстное меню клипа"><br><sub><b>Правый клик по клипу:</b> дубль, этапы, апскейл, перекрытие, маркер</sub></td>
<td width="33%"><img src="docs/images/assets.webp" alt="Ассеты"><br><sub><b>Ассеты:</b> персонажи, локации, прочее, аудио с волной</sub></td>
</tr>
</table>

## ⚙️ Настройки и этапы

<table>
<tr>
<td width="50%"><img src="docs/images/settings.webp" alt="Вкладка Настройки"></td>
<td width="50%"><img src="docs/images/upscale.webp" alt="Блок апскейла с плитками"></td>
</tr>
<tr><td><sub><b>«Настройки»:</b> этапы, параметры прохода, продление, кэш, превью, модели</sub></td><td><sub><b>«Апскейл»:</b> метод, итоговые Мп, σ; для плиток — сетка 3×3 и перекрытие</sub></td></tr>
</table>

В правой панели собрано то, что меняется часто: отрезок, общий промпт, негатив, разрешение и сид. Всё остальное — во вкладке **«Настройки»**. Глобальные настройки хранятся в `output/h3zerostudio/_settings.json`. Есть два режима: «Для всех проектов» и «Только этот проект».

**Режим генерации** («Настройки» → «Генерация»):
- **1 этап** — каждый отрезок сразу в финальном размере.
- **2 этапа** — сначала черновик (по умолчанию 50 % по стороне), затем чистовик:
  1. Видео-латент выбранного черновика увеличивается обученным апскейлером H3 (или через RTX VSR → VAE encode).
  2. Короткий проход H3 стартует с **σ 0.40** (проверенный диапазон 0.25–0.45). Это доля шума, а не «denoise».
  3. **Звук черновика сохраняется 1:1** через маску звука H3, перекрытие фиксируется по доработанному предыдущему отрезку.
- **✎ Черновик / ✦ Чистовик / ↑ Финал из черновика** запускают один этап для одного клипа, не меняя режим проекта.
- У «Основного прохода», «Этапа 1» и «Этапа 2» свои шаги, cfg, сэмплер, расписание и shift. Пустое поле означает «как в основном проходе».

<details>
<summary>Подробнее: кэш, лог, перекрытие</summary>

- **Кэш.**
  - Черновики и финалы кэшируются отдельно в `output/h3zerostudio/<проект>/cache/` по хэшу параметров. Переключение режима ничего не стирает.
  - Сервер хранит состояние запуска (`/h3zero/status`). Редактор догоняет пропущенное после перезагрузки вкладки или возврата в окно.
- **Перекрытие** продлений: 22, 39, 56 … кадров (сетка 17k+5). Задаётся глобально и для каждого стыка: в карточке или через ПКМ → «Перекрытие». Значения 39/90/141 ложатся точно на сетку звука 40 Гц.
- **Лог `[H3ZS]` в консоли ComfyUI.**
  - Сводка запуска.
  - Начало каждого отрезка: seed, какой ассет стоит за каким `<Picture N>`, HIT/miss кэша.
  - Строка на каждый шаг: σ, Δ, мс, ETA, VRAM.
  - Итог склейки.
- **Оценка до запуска.** Кадры, секунды и примерное время. Предупреждения: выход за обучающий диапазон H3 (124–362 кадра), пустые промпты, маркеры без эффекта.
</details>

## ↑ Апскейл

Отрезок увеличивается и дорабатывается, остальные при этом не трогаются. Запустить можно кнопкой **↑** на клипе, через меню клипа «↑ Апскейл отрезка ▸» (×1.5 / ×2) или из карточки. **«↑ Апскейл»** в шапке увеличивает весь ролик: готовые отрезки берутся из кэша, прерванный запуск продолжается.

| Метод | Как работает | σ по умолчанию |
|---|---|---|
| **Латент + доработка** (по умолчанию) | обученный апскейлер H3 прямо в латенте, без VAE decode/encode | 0.40 |
| **RTX VSR → доработка** | decode → RTX VSR (ULTRA) → encode, вариант «качество» | 0.25 |
| **Плитки (SyncTile)** | синхронные плитки: на каждом шаге считаются все плитки со своими референсами и смешиваются рампами | 0.35 |

- Для плиток задаются размер (768×448 … 1280×704 или свой) и перекрытие. Итоговая сетка показывается сразу, например «3×3 = 9 плит. → 1728×960».
- Звук отрезка сохраняется 1:1.
- Апскейл — это обычный дубль: к версии без апскейла всегда можно вернуться.
- Прогресс виден по каждой плитке: окно, шаг, тайл и ETA, плюс рамка текущей плитки поверх плеера.

## 🎵 Звук: «Аудио» (фиксация) и «Музыка»

| | Дорожки **«Аудио»** (2 полосы) | Дорожка **«Музыка»** |
|---|---|---|
| Что делает | звук **фиксируется** в аудиолатенте на всех шагах | фон, **подмешивается** к итогу при склейке |
| Видео | подстраивается под звук (ритм, липсинк, удары) | не зависит от музыки |
| Звук H3 под клипом | заменён вашим | генерируется как обычно, музыка ложится поверх |
| Для чего | клип под песню, озвучка, синхрон | саундтрек, эмбиент |

- Аудиоклипы можно двигать, подрезать за края, разрезать на плейхеде (`S`) и удалять (`Del`).
- Аудиоассет в **референсах** отрезка — это только подсказка `<Audio N>` (H3 ref_audios, до 3 на отрезок).
- **Стыки продлений:**
  - Аудиолатент перекрытия защищается маской: модель продолжает ту же музыку, голос и фон.
  - Склейка выравнивается по корреляции, с точностью до сэмпла.
  - Если по обе стороны разный звук — выравнивание громкости и равномощный кроссфейд.

## 🗂️ Галерея, проекты, справка

<table>
<tr>
<td width="50%"><img src="docs/images/gallery.webp" alt="Галерея"></td>
<td width="50%"><img src="docs/images/projects.webp" alt="Проекты"></td>
</tr>
<tr><td><sub><b>Галерея:</b> дубли, черновики, финалы, апскейлы; фильтры, поиск, избранное, A/B (Ctrl+клик)</sub></td><td><sub><b>Проекты:</b> открыть, переименовать, дублировать, экспорт/импорт zip с ассетами</sub></td></tr>
</table>

![Справка](docs/images/help.webp)

<p align="center"><sub><b>«Справка»</b>: руководство для новичков прямо в редакторе — 26 разделов, оглавление и поиск с подсветкой.</sub></p>

<details>
<summary>Ещё скриншоты: плеер, редактор ассета, сохранение</summary>

![Плеер](docs/images/player.webp)

| Редактор ассета | Экспорт / сохранение |
|---|---|
| ![Редактор ассета](docs/images/asset_editor.webp) | ![Сохранение](docs/images/save_dialog.webp) |
</details>

## ⌨️ Горячие клавиши

| Клавиша | Действие |
|---|---|
| `Пробел` | play / pause |
| `S` / `D` / `E` | разрезать / дублировать / продлить отрезок |
| `S` при выбранном аудиоклипе | разрезать аудиоклип на плейхеде |
| `M` | маркер на плейхеде |
| `Del` / `Backspace` | удалить отрезок или аудиоклип |
| `← →` (`Shift` — по секунде), `Home` / `End` | перемотка |
| `[` `]` | предыдущий / следующий отрезок |
| `+` `−`, `Ctrl+колесо` | масштаб таймлайна (к курсору) |
| `Ctrl+Z` / `Ctrl+Y` | отменить / повторить |
| `Ctrl+Enter` | сгенерировать |
| Правый клик по клипу | контекстное меню |
| `Shift` при перетаскивании шва | ripple вместо roll |
| `Esc` | закрыть меню / снять выбор / свернуть редактор |

Пока открыт редактор, горячие клавиши ComfyUI (в том числе его Ctrl+Z для графа) не срабатывают.

## ❓ FAQ

<details><summary><b>«Апскейл недоступен» / чистовик не запускается</b></summary>

Нужен обученный апскейлер: нода [Comfyui_Minimax_h3_latent_Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler) и файл `minimax_h3_latent_upscaler_3d_bf16.safetensors` в `models/latent_upscale_models`. Другой вариант — `pip install nvidia-vfx` на ПК с NVIDIA RTX. Статус виден в «Настройки» → «Модели».
</details>

<details><summary><b>Превью во время генерации мутное, цвета странные</b></summary>

Положите `taeh3.safetensors` в `models/vae_approx` и выберите в «Живое превью» tiny VAE «авто». Без него используется грубое приближение latent → RGB.
</details>

<details><summary><b>Кнопки «Сгенерировать» на отрезке-продлении серые</b></summary>

Продлению нужен готовый (выбранный) дубль предыдущего отрезка: без его хвоста продолжать нечего. Сначала сгенерируйте предыдущий отрезок. Первый отрезок и «Новая сцена» доступны всегда.
</details>

<details><summary><b>У старой ноды на графе бейдж [DEPR]</b></summary>

Это workflow со старой нодой `ZL_H3Studio` (прежнее имя «H3 Studio»). Он по-прежнему загружается, а в компактном виде ноды есть кнопка **«⇪ Обновить ноду»**: она заменяет ноду на новую, сохраняя проект, связи, позицию и значения.
</details>

<details><summary><b>Где хранятся проекты и результаты? Нужен ли интернет?</b></summary>

Проект хранится внутри workflow и копией в `output/h3zerostudio/_projects`. Кэш и результаты лежат в `output/h3zerostudio/<проект>/`, ассеты — в `input/h3zerostudio/`. Интернет не нужен: интерфейс работает офлайн, без CDN.
</details>

<details><summary><b>Сколько длиной делать отрезки?</b></summary>

Держите отрезки в обучающем диапазоне H3: 124–362 кадра, это примерно 5–15 с. Длинный ролик собирайте продлениями. Отрезки генерируются последовательно.
</details>

<details><summary><b>Плитки апскейла упираются в VRAM</b></summary>

Возьмите плитку меньше (например, 768×448): плиток станет больше, но каждая легче. Итоговая сетка и размер показываются до запуска.
</details>

## 🗺️ Roadmap

- [ ] Английский интерфейс (сейчас UI на русском).
- [ ] Публикация в ComfyUI Registry / Manager.
- [ ] Нативное превью `taeh3`, когда оно появится в ComfyUI ([#15592](https://github.com/Comfy-Org/ComfyUI/issues/15592)).
- [ ] Выходной латент с «новыми сценами» точно по сетке 5k+2 (сейчас — конкатенация).
- [ ] Подстройка цветов превью и поведения дорожки «Аудио» на полноразмерной H3.

Идеи и баги — в [Issues](https://github.com/zeroleloushe/H3ZeroStudio/issues).

## 🧪 Тесты

```bash
python -m pip install pytest
python -m pytest            # или COMFYUI_PATH=/путь/к/ComfyUI python -m pytest
```

78 тестов запускают настоящий `MiniMaxH3` в крошечной конфигурации с фейковыми CLIP и VAE на CPU. Они проверяют:
- продления, кэш и перекрытие;
- аудио-фиксацию и швы;
- дубли и маркеры;
- этапы и апскейл;
- превью;
- синтаксис JS и совпадение логики Python и JS.

---

## 🇬🇧 English

**H3ZeroStudio** is a CapCut-style timeline editor node for **MiniMax H3** in ComfyUI. The UI is in Russian; English is on the roadmap.

- **Segments.** Build a long video from segments, each with its own prompt and reference images. *Extend* continues the previous segment: its latent tail is pinned and audio continues through H3's native denoise masks. *New scene* is a hard cut.
- **Takes.** Keep up to 12 takes per segment. Only changed segments are re-generated, thanks to a content-hash cache.
- **Two stages.** A fast draft first, then a final pass: learned H3 latent upscaler (or RTX VSR) plus a short low-σ refine that keeps the draft audio 1:1.
- **Upscale.** Per segment or the whole video: learned latent upscaler, RTX Video Super Resolution, or synchronized tiles (SyncTile).
- **Audio.** "Аудио" lanes **lock** your audio, so the video follows its rhythm and lip-sync. The "Музыка" lane is a background music bed mixed into the output.
- **Live preview.** Every step is decoded with `taeh3`, with audio, σ/Δ charts and a per-step log.
- **Also included:** markers, gallery with A/B compare, projects with zip export/import, undo/redo, hotkeys, and a built-in help tab. The UI is plain JS, works offline and uses no CDN.

**Install:** `git clone https://github.com/zeroleloushe/H3ZeroStudio.git` into `ComfyUI/custom_nodes`, then restart ComfyUI. No extra pip packages are required.

**Optional models:**
- `minimax_h3_latent_upscaler_3d_bf16.safetensors` in `models/latent_upscale_models`, plus the [Comfyui_Minimax_h3_latent_Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler) node;
- `pip install nvidia-vfx` for RTX VSR;
- `taeh3.safetensors` in `models/vae_approx` for the preview.

**Use:** wire `model`, `clip`, `vae` and `audio_vae`. Click **«Развернуть»** (Expand), build the timeline and press **«Сгенерировать»** (`Ctrl+Enter`). Outputs: `images` (24 fps), `audio`, `latent`.

---

## 🙏 Благодарности и лицензии

H3ZeroStudio распространяется под **[GPL-3.0](LICENSE)** — той же лицензией, что ComfyUI и KJNodes. Код из перечисленных проектов **не копировался**: всё написано заново на штатных механизмах ComfyUI. Ниже — у кого взяты идеи и что вызывается во время работы.

- **Продление и звук на стыках** (нативные video/audio denoise masks H3, cond-аудио до стыка). Подход сверен с:
  - [Herrgott — H3 Infinite Continuation Suite](https://github.com/HerrgottMargott/Herrgotts-H3-Infinite-Continuation-Suite) (GPL-3.0);
  - [NikoDemon80 — ComfyUI-H3-Motion-Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context) (GPL-3.0);
  - [seitanism — ComfyUI-H3-Motion-Context-MultiRef](https://github.com/seitanism/ComfyUI-H3-Motion-Context-MultiRef) (GPL-3.0);
  - [ttulttul — ComfyUI-Minimax-H3-Continuation](https://github.com/ttulttul/ComfyUI-Minimax-H3-Continuation) (MIT).
- **Таймлайн из нескольких клипов H3:** [tritant — ComfyUI_MiniMax_H3_Extender](https://github.com/tritant/ComfyUI_MiniMax_H3_Extender) (Apache-2.0), идея.
- **Живое превью и RTX VSR** — по образцу [kijai — ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) (GPL-3.0):
  - Model Preview Override: tiny VAE `taeh3`, Δ шага, звук через audio_vae;
  - Resize Image v2 с `nvidia_rtx_vsr`.
- **Остальное для превью и RTX VSR:**
  - Вызов RTX VSR сверен с [Comfy-Org — Nvidia_RTX_Nodes_ComfyUI](https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI) (Apache-2.0); используется пакет NVIDIA `nvidia-vfx`.
  - Веса `taeh3` — [madebyollin/taehv](https://github.com/madebyollin/taehv).
- **Латентный апскейлер H3:** [LBH-123-AI — Comfyui_Minimax_h3_latent_Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler) (MIT). Его нода только **вызывается**, если установлена.
- **Схема «черновик → апскейл латента → доработка»** (идеи: старт σ 0.25–0.45, апскейл только видео, звук прохода 1 сохраняется):
  - [Tr1dae — ComfyUI-MiniMaxH3_LatentUpscaler](https://github.com/Tr1dae/ComfyUI-MiniMaxH3_LatentUpscaler);
  - [xmarre — Comfyui_Minimax_h3_latent_Upscaler-Plus](https://github.com/xmarre/Comfyui_Minimax_h3_latent_Upscaler-Plus);
  - Z3 MiniMax H3 Refine Pass.
- **Синхронные плитки:**
  - метод — [alaintural/synctile-h3](https://github.com/alaintural/synctile-h3) (MIT);
  - встраивание — по собственной ноде автора **ComfyUI-SyncTile-H3** (Zero Leloushe), с референсами на каждую плитку.
- **Последовательное продление** повторяет подход собственной ноды автора **ComfyUI-H3-WindowedRefine**.
- **ComfyUI** (GPL-3.0) — нативная реализация MiniMax H3: refs, keyframes, `ModelSamplingAV`, блоки TAESD/TAEHV.

**Кадры на скриншотах** — из фильма *Tears of Steel* © Blender Foundation | [mango.blender.org](https://mango.blender.org), лицензия [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Используется только видео; музыка в демо-проекте синтезирована отдельно. Генерации на скриншотах воспроизводят интерфейс на реальных кадрах — это не выход модели.

<div align="center"><sub>Сделано Zero Leloushe · префиксы <code>ZL_</code> / <code>h3z-</code> / <code>/h3zero/</code> выбраны, чтобы не конфликтовать с другими паками</sub></div>
