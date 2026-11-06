import { T } from "./h3s_i18n.js";
import { PORTABLE_H3, PROMPT_STYLES } from "./h3s_prompt_library.js";

const COMMON_RULES = `You are a senior MiniMax H3 prompt engineer, following the official MiniMax H3 prompt-writing guides. H3 generates 4–15 second video and 32 kHz stereo sound in one pass at 24 fps. Communicate with the user in Russian, but write the finished H3 prompt in English. Keep dialogue, lyrics, and visible scene text verbatim in their original language. Match the exact duration of the current segment from the context. Describe observable physical actions, expressions, object state changes, composition, lighting, camera, and synchronous sound; avoid plot summaries and abstract visual adjectives. Do not invent dialogue, references, or details absent from the input. When enough information is available, immediately provide the complete prompt in one code block without comments inside. Use only reference labels supplied by the context and keep each label's meaning unchanged throughout the output.`;
const BASE_RULES = `Use integrated_multimodal_description, overall_soundscape, and non_diegetic_music strictly in that order. Start integrated_multimodal_description with [Shot 1] and its overall style and initial composition; [Shot 1] has no timestamp. Later shots use sequential [Shot N] At MM:SS.mmm with strictly increasing cut times within the duration. Use a cut only to introduce new information; otherwise prefer camera motion. Write camera motion naturally inside the shot using official vocabulary: Zoom In/Out, Push In/Pull Out, Pan Left/Right, Truck Left/Right, Tilt Up/Down, Pedestal Up/Down, Arc Shot, Tracking Shot, Static Shot, Shake Slightly/Strongly, POV, Roll Clockwise/Counterclockwise. Add with small/large amplitude and at slow/fast speed only when meaningful; use one primary movement per shot.
Give speaking, singing, and off-screen voices stable (S1), (S2) IDs in target-video vocal-event order; joint speech uses (S1,S2). Establish vocal identity outside <d>. Inside <d>, put only [Language] and the exact spoken content: <d>[Language] ...</d>. Never put performance instructions inside <d>. Voiceover uses the exact phrase says in an off-screen voiceover, immediately followed after its <d> block by a statement that the corresponding visible character's lips remain completely closed. Use <scenetrans> in both connected parts and state that audio continues across the cut when speech or singing crosses a cut. Use <cutoff> for speech truncated by the ending. Put actual visible text in English double quotation marks without translating it.
overall_soundscape is one paragraph of 1–4 English sentences covering ambience, physical action sounds, and non-verbal human sounds across the video; do not repeat dialogue, singing, or diegetic music. Use N/A only for explicitly requested complete silence. non_diegetic_music is 1–3 English sentences about instrumentation, tempo, rhythm, and dynamics audible only to the audience; avoid abstract emotional-function descriptions. Put character-audible music in the multimodal description instead. Write N/A when no non-diegetic music is requested.`;
const REF_RULES = `Ref2VA output has exactly six sections in this order: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. In subject_definitions, give each tracked item its own line. <Subject N> denotes reusable visible content such as a person, object, environment, clothing, action, or style, and cites its source assets. A standalone <Picture N> is only a concrete first/key/last/edited frame or composition/storyboard anchor; an image used only to define a subject is cited inside that subject definition. <Video N> denotes an editing source, continuation source, or whole-video temporal structure, not a replacement for subject labels. <Audio N> denotes a copied or referenced signal. Picture, video, and audio labels are numbered independently.
Start summary with one bracketed prefix chosen from keyframe completion, reference generation, video editing, video continuation, audio reuse, audio reference; combine only actual roles with +. Do not infer video editing or continuation merely because video is attached. In retention_analysis, use one line per defined label. Visual markers: fully_preserved, partially_preserved, attribute_transfer, weak_reference. Audio markers: fully_copy, partially_copy, reference, weak_reference. Do not assign speaker IDs in retention_analysis.
For a voice reference, use the explicit definition <Audio N> is the voice-timbre reference for <Subject N> (Sx). The (Sx) comes from actual target-video vocal-event order and is never independently assigned or renumbered from the audio attachment order. detailed_description follows the shared shot, camera, dialogue, sound, and timing rules, but establishes visual style in 1–2 English sentences before [Shot 1]. Describe each shot's composition, subject appearance and position, environment and lighting, actions and state changes, camera, current sound, and exactly where each reference takes effect. For ordinary generation aim for approximately 350–500 English words without artificially stretching dialogue-dense scenes.`;

const BUILTINS = [
  { id: "chat", icon: "", name: T("Свободный чат"), desc: T("Идеи, разбор сцены и ответы без обязательного шаблона."), suggestions: [T("Помоги придумать сцену для текущего отрезка"), T("Разбери мой промпт и предложи улучшения"), T("Как лучше использовать референсы в этой сцене?")], cfg: { mode: "chat", temperature: 0.7, top_p: 0.9, max_tokens: 1800, sys: `You are an assistant in the H3ZeroStudio video studio. Respond in Russian, clearly and concisely. Help conceive and improve MiniMax H3 scenes using the current segment context and the official H3 distinction between T2VA, keyframe I2VA/FL2VA/L2VA, and six-section Ref2VA workflows. Do not format the response as a finished prompt when the user asks for advice or discussion. If the user requests a finished prompt, ask which mode to use or select one based on the references and task.` } },
  { id: "t2va", icon: "", name: T("Текст → видео"), desc: T("Полная сцена из текстового описания без референсов."), suggestions: [T("Напиши промпт: утреннее кафе, бариста готовит кофе, мягкий свет"), T("Придумай динамичную сцену в киберпанк-городе"), T("Сделай спокойный природный кадр без музыки")], cfg: { mode: "t2va", temperature: 0.65, top_p: 0.9, max_tokens: 3000, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nT2VA mode. Build the complete audiovisual timeline from text without an image-alignment instruction. Begin directly with integrated_multimodal_description; do not add subject_definitions or retention_analysis.` } },
  { id: "ref2va", icon: "", name: T("По референсам"), desc: T("Новая сцена с людьми, объектами и локациями из изображений."), suggestions: [T("Напиши промпт по референсам: герой идёт по ночной улице"), T("Сохрани внешность персонажа и добавь спокойное движение камеры"), T("Собери сцену из текущих изображений с естественным звуком")], cfg: { mode: "ref2va", temperature: 0.55, top_p: 0.9, max_tokens: 4200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\n${REF_RULES}\n\nRef2VA full-reference generation mode. Usually use [reference generation], adding keyframe completion, video editing, video continuation, audio reuse, or audio reference only when the actual input roles require them. Retain distinctive identity and appearance details from every supplied visual reference.` } },
  { id: "i2va", icon: "", name: T("Первый кадр"), desc: T("Оживление изображения с развитием действия вперёд."), suggestions: [T("Оживи первый кадр: лёгкий ветер и естественная мимика"), T("Начни с текущего изображения и плавно приблизь камеру"), T("Развивай сцену из первого кадра без смены локации")], cfg: { mode: "i2va", temperature: 0.5, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nI2VA mode. The first line must always be exactly: For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced. Follow it with one blank line before the three core fields. Establish the source image's style, subjects, composition, and scene anchors, then use first-frame anchor → action onset → continuous development → result or reaction. Preserve character identity, clothing, colors, key objects, and spatial relationships.` } },
  { id: "fl2va", icon: "", name: T("Первый + последний"), desc: T("Непрерывный переход между двумя ключевыми кадрами."), suggestions: [T("Соедини первый и последний кадр одним плавным действием"), T("Опиши переход между кадрами без дополнительных монтажных склеек"), T("Сделай непрерывное движение камеры между двумя изображениями")], cfg: { mode: "fl2va", temperature: 0.45, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nFL2VA mode. The first line must be: How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video. Replace N with the actual final shot index and S.SS with the exact duration to two decimal places. Follow it with one blank line before the three core fields. Prefer one continuous shot unless multiple shots are explicitly requested. Describe first-frame state → observable intermediate changes → progressively narrowing differences → last-frame state; the final shot must land exactly on Picture 2 at the end.` } },
  { id: "l2va", icon: "", name: T("Последний кадр"), desc: T("Сцена, которая логично приходит к заданному финалу."), suggestions: [T("Построй действие так, чтобы закончить текущим последним кадром"), T("Придумай плавный подход камеры к финальному изображению"), T("Сделай сцену с точной остановкой на последнем кадре")], cfg: { mode: "l2va", temperature: 0.5, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nL2VA mode. The first line must be: How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video. Replace N with the actual final shot index and S.SS with the exact duration to two decimal places. Follow it with one blank line before the three core fields. Picture 1 belongs only to the final shot, not inherently Shot 1. Construct plausible preceding state → explicit action and transition path → gradual convergence in the final shot → exact last-frame landing on composition, pose, lighting, and object positions.` } },
  { id: "lipsync", icon: "", name: T("Липсинк и диалог"), desc: T("Речь, мимика и голосовые референсы с точными репликами."), suggestions: [T("Напиши сцену с липсинком: герой спокойно представляется зрителю"), T("Используй аудио-референс как тембр голоса персонажа"), T("Сделай короткий диалог двух персонажей с естественной мимикой")], cfg: { mode: "lipsync", temperature: 0.4, top_p: 0.85, max_tokens: 4200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\n${REF_RULES}\n\nLipsync and dialogue mode uses the official Ref2VA structure, not a separate H3 checkpoint. Choose summary task types from the actual task, typically reference generation or video editing plus audio reference for voice timbre, or audio reuse only when the source signal itself is copied. Preserve every line verbatim inside <d>[Language] ...</d>. Describe observable articulation, pauses, breathing, gaze, eyebrows, and head movements in temporal alignment with speech. Do not promise exact lipsync in prose; define the physical sequence instead. Fit speech naturally into the segment duration; silence and pauses take time too.` } },
];
for (const preset of BUILTINS) preset.cfg.max_tokens = 32768;

const MODE_NAMES = { chat: T("Свободный чат"), t2va: T("Текст → видео"), ref2va: T("По референсам"), i2va: T("Первый кадр"), fl2va: T("Первый + последний"), l2va: T("Последний кадр"), lipsync: T("Липсинк и диалог") };

const ASSIST_CSS = `
/* Native H3 assistant — theme vars only; no hover reflow */
.h3z-ast-panel,.h3z-ast-panel *{box-sizing:border-box}
.h3z-panel > .h3z-ph:has(.h3z-ast-titlerow),.h3z-panel > .h3z-ph:has(.h3z-ast-status),
.h3z-ast-panel > .h3z-ph:has(.h3z-ast-titlerow),.h3z-ast-panel > .h3z-ph:has(.h3z-ast-status){min-width:0;max-width:100%;overflow:hidden;padding:0 0 2px;gap:6px;box-sizing:border-box;flex:0 0 auto}
.h3z-panel > .h3z-ph:has(.h3z-ast-titlerow) h3,.h3z-panel > .h3z-ph:has(.h3z-ast-status) h3,
.h3z-ast-panel > .h3z-ph:has(.h3z-ast-titlerow) h3,.h3z-ast-panel > .h3z-ph:has(.h3z-ast-status) h3{flex:1 1 auto;min-width:3.5em;height:28px;line-height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center}

.h3z-ast-panel{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;flex:1 1 auto;width:100%;max-width:100%;height:auto;overflow:hidden;padding:10px 12px 8px;background:transparent;font-size:12.5px;font-weight:400;box-sizing:border-box}
.h3z-panel > .h3z-ast-panel{flex:1 1 auto;min-height:0;min-width:0;overflow:hidden;height:auto}
.h3z-panel:has(> .h3z-ast-panel){display:flex;flex-direction:column;min-height:0;overflow:hidden}
/* Title + mode + dialog are flex:none header rows — never shrink/scroll/overlap */
.h3z-ast-panel > .h3z-ph,
.h3z-ast-panel > .h3z-ast-moderow,
.h3z-ast-panel > .h3z-ast-histrow,
.h3z-ast-panel > .h3z-ast-compose,
.h3z-ast-panel > .h3z-settabs{flex:0 0 auto;flex-shrink:0;min-height:0;position:relative;z-index:1}
.h3z-panel .h3z-ast-panel .h3z-scroll,.h3z-ast-panel .h3z-scroll{flex:1 1 auto;min-height:0;min-width:0;width:100%;max-width:100%;overflow-x:hidden;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:0;margin:0;border:none;background:transparent;box-shadow:none}
.h3z-ast-panel > .h3z-ph{display:flex;align-items:center;gap:8px;padding:0 0 2px;margin:0;min-width:0;width:100%;max-width:100%;overflow:hidden;min-height:28px}
.h3z-ast-panel > .h3z-ph h3{margin:0;flex:1 1 auto;min-width:3.5em;height:28px;line-height:28px;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center}
.h3z-ast-titlerow{display:flex;align-items:center;gap:6px;flex:0 0 auto;flex-shrink:0;min-width:0;max-width:none;height:28px}
.h3z-ast-titlerow .h3z-btn.sm.icon,.h3z-ast-titlerow .h3z-ast-gear{flex:none;width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;max-height:28px;padding:0;margin:0;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}
.h3z-ast-titlerow .h3z-btn.sm.icon svg,.h3z-ast-titlerow .h3z-ast-gear svg{width:14px;height:14px;display:block;flex:none}
.h3z-ast-moderow,.h3z-ast-histrow{border:none;box-shadow:none;background:transparent;overflow:hidden}
.h3z-ast-moderow{display:flex;align-items:center;gap:8px;min-width:0;width:100%;flex:0 0 auto}
.h3z-ast-moderow .h3z-lbl{flex:none;margin:0;color:var(--mut);font-size:11.5px;font-weight:600}
.h3z-ast-mode{flex:1;min-width:0;max-width:100%;font-size:12.5px}
.h3z-ast-histrow .h3z-lbl{flex:none;margin:0;color:var(--mut);font-size:11.5px;font-weight:600}
.h3z-ast-status{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:6px;height:28px;min-height:28px;max-height:28px;min-width:4.5em;max-width:11.5em;padding:0 8px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--mut);font:inherit;font-size:11px;font-weight:500;line-height:1;cursor:pointer;margin:0;overflow:hidden;flex:0 1 auto;box-sizing:border-box;vertical-align:middle}
.h3z-ast-status > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 auto;line-height:1}
.h3z-ast-status.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 35%,transparent)}
.h3z-ast-status.err{color:var(--err);border-color:color-mix(in srgb,var(--err) 35%,transparent)}
.h3z-ast-status.busy .h3z-ast-dot{background:var(--a2);animation:h3zAstPulse 1s infinite alternate}
.h3z-ast-dot{width:7px;height:7px;border-radius:50%;background:var(--mut);flex:none}
.h3z-ast-status.ok .h3z-ast-dot{background:var(--ok)}
.h3z-ast-status.err .h3z-ast-dot{background:var(--err)}
@keyframes h3zAstPulse{from{opacity:.45}to{opacity:1}}
.h3z-ast-histrow{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;min-width:0;width:100%;max-width:100%;flex:0 0 auto}
.h3z-ast-histrow .h3z-sel{flex:1 1 auto;min-width:0;max-width:100%;height:28px;overflow:hidden}
.h3z-ast-histrow .h3z-sel .h3z-dd-lab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-ast-histacts{display:flex;flex-wrap:nowrap;gap:3px;align-items:center;flex:0 0 auto;min-width:0}
.h3z-ast-histacts .h3z-btn.icon{width:28px;min-width:28px;height:28px;padding:0}
.h3z-ast-histrow .h3z-btn{flex:none;height:28px;font-weight:500}
.h3z-ast-main,.h3z-root .h3z-ast-main{display:flex;flex-direction:column;min-height:0;min-width:0;flex:1;margin:0;padding:0;border:none;background:transparent;box-shadow:none}
.h3z-ast-log{flex:1;min-height:0;min-width:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:2px 0;margin:0;border:none;background:transparent;box-shadow:none}
.h3z-ast-log:has(.h3z-ast-empty){justify-content:stretch}
.h3z-ast-msg{min-width:0;width:100%;padding:10px;font-size:12.5px}
.h3z-ast-msg .h3z-card-h h4{font-size:12px;font-weight:650}
.h3z-ast-msg.user{border-color:color-mix(in srgb,var(--a1) 28%,transparent);background:color-mix(in srgb,var(--a1) 8%,var(--panel))}
.h3z-root .h3z-ast-bubble,.h3z-root .h3z-ast-bubble *,.h3z-root .h3z-ast-reasonbody,.h3z-root .h3z-ast-reasonbody *{user-select:text!important;-webkit-user-select:text!important}
.h3z-ast-bubble{white-space:normal;word-break:break-word;overflow-wrap:anywhere;font-size:12.5px;font-weight:400;line-height:1.5;min-width:0;background:transparent;border:none;padding:0;margin:0;box-shadow:none}
.h3z-ast-msg .h3z-row{gap:5px;flex-wrap:wrap;margin-top:6px}
.h3z-ast-msg .h3z-btn{font-weight:500}
.h3z-ast-empty{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px 16px;pointer-events:none}
.h3z-ast-emptyblurb{max-width:280px;margin:0;text-align:center;font-size:12px;font-weight:400;line-height:1.5;color:var(--mut);white-space:pre-line}
/* Composer card: textarea full width, toolbar below, never clipped */
.h3z-ast-compose{flex:0 0 auto;flex-shrink:0;position:relative;z-index:2;display:flex;flex-direction:column;gap:6px;padding:8px;margin:0;min-width:0;width:100%;max-width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;background:var(--panel2);overflow:hidden}
.h3z-ast-compose textarea.h3z-ast-input,.h3z-ast-compose .h3z-ast-input{display:block;width:100%;max-width:100%;min-width:0;min-height:44px;max-height:140px;resize:none;overflow-y:auto;font-size:12.5px;font-weight:400;line-height:1.45;box-sizing:border-box;margin:0;flex:0 0 auto}
.h3z-ast-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;min-width:0;width:100%}
.h3z-ast-toolbar .h3z-ast-tools{display:flex;flex-wrap:nowrap;align-items:center;gap:5px;min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:thin}
.h3z-ast-toolbar .h3z-ast-send{flex:none;grid-column:2;grid-row:1;align-self:center;margin:0;white-space:nowrap}
.h3z-ast-toolbar .h3z-pill,.h3z-ast-toolbar .h3z-ast-neighpill{flex:none;white-space:nowrap}
.h3z-ast-stylechips{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
.h3z-ast-stylechips .h3z-pill{font-size:11px;font-weight:500;padding:3px 8px;flex:none}
.h3z-ast-neighpill{appearance:none;-webkit-appearance:none;font:inherit;font-size:11px;font-weight:600;padding:0 8px;height:26px;min-width:26px;flex:none;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--mut);cursor:pointer;margin:0;display:inline-flex;align-items:center;justify-content:center;gap:0}
.h3z-ast-neighpill.on{color:var(--txt);border-color:color-mix(in srgb,var(--a1) 45%,var(--line));background:color-mix(in srgb,var(--a1) 14%,var(--field));box-shadow:0 0 0 1px color-mix(in srgb,var(--a1) 25%,transparent)}
.h3z-ast-uploads{display:flex;flex-wrap:wrap;gap:4px;min-width:0;width:100%}
.h3z-ast-settings .h3z-settabs{margin-left:-12px;margin-right:-12px}
.h3z-ast-presetlist{display:flex;flex-direction:column;gap:4px;min-width:0}
.h3z-ast-styletbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;width:100%;margin:6px 0}
.h3z-ast-stylelist{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;min-width:0;width:100%}
/* Style cards: reserved corner for ops — opacity only, never display/size changes */
.h3z-ast-stylecard{position:relative;cursor:pointer;padding:10px 40px 10px 10px;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:72px}
.h3z-ast-stylecard.on{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 12%,var(--panel))}
.h3z-ast-stylecard:hover,.h3z-ast-stylecard:focus-within{border-color:color-mix(in srgb,var(--a1) 40%,var(--line))}
.h3z-ast-stylecard-hd{display:flex;align-items:center;gap:6px;min-width:0;padding-right:0}
.h3z-ast-styleico{flex:none}
.h3z-ast-stylecheck{margin-left:auto;color:var(--a1);font-weight:700;font-size:12px;width:14px;text-align:center;flex:none}
.h3z-ast-styleops{position:absolute;top:6px;right:6px;display:flex;gap:2px;opacity:.35;pointer-events:auto}
.h3z-ast-stylecard:hover .h3z-ast-styleops,.h3z-ast-stylecard:focus-within .h3z-ast-styleops{opacity:1}
.h3z-ast-styleops .h3z-btn{width:26px;height:26px;padding:0}
.h3z-ast-stylename{display:block;font-size:12.5px;font-weight:650;line-height:1.3;word-break:break-word}
.h3z-ast-styledesc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11px;font-weight:400;line-height:1.35}
.h3z-ast-content{display:flex;flex-direction:column;gap:6px;min-width:0;background:transparent}
.h3z-ast-bubble{background:transparent;border:none;padding:0;margin:0;box-shadow:none}
.h3z-ast-msg.user .h3z-ast-bubble{background:transparent;border:none}
.h3z-ast-bubble.plain{white-space:pre-wrap}
.h3z-ast-p{margin:0 0 .55em}
.h3z-ast-p:last-child{margin-bottom:0}
.h3z-ast-h{margin:.55em 0 .3em;font-weight:700;color:var(--txt);line-height:1.35}
.h3z-ast-h.h1{font-size:1.15em}.h3z-ast-h.h2{font-size:1.08em}.h3z-ast-h.h3{font-size:1.02em}
.h3z-ast-ul,.h3z-ast-ol{margin:.3em 0 .55em;padding-left:1.3em}
.h3z-ast-li{margin:.12em 0}
.h3z-ast-code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:color-mix(in srgb,var(--a1) 12%,var(--field));color:var(--a1);padding:1px 5px;border-radius:5px}
.h3z-ast-pre{margin:.4em 0;padding:8px 10px;border-radius:8px;background:var(--field);border:1px solid var(--line);overflow-x:auto;max-width:100%;white-space:pre;box-sizing:border-box}
.h3z-ast-pre code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--txt);background:transparent;padding:0;border-radius:0}
.h3z-ast-a{color:var(--a1);text-decoration:underline;word-break:break-all}
.h3z-ast-reason{margin:0;border-left:2px solid color-mix(in srgb,var(--a1) 40%,transparent);padding:4px 0 4px 8px;color:var(--mut);font-size:11px;min-width:0;background:transparent}
.h3z-ast-reason summary{display:flex;align-items:center;gap:0;cursor:pointer;list-style:none;user-select:none}
.h3z-ast-reason summary::-webkit-details-marker{display:none}
.h3z-ast-reasondot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--a1);margin-right:6px;vertical-align:middle;flex:none}
.h3z-ast-reason.live .h3z-ast-reasondot{animation:h3zAstPulse 1s infinite alternate}
.h3z-ast-reasonbody{max-height:120px;overflow:auto;white-space:normal;word-break:break-word;overflow-wrap:anywhere;background:transparent;contain:content}
@media (max-width:360px){.h3z-ast-stylelist{grid-template-columns:1fr}}
`;






/** Escape text for HTML text nodes / attributes. */
export function astEsc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _astSafeHref(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  if (/[\s<>"']/.test(u)) return "";
  return u.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Inline markdown on already-escaped text. Only closed markers render (stream-safe). */
function _astInline(s) {
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => {
    const href = _astSafeHref(url);
    if (!href) return m;
    return `<a class="h3z-ast-a" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Bold first. Underscore forms require word boundaries (CommonMark: no intraword emphasis),
  // so snake_case keys like non_diegetic_music stay intact. Code is already parked by astMd.
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^A-Za-z0-9_])__([^_\n]+?)__(?![A-Za-z0-9_])/g, "$1<strong>$2</strong>");
  s = s.replace(/(^|[^\w*])\*([^*\n]+?)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g, "$1<em>$2</em>");
  return s;
}

function _astRenderLists(lists) {
  if (!lists?.length) return "";
  return lists.map((list) => {
    const tag = list.ordered ? "ol" : "ul";
    const cls = list.ordered ? "h3z-ast-ol" : "h3z-ast-ul";
    const body = list.items.map((li) => `<li class="h3z-ast-li">${li.html}${_astRenderLists(li.lists)}</li>`).join("");
    return `<${tag} class="${cls}">${body}</${tag}>`;
  }).join("");
}

/**
 * Small safe markdown → HTML. Escape first; no raw HTML passthrough.
 * Stream-friendly: unclosed ** / ` stay literal; an unclosed ``` fence becomes a trailing code block.
 */
export function astMd(raw) {
  if (raw == null || raw === "") return "";
  let text = astEsc(raw);
  const slots = [];
  const park = (html) => {
    const id = `\uE000${slots.length}\uE001`;
    slots.push(html);
    return id;
  };
  text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n?([\s\S]*?)```/g, (_, _lang, code) =>
    park(`<pre class="h3z-ast-pre"><code>${code.replace(/^\r?\n/, "").replace(/\r?\n$/, "")}</code></pre>`));
  text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n?([\s\S]*)$/g, (_, _lang, code) =>
    park(`<pre class="h3z-ast-pre"><code>${code}</code></pre>`));
  text = text.replace(/`([^`\n]+)`/g, (_, code) => park(`<code class="h3z-ast-code">${code}</code>`));

  const lines = text.split(/\r?\n/);
  const out = [];
  const para = [];
  let i = 0;
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p class="h3z-ast-p">${_astInline(para.join("<br>"))}</p>`);
    para.length = 0;
  };

  while (i < lines.length) {
    const ln = lines[i];
    if (/^\uE000\d+\uE001$/.test(ln.trim())) {
      flushPara();
      out.push(ln.trim());
      i++;
      continue;
    }
    const heading = ln.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushPara();
      const level = Math.min(3, heading[1].length);
      out.push(`<div class="h3z-ast-h h${level}">${_astInline(heading[2])}</div>`);
      i++;
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(ln)) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const u = lines[i].match(/^(\s*)([-*])\s+(.+)$/);
        const o = lines[i].match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (!(u || o)) break;
        const m = u || o;
        const indent = m[1].replace(/\t/g, "  ").length;
        items.push({ depth: Math.min(4, Math.floor(indent / 2)), ordered: !!o, html: _astInline(m[3]) });
        i++;
      }
      const root = { lists: [] };
      const stack = [{ depth: -1, node: root }];
      for (const it of items) {
        while (stack.length > 1 && stack[stack.length - 1].depth >= it.depth) stack.pop();
        const parent = stack[stack.length - 1].node;
        if (!parent.lists) parent.lists = [];
        let list = parent.lists[parent.lists.length - 1];
        if (!list || list.ordered !== it.ordered || list.depth !== it.depth) {
          list = { ordered: it.ordered, depth: it.depth, items: [] };
          parent.lists.push(list);
        }
        const li = { html: it.html, lists: [] };
        list.items.push(li);
        stack.push({ depth: it.depth, node: li });
      }
      out.push(_astRenderLists(root.lists));
      continue;
    }
    if (!ln.trim()) { flushPara(); i++; continue; }
    para.push(ln);
    i++;
  }
  flushPara();
  return out.join("").replace(/\uE000(\d+)\uE001/g, (_, n) => slots[Number(n)] || "");
}

function astFillMd(el, raw) {
  if (!el) return;
  const text = raw == null ? "" : String(raw);
  if (el._mdRaw === text) return;
  el._mdRaw = text;
  el.innerHTML = astMd(text);
}

export function installAssist(Editor, { C, h, ICON }) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const id = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  Object.assign(Editor.prototype, {
    openAssist() {
      if (!document.getElementById("h3z-ast-style")) document.head.append(h("style", { id: "h3z-ast-style" }, ASSIST_CSS));
      if (!this._ast) {
        this._ast = { el: null, busy: false, abort: null, status: { state: "idle", models: [], error: "" }, setOpen: false,
          setTab: "connection", editPreset: "", presetDraft: null, sideOpen: false, connectSeq: 0,
          uploads: [], uploading: false, styleQuery: "", styleCategory: "all", drafts: this.astLoadDrafts() };
      } else if (!this._ast.drafts) this._ast.drafts = this.astLoadDrafts();
      if (!this.astPreset()) this.astSet((a) => { a.preset = "chat"; });
      if (this.tool === "assist" && this.$.left?.querySelector(".h3z-ast-panel")) {
        this.astConnect(true);
        return;
      }
      this.tool = "assist";
      this.renderTools();
      this.renderLeft();
      this.astConnect(true);
    },
    closeAssist() {
      if (this._ast) this._ast.connectSeq++;
      this.astCaptureDraft();
      this.astPersistDrafts();
      clearTimeout(this._astCfgT);
      clearTimeout(this._astUnloadT);
      clearTimeout(this._astDraftT);
      this._ast?.abort?.abort();
      this._ast = null;
      if (this.tool === "assist") {
        this.tool = "settings";
        if (this.root) { this.renderTools(); this.renderLeft(); }
      }
    },
    disposeAssist() {
      if (this._ast) this._ast.connectSeq++;
      this.astCaptureDraft();
      this.astPersistDrafts();
      clearTimeout(this._astCfgT);
      clearTimeout(this._astUnloadT);
      clearTimeout(this._astDraftT);
      this._ast?.abort?.abort();
      this._ast = null;
    },
    astSet(fn) {
      const a = clone(this.p.assistant || {});
      fn(a);
      this.p = C.normalizeProject({ ...this.p, assistant: a });
      this.flushSave();
    },
    astApplyCfg(patch) { this.astSet((a) => { a.cfg = { ...a.cfg, ...patch }; }); },
    astDraftId() { return this.p?.assistant?.active || "none"; },
    astLoadDrafts() {
      try {
        const raw = localStorage.getItem("h3zs.ast.drafts");
        const data = raw ? JSON.parse(raw) : {};
        return data && typeof data === "object" && !Array.isArray(data) ? data : {};
      } catch { return {}; }
    },
    astPersistDrafts() {
      try {
        const drafts = this._ast?.drafts;
        if (!drafts) return;
        // Keep only non-empty drafts; cap size
        const out = {};
        for (const [k, v] of Object.entries(drafts)) {
          if (!v || typeof v !== "object") continue;
          const text = String(v.text || "");
          if (!text) continue;
          out[String(k).slice(0, 80)] = { text: text.slice(0, 20000), height: Math.max(44, Math.min(220, Number(v.height) || 44)) };
        }
        localStorage.setItem("h3zs.ast.drafts", JSON.stringify(out));
      } catch {}
    },
    astScheduleDraftPersist() {
      clearTimeout(this._astDraftT);
      this._astDraftT = setTimeout(() => this.astPersistDrafts(), 250);
    },
    astCaptureDraft() {
      const A = this._ast; if (!A) return;
      const ta = A.el?.querySelector?.("textarea.h3z-ast-input");
      if (!ta) return;
      if (!A.drafts) A.drafts = this.astLoadDrafts();
      const id = this.astDraftId();
      if (!ta.value) delete A.drafts[id];
      else A.drafts[id] = { text: ta.value, height: parseInt(ta.style.height, 10) || 44 };
      clearTimeout(this._astDraftT);
      this.astPersistDrafts();
    },
    astRememberDraft(ta) {
      const A = this._ast; if (!A || !ta) return;
      if (!A.drafts) A.drafts = this.astLoadDrafts();
      const id = this.astDraftId();
      const text = ta.value;
      if (!text) delete A.drafts[id];
      else A.drafts[id] = { text, height: parseInt(ta.style.height, 10) || 44 };
      this.astScheduleDraftPersist();
    },
    astClearDraft(cid) {
      clearTimeout(this._astDraftT);
      this._astDraftT = null;
      const A = this._ast;
      const id = cid || this.astDraftId();
      if (A?.drafts) delete A.drafts[id];
      this.astPersistDrafts();
    },
    astText(k, e, connection = false) {
      clearTimeout(this._astCfgT);
      if (connection && this._ast) {
        this._ast.status = { state: "idle", models: [], error: "" };
        this.astPaintStatus();
      }
      this._astCfgT = setTimeout(() => this.astApplyCfg({ [k]: e.value.trim() }), 250);
    },
    astCommitText() {
      clearTimeout(this._astCfgT);
      const fields = this._ast?.el.querySelectorAll("[data-ast-cfg]");
      if (!fields?.length) return;
      const patch = {};
      fields.forEach((e) => { patch[e.dataset.astCfg] = e.value.trim(); });
      this.astApplyCfg(patch);
    },
    astPreset(idValue) {
      const wanted = idValue || this.p.assistant.preset || "chat";
      return [...BUILTINS, ...this.p.assistant.presets].find((p) => p.id === wanted) || null;
    },
    astPresetView(p) {
      return { ...p, name: T(p.name), desc: p.desc ? T(p.desc) : T("Пользовательский режим генерации промпта"), suggestions: (p.suggestions || []).map((s) => T(s)) };
    },
    astBaseSystem() { return (this.p.assistant.cfg.sys || "").trim() || this.astPreset()?.cfg.sys || BUILTINS[0].cfg.sys; },
    astStyles() {
      const a = this.p.assistant, deleted = new Set(a.style_deleted || []), overrides = new Map((a.style_defs || []).map((s) => [s.id, s]));
      return PROMPT_STYLES.filter((s) => !deleted.has(s.id)).map((s) => overrides.get(s.id) || s)
        .concat((a.style_defs || []).filter((s) => s.custom && !PROMPT_STYLES.some((base) => base.id === s.id) && !deleted.has(s.id)));
    },
    astSystem() {
      const cfg = this.p.assistant.cfg, base = this.astBaseSystem();
      let sys = cfg.mode === "chat" ? base : PORTABLE_H3 + "\n\n" + base;
      const selected = this.astStyles().filter((s) => cfg.styles.includes(s.id))
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
      if (selected.length) {
        sys += "\n\n=== ACTIVE STYLES ===\nApply all of these styles together (listed by priority, highest first).";
        for (const style of selected) {
          sys += `\n[${style.name}] (priority ${Number(style.priority || 0)})${style.description ? ` - ${style.description}` : ""}`;
          for (const line of (Array.isArray(style.instructions) ? style.instructions : [style.instructions])) if (line) sys += `\n  * ${line}`;
        }
      }
      return sys;
    },

    astNewChat(render = true) {
      this.astCaptureDraft();
      const cid = id("c");
      this.astSet((a) => { a.chats.unshift({ id: cid, title: "", created: Date.now(), msgs: [] }); a.active = cid; });
      if (render) this.renderAssist();
    },
    astSelectChat(cid) { this.astCaptureDraft(); this.astSet((a) => { a.active = cid; }); if (this._ast) this._ast.sideOpen = false; this.renderAssist(); },
    astRenameChat(cid) {
      const chat = this.p.assistant.chats.find((c) => c.id === cid); if (!chat) return;
      const title = prompt(T("Название чата"), chat.title || ""); if (title == null) return;
      this.astSet((a) => { const c = a.chats.find((x) => x.id === cid); if (c) c.title = title.trim().slice(0, 120); });
      this.renderAssist();
    },
    astDeleteChat(cid) {
      const chat = this.p.assistant.chats.find((c) => c.id === cid);
      if (chat?.msgs.length && !confirm(T("Удалить этот диалог?"))) return;
      this.astSet((a) => { a.chats = a.chats.filter((c) => c.id !== cid); if (a.active === cid) a.active = a.chats[0]?.id || ""; });
      if (!this.astChat()) this.astNewChat(); else this.renderAssist();
    },
    astChat() { const a = this.p.assistant; return a.chats.find((c) => c.id === a.active) || null; },

    astApplyPreset(pid) {
      const preset = this.astPreset(pid); if (!preset) return;
      const old = this.p.assistant.cfg;
      this.astSet((a) => {
        a.cfg = C.normalizeAssistCfg({ ...preset.cfg, api_base: old.api_base, api_key: old.api_key, api_model: old.api_model,
          engine_defaults: old.engine_defaults, show_reasoning: old.show_reasoning, stream_timeout: old.stream_timeout,
          unload_on_generate: old.unload_on_generate, unload_endpoint: old.unload_endpoint,
          auto_unload: old.auto_unload, auto_unload_delay: old.auto_unload_delay });
        a.preset = pid;
      });
      if (this._ast) { this._ast.editPreset = pid; this._ast.presetDraft = clone(preset); }
      this.renderAssist();
      if (this._ast?.setOpen) this.renderAssistSettings();
    },
    astEditPreset(pid) {
      const p = this.astPreset(pid); if (!p) return;
      this._ast.editPreset = pid;
      this._ast.presetDraft = clone(p);
      this.renderAssistSettings();
    },
    astNewPreset() {
      const base = this.astPreset() || BUILTINS[0];
      this._ast.editPreset = "";
      this._ast.presetDraft = { ...clone(base), id: "", name: base.name + T(" — копия"), cfg: { ...clone(this.p.assistant.cfg), sys: this.astBaseSystem() } };
      this.renderAssistSettings();
    },
    astPresetDraftValue(key, value) {
      const d = this._ast?.presetDraft; if (!d) return;
      if (key === "name") d.name = value;
      else d.cfg[key] = value;
    },
    astSavePreset() {
      const d = this._ast?.presetDraft;
      if (!d?.name.trim()) { this.toast(T("Введите название пресета"), true); return; }
      const current = this.p.assistant.cfg;
      const saved = { id: d.id && !BUILTINS.some((p) => p.id === d.id) ? d.id : id("p"), name: d.name.trim().slice(0, 80),
        cfg: C.normalizeAssistCfg({ ...d.cfg, styles: current.styles, api_base: current.api_base, api_key: current.api_key, api_model: current.api_model }) };
      this.astSet((a) => {
        const at = a.presets.findIndex((p) => p.id === saved.id);
        if (at >= 0) a.presets[at] = saved; else a.presets.unshift(saved);
        a.preset = saved.id; a.cfg = clone(saved.cfg);
      });
      this._ast.editPreset = saved.id;
      this._ast.presetDraft = clone(saved);
      this.renderAssist();
      this.renderAssistSettings();
      this.toast(T("Пресет сохранён"));
    },
    astDeletePreset(pid) {
      if (BUILTINS.some((p) => p.id === pid) || !confirm(T("Удалить этот пресет?"))) return;
      this.astSet((a) => { a.presets = a.presets.filter((p) => p.id !== pid); if (a.preset === pid) { a.preset = "chat"; a.cfg = C.normalizeAssistCfg({ ...BUILTINS[0].cfg, api_base: a.cfg.api_base, api_key: a.cfg.api_key, api_model: a.cfg.api_model }); } });
      this._ast.editPreset = "chat"; this._ast.presetDraft = clone(BUILTINS[0]);
      this.renderAssist(); this.renderAssistSettings();
    },

    async astConnect(quiet = false) {
      const A = this._ast; if (!A) return false;
      this.astCommitText();
      const cfg = this.p.assistant.cfg, seq = ++A.connectSeq;
      A.status = { state: "checking", models: [], error: "" };
      this.astPaintStatus();
      try {
        const data = await this.host.call("/h3zero/llm/connect", { api_base: cfg.api_base, api_key: cfg.api_key });
        if (!this._ast || seq !== A.connectSeq) return false;
        A.status = { state: "connected", models: data.models || [], error: "", base: data.base };
        if (!cfg.api_model && data.models?.length === 1) this.astApplyCfg({ api_model: data.models[0] });
        if (!quiet) this.toast(T("API подключён, моделей: {0}", data.models?.length || 0));
        this.astPaintStatus();
        if (A.setOpen && A.setTab === "connection") this.renderAssistSettings();
        return true;
      } catch (e) {
        if (!this._ast || seq !== A.connectSeq) return false;
        A.status = { state: "error", models: [], error: String(e.message || e) };
        this.astPaintStatus();
        if (A.setOpen && A.setTab === "connection") this.renderAssistSettings();
        if (!quiet) this.toast(A.status.error, true);
        return false;
      }
    },
    async astUnload(automatic = false) {
      const A = this._ast; if ((!automatic && !A) || A?.unloading || A?.busy) return;
      clearTimeout(this._astUnloadT);
      if (!automatic) this.astCommitText();
      const cfg = this.p.assistant.cfg;
      if (A) { A.unloading = true; if (A.setOpen) this.renderAssistSettings(); }
      try {
        const data = await this.host.call("/h3zero/llm/unload", { api_base: cfg.api_base, api_key: cfg.api_key,
          api_model: cfg.api_model, unload_endpoint: cfg.unload_endpoint });
        this.toast(T("LLM выгружена: {0}", data.backend));
      } catch (e) { this.toast(String(e.message || e), true); }
      finally {
        if (this._ast) { this._ast.unloading = false; if (this._ast.setOpen) this.renderAssistSettings(); }
      }
    },
    astScheduleUnload() {
      clearTimeout(this._astUnloadT);
      const cfg = this.p.assistant.cfg;
      if (cfg.auto_unload && cfg.api_model) this._astUnloadT = setTimeout(() => this.astUnload(true), cfg.auto_unload_delay * 1000);
    },
    astPaintStatus() {
      const A = this._ast;
      if (!A?.el) return;
      const st = this.astStatusView();
      const btn = A.el.querySelector(".h3z-ast-status");
      if (btn) {
        btn.className = "h3z-ast-status " + st.cls;
        btn.title = st.tip || st.text;
        btn.setAttribute("aria-label", st.tip || st.text);
        const label = btn.querySelector("span");
        if (label) label.textContent = st.text;
      }
      const old = A.el.querySelector(".h3z-ast-conn");
      if (old) old.replaceWith(this.astConnectionState());
    },
    astOpenSettings(tab = "connection") {
      if (!this._ast) return;
      this.astCaptureDraft();
      this._ast.setOpen = true; this._ast.setTab = tab;
      if (tab === "presets" && !this._ast.presetDraft) {
        const p = this.astPreset() || BUILTINS[0];
        this._ast.editPreset = p.id; this._ast.presetDraft = clone(p);
      }
      this.renderLeft();
    },

    astCardLabels(i, s) { return C.cardLabels(this.p, s, i, true, false); },
    astAttachments() {
      const out = [...(this._ast?.uploads || [])];
      const i = this.sel >= 0 && this.seg(this.sel) ? this.sel : 0, s = this.seg(i);
      if (!s) return out;
      out.push(...C.orderedRefs(this.p, s).map((a, n) => ({ kind: "asset", token: `<Picture ${n + 1}>`, label: a.name,
        asset: { file: a.file, subfolder: a.subfolder || "", type: a.type || "input" } })));
      for (const r of this.astCardLabels(i, s)) {
        const token = r.image.length ? `<Picture ${r.image[0]}>` : r.video.length ? `<Video ${r.video[0]}> preview` : "";
        if (token) out.push({ kind: "card", id: r.id, sig: r.snap.sig || "", token, label: r.snap.name || r.id });
      }
      C.videoRefs(this.p, s).forEach((a, n) => {
        if (a.poster) out.push({ kind: "asset", token: `<Video ${n + 1}> poster`, label: a.name,
          asset: { file: a.poster.filename, subfolder: a.poster.subfolder || "", type: a.poster.type || "output" } });
      });
      return out;
    },
    async astAddImages(files) {
      const A = this._ast; if (!A || A.busy || A.uploading) return;
      const images = [...files].filter((f) => (f.type || "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name || ""));
      if (!images.length) return;
      A.uploading = true; this.astPaintComposer();
      try {
        for (const file of images.slice(0, Math.max(0, 16 - A.uploads.length))) {
          try {
            const r = await this.host.upload(file, this.p.id);
            A.uploads.push({ kind: "asset", token: `[User image ${A.uploads.length + 1}]`, label: file.name || r.name,
              asset: { file: r.name, subfolder: r.subfolder || "", type: r.type || "input" } });
          } catch (e) { this.toast(T("Не удалось загрузить ") + file.name + ": " + (e.message || e), true); }
        }
      } finally {
        if (this._ast) { this._ast.uploading = false; this.astPaintComposer(); }
      }
    },
    astContext() {
      const i = this.sel >= 0 && this.seg(this.sel) ? this.sel : 0, s = this.seg(i);
      if (!s) return "";
      const g = this.p.settings, [w, hh] = C.resolution(g), cfg = this.p.assistant.cfg;
      const L = [T("Текущий отрезок {0}{1}: {2} кадров ({3} с), {4}×{5}, {6} fps.", i + 1, s.name ? ` «${s.name}»` : "", s.frames, (s.frames / C.FPS).toFixed(2), w, hh, C.FPS)];
      // Selected clip context (refs + characters) is always on.
      {
        const names = { character: T("персонаж"), location: T("локация"), other: T("другое") };
        const refs = C.orderedRefs(this.p, s).map((a, n) => `<Picture ${n + 1}> — ${a.name} (${names[a.category] || a.category})`);
        const cp = C.continuityPicture(this.p, i);
        if (cp) refs.push(`<Picture ${cp}> — ` + T("последний кадр прошлого отрезка (авто)"));
        C.videoRefs(this.p, s).forEach((a, n) => refs.push(`<Video ${n + 1}> — ${a.name}`));
        C.audioRefs(this.p, s).forEach((a, n) => refs.push(`<Audio ${n + 1}> — ${a.name}${a.duration ? ` (${Number(a.duration).toFixed(2)} s)` : ""}`));
        if (refs.length) L.push(T("Референсы отрезка: {0}.", refs.join("; ")));
        let subject = 0;
        for (const r of this.astCardLabels(i, s)) {
          const sn = r.snap;
          if (sn.subject_name || ["identity", "voice", "generic"].includes(sn.concept)) subject++;
          const who = sn.subject_name ? `<Subject ${subject}> ${sn.subject_name}` : sn.name || r.id;
          const visual = [...r.image.map((n) => `<Picture ${n}>`), ...r.video.map((n) => `<Video ${n}>`)].join(", ");
          const audio = r.audio.map((n) => `<Audio ${n}>`).join(", ");
          const details = [sn.appearance, sn.retained_attributes ? "retain: " + sn.retained_attributes : ""].filter(Boolean).join("; ");
          L.push(`Card "${sn.name || r.id}": ${who}${visual ? `; visual reference ${visual}` : ""}${details ? `; ${details}` : ""}.`);
          if (audio) L.push(`${audio} is the voice timbre reference for ${who}${sn.voice_description ? ` (${sn.voice_description})` : ""}. Cite this audio for the character in subject_definitions and retention_analysis; do not treat it as music.`);
        }
        L.push("Reference numbering exactly matches the H3 generation inputs. Attached images correspond to the labelled <Picture N> references and card previews. Never claim that an attached reference is unavailable.");
      }
      if ((g.prompt || "").trim()) L.push(T("Общий промпт проекта: «{0}»", g.prompt.trim()));
      if ((s.prompt || "").trim()) L.push(T("Текущий промпт отрезка: «{0}»", s.prompt.trim()));
      if (cfg.ctx_neighbours) for (const j of [i - 1, i + 1]) {
        const x = this.seg(j); if (!x) continue;
        const nr = C.orderedRefs(this.p, x).map((a) => a.name);
        const bits = [];
        if ((x.prompt || "").trim()) bits.push(T("промпт «{0}»", x.prompt.trim().slice(0, 16000)));
        if (nr.length) bits.push(T("референсы: {0}", nr.join(", ")));
        if (bits.length) L.push(T("Соседний отрезок {0}: {1}.", j + 1, bits.join("; ")));
      }
      return L.join("\n");
    },
    astMessages() {
      const ctx = this.astContext(), sys = this.astSystem();
      return [{ role: "system", content: ctx ? sys + "\n\n" + T("Контекст (текущий клип):") + "\n" + ctx : sys },
        ...(this.astChat()?.msgs || []).filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: m.text }))];
    },
    async astSend() {
      const A = this._ast; if (!A || A.busy) return;
      if (A.uploading) { this.toast(T("Дождитесь загрузки изображений")); return; }
      clearTimeout(this._astUnloadT);
      const ta = A.el.querySelector(".h3z-ast-inputbox textarea, textarea.h3z-ast-input");
      const text = ta?.value.trim() || (A.uploads.length ? T("Опиши прикреплённые изображения.") : "");
      if (!text) return;
      // Clear composer + draft first so paint/render cannot re-save or restore the sent text.
      if (ta) { ta.value = ""; ta.style.height = "44px"; ta.style.maxHeight = ""; }
      this.astClearDraft(this.p.assistant.active);
      A.busy = true; this.astPaintComposer();
      if (!this.p.assistant.cfg.api_model) this.astOpenSettings("connection");
      if (!this.p.assistant.cfg.api_model || !(A.status.state === "connected" || await this.astConnect(true))) {
        A.busy = false; this.astPaintComposer();
        const input = A.el.querySelector(".h3z-ast-inputbox textarea, textarea.h3z-ast-input");
        if (input) { input.value = text; this.astAutoGrow(input); this.astRememberDraft(input); }
        this.toast(this.p.assistant.cfg.api_model ? T("Сначала подключитесь к API") : T("Выберите модель в настройках API"), true);
        return;
      }
      if (!this.astChat()) this.astNewChat(false);
      const cid = this.p.assistant.active;
      this.astSet((a) => {
        const c = a.chats.find((x) => x.id === cid);
        c.msgs.push({ role: "user", text });
        if (!c.title) c.title = text.slice(0, 60);
        c.msgs.push({ role: "assistant", text: "" });
      });
      this.astClearDraft(cid); // again after any interim remember
      this.renderAssist();
      const messages = this.astMessages(), cfg = this.p.assistant.cfg, attachments = this.astAttachments();
      A.uploads = [];
      let answer = "", reasoning = "", stats = null, failed = false;
      try {
        A.abort = new AbortController();
        const r = await fetch("/h3zero/llm/chat", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, attachments, temperature: cfg.temperature, top_p: cfg.top_p, max_tokens: cfg.max_tokens,
            thinking: cfg.thinking, sampling: cfg.sampling?.[cfg.thinking ? "thinking" : "plain"], stream_timeout: cfg.stream_timeout,
            engine_defaults: cfg.engine_defaults, api_base: cfg.api_base, api_key: cfg.api_key, api_model: cfg.api_model }), signal: A.abort.signal });
        if (!r.ok || !r.body) {
          let detail = ""; try { detail = (await r.json()).error || ""; } catch (_) {}
          throw new Error(detail || "HTTP " + r.status);
        }
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let at;
          while ((at = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, at); buf = buf.slice(at + 2);
            const line = event.split("\n").find((x) => x.startsWith("data: ")); if (!line) continue;
            const data = JSON.parse(line.slice(6));
            if (data.kind === "error") throw new Error(data.text);
            if (data.kind === "notice") this.toast(T(data.text));
            if (data.kind === "stats") stats = data.text;
            if (data.kind === "reasoning") reasoning += data.text;
            if (data.kind === "token") answer += data.text;
          }
          if (answer || reasoning) {
            this.astPaintStream(answer, reasoning);
            const log = A.el.querySelector(".h3z-ast-log"); if (log) log.scrollTop = log.scrollHeight;
          }
        }
        if (!answer.trim()) throw new Error(T("API вернул пустой ответ"));
      } catch (e) {
        failed = true;
        if (e.name !== "AbortError") this.toast(T("Ассистент: ") + (e.message || e), true);
      } finally {
        this.astSet((a) => {
          const c = a.chats.find((x) => x.id === cid); if (!c) return;
          const m = c.msgs[c.msgs.length - 1];
          if (m?.role === "assistant") {
            m.text = answer; m.reasoning = reasoning;
            if (stats) m.stats = stats;
            if (!answer && !reasoning && failed) c.msgs.pop();
          }
        });
        A.abort = null; A.busy = false;
        this.astClearDraft(cid);
        this.renderAssist();
        if (answer) this.astScheduleUnload();
      }
    },
    astStop() { this._ast?.abort?.abort(); },
    astReasoning(text, active) {
      return h("details", { class: "h3z-ast-reason" + (active ? " live" : ""), open: active || undefined },
        h("summary", null, h("i", { class: "h3z-ast-reasondot" }), h("span", null, active ? T("Модель размышляет…") : T("Размышления модели"))),
        h("div", { class: "h3z-ast-reasonbody", dataset: { mdRaw: text || "" }, html: astMd(text) }));
    },
    astPaintStream(answer, reasoning) {
      const A = this._ast;
      if (!A) return;
      A._streamAnswer = answer;
      A._streamReasoning = reasoning;
      if (A._streamRaf) return;
      const paint = () => {
        A._streamRaf = 0;
        this.astFlushStream(A._streamAnswer, A._streamReasoning);
      };
      A._streamRaf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : (paint(), 0);
    },
    astFlushStream(answer, reasoning) {
      const pending = this._ast?.el.querySelector(".h3z-ast-msg.pending"); if (!pending) return;
      const bubble = pending.querySelector(".tx"); if (bubble) astFillMd(bubble, answer);
      let details = pending.querySelector(".h3z-ast-reason");
      const show = this.p.assistant.cfg.show_reasoning !== false;
      if (reasoning && !details && show) {
        details = this.astReasoning(reasoning, !answer);
        const host = pending.querySelector(".h3z-ast-content") || pending;
        const before = host.querySelector(".tx");
        if (before) host.insertBefore(details, before);
        else host.prepend(details);
      }
      if (details) {
        const body = details.querySelector(".h3z-ast-reasonbody");
        const active = !answer;
        if (active) {
          if (body && body._plainRaw !== reasoning) {
            body._plainRaw = reasoning;
            body._mdRaw = undefined;
            body.textContent = reasoning;
          }
        } else {
          if (body) body._plainRaw = undefined;
          astFillMd(body, reasoning);
        }
        details.querySelector("summary span").textContent = active ? T("Модель размышляет…") : T("Размышления модели");
        details.classList.toggle("live", active);
        if (active) {
          details.open = true;
          body.scrollTop = body.scrollHeight;
        } else if (details.dataset.closed !== "1") {
          details.open = false;
          details.dataset.closed = "1";
        }
      }
    },
    astSuggestion(text) {
      const ta = this._ast?.el.querySelector(".h3z-ast-inputbox textarea, textarea.h3z-ast-input"); if (!ta) return;
      ta.value = text; ta.focus(); this.astAutoGrow(ta);
    },
    /** Cap composer at ~6 lines so the message log keeps the panel. */
    astComposeMaxH() { return 140; },
    astComposeCollapsedH() { return 44; }, // ~2 lines
    astComposeEmptyIsh(ta) {
      const text = String(ta?.value || "");
      if (!text.trim()) return true;
      // short enough that 2 lines still show it without feeling "draft-expanded"
      return text.length < 48 && !text.includes("\n");
    },
    astAutoGrow(ta) {
      if (!ta) return;
      const focused = (typeof document !== "undefined" && document.activeElement === ta);
      const emptyIsh = this.astComposeEmptyIsh(ta);
      const maxH = (!focused && emptyIsh) ? this.astComposeCollapsedH() : this.astComposeMaxH();
      ta.style.height = "0px";
      ta.style.minHeight = "0";
      const contentHeight = ta.scrollHeight;
      const height = Math.min(maxH, Math.max(this.astComposeCollapsedH(), contentHeight));
      ta.style.height = height + "px";
      ta.style.maxHeight = this.astComposeMaxH() + "px";
      ta.style.minHeight = this.astComposeCollapsedH() + "px";
      ta.style.overflowY = contentHeight > maxH ? "auto" : "hidden";
    },
    astCopy(text) { navigator.clipboard?.writeText(text); this.toast(T("Скопировано")); },
    astInsertPrompt(text, generate) {
      const i = this.sel >= 0 && this.seg(this.sel) ? this.sel : 0;
      if (!this.seg(i)) { this.toast(T("Нет отрезка — добавьте отрезок на таймлайн"), true); return; }
      const clean = text.trim().replace(/^```(?:\w+)?\s*\n?/, "").replace(/\n?```$/, "").trim();
      this.mutate((p) => { p.segments[i].prompt = clean; });
      this.toast(T("Промпт вставлен в отрезок {0}", i + 1));
      if (generate) { this.closeAssist(); this.generate({ upto: i, only: i }); }
    },
    renderAssist() {
      if (this.tool !== "assist") return;
      this.renderLeft();
    },
    renderAssistHead() { if (this.tool === "assist") this.renderLeft(); },
    renderAssistSettings() { if (this.tool === "assist") this.renderLeft(); },
    astStatusView() {
      const st = this._ast?.status || { state: "idle" }, model = (this.p.assistant.cfg.api_model || "").trim();
      if (st.state === "connected") {
        const text = model || T("API подключён");
        return { cls: "ok", text, tip: text };
      }
      if (st.state === "checking") return { cls: "busy", text: T("Проверка API…"), tip: T("Проверка API…") };
      if (st.state === "error") return { cls: "err", text: T("Нет соединения"), tip: st.error || T("Нет соединения") };
      return { cls: "", text: T("API не проверен"), tip: T("Настройки ассистента") };
    },
    /** Native H3 left-panel tool (chat or settings view). */
    renderAssistPanel(L) {
      if (!document.getElementById("h3z-ast-style")) document.head.append(h("style", { id: "h3z-ast-style" }, ASSIST_CSS));
      if (!this._ast) {
        this._ast = { el: null, busy: false, abort: null, status: { state: "idle", models: [], error: "" }, setOpen: false,
          setTab: "connection", editPreset: "", presetDraft: null, sideOpen: false, connectSeq: 0,
          uploads: [], uploading: false, styleQuery: "", styleCategory: "all", styleDraft: null, drafts: this.astLoadDrafts() };
      } else if (!this._ast.drafts) this._ast.drafts = this.astLoadDrafts();
      this.astCaptureDraft();
      if (!this.astPreset()) this.astSet((a) => { a.preset = "chat"; });
      if (this._ast.setOpen) return this.renderAssistSettingsView(L);
      const panel = h("div", { class: "h3z-ast-panel" },
        h("div", { class: "h3z-ph" }, h("h3", null, T("Ассистент")), this.astTitleControls()),
        this.astModeRow(),
        this.astHistoryRow(),
        h("div", { class: "h3z-scroll" }, this.astMain()),
        this.astComposer());
      this._ast.el = panel;
      try { L.scrollTop = 0; L.scrollLeft = 0; } catch {}
      L.append(panel);
      const log = panel.querySelector(".h3z-ast-log"); if (log) log.scrollTop = log.scrollHeight;
    },
    renderAssistSettingsView(L) {
      const A = this._ast;
      const close = () => { A.setOpen = false; A.styleDraft = null; this.renderLeft(); };
      const tab = (key, label) => h("div", { class: "h3z-settab" + (A.setTab === key ? " on" : ""), onclick: () => {
        A.setTab = key;
        if (key === "presets" && !A.presetDraft) {
          const p = this.astPreset() || BUILTINS[0];
          A.editPreset = p.id; A.presetDraft = clone(p);
        }
        this.renderLeft();
      } }, label);
      const body = A.setTab === "connection" ? this.astSetConnection()
        : A.setTab === "presets" ? this.astSetPresets()
        : A.setTab === "styles" ? this.astSetStyles()
        : A.setTab === "generation" ? this.astSetGeneration()
        : this.astSetContext();
      const panel = h("div", { class: "h3z-ast-panel h3z-ast-settings" },
        h("div", { class: "h3z-ph" },
          h("button", { class: "h3z-btn sm icon", title: T("Назад"), onclick: close }, "←"),
          h("h3", null, T("Настройки ассистента"))),
        h("div", { class: "h3z-settabs" }, tab("connection", T("Подключение")), tab("presets", T("Пресеты")), tab("styles", T("Стили")), tab("generation", T("Генерация")), tab("context", T("Контекст"))),
        h("div", { class: "h3z-scroll h3z-setbody" }, body));
      this._ast.el = panel;
      try { L.scrollTop = 0; L.scrollLeft = 0; } catch {}
      L.append(panel);
    },
    astTitleControls() {
      const st = this.astStatusView();
      return h("div", { class: "h3z-ast-titlerow" },
        h("button", {
          type: "button",
          class: "h3z-ast-status " + st.cls,
          title: st.tip || st.text,
          "aria-label": st.tip || st.text,
          onclick: () => this.astOpenSettings("connection"),
        }, h("i", { class: "h3z-ast-dot", "aria-hidden": "true" }), h("span", null, st.text)),
        h("button", {
          type: "button",
          class: "h3z-btn sm icon h3z-ast-gear",
          title: T("Настройки ассистента"),
          "aria-label": T("Настройки ассистента"),
          html: ICON.settings,
          onclick: () => this.astOpenSettings("connection"),
        }));
    },
    astHead() { return this.astTitleControls(); },
    astModeRow() {
      const active = this.p.assistant.preset || "chat";
      const groups = [
        { label: T("Основные режимы"), options: BUILTINS.map((p) => ({ value: p.id, label: T(p.name) })) },
      ];
      if (this.p.assistant.presets.length) {
        groups.push({ label: T("Мои пресеты"), options: this.p.assistant.presets.map((p) => ({ value: p.id, label: p.name })) });
      }
      const sel = this.themedSelect({
        value: active, groups,
        title: T("Режим ассистента: под какую задачу писать промпт"),
        className: "h3z-ast-mode",
        onChange: (v) => this.astApplyPreset(v),
      });
      return h("div", { class: "h3z-ast-moderow" },
        h("span", { class: "h3z-lbl" }, T("Режим")),
        sel);
    },
    astContextCard() { return null; },
    /** Compact neighbor pill for the composer toolbar (off by default via normalize). */
    astNeighPill() {
      const on = !!this.p.assistant.cfg.ctx_neighbours;
      return h("button", {
        type: "button",
        class: "h3z-pill h3z-ast-neighpill" + (on ? " on" : ""),
        title: T("Соседние отрезки: промпты и референсы предыдущего и следующего — удобно при продлении клипа."),
        "aria-label": T("Соседние отрезки"),
        "aria-pressed": on ? "true" : "false",
        onclick: () => { this.astApplyCfg({ ctx_neighbours: !on }); this.astPaintComposer(); },
      }, "⟷");
    },
    astStylesRow() { return null; },
    astToggleStyle(sid) {
      const cur = new Set(this.p.assistant.cfg.styles || []);
      if (cur.has(sid)) cur.delete(sid); else cur.add(sid);
      this.astApplyCfg({ styles: [...cur] });
      this.astPaintComposer();
      if (this._ast?.setOpen) this.astPaintStyleList();
    },
    astSysCollapsible() { return null; },
    astHistoryRow() {
      const chats = this.p.assistant.chats || [], active = this.p.assistant.active;
      const sel = this.themedSelect({
        value: active || "",
        sm: true,
        title: T("Диалог с ассистентом"),
        emptyLabel: T("Новый диалог"),
        options: chats.length
          ? chats.map((c) => ({ value: c.id, label: c.title || T("Диалог") }))
          : [{ value: "", label: T("Новый диалог"), dis: true }],
        onChange: (v) => { if (v) this.astSelectChat(v); },
      });
      return h("div", { class: "h3z-ast-histrow" },
        h("span", { class: "h3z-lbl" }, T("Диалог")),
        sel,
        h("div", { class: "h3z-ast-histacts" },
          h("button", { class: "h3z-btn sm icon", title: T("Новый чат"), "aria-label": T("Новый чат"), html: ICON.plus, onclick: () => this.astNewChat() }),
          h("button", { class: "h3z-btn sm icon", title: T("Показать версии промпта этого чата"), "aria-label": T("Версии"), html: ICON.copy, onclick: () => this.astShowVersions() }),
          h("button", { class: "h3z-btn sm icon", title: T("Перевести последний ответ ассистента на русский (кратко)"), "aria-label": T("Перевод"), onclick: () => this.astTranslateLast() }, "あ")));
    },
    astBody() { return this.astMain(); },
    astStudioRail() { return null; },
    astAutofillBrief() {},
    async astTranslateLast() {
      const chat = this.astChat(); const last = [...(chat?.msgs || [])].reverse().find((m) => m.role === "assistant" && m.text?.trim());
      if (!last) { this.toast(T("Нет ответа для перевода"), true); return; }
      const ta = this._ast?.el.querySelector(".h3z-ast-inputbox textarea, textarea.h3z-ast-input"); if (!ta) return;
      ta.value = T("Переведи на русский кратко, без правок смысла:\n\n") + last.text.trim();
      this.astAutoGrow(ta); ta.focus();
      this.toast(T("Запрос перевода в поле ввода — нажмите Отправить"));
    },
    astShowVersions() {
      const chat = this.astChat();
      const vers = (chat?.msgs || []).filter((m) => m.role === "assistant" && m.text?.trim());
      if (vers.length < 1) { this.toast(T("Пока нет версий промпта"), true); return; }
      const a = vers[vers.length - 1]?.text || "", b = vers[vers.length - 2]?.text || "";
      const body = h("div", { class: "h3z-ast-diff" },
        h("div", { class: "h3z-lbl" }, T("Версия {0} (последняя)", vers.length)),
        h("pre", { class: "h3z-note" }, a),
        b ? h("div", { class: "h3z-lbl" }, T("Предыдущая · простой diff")) : null,
        b ? h("pre", { class: "h3z-note" }, this.astSimpleDiff(b, a)) : h("div", { class: "h3z-note" }, T("Это первая версия в чате")));
      const close = () => modal.remove();
      const modal = h("div", { class: "h3z-modal" }, h("div", { class: "h3z-save h3z-glass" },
        h("div", { class: "hd" }, h("b", null, T("Версии промпта")), h("div", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: close }, "✕")),
        body,
        h("div", { class: "h3z-row", style: { justifyContent: "flex-end" } },
          h("button", { class: "h3z-btn sm primary", onclick: () => { this.astInsertPrompt(a, false); close(); } }, T("Вставить последнюю")),
          h("button", { class: "h3z-btn sm", onclick: close }, T("Закрыть")))));
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      document.body.append(modal);
    },
    astSimpleDiff(oldT, newT) {
      const oa = oldT.split(/\s+/), na = newT.split(/\s+/);
      const os = new Set(oa);
      return na.map((w) => (os.has(w) ? w : `⟦${w}⟧`)).join(" ");
    },
    astChatsSide() { return null; },
    astMain() {
      const chat = this.astChat(), preset = this.astPresetView(this.astPreset() || BUILTINS[0]);
      return h("div", { class: "h3z-ast-main" },
        h("div", { class: "h3z-ast-log" }, chat?.msgs.length ? chat.msgs.map((m, i, all) => this.astMessage(m, i === all.length - 1 && this._ast.busy)) : this.astEmpty(preset)));
    },
    astEmpty(preset) {
      return h("div", { class: "h3z-ast-empty" },
        h("p", { class: "h3z-ast-emptyblurb" },
          [T("Ассистент видит текущий отрезок, референсы и выбранный режим."),
            T("Опишите сцену или задайте вопрос ниже."),
            T("Стили — через «＋ Стили».")].join("\n")));
    },
    astSuggestBlock() { return null; },
    astMessage(m, pending) {
      const user = m.role === "user";
      const stats = !user && m.stats ? h("div", { class: "h3z-note" },
        T("{0} → {1} ток.", m.stats.prompt, m.stats.completion),
        m.stats.tps ? " · " + T("{0} ток/с", m.stats.tps) : "",
        m.stats.ttft != null ? " · " + T("TTFT {0} с", m.stats.ttft) : "",
        m.stats.elapsed ? " · " + T("{0} с", m.stats.elapsed) : "",
        m.stats.finish === "length" ? " · " + T("Ответ обрезан по лимиту токенов") : "") : null;
      const acts = !user && m.text ? h("div", { class: "h3z-row" },
        h("button", { class: "h3z-btn sm", onclick: () => this.astCopy(m.text) }, T("Копировать")),
        h("button", { class: "h3z-btn sm primary", onclick: () => this.astInsertPrompt(m.text, false) }, T("Применить к отрезку")),
        h("button", { class: "h3z-btn sm", onclick: () => this.astInsertPrompt(m.text, true) }, T("Вставить и сгенерировать"))) : null;
      return h("div", { class: "h3z-card h3z-glass h3z-ast-msg" + (user ? " user" : "") + (pending ? " pending" : "") },
        h("div", { class: "h3z-card-h" }, h("h4", null, user ? T("Вы") : "H3")),
        h("div", { class: "h3z-ast-content" },
          !user && m.reasoning && this.p.assistant.cfg.show_reasoning !== false ? this.astReasoning(m.reasoning, pending && !m.text) : null,
          user
            ? h("div", { class: "h3z-ast-bubble tx plain" }, m.text)
            : h("div", { class: "h3z-ast-bubble tx", dataset: { mdRaw: m.text || "" }, html: astMd(m.text) }),
          stats, acts));
    },
    astComposer() {
      const A = this._ast, cfg = this.p.assistant.cfg;
      const ta = h("textarea", { class: "h3z-ta h3z-ast-input", rows: "2",
        placeholder: T("Опишите сцену или задайте вопрос…"),
        title: T("Enter / Ctrl+Enter — отправить · Shift+Enter — новая строка"), spellcheck: "false" });
      const draft = A.drafts?.[this.astDraftId()];
      if (draft?.text) {
        ta.value = draft.text;
        if (draft.height) { const maxH = this.astComposeMaxH(); ta.style.height = Math.max(44, Math.min(maxH, draft.height)) + "px"; ta.style.maxHeight = maxH + "px"; }
      }
      ta.addEventListener("input", () => { this.astAutoGrow(ta); this.astRememberDraft(ta); });
      ta.addEventListener("focus", () => this.astAutoGrow(ta));
      ta.addEventListener("blur", () => { this.astAutoGrow(ta); this.astRememberDraft(ta); });
      ta.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
        if (e.shiftKey && !e.ctrlKey && !e.metaKey) return; // newline
        e.preventDefault();
        if (!this._ast?.busy) this.astSend();
      });
      queueMicrotask(() => this.astAutoGrow(ta));
      const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, style: "display:none" });
      file.onchange = () => { this.astAddImages([...file.files]); file.value = ""; };
      const send = A.busy
        ? h("button", { class: "h3z-btn sm danger h3z-ast-send", html: ICON.stop + `<span>${T("Стоп")}</span>`, onclick: () => this.astStop() })
        : h("button", { class: "h3z-btn sm primary h3z-ast-send", disabled: A.uploading || undefined, html: `<span>${A.uploading ? T("Загрузка…") : T("Отправить")}</span>`, onclick: () => this.astSend() });
      const styles = this.astStyles().filter((s) => cfg.styles.includes(s.id));
      const styleLab = styles.length ? T("＋ Стили ·{0}", styles.length) : T("＋ Стили");
      const styleTitle = styles.length
        ? T("Выбрать стили промпта") + " — " + styles.map((s) => s.name).join(", ")
        : T("Выбрать стили промпта");
      const tools = h("div", { class: "h3z-ast-tools" },
        h("button", { class: "h3z-btn sm icon", title: T("Прикрепить изображения"), disabled: A.busy || A.uploading || undefined, html: ICON.upload, onclick: () => file.click() }),
        h("button", { class: "h3z-pill" + (styles.length ? " on" : ""), title: styleTitle, onclick: () => this.astOpenSettings("styles") }, styleLab),
        this.astNeighPill());
      const compose = h("div", { class: "h3z-ast-compose" },
        A.uploads.length ? h("div", { class: "h3z-ast-uploads" }, A.uploads.map((u, i) => h("span", { class: "h3z-chip" },
          h("span", { title: u.label }, u.label),
          h("button", { class: "h3z-btn sm icon", title: T("Убрать изображение"), onclick: () => { A.uploads.splice(i, 1); this.astPaintComposer(); } }, "×")))) : null,
        ta,
        h("div", { class: "h3z-ast-toolbar" }, tools, send),
        file);
      compose.addEventListener("dragover", (e) => { if (e.dataTransfer?.files?.length) e.preventDefault(); });
      compose.addEventListener("drop", (e) => { const files = [...(e.dataTransfer?.files || [])]; if (files.length) { e.preventDefault(); this.astAddImages(files); } });
      return compose;
    },
    astPaintComposer() {
      const old = this._ast?.el?.querySelector(".h3z-ast-compose"); if (!old) return;
      const input = old.querySelector("textarea"), text = input?.value || "", focused = document.activeElement === input;
      if (input) this.astRememberDraft(input);
      old.replaceWith(this.astComposer());
      const next = this._ast.el.querySelector(".h3z-ast-compose textarea");
      if (next && text) { next.value = text; this.astAutoGrow(next); this.astRememberDraft(next); }
      if (next && focused) next.focus();
    },
    astSettings() { return null; },
    astConnectionState() {
      const st = this._ast.status;
      const title = st.state === "connected" ? T("Подключено к API") : st.state === "checking" ? T("Проверяем соединение…") : st.state === "error" ? T("Не удалось подключиться") : T("Соединение ещё не проверено");
      const detail = st.state === "connected" ? T("Список моделей получен: {0}", st.models.length) : st.error || T("Нажмите «Подключить». Адрес и ключ будут проверены через GET /models.");
      const cls = st.state === "error" ? "warn" : st.state === "connected" ? "ok" : "";
      return h("div", { class: "h3z-note h3z-ast-conn" + (cls ? " " + cls : "") }, h("b", null, title), h("div", null, detail));
    },
    astSetConnection() {
      const cfg = this.p.assistant.cfg, st = this._ast.status;
      const base = h("input", { class: "h3z-in", type: "text", inputmode: "url", value: cfg.api_base, placeholder: "http://127.0.0.1:1234/v1", spellcheck: "false", "data-ast-cfg": "api_base", autocomplete: "off" });
      base.oninput = () => this.astText("api_base", base, true);
      const key = h("input", { class: "h3z-in", type: "password", value: cfg.api_key, placeholder: "sk-…", autocomplete: "off", spellcheck: "false", "data-ast-cfg": "api_key" });
      key.oninput = () => this.astText("api_key", key, true);
      const show = h("button", { class: "h3z-btn sm", type: "button", onclick: () => { key.type = key.type === "password" ? "text" : "password"; show.textContent = key.type === "password" ? T("Показать") : T("Скрыть"); } }, T("Показать"));
      const models = st.models || [];
      const modelOpts = [
        { value: "", label: models.length ? T("— выберите модель —") : T("— сначала подключитесь —") },
        ...models.map((m) => ({ value: m, label: m })),
      ];
      if (cfg.api_model && !models.includes(cfg.api_model)) modelOpts.push({ value: cfg.api_model, label: cfg.api_model });
      const model = this.themedSelect({
        value: cfg.api_model || "",
        options: modelOpts,
        emptyLabel: models.length ? T("— выберите модель —") : T("— сначала подключитесь —"),
        onChange: (v) => { this.astApplyCfg({ api_model: v }); this.renderAssistHead(); },
      });
      const timeout = h("input", { class: "h3z-in", type: "number", value: cfg.stream_timeout, min: 30, max: 3600, step: 30 });
      timeout.onchange = () => this.astApplyCfg({ stream_timeout: Math.max(30, Math.min(3600, Number(timeout.value) || 600)) });
      const endpoint = h("input", { class: "h3z-in", value: cfg.unload_endpoint, placeholder: "/api/v1/models/unload", spellcheck: "false", "data-ast-cfg": "unload_endpoint" });
      endpoint.oninput = () => this.astText("unload_endpoint", endpoint);
      return h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
        h("div", { class: "h3z-card-h" }, h("h4", null, T("OpenAI-совместимый API"))),
        h("div", { class: "h3z-note" }, T("Поддерживаются LM Studio, Ollama, llama-server, vLLM, OpenAI и другие серверы с endpoints /models и /chat/completions.")),
        this.astConnectionState(),
        this.field(T("Адрес API"), base),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Ключ API")), h("div", { class: "h3z-row" }, key, show), h("div", { class: "h3z-note" }, T("Для локальных серверов ключ обычно не нужен. Ключ хранится в данных проекта — не публикуйте проект с секретным ключом."))),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Модель")), h("div", { class: "h3z-row" }, model,
          h("button", { class: "h3z-btn sm", disabled: st.state === "checking" || undefined, onclick: () => this.astConnect() }, st.state === "checking" ? T("Обновление…") : T("Обновить")))),
        h("div", { class: "h3z-grid2" }, this.field(T("Таймаут ответа, сек"), timeout), this.field(T("Endpoint выгрузки (необязательно)"), endpoint)),
        h("div", { class: "h3z-row" },
          h("button", { class: "h3z-btn primary", disabled: st.state === "checking" || undefined, onclick: () => this.astConnect() }, st.state === "checking" ? T("Подключение…") : T("Подключить")),
          h("button", { class: "h3z-btn", disabled: !cfg.api_model || this._ast.busy || this._ast.unloading || undefined,
            title: T("Выгрузить модель LLM из памяти сервера"), onclick: () => this.astUnload() }, this._ast.unloading ? T("Выгрузка…") : T("Выгрузить LLM"))),
        h("div", { class: "h3z-note" }, T("Адрес должен включать /v1, если этого требует сервер. Можно вставить полный /chat/completions — путь будет приведён автоматически.")));
    },
    astSamplingControls(cfg, onSample, onTokens, disabled = false) {
      const key = cfg.thinking ? "thinking" : "plain", profile = cfg.sampling[key];
      const num = (name, label, step, min, max) => {
        const e = h("input", { class: "h3z-in", type: "number", value: profile[name], step, min, max, disabled: disabled || undefined });
        e.onchange = () => onSample({ ...profile, [name]: Math.max(min, Math.min(max, Number(e.value) || 0)) });
        return this.field(label, e);
      };
      const tokens = h("input", { class: "h3z-in", type: "number", value: cfg.max_tokens, step: 256, min: 16, max: 32768, disabled: disabled || undefined });
      tokens.onchange = () => onTokens(Math.max(16, Math.min(32768, Number(tokens.value) || 16)));
      return h("div", null,
        h("div", { class: "h3z-lbl" }, cfg.thinking ? T("Параметры режима мышления") : T("Параметры обычного режима")),
        h("div", { class: "h3z-note" }, T("Два профиля хранятся независимо: переключение мышления не изменяет их значения.")),
        h("div", { class: "h3z-grid3" },
          num("temperature", T("Температура"), 0.05, 0, 2), num("top_p", "Top P", 0.05, 0, 1), num("top_k", "Top K", 1, 0, 200)),
        h("div", { class: "h3z-grid3" },
          num("min_p", "Min P", 0.01, 0, 1), num("presence_penalty", "Presence Penalty", 0.1, -2, 2), num("repetition_penalty", "Repetition Penalty", 0.05, 0, 2)),
        this.field(T("Макс. токенов"), tokens));
    },
    astSetPresets() {
      const A = this._ast, d = A.presetDraft;
      const item = (p) => h("button", { class: "h3z-btn sm" + (A.editPreset === p.id ? " primary" : ""), style: "justify-content:flex-start;width:100%", onclick: () => this.astEditPreset(p.id) },
        T(p.name));
      if (!d) return h("div", { class: "h3z-note" }, T("Выберите пресет"));
      d.cfg = C.normalizeAssistCfg(d.cfg);
      const builtin = BUILTINS.some((p) => p.id === d.id);
      const name = h("input", { class: "h3z-in", value: d.name });
      name.oninput = () => this.astPresetDraftValue("name", name.value);
      const mode = this.themedSelect({
        value: d.cfg.mode,
        options: Object.entries(MODE_NAMES).map(([k, v]) => ({ value: k, label: T(v) })),
        onChange: (v) => this.astPresetDraftValue("mode", v),
      });
      const sys = h("textarea", { class: "h3z-ta", value: d.cfg.sys || "", spellcheck: "false" });
      sys.oninput = () => this.astPresetDraftValue("sys", sys.value);
      return h("div", null,
        h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
          h("div", { class: "h3z-card-h" }, h("h4", null, T("Пресеты"))),
          h("div", { class: "h3z-ast-presetlist" }, BUILTINS.map(item), this.p.assistant.presets.map(item)),
          h("button", { class: "h3z-btn sm", style: "width:100%;justify-content:center;margin-top:8px", onclick: () => this.astNewPreset() }, T("＋ Новый пресет"))),
        h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
          h("div", { class: "h3z-card-h" }, h("h4", null, builtin ? T("Встроенный режим") : T("Редактор пресета"))),
          h("div", { class: "h3z-note" }, builtin ? T("Измените поля черновика и нажмите «Сохранить как копию». Стандартный режим останется без изменений.") : T("Настройте собственный сценарий работы ассистента.")),
          h("div", { class: "h3z-grid2" }, this.field(T("Название"), name), this.field(T("Режим"), mode)),
          h("div", null, h("div", { class: "h3z-lbl" }, T("Системный промпт")), sys),
          this.toggle(T("Режим мышления"), !!d.cfg.thinking, (v) => { d.cfg.thinking = !!v; this.renderAssistSettings(); }, T("Включать рассуждения модели и использовать отдельный профиль генерации.")),
          this.astSamplingControls(d.cfg,
            (profile) => { d.cfg.sampling = { ...d.cfg.sampling, [d.cfg.thinking ? "thinking" : "plain"]: profile }; },
            (value) => { d.cfg.max_tokens = value; }),
          h("div", { class: "h3z-row" },
            h("button", { class: "h3z-btn primary", onclick: () => this.astSavePreset() }, builtin ? T("Сохранить как копию") : T("Сохранить пресет")),
            h("button", { class: "h3z-btn", onclick: () => this.astApplyPreset(d.id || this.p.assistant.preset) }, T("Применить")),
            !builtin && d.id ? h("button", { class: "h3z-btn danger", onclick: () => this.astDeletePreset(d.id) }, T("Удалить")) : null)));
    },
    astStyleIcon(style) {
      const map = { camera: "📷", clapperboard: "🎬", film: "🎞️", image: "🖼️", sparkles: "✨", wand: "🪄" };
      return map[style.icon] || "✦";
    },
    astCatLabel(c) {
      if (!c || c === "other") return T("Другое");
      return c;
    },
    astStyleList() {
      const A = this._ast, cfg = this.p.assistant.cfg, query = A.styleQuery.trim().toLowerCase();
      const styles = this.astStyles().filter((s) => (A.styleCategory === "all" || String(s.category || "other") === A.styleCategory) &&
        (!query || `${s.name} ${s.description || ""} ${s.category || ""}`.toLowerCase().includes(query)));
      return h("div", { class: "h3z-ast-stylelist" }, styles.length ? styles.map((style) => {
        const on = cfg.styles.includes(style.id);
        return h("div", { class: "h3z-card h3z-glass h3z-ast-stylecard" + (on ? " on" : ""), role: "button", tabindex: "0",
          "aria-pressed": on ? "true" : "false",
          onclick: () => this.astToggleStyle(style.id),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.astToggleStyle(style.id); } } },
          h("div", { class: "h3z-ast-stylecard-hd" },
            h("span", { class: "h3z-ast-styleico" }, this.astStyleIcon(style)),
            h("span", { class: "h3z-ast-stylecheck", "aria-hidden": "true" }, on ? "✓" : "")),
          h("div", { class: "h3z-ast-styleops" },
            h("button", { class: "h3z-btn sm icon", title: T("Редактировать стиль"), onclick: (e) => { e.stopPropagation(); this.astEditStyle(style.id); } }, "✎"),
            h("button", { class: "h3z-btn sm icon", title: T("Удалить стиль"), onclick: (e) => { e.stopPropagation(); this.astDeleteStyle(style.id); } }, "×")),
          h("b", { class: "h3z-ast-stylename" }, style.name),
          h("div", { class: "h3z-note h3z-ast-styledesc" }, style.description || T("Без описания")));
      }) : h("div", { class: "h3z-note" }, T("Ничего не найдено")));
    },
    astPaintStyleList() {
      const A = this._ast; if (!A?.el) return;
      A.el.querySelector(".h3z-ast-stylelist")?.replaceWith(this.astStyleList());
      const count = A.el.querySelector(".h3z-ast-stylecount"); if (count) count.textContent = T("Выбрано: {0}", this.p.assistant.cfg.styles.length);
    },
    astEditStyle(sid = "") {
      const style = this.astStyles().find((s) => s.id === sid);
      this._ast.styleDraft = style ? clone(style) : { id: "", name: "", description: "", category: T("Мои стили"), icon: "sparkles", tone: "violet", priority: 50, instructions: [], custom: true };
      this.renderAssistSettings();
    },
    astSaveStyle() {
      const A = this._ast, d = A?.styleDraft; if (!d) return;
      const instructions = (Array.isArray(d.instructions) ? d.instructions : String(d.instructions || "").split("\n")).map((x) => String(x).trim()).filter(Boolean);
      if (!d.name.trim()) { this.toast(T("Введите название стиля"), true); return; }
      if (!instructions.length) { this.toast(T("Добавьте хотя бы одну инструкцию"), true); return; }
      const isNew = !d.id, sid = d.id || id("style");
      const saved = { ...clone(d), id: sid, name: d.name.trim(), description: d.description.trim(), category: d.category.trim() || T("Мои стили"),
        priority: Math.max(0, Math.min(100, Number(d.priority) || 0)), instructions, custom: !PROMPT_STYLES.some((s) => s.id === sid) };
      this.astSet((a) => {
        a.style_defs ||= [];
        const at = a.style_defs.findIndex((s) => s.id === sid);
        if (at >= 0) a.style_defs[at] = saved; else a.style_defs.push(saved);
        a.style_deleted = (a.style_deleted || []).filter((x) => x !== sid);
        if (isNew && !a.cfg.styles.includes(sid)) a.cfg.styles.push(sid);
      });
      A.styleDraft = null;
      this.renderAssistSettings(); this.astPaintComposer(); this.toast(T("Стиль сохранён"));
    },
    astDeleteStyle(sid) {
      const style = this.astStyles().find((s) => s.id === sid); if (!style || !confirm(T("Удалить стиль «{0}»?", style.name))) return;
      this.astSet((a) => {
        a.style_defs = (a.style_defs || []).filter((s) => s.id !== sid);
        if (PROMPT_STYLES.some((s) => s.id === sid)) a.style_deleted = [...new Set([...(a.style_deleted || []), sid])];
        a.cfg.styles = a.cfg.styles.filter((x) => x !== sid);
        for (const preset of a.presets) preset.cfg.styles = preset.cfg.styles.filter((x) => x !== sid);
      });
      if (this._ast.styleDraft?.id === sid) this._ast.styleDraft = null;
      this.renderAssistSettings(); this.astPaintComposer(); this.toast(T("Стиль удалён"));
    },
    astResetStyles() {
      this.astSet((a) => {
        a.style_deleted = [];
        a.style_defs = (a.style_defs || []).filter((s) => s.custom && !PROMPT_STYLES.some((base) => base.id === s.id));
      });
      this.renderAssistSettings(); this.astPaintComposer(); this.toast(T("Стандартные стили восстановлены"));
    },
    astStyleEditor() {
      const d = this._ast.styleDraft;
      const input = (key, type = "text") => {
        const field = h("input", { class: "h3z-in", type, value: d[key], min: type === "number" ? 0 : undefined, max: type === "number" ? 100 : undefined });
        field.oninput = () => { d[key] = field.value; };
        return field;
      };
      const instructions = h("textarea", { class: "h3z-ta", style: "min-height:180px;line-height:1.6", value: (Array.isArray(d.instructions) ? d.instructions : String(d.instructions || "").split("\n")).join("\n"), placeholder: T("По одной инструкции на строку") });
      instructions.oninput = () => { d.instructions = instructions.value; };
      return h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
        h("div", { class: "h3z-card-h" }, h("h4", null, d.id ? T("Редактирование стиля") : T("Новый стиль"))),
        h("div", { class: "h3z-note" }, T("Название и описание помогают выбрать стиль. В готовый системный промпт попадают его инструкции и приоритет.")),
        this.field(T("Название"), input("name")), this.field(T("Описание"), input("description")),
        h("div", { class: "h3z-grid3" }, this.field(T("Категория"), input("category")), this.field(T("Иконка"), input("icon")), this.field(T("Приоритет"), input("priority", "number"))),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Инструкции")), instructions,
          h("div", { class: "h3z-note" }, T("Приоритет 0–100: при конфликте инструкций выше приоритет стиля с большим числом."))),
        h("div", { class: "h3z-row" }, h("button", { class: "h3z-btn primary", onclick: () => this.astSaveStyle() }, T("Сохранить стиль")),
          h("button", { class: "h3z-btn", onclick: () => { this._ast.styleDraft = null; this.renderAssistSettings(); } }, T("Отмена"))));
    },
    astSetStyles() {
      const A = this._ast; if (A.styleDraft) return this.astStyleEditor();
      const search = h("input", { class: "h3z-in", type: "search", value: A.styleQuery, placeholder: T("Поиск стилей…") });
      search.oninput = () => { A.styleQuery = search.value; this.astPaintStyleList(); };
      const all = this.astStyles(), categories = [...new Set(all.map((s) => String(s.category || "other")))].sort();
      const cat = (value, label) => h("div", { class: "h3z-pill" + (A.styleCategory === value ? " on" : ""), onclick: () => { A.styleCategory = value; this.renderAssistSettings(); } }, label);
      const changed = this.p.assistant.style_deleted.length || this.p.assistant.style_defs.some((s) => PROMPT_STYLES.some((base) => base.id === s.id));
      return h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
        h("div", { class: "h3z-card-h" }, h("h4", null, T("Стили генерации промпта"))),
        h("div", { class: "h3z-note" }, T("Создавайте и редактируйте стили. Выбранные стили добавляются в системный промпт в порядке приоритета и сохраняются в пресетах.")),
        search,
        h("div", { class: "h3z-pills wrap" }, cat("all", T("Все стили")), categories.map((c) => cat(c, this.astCatLabel(c)))),
        h("div", { class: "h3z-ast-styletbar" },
          h("span", { class: "h3z-note h3z-ast-stylecount" }, T("Выбрано: {0}", this.p.assistant.cfg.styles.length)),
          h("div", { class: "grow" }),
          h("button", { class: "h3z-btn sm", disabled: !this.p.assistant.cfg.styles.length || undefined, onclick: () => { this.astApplyCfg({ styles: [] }); this.astPaintStyleList(); this.astPaintComposer(); } }, T("Сбросить")),
          changed ? h("button", { class: "h3z-btn sm", onclick: () => this.astResetStyles() }, T("Восстановить")) : null,
          h("button", { class: "h3z-btn sm primary", onclick: () => this.astEditStyle() }, T("＋ Новый"))),
        this.astStyleList());
    },
    astSetGeneration() {
      const cfg = this.p.assistant.cfg;
      const delay = h("input", { class: "h3z-in", type: "number", value: cfg.auto_unload_delay, min: 0, max: 86400, step: 30, disabled: !cfg.auto_unload || undefined });
      delay.onchange = () => { this.astApplyCfg({ auto_unload_delay: Math.max(0, Math.min(86400, Number(delay.value) || 0)) }); this.astScheduleUnload(); };
      return h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
        h("div", { class: "h3z-card-h" }, h("h4", null, T("Параметры текущего чата"))),
        h("div", { class: "h3z-note" }, T("Эти значения применяются сразу. Чтобы сохранить их в пресет, откройте вкладку «Пресеты» и сохраните копию.")),
        this.toggle(T("Режим мышления"), !!cfg.thinking, (v) => { this.astApplyCfg({ thinking: !!v }); this.renderAssistSettings(); }, T("Включать рассуждения модели и использовать отдельный профиль генерации.")),
        this.toggle(T("Показывать размышления"), !!cfg.show_reasoning, (v) => { this.astApplyCfg({ show_reasoning: !!v }); this.renderAssistSettings(); }, T("Показывать reasoning под складной шторкой. Модель продолжит мыслить независимо от отображения.")),
        this.toggle(T("Использовать настройки модели по умолчанию"), !!cfg.engine_defaults, (v) => { this.astApplyCfg({ engine_defaults: !!v }); this.renderAssistSettings(); }, T("Не отправлять параметры сэмплирования и лимит токенов — сервер LLM применит собственные значения.")),
        this.astSamplingControls(cfg,
          (profile) => this.astApplyCfg({ sampling: { ...cfg.sampling, [cfg.thinking ? "thinking" : "plain"]: profile } }),
          (value) => this.astApplyCfg({ max_tokens: value }), cfg.engine_defaults),
        h("div", { class: "h3z-lbl" }, T("Память")),
        this.toggle(T("Выгружать LLM перед видеогенерацией"), !!cfg.unload_on_generate, (v) => { this.astApplyCfg({ unload_on_generate: !!v }); this.renderAssistSettings(); }, T("Освобождать память LLM при каждом запуске H3. Перед запросом к LLM модели ComfyUI выгружаются автоматически.")),
        this.toggle(T("Автовыгрузка после ответа"), !!cfg.auto_unload, (v) => { this.astApplyCfg({ auto_unload: !!v }); if (!v) clearTimeout(this._astUnloadT); this.renderAssistSettings(); }, T("Выгружать LLM после паузы. Новая отправка сбрасывает таймер.")),
        this.field(T("Задержка автовыгрузки, сек"), delay));
    },
    astSetContext() {
      const cfg = this.p.assistant.cfg;
      const sys = h("textarea", { class: "h3z-ta", style: "min-height:210px", value: cfg.sys || "", placeholder: T("Пусто — использовать системный промпт выбранного пресета"), spellcheck: "false" });
      sys.oninput = () => this.astText("sys", sys);
      return h("div", { class: "h3z-card h3z-glass h3z-insp-block" },
        h("div", { class: "h3z-card-h" }, h("h4", null, T("Что ассистент знает о сцене"))),
        h("div", { class: "h3z-note" }, T("Контекст выбранного отрезка (длина, разрешение, fps, промпт, референсы и персонажи) всегда добавляется к системному сообщению.")),
        h("div", { class: "h3z-note" }, T("Референсы и персонажи текущего отрезка включены всегда.")),
        this.toggle(T("Соседние отрезки"), !!cfg.ctx_neighbours, (v) => { this.astApplyCfg({ ctx_neighbours: !!v }); this.renderAssistSettings(); }, T("Промпты и референсы предыдущего и следующего отрезков — удобно при продлении клипа.")),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Системный промпт для этого чата")), sys,
          h("div", { class: "h3z-note" }, T("Переопределение не меняет пресет. Очистите поле, чтобы снова использовать промпт пресета."))),
        h("button", { class: "h3z-btn sm", onclick: () => { this.astApplyCfg({ sys: "" }); this.renderAssistSettings(); } }, T("Сбросить переопределение")));
    },
  });
}
