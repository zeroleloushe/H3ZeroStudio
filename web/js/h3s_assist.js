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
  { id: "chat", icon: "✦", name: T("Свободный чат"), desc: T("Идеи, разбор сцены и ответы без обязательного шаблона."), suggestions: [T("Помоги придумать сцену для текущего отрезка"), T("Разбери мой промпт и предложи улучшения"), T("Как лучше использовать референсы в этой сцене?")], cfg: { mode: "chat", temperature: 0.7, top_p: 0.9, max_tokens: 1800, sys: `You are an assistant in the H3ZeroStudio video studio. Respond in Russian, clearly and concisely. Help conceive and improve MiniMax H3 scenes using the current segment context and the official H3 distinction between T2VA, keyframe I2VA/FL2VA/L2VA, and six-section Ref2VA workflows. Do not format the response as a finished prompt when the user asks for advice or discussion. If the user requests a finished prompt, ask which mode to use or select one based on the references and task.` } },
  { id: "t2va", icon: "T", name: T("Текст → видео"), desc: T("Полная сцена из текстового описания без референсов."), suggestions: [T("Напиши промпт: утреннее кафе, бариста готовит кофе, мягкий свет"), T("Придумай динамичную сцену в киберпанк-городе"), T("Сделай спокойный природный кадр без музыки")], cfg: { mode: "t2va", temperature: 0.65, top_p: 0.9, max_tokens: 3000, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nT2VA mode. Build the complete audiovisual timeline from text without an image-alignment instruction. Begin directly with integrated_multimodal_description; do not add subject_definitions or retention_analysis.` } },
  { id: "ref2va", icon: "◉", name: T("По референсам"), desc: T("Новая сцена с людьми, объектами и локациями из изображений."), suggestions: [T("Напиши промпт по референсам: герой идёт по ночной улице"), T("Сохрани внешность персонажа и добавь спокойное движение камеры"), T("Собери сцену из текущих изображений с естественным звуком")], cfg: { mode: "ref2va", temperature: 0.55, top_p: 0.9, max_tokens: 4200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\n${REF_RULES}\n\nRef2VA full-reference generation mode. Usually use [reference generation], adding keyframe completion, video editing, video continuation, audio reuse, or audio reference only when the actual input roles require them. Retain distinctive identity and appearance details from every supplied visual reference.` } },
  { id: "i2va", icon: "▶", name: T("Первый кадр"), desc: T("Оживление изображения с развитием действия вперёд."), suggestions: [T("Оживи первый кадр: лёгкий ветер и естественная мимика"), T("Начни с текущего изображения и плавно приблизь камеру"), T("Развивай сцену из первого кадра без смены локации")], cfg: { mode: "i2va", temperature: 0.5, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nI2VA mode. The first line must always be exactly: For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced. Follow it with one blank line before the three core fields. Establish the source image's style, subjects, composition, and scene anchors, then use first-frame anchor → action onset → continuous development → result or reaction. Preserve character identity, clothing, colors, key objects, and spatial relationships.` } },
  { id: "fl2va", icon: "↔", name: T("Первый + последний"), desc: T("Непрерывный переход между двумя ключевыми кадрами."), suggestions: [T("Соедини первый и последний кадр одним плавным действием"), T("Опиши переход между кадрами без дополнительных монтажных склеек"), T("Сделай непрерывное движение камеры между двумя изображениями")], cfg: { mode: "fl2va", temperature: 0.45, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nFL2VA mode. The first line must be: How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video. Replace N with the actual final shot index and S.SS with the exact duration to two decimal places. Follow it with one blank line before the three core fields. Prefer one continuous shot unless multiple shots are explicitly requested. Describe first-frame state → observable intermediate changes → progressively narrowing differences → last-frame state; the final shot must land exactly on Picture 2 at the end.` } },
  { id: "l2va", icon: "◀", name: T("Последний кадр"), desc: T("Сцена, которая логично приходит к заданному финалу."), suggestions: [T("Построй действие так, чтобы закончить текущим последним кадром"), T("Придумай плавный подход камеры к финальному изображению"), T("Сделай сцену с точной остановкой на последнем кадре")], cfg: { mode: "l2va", temperature: 0.5, top_p: 0.9, max_tokens: 3200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\nL2VA mode. The first line must be: How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video. Replace N with the actual final shot index and S.SS with the exact duration to two decimal places. Follow it with one blank line before the three core fields. Picture 1 belongs only to the final shot, not inherently Shot 1. Construct plausible preceding state → explicit action and transition path → gradual convergence in the final shot → exact last-frame landing on composition, pose, lighting, and object positions.` } },
  { id: "lipsync", icon: "♪", name: T("Липсинк и диалог"), desc: T("Речь, мимика и голосовые референсы с точными репликами."), suggestions: [T("Напиши сцену с липсинком: герой спокойно представляется зрителю"), T("Используй аудио-референс как тембр голоса персонажа"), T("Сделай короткий диалог двух персонажей с естественной мимикой")], cfg: { mode: "lipsync", temperature: 0.4, top_p: 0.85, max_tokens: 4200, sys: `${COMMON_RULES}\n\n${BASE_RULES}\n\n${REF_RULES}\n\nLipsync and dialogue mode uses the official Ref2VA structure, not a separate H3 checkpoint. Choose summary task types from the actual task, typically reference generation or video editing plus audio reference for voice timbre, or audio reuse only when the source signal itself is copied. Preserve every line verbatim inside <d>[Language] ...</d>. Describe observable articulation, pauses, breathing, gaze, eyebrows, and head movements in temporal alignment with speech. Do not promise exact lipsync in prose; define the physical sequence instead. Fit speech naturally into the segment duration; silence and pauses take time too.` } },
];
for (const preset of BUILTINS) preset.cfg.max_tokens = 16000;

const MODE_NAMES = { chat: T("Свободный чат"), t2va: T("Текст → видео"), ref2va: T("По референсам"), i2va: T("Первый кадр"), fl2va: T("Первый + последний"), l2va: T("Последний кадр"), lipsync: T("Липсинк и диалог") };

export const ASSIST_CSS = `
.h3z-ast{position:fixed;inset:0;z-index:100002;display:grid;place-items:center;padding:22px;background:rgba(2,5,14,.72);backdrop-filter:blur(10px)}
.h3z-ast-box{position:relative;width:min(1180px,100%);height:min(820px,100%);min-height:420px;display:grid;grid-template-rows:64px minmax(0,1fr);overflow:hidden;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.42)}
.h3z-ast-hd{display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line);background:rgba(13,17,32,.82)}
.h3z-ast-brand{display:flex;align-items:center;gap:10px;min-width:190px}
.h3z-ast-logo{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,#8b5cf6,#4f46e5);color:#fff;box-shadow:0 5px 18px rgba(99,102,241,.25)}
.h3z-ast-logo svg{width:19px;height:19px}
.h3z-ast-title{font-size:14px;font-weight:750;line-height:1.2}
.h3z-ast-sub{font-size:10.5px;color:var(--mut);margin-top:3px}
.h3z-ast-preset{height:34px;max-width:230px;min-width:150px}
.h3z-ast-spacer{flex:1}
.h3z-ast-status{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px;border:1px solid var(--line);border-radius:9px;background:rgba(5,9,20,.35);color:var(--mut);font-size:11px;cursor:pointer;white-space:nowrap}
.h3z-ast-status:hover{border-color:var(--line2);color:var(--txt)}
.h3z-ast-dot{width:7px;height:7px;border-radius:50%;background:#64748b;flex:none}
.h3z-ast-status.ok{color:#a7f3d0;border-color:rgba(52,211,153,.25);background:rgba(16,185,129,.08)}
.h3z-ast-status.ok .h3z-ast-dot{background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.1)}
.h3z-ast-status.err{color:#fda4af;border-color:rgba(251,113,133,.25);background:rgba(244,63,94,.07)}
.h3z-ast-status.err .h3z-ast-dot{background:#fb7185}
.h3z-ast-status.busy .h3z-ast-dot{background:#22d3ee;animation:h3zAstPulse 1s infinite alternate}
@keyframes h3zAstPulse{to{opacity:.35}}
.h3z-ast-body{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:0}
.h3z-ast-side{border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;background:rgba(7,11,24,.42)}
.h3z-ast-sidehd{display:flex;align-items:center;justify-content:space-between;padding:15px 13px 10px;color:var(--mut);font-size:11px;font-weight:650}
.h3z-ast-new{width:100%;justify-content:center;margin-bottom:8px}
.h3z-ast-new svg,.h3z-ast-send svg,.h3z-ast-iconbtn svg,.h3z-ast-action svg{width:15px;height:15px}
.h3z-ast-sidepad{padding:0 11px 10px}
.h3z-ast-chats{flex:1;overflow:auto;padding:2px 8px 12px;display:flex;flex-direction:column;gap:3px}
.h3z-ast-chat{position:relative;display:flex;align-items:center;gap:8px;padding:10px 8px;border-radius:9px;cursor:pointer;border:1px solid transparent;color:var(--mut)}
.h3z-ast-chat:hover{background:rgba(148,163,255,.06);color:var(--txt)}
.h3z-ast-chat.on{border-color:rgba(139,92,246,.26);background:rgba(139,92,246,.12);color:var(--txt)}
.h3z-ast-chatinfo{flex:1;min-width:0}
.h3z-ast-chattitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:550}
.h3z-ast-chatmeta{font-size:10px;color:var(--mut2);margin-top:4px}
.h3z-ast-chatops{display:none;gap:2px}
.h3z-ast-chat:hover .h3z-ast-chatops,.h3z-ast-chat.on .h3z-ast-chatops{display:flex}
.h3z-ast-chat.on .h3z-ast-chattitle{max-width:125px}
.h3z-ast-x{border:none;background:transparent;color:var(--mut2);cursor:pointer;padding:3px;font-size:11px;border-radius:4px}
.h3z-ast-x:hover{color:var(--txt);background:rgba(255,255,255,.07)}
.h3z-ast-main{display:flex;flex-direction:column;min-height:0;min-width:0;background:rgba(10,14,28,.25)}
.h3z-ast-log{flex:1;overflow:auto;padding:24px clamp(16px,4vw,48px);display:flex;flex-direction:column;gap:20px;min-height:0;scroll-behavior:smooth}
.h3z-ast-msg{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;max-width:88%;align-self:flex-start}
.h3z-ast-msg.user{align-self:flex-end;grid-template-columns:minmax(0,1fr) 28px;max-width:78%}
.h3z-ast-avatar{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.22);color:#c4b5fd;font-size:11px;font-weight:800;margin-top:2px}
.h3z-ast-msg.user .h3z-ast-avatar{grid-column:2;background:rgba(34,211,238,.1);border-color:rgba(34,211,238,.2);color:#a5f3fc}
.h3z-ast-msg.user .h3z-ast-content{grid-column:1;grid-row:1}
.h3z-ast-bubble{padding:12px 15px;border-radius:5px 15px 15px 15px;background:rgba(20,26,46,.82);border:1px solid var(--line);font-size:13px;line-height:1.62;white-space:pre-wrap;word-break:break-word;color:var(--txt)}
.h3z-ast-bubble,.h3z-ast-bubble *,.h3z-ast-reasonbody{user-select:text;-webkit-user-select:text;cursor:text}
.h3z-ast-bubble ::selection,.h3z-ast-reasonbody::selection{background:rgba(139,92,246,.35);color:#fff}
.h3z-ast-msg.user .h3z-ast-bubble{border-radius:15px 5px 15px 15px;background:rgba(91,76,175,.22);border-color:rgba(139,92,246,.28)}
.h3z-ast-reason{margin:0 0 8px;border-left:2px solid rgba(139,92,246,.34);border-radius:0 9px 9px 0;background:rgba(139,92,246,.045);color:var(--mut)}
.h3z-ast-reason summary{display:flex;align-items:center;gap:7px;padding:8px 10px;cursor:pointer;list-style:none;font-size:11px;user-select:none}
.h3z-ast-reason summary::-webkit-details-marker{display:none}
.h3z-ast-reason summary::after{content:"+";margin-left:auto;color:var(--mut2);font-size:14px}
.h3z-ast-reason[open] summary::after{content:"−"}
.h3z-ast-reason summary:focus-visible{outline:2px solid #a78bfa;outline-offset:2px;border-radius:7px}
.h3z-ast-reasondot{width:6px;height:6px;border-radius:50%;background:#a78bfa;flex:none}
.h3z-ast-reason[open] .h3z-ast-reasondot{animation:h3zAstPulse .8s infinite alternate}
.h3z-ast-reasonbody{max-height:250px;overflow:auto;padding:0 12px 11px 23px;white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.58;color:var(--mut)}
.h3z-ast-msg.pending .h3z-ast-bubble:empty::after{content:"";display:inline-block;width:18px;height:7px;border-radius:4px;background:rgba(196,181,253,.45);animation:h3zAstPulse .7s infinite alternate}
.h3z-ast-acts{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.h3z-ast-action{display:inline-flex;align-items:center;gap:5px;border:1px solid transparent;background:transparent;color:var(--mut);border-radius:7px;padding:5px 7px;font-size:10.5px;cursor:pointer}
.h3z-ast-action:hover{color:var(--txt);background:rgba(148,163,255,.07);border-color:var(--line)}
.h3z-ast-empty{margin:auto;max-width:590px;text-align:center;padding:28px 10px}
.h3z-ast-emptyicon{width:54px;height:54px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(139,92,246,.25);border-radius:16px;background:rgba(139,92,246,.1);color:#c4b5fd;font-size:24px;font-weight:650}
.h3z-ast-empty h2{font-size:20px;line-height:1.3;margin:0 0 8px;font-weight:700;letter-spacing:-.02em}
.h3z-ast-empty p{margin:0 auto;color:var(--mut);font-size:12.5px;line-height:1.6;max-width:480px}
.h3z-ast-suggest{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:20px}
.h3z-ast-chip{max-width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:rgba(18,24,43,.55);color:var(--mut);font-size:11px;line-height:1.4;cursor:pointer;text-align:left}
.h3z-ast-chip:hover{color:var(--txt);border-color:rgba(139,92,246,.38);background:rgba(139,92,246,.08)}
.h3z-ast-compose{padding:12px clamp(14px,3vw,32px) 16px;border-top:1px solid var(--line);background:rgba(10,14,27,.8)}
.h3z-ast-inputbox{display:flex;align-items:center;gap:8px;padding:7px 7px 7px 13px;border:1px solid var(--line2);border-radius:13px;background:rgba(5,9,20,.48);transition:border-color .15s,box-shadow .15s}
.h3z-ast-inputbox:focus-within{border-color:rgba(139,92,246,.6);box-shadow:0 0 0 3px rgba(139,92,246,.08)}
.h3z-ast-inputbox textarea{flex:1;box-sizing:border-box;height:38px;min-height:38px;max-height:150px;resize:none;overflow-y:hidden;border:none!important;background:transparent!important;box-shadow:none!important;padding:9px 0!important;font-size:13px;line-height:1.45}
.h3z-ast-send{height:38px;min-width:98px;justify-content:center;border-radius:9px}
.h3z-ast-composemeta{display:flex;justify-content:space-between;gap:12px;margin-top:7px;color:var(--mut2);font-size:10px}
.h3z-ast-set{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:28px;background:rgba(2,5,14,.7);backdrop-filter:blur(8px)}
.h3z-ast-setbox{width:min(880px,100%);height:min(690px,100%);display:grid;grid-template-rows:58px 44px minmax(0,1fr);overflow:hidden;border:1px solid var(--line2);border-radius:16px;background:#0e1324;box-shadow:0 24px 70px rgba(0,0,0,.45)}
.h3z-ast-settabs{display:flex;gap:3px;padding:0 16px;border-bottom:1px solid var(--line)}
.h3z-ast-settab{position:relative;padding:0 13px;border:none;background:transparent;color:var(--mut);cursor:pointer;font-size:12px}
.h3z-ast-settab:hover{color:var(--txt)}
.h3z-ast-settab.on{color:#ddd6fe}
.h3z-ast-settab.on::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:#8b5cf6;border-radius:2px}
.h3z-ast-setbody{overflow:auto;padding:22px;min-height:0}
.h3z-ast-form{max-width:650px;margin:0 auto;display:flex;flex-direction:column;gap:17px}
.h3z-ast-formwide{max-width:none}
.h3z-ast-sectiontitle{font-size:15px;font-weight:700;margin:0}
.h3z-ast-sectiondesc{font-size:12px;color:var(--mut);line-height:1.65;margin:7px 0 0;max-width:72ch}
.h3z-ast-conn{display:flex;align-items:flex-start;gap:11px;padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:rgba(5,9,20,.35)}
.h3z-ast-conn .h3z-ast-dot{margin-top:5px}
.h3z-ast-conn.ok{border-color:rgba(52,211,153,.25);background:rgba(16,185,129,.06)}
.h3z-ast-conn.ok .h3z-ast-dot{background:#34d399}
.h3z-ast-conn.err{border-color:rgba(251,113,133,.28);background:rgba(244,63,94,.06)}
.h3z-ast-conn.err .h3z-ast-dot{background:#fb7185}
.h3z-ast-conntext{font-size:12px;font-weight:600;line-height:1.45}
.h3z-ast-conndetail{font-size:11px;color:var(--mut);line-height:1.5;margin-top:3px;word-break:break-word}
.h3z-ast-modelrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
.h3z-ast-buttonrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.h3z-ast-presets{display:grid;grid-template-columns:205px minmax(0,1fr);gap:18px;min-height:100%}
.h3z-ast-presetlist{display:flex;flex-direction:column;gap:6px;padding-right:14px;border-right:1px solid var(--line)}
.h3z-ast-presetitem{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:9px 10px;border:1px solid transparent;border-radius:9px;background:rgba(148,163,255,.035);color:var(--mut);font:inherit;cursor:pointer;text-align:left}
.h3z-ast-presetitem:hover{background:rgba(148,163,255,.09);border-color:var(--line);color:var(--txt)}
.h3z-ast-presetitem.on{background:rgba(139,92,246,.14);border-color:rgba(139,92,246,.34);color:var(--txt)}
.h3z-ast-presetitem:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
.h3z-ast-preseticon{width:27px;height:27px;display:grid;place-items:center;flex:none;border-radius:7px;background:rgba(139,92,246,.12);color:#c4b5fd;font-size:12px;font-weight:750}
.h3z-ast-presetname{font-size:12px;font-weight:600;line-height:1.5}
.h3z-ast-editor{display:flex;flex-direction:column;gap:18px;min-width:0}
.h3z-ast-editor textarea{min-height:245px;line-height:1.7;font-size:12.5px;padding:13px 14px}
.h3z-ast-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.h3z-ast-switch{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;cursor:pointer}
.h3z-ast-switch input{margin-top:3px;accent-color:#8b5cf6}
.h3z-ast-switchtitle{font-size:12px;font-weight:600}
.h3z-ast-switchdesc{font-size:10.5px;color:var(--mut);line-height:1.5;margin-top:3px}
.h3z-ast-stats{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:7px;color:var(--mut2);font-size:10px;line-height:1.5}
.h3z-ast-truncated{color:#fbbf24}
.h3z-ast-tools{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;margin-top:8px}
.h3z-ast-uploads{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.h3z-ast-upload{display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:5px 7px;border:1px solid var(--line);border-radius:8px;background:rgba(139,92,246,.07);color:var(--mut);font-size:10.5px}
.h3z-ast-upload span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-ast-upload button{border:0;background:transparent;color:var(--mut);padding:0;cursor:pointer}
.h3z-ast-upload button:hover{color:var(--txt)}
.h3z-ast-attach{flex:none;width:34px;height:34px}
.h3z-ast-attach svg{width:16px;height:16px}
.h3z-ast-stylechips{display:flex;gap:5px;flex:1;min-width:0;overflow:auto;scrollbar-width:thin}
.h3z-ast-stylechip{flex:none;border:1px solid rgba(139,92,246,.24);border-radius:999px;background:rgba(139,92,246,.08);color:#c4b5fd;padding:4px 8px;font-size:10px;cursor:pointer}
.h3z-ast-stylechip:hover{border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.14)}
.h3z-ast-stylelayout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:18px;min-height:100%}
.h3z-ast-stylefilters{display:flex;flex-direction:column;gap:8px}
.h3z-ast-stylecat{padding:8px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--mut);text-align:left;cursor:pointer;font-size:11.5px}
.h3z-ast-stylecat:hover{background:rgba(148,163,255,.06);color:var(--txt)}
.h3z-ast-stylecat.on{border-color:rgba(139,92,246,.28);background:rgba(139,92,246,.12);color:#ddd6fe}
.h3z-ast-stylelist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start}
.h3z-ast-styleitem{display:flex;align-items:flex-start;gap:9px;padding:11px;border:1px solid var(--line);border-radius:10px;background:rgba(5,9,20,.26);cursor:pointer;min-width:0}
.h3z-ast-styleitem:hover{border-color:rgba(139,92,246,.35);background:rgba(139,92,246,.055)}
.h3z-ast-styleitem.on{border-color:rgba(139,92,246,.42);background:rgba(139,92,246,.1)}
.h3z-ast-styleitem input{margin-top:3px;accent-color:#8b5cf6;flex:none}
.h3z-ast-stylepick{display:flex;align-items:flex-start;gap:9px;flex:1;min-width:0;cursor:pointer}
.h3z-ast-styleops{display:flex;gap:1px;flex:none;margin:-5px -5px 0 0}
.h3z-ast-stylename{display:block;font-size:11.5px;font-weight:650;line-height:1.45;color:var(--txt)}
.h3z-ast-styledesc{display:block;font-size:10.5px;color:var(--mut);line-height:1.5;margin-top:4px}
.h3z-ast-styleempty{grid-column:1/-1;padding:32px;text-align:center;color:var(--mut);font-size:12px}
.h3z-ast-mobilechats{display:none}
@media(max-width:800px){.h3z-ast{padding:0}.h3z-ast-box{border-radius:0;height:100%;min-height:0}.h3z-ast-brand{min-width:0}.h3z-ast-sub,.h3z-ast-status span{display:none}.h3z-ast-status{padding:0 9px}.h3z-ast-preset{max-width:155px;min-width:100px}.h3z-ast-body{grid-template-columns:1fr}.h3z-ast-side{display:none;position:absolute;z-index:2;inset:64px auto 0 0;width:min(280px,85vw);background:#0c1121;box-shadow:15px 0 40px rgba(0,0,0,.35)}.h3z-ast-side.open{display:flex}.h3z-ast-mobilechats{display:inline-flex}.h3z-ast-set{padding:10px}.h3z-ast-setbox{height:100%}.h3z-ast-presets{grid-template-columns:1fr}.h3z-ast-presetlist{border-right:none;border-bottom:1px solid var(--line);padding:0 0 12px;max-height:190px;overflow:auto}.h3z-ast-grid3{grid-template-columns:1fr}.h3z-ast-stylelayout{grid-template-columns:1fr}.h3z-ast-stylefilters{flex-direction:row;flex-wrap:wrap}.h3z-ast-stylefilters .h3z-in{width:100%}.h3z-ast-stylelist{grid-template-columns:1fr}.h3z-ast-msg,.h3z-ast-msg.user{max-width:96%}.h3z-ast-log{padding:18px 12px}}
@media(prefers-reduced-motion:reduce){.h3z-ast *{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
`;

export function installAssist(Editor, { C, h, ICON }) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const id = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  Object.assign(Editor.prototype, {
    openAssist() {
      if (this._ast?.el?.isConnected) return;
      if (!document.getElementById("h3z-ast-style")) document.head.append(h("style", { id: "h3z-ast-style" }, ASSIST_CSS));
      const el = h("div", { class: "h3z-ast" });
      el.addEventListener("pointerdown", (e) => { if (e.target === el) this.closeAssist(); });
      this._ast = { el, busy: false, abort: null, status: { state: "idle", models: [], error: "" }, setOpen: false,
        setTab: "connection", editPreset: "", presetDraft: null, sideOpen: false, connectSeq: 0,
        uploads: [], uploading: false, styleQuery: "", styleCategory: "all" };
      this.root.append(el);
      if (!this.astPreset()) this.astSet((a) => { a.preset = "chat"; });
      this.renderAssist();
      this.astConnect(true);
    },
    closeAssist() {
      if (this._ast) this._ast.connectSeq++;
      clearTimeout(this._astCfgT);
      this._ast?.abort?.abort();
      this._ast?.el?.remove();
      this._ast = null;
    },
    astSet(fn) {
      const a = clone(this.p.assistant || {});
      fn(a);
      this.p = C.normalizeProject({ ...this.p, assistant: a });
      this.flushSave();
    },
    astApplyCfg(patch) { this.astSet((a) => { a.cfg = { ...a.cfg, ...patch }; }); },
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
      const cid = id("c");
      this.astSet((a) => { a.chats.unshift({ id: cid, title: "", created: Date.now(), msgs: [] }); a.active = cid; });
      if (render) this.renderAssist();
    },
    astSelectChat(cid) { this.astSet((a) => { a.active = cid; }); if (this._ast) this._ast.sideOpen = false; this.renderAssist(); },
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
      this.renderAssistHead?.();
      const old = this._ast?.el.querySelector(".h3z-ast-conn");
      if (old) old.replaceWith(this.astConnectionState());
    },
    astOpenSettings(tab = "connection") {
      if (!this._ast) return;
      this._ast.setOpen = true; this._ast.setTab = tab;
      if (tab === "presets" && !this._ast.presetDraft) {
        const p = this.astPreset() || BUILTINS[0];
        this._ast.editPreset = p.id; this._ast.presetDraft = clone(p);
      }
      this.renderAssistSettings();
    },

    astCardLabels(i, s) { return C.cardLabels(this.p, s, i, true, false); },
    astAttachments() {
      const out = [...(this._ast?.uploads || [])];
      const i = this.sel >= 0 && this.seg(this.sel) ? this.sel : 0, s = this.seg(i);
      if (!s || this.p.assistant.cfg.ctx_refs === false) return out;
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
      const L = [T("Текущий отрезок {0}{1}: {2} кадров ({3} с), кадр {4}×{5}.", i + 1, s.name ? ` «${s.name}»` : "", s.frames, (s.frames / C.FPS).toFixed(2), w, hh)];
      if (cfg.ctx_refs !== false) {
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
        const x = this.seg(j);
        if (x && (x.prompt || "").trim()) L.push(T("Соседний отрезок {0}: «{1}»", j + 1, x.prompt.trim().slice(0, 500)));
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
      const ta = A.el.querySelector(".h3z-ast-inputbox textarea");
      const text = ta?.value.trim() || (A.uploads.length ? T("Опиши прикреплённые изображения.") : "");
      if (!text) return;
      A.busy = true; this.astPaintComposer();
      if (!this.p.assistant.cfg.api_model) this.astOpenSettings("connection");
      if (!this.p.assistant.cfg.api_model || !(A.status.state === "connected" || await this.astConnect(true))) {
        A.busy = false; this.astPaintComposer();
        const input = A.el.querySelector(".h3z-ast-inputbox textarea");
        if (input) { input.value = text; this.astAutoGrow(input); }
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
      ta.value = ""; ta.style.height = "38px";
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
            if (data.kind === "reasoning" || data.kind === "token") {
              this.astPaintStream(answer, reasoning);
              const log = A.el.querySelector(".h3z-ast-log"); if (log) log.scrollTop = log.scrollHeight;
            }
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
        A.abort = null; A.busy = false; this.renderAssist();
        if (answer) this.astScheduleUnload();
      }
    },
    astStop() { this._ast?.abort?.abort(); },
    astReasoning(text, active) {
      return h("details", { class: "h3z-ast-reason", open: active || undefined },
        h("summary", null, h("i", { class: "h3z-ast-reasondot" }), h("span", null, active ? T("Модель размышляет…") : T("Размышления модели"))),
        h("div", { class: "h3z-ast-reasonbody" }, text));
    },
    astPaintStream(answer, reasoning) {
      const pending = this._ast?.el.querySelector(".h3z-ast-msg.pending"); if (!pending) return;
      const bubble = pending.querySelector(".tx"); if (bubble) bubble.textContent = answer;
      let details = pending.querySelector(".h3z-ast-reason");
      if (reasoning && !details && this.p.assistant.cfg.show_reasoning) {
        details = this.astReasoning(reasoning, !answer);
        pending.querySelector(".h3z-ast-content")?.prepend(details);
      }
      if (details) {
        const body = details.querySelector(".h3z-ast-reasonbody");
        body.textContent = reasoning;
        details.querySelector("summary span").textContent = answer ? T("Размышления модели") : T("Модель размышляет…");
        if (details.open) body.scrollTop = body.scrollHeight;
        if (answer && details.dataset.closed !== "1") { details.open = false; details.dataset.closed = "1"; }
      }
    },
    astSuggestion(text) {
      const ta = this._ast?.el.querySelector(".h3z-ast-inputbox textarea"); if (!ta) return;
      ta.value = text; ta.focus(); this.astAutoGrow(ta);
    },
    astAutoGrow(ta) {
      ta.style.height = "0px";
      ta.style.minHeight = "0px";
      const contentHeight = ta.scrollHeight;
      const height = Math.min(150, Math.max(38, contentHeight));
      ta.style.height = height + "px";
      ta.style.minHeight = "38px";
      ta.style.overflowY = contentHeight > 150 ? "auto" : "hidden";
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
      const A = this._ast; if (!A?.el?.isConnected) return;
      A.el.replaceChildren(h("div", { class: "h3z-ast-box h3z-glass" }, this.astHead(), this.astBody(), A.setOpen ? this.astSettings() : null));
      const log = A.el.querySelector(".h3z-ast-log"); if (log) log.scrollTop = log.scrollHeight;
    },
    renderAssistHead() { const old = this._ast?.el.querySelector(":scope > .h3z-ast-box > .h3z-ast-hd"); if (old) old.replaceWith(this.astHead()); },
    renderAssistSettings() {
      const box = this._ast?.el.querySelector(":scope > .h3z-ast-box"); if (!box) return;
      box.querySelector(":scope > .h3z-ast-set")?.remove();
      if (this._ast.setOpen) box.append(this.astSettings());
    },
    astStatusView() {
      const st = this._ast.status, model = this.p.assistant.cfg.api_model;
      if (st.state === "connected") return { cls: "ok", text: model || T("API подключён") };
      if (st.state === "checking") return { cls: "busy", text: T("Проверка API…") };
      if (st.state === "error") return { cls: "err", text: T("Нет соединения") };
      return { cls: "", text: T("API не проверен") };
    },
    astHead() {
      const st = this.astStatusView(), active = this.p.assistant.preset || "chat";
      const sel = h("select", { class: "h3z-sel sm h3z-ast-preset", title: T("Режим и пресет ассистента") },
        h("optgroup", { label: T("Основные режимы") }, BUILTINS.map((p) => h("option", { value: p.id, selected: active === p.id }, `${p.icon} ${T(p.name)}`))),
        this.p.assistant.presets.length ? h("optgroup", { label: T("Мои пресеты") }, this.p.assistant.presets.map((p) => h("option", { value: p.id, selected: active === p.id }, "✦ " + p.name))) : null);
      sel.onchange = () => this.astApplyPreset(sel.value);
      return h("div", { class: "h3z-ast-hd" },
        h("button", { class: "h3z-btn sm icon h3z-ast-mobilechats", title: T("Диалоги"), html: ICON.menu || "☰", onclick: () => { this._ast.sideOpen = !this._ast.sideOpen; this._ast.el.querySelector(".h3z-ast-side")?.classList.toggle("open", this._ast.sideOpen); } }),
        h("div", { class: "h3z-ast-brand" }, h("div", { class: "h3z-ast-logo", html: ICON.spark }), h("div", null, h("div", { class: "h3z-ast-title" }, T("Ассистент")), h("div", { class: "h3z-ast-sub" }, "MiniMax H3 · API"))),
        sel, h("div", { class: "h3z-ast-spacer" }),
        h("button", { class: `h3z-ast-status ${st.cls}`, title: T("Открыть настройки подключения"), onclick: () => this.astOpenSettings("connection") }, h("i", { class: "h3z-ast-dot" }), h("span", null, st.text)),
        h("button", { class: "h3z-btn sm icon", title: T("Настройки ассистента"), html: ICON.settings, onclick: () => this.astOpenSettings() }),
        h("button", { class: "h3z-btn sm icon", title: T("Закрыть (Esc)"), html: ICON.close, onclick: () => this.closeAssist() }));
    },
    astBody() { return h("div", { class: "h3z-ast-body" }, this.astChatsSide(), this.astMain()); },
    astChatsSide() {
      const active = this.p.assistant.active;
      return h("div", { class: "h3z-ast-side" + (this._ast.sideOpen ? " open" : "") },
        h("div", { class: "h3z-ast-sidehd" }, h("span", null, T("Диалоги")), h("span", null, String(this.p.assistant.chats.length))),
        h("div", { class: "h3z-ast-sidepad" }, h("button", { class: "h3z-btn sm primary h3z-ast-new", html: ICON.plus + `<span>${T("Новый чат")}</span>`, onclick: () => this.astNewChat() })),
        h("div", { class: "h3z-ast-chats" }, this.p.assistant.chats.length ? this.p.assistant.chats.map((c) => h("div", { class: "h3z-ast-chat" + (c.id === active ? " on" : ""), onclick: () => this.astSelectChat(c.id) },
          h("div", { class: "h3z-ast-chatinfo" }, h("div", { class: "h3z-ast-chattitle" }, c.title || T("Новый чат")), h("div", { class: "h3z-ast-chatmeta" }, T("{0} сообщений", c.msgs.length))),
          h("div", { class: "h3z-ast-chatops" },
            h("button", { class: "h3z-ast-x", title: T("Переименовать"), onclick: (e) => { e.stopPropagation(); this.astRenameChat(c.id); } }, "✎"),
            h("button", { class: "h3z-ast-x", title: T("Удалить чат"), onclick: (e) => { e.stopPropagation(); this.astDeleteChat(c.id); } }, "×")))) : h("div", { class: "h3z-note" }, T("Здесь появятся ваши диалоги"))));
    },
    astMain() {
      const chat = this.astChat(), preset = this.astPresetView(this.astPreset() || BUILTINS[0]);
      return h("div", { class: "h3z-ast-main" },
        h("div", { class: "h3z-ast-log" }, chat?.msgs.length ? chat.msgs.map((m, i, all) => this.astMessage(m, i === all.length - 1 && this._ast.busy)) : this.astEmpty(preset)),
        this.astComposer());
    },
    astEmpty(preset) {
      return h("div", { class: "h3z-ast-empty" }, h("div", { class: "h3z-ast-emptyicon" }, preset.icon || "✦"),
        h("h2", null, preset.name), h("p", null, preset.desc),
        h("div", { class: "h3z-ast-suggest" }, preset.suggestions.map((s) => h("button", { class: "h3z-ast-chip", onclick: () => this.astSuggestion(s) }, s))));
    },
    astMessage(m, pending) {
      const user = m.role === "user";
      const stats = !user && m.stats ? h("div", { class: "h3z-ast-stats" },
        h("span", null, T("{0} → {1} ток.", m.stats.prompt, m.stats.completion)),
        m.stats.tps ? h("span", null, T("{0} ток/с", m.stats.tps)) : null,
        m.stats.elapsed ? h("span", null, T("{0} с", m.stats.elapsed)) : null,
        m.stats.finish === "length" ? h("span", { class: "h3z-ast-truncated" }, T("Ответ обрезан по лимиту токенов")) : null) : null;
      const content = h("div", { class: "h3z-ast-content" }, !user && m.reasoning && this.p.assistant.cfg.show_reasoning ? this.astReasoning(m.reasoning, pending && !m.text) : null,
        h("div", { class: "h3z-ast-bubble" }, h("span", { class: "tx" }, m.text)), stats,
        !user && m.text ? h("div", { class: "h3z-ast-acts" },
          h("button", { class: "h3z-ast-action", html: ICON.copy + `<span>${T("Копировать")}</span>`, onclick: () => this.astCopy(m.text) }),
          h("button", { class: "h3z-ast-action", onclick: () => this.astInsertPrompt(m.text, false) }, T("Вставить в промпт")),
          h("button", { class: "h3z-ast-action", onclick: () => this.astInsertPrompt(m.text, true) }, T("Вставить и сгенерировать"))) : null);
      return h("div", { class: `h3z-ast-msg ${user ? "user" : "as"}${pending ? " pending" : ""}` },
        user ? [content, h("div", { class: "h3z-ast-avatar" }, T("Вы"))] : [h("div", { class: "h3z-ast-avatar" }, "H3"), content]);
    },
    astComposer() {
      const A = this._ast, preset = this.astPreset(), cfg = this.p.assistant.cfg;
      const ta = h("textarea", { class: "h3z-ta", rows: "1", placeholder: T("Опишите сцену или задайте вопрос…"), spellcheck: "false" });
      ta.addEventListener("input", () => this.astAutoGrow(ta));
      ta.addEventListener("keydown", (e) => e.stopPropagation());
      const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, style: "display:none" });
      file.onchange = () => { this.astAddImages([...file.files]); file.value = ""; };
      const send = A.busy ? h("button", { class: "h3z-btn danger h3z-ast-send", html: ICON.stop + `<span>${T("Стоп")}</span>`, onclick: () => this.astStop() })
        : h("button", { class: "h3z-btn primary h3z-ast-send", disabled: A.uploading || undefined, html: `<span>${A.uploading ? T("Загрузка…") : T("Отправить")}</span>`, onclick: () => this.astSend() });
      const styles = this.astStyles().filter((s) => cfg.styles.includes(s.id));
      const compose = h("div", { class: "h3z-ast-compose" },
        A.uploads.length ? h("div", { class: "h3z-ast-uploads" }, A.uploads.map((u, i) => h("span", { class: "h3z-ast-upload" },
          h("span", { title: u.label }, u.label), h("button", { title: T("Убрать изображение"), onclick: () => { A.uploads.splice(i, 1); this.astPaintComposer(); } }, "×")))) : null,
        h("div", { class: "h3z-ast-inputbox" },
          h("button", { class: "h3z-btn sm icon h3z-ast-attach", title: T("Прикрепить изображения"), disabled: A.busy || A.uploading || undefined, html: ICON.upload, onclick: () => file.click() }), ta, send),
        h("div", { class: "h3z-ast-tools" }, h("div", { class: "h3z-ast-stylechips" },
          styles.slice(0, 4).map((s) => h("button", { class: "h3z-ast-stylechip", title: s.description || s.name, onclick: () => this.astOpenSettings("styles") }, s.name)),
          styles.length > 4 ? h("button", { class: "h3z-ast-stylechip", onclick: () => this.astOpenSettings("styles") }, "+" + (styles.length - 4)) : null,
          h("button", { class: "h3z-ast-stylechip", title: T("Выбрать стили промпта"), onclick: () => this.astOpenSettings("styles") }, styles.length ? T("Изменить") : T("＋ Стили")))),
        h("div", { class: "h3z-ast-composemeta" }, h("span", null, T("Enter — отправить · Shift+Enter — новая строка")), h("span", null, T(MODE_NAMES[preset?.cfg.mode] || T("Пользовательский пресет")))), file);
      compose.addEventListener("dragover", (e) => { if (e.dataTransfer?.files?.length) e.preventDefault(); });
      compose.addEventListener("drop", (e) => { const files = [...(e.dataTransfer?.files || [])]; if (files.length) { e.preventDefault(); this.astAddImages(files); } });
      return compose;
    },
    astPaintComposer() {
      const old = this._ast?.el.querySelector(".h3z-ast-compose"); if (!old) return;
      const input = old.querySelector("textarea"), text = input?.value || "", focused = document.activeElement === input;
      old.replaceWith(this.astComposer());
      const next = this._ast.el.querySelector(".h3z-ast-compose textarea");
      if (next && text) { next.value = text; this.astAutoGrow(next); }
      if (next && focused) next.focus();
    },

    astSettings() {
      const A = this._ast;
      const close = () => { A.setOpen = false; this.renderAssistSettings(); };
      const tab = (key, label) => h("button", { class: "h3z-ast-settab" + (A.setTab === key ? " on" : ""), onclick: () => {
        A.setTab = key;
        if (key === "presets" && !A.presetDraft) {
          const p = this.astPreset() || BUILTINS[0];
          A.editPreset = p.id; A.presetDraft = clone(p);
        }
        this.renderAssistSettings();
      } }, label);
      const overlay = h("div", { class: "h3z-ast-set" },
        h("div", { class: "h3z-ast-setbox" },
          h("div", { class: "h3z-ast-hd" }, h("div", { class: "h3z-ast-title" }, T("Настройки ассистента")), h("div", { class: "h3z-ast-spacer" }), h("button", { class: "h3z-btn sm icon", html: ICON.close, title: T("Закрыть настройки"), onclick: close })),
          h("div", { class: "h3z-ast-settabs" }, tab("connection", T("Подключение")), tab("presets", T("Пресеты")), tab("styles", T("Стили")), tab("generation", T("Генерация")), tab("context", T("Контекст"))),
          h("div", { class: "h3z-ast-setbody" }, A.setTab === "connection" ? this.astSetConnection() : A.setTab === "presets" ? this.astSetPresets() : A.setTab === "styles" ? this.astSetStyles() : A.setTab === "generation" ? this.astSetGeneration() : this.astSetContext())));
      overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
      return overlay;
    },
    astConnectionState() {
      const st = this._ast.status, cls = st.state === "connected" ? "ok" : st.state === "error" ? "err" : st.state === "checking" ? "busy" : "";
      const title = st.state === "connected" ? T("Подключено к API") : st.state === "checking" ? T("Проверяем соединение…") : st.state === "error" ? T("Не удалось подключиться") : T("Соединение ещё не проверено");
      const detail = st.state === "connected" ? T("Список моделей получен: {0}", st.models.length) : st.error || T("Нажмите «Подключить». Адрес и ключ будут проверены через GET /models.");
      return h("div", { class: `h3z-ast-conn ${cls}` }, h("i", { class: "h3z-ast-dot" }), h("div", null, h("div", { class: "h3z-ast-conntext" }, title), h("div", { class: "h3z-ast-conndetail" }, detail)));
    },
    astSetConnection() {
      const cfg = this.p.assistant.cfg, st = this._ast.status;
      const base = h("input", { class: "h3z-in", type: "url", value: cfg.api_base, placeholder: "http://127.0.0.1:1234/v1", spellcheck: "false", "data-ast-cfg": "api_base" });
      base.oninput = () => this.astText("api_base", base, true);
      const key = h("input", { class: "h3z-in", type: "password", value: cfg.api_key, placeholder: "sk-…", autocomplete: "off", spellcheck: "false", "data-ast-cfg": "api_key" });
      key.oninput = () => this.astText("api_key", key, true);
      const show = h("button", { class: "h3z-btn sm", type: "button", onclick: () => { key.type = key.type === "password" ? "text" : "password"; show.textContent = key.type === "password" ? T("Показать") : T("Скрыть"); } }, T("Показать"));
      const models = st.models || [];
      const model = h("select", { class: "h3z-sel" },
        h("option", { value: "", selected: !cfg.api_model }, models.length ? T("— выберите модель —") : T("— сначала подключитесь —")),
        models.map((m) => h("option", { value: m, selected: cfg.api_model === m }, m)),
        cfg.api_model && !models.includes(cfg.api_model) ? h("option", { value: cfg.api_model, selected: true }, cfg.api_model) : null);
      model.onchange = () => { this.astApplyCfg({ api_model: model.value }); this.renderAssistHead(); };
      const timeout = h("input", { class: "h3z-in", type: "number", value: cfg.stream_timeout, min: 30, max: 3600, step: 30 });
      timeout.onchange = () => this.astApplyCfg({ stream_timeout: Math.max(30, Math.min(3600, Number(timeout.value) || 600)) });
      const endpoint = h("input", { class: "h3z-in", value: cfg.unload_endpoint, placeholder: "/api/v1/models/unload", spellcheck: "false", "data-ast-cfg": "unload_endpoint" });
      endpoint.oninput = () => this.astText("unload_endpoint", endpoint);
      return h("div", { class: "h3z-ast-form" },
        h("h3", { class: "h3z-ast-sectiontitle" }, T("OpenAI-совместимый API")),
        h("p", { class: "h3z-ast-sectiondesc" }, T("Поддерживаются LM Studio, Ollama, llama-server, vLLM, OpenAI и другие серверы с endpoints /models и /chat/completions.")),
        this.astConnectionState(),
        this.field(T("Адрес API"), base),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Ключ API")), h("div", { class: "h3z-row" }, key, show), h("div", { class: "h3z-note" }, T("Для локальных серверов ключ обычно не нужен. Ключ хранится в данных проекта — не публикуйте проект с секретным ключом."))),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Модель")), h("div", { class: "h3z-ast-modelrow" }, model,
          h("button", { class: "h3z-btn sm", disabled: st.state === "checking" || undefined, onclick: () => this.astConnect() }, st.state === "checking" ? T("Обновление…") : T("Обновить")))),
        h("div", { class: "h3z-grid2" }, this.field(T("Таймаут ответа, сек"), timeout), this.field(T("Endpoint выгрузки (необязательно)"), endpoint)),
        h("div", { class: "h3z-note" }, T("Если автоматическая выгрузка не поддерживается сервером, укажите его POST endpoint. Относительный путь использует хост API.")),
        h("div", { class: "h3z-ast-buttonrow" },
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
      const tokens = h("input", { class: "h3z-in", type: "number", value: cfg.max_tokens, step: 50, min: 16, max: 16000, disabled: disabled || undefined });
      tokens.onchange = () => onTokens(Math.max(16, Math.min(16000, Number(tokens.value) || 16)));
      return h("div", null,
        h("h3", { class: "h3z-ast-sectiontitle" }, cfg.thinking ? T("Параметры режима мышления") : T("Параметры обычного режима")),
        h("p", { class: "h3z-ast-sectiondesc" }, T("Два профиля хранятся независимо: переключение мышления не изменяет их значения.")),
        h("div", { class: "h3z-ast-grid3" },
          num("temperature", T("Температура"), 0.05, 0, 2), num("top_p", "Top P", 0.05, 0, 1), num("top_k", "Top K", 1, 0, 200)),
        h("div", { class: "h3z-ast-grid3" },
          num("min_p", "Min P", 0.01, 0, 1), num("presence_penalty", "Presence Penalty", 0.1, -2, 2), num("repetition_penalty", "Repetition Penalty", 0.05, 0, 2)),
        h("div", { class: "h3z-ast-grid3" }, this.field(T("Макс. токенов"), tokens)),
        h("div", { class: "h3z-note" }, T("Общий лимит — до 16 000 токенов на готовый промпт и размышления модели.")));
    },
    astSetPresets() {
      const A = this._ast, d = A.presetDraft;
      const item = (p) => h("button", { class: "h3z-ast-presetitem" + (A.editPreset === p.id ? " on" : ""), onclick: () => this.astEditPreset(p.id) },
        h("span", { class: "h3z-ast-preseticon" }, p.icon || "✦"), h("span", { class: "h3z-ast-presetname" }, T(p.name)));
      if (!d) return h("div", null);
      d.cfg = C.normalizeAssistCfg(d.cfg);
      const builtin = BUILTINS.some((p) => p.id === d.id);
      const name = h("input", { class: "h3z-in", value: d.name });
      name.oninput = () => this.astPresetDraftValue("name", name.value);
      const mode = h("select", { class: "h3z-sel" }, Object.entries(MODE_NAMES).map(([k, v]) => h("option", { value: k, selected: d.cfg.mode === k }, T(v))));
      mode.onchange = () => this.astPresetDraftValue("mode", mode.value);
      const sys = h("textarea", { class: "h3z-ta", value: d.cfg.sys || "", spellcheck: "false" });
      sys.oninput = () => this.astPresetDraftValue("sys", sys.value);
      const thinking = h("input", { type: "checkbox", checked: d.cfg.thinking || undefined });
      thinking.onchange = () => { d.cfg.thinking = thinking.checked; this.renderAssistSettings(); };
      return h("div", { class: "h3z-ast-presets" },
        h("div", null, h("div", { class: "h3z-ast-presetlist" }, BUILTINS.map(item), this.p.assistant.presets.map(item)),
          h("button", { class: "h3z-btn sm", style: "width:100%;justify-content:center;margin-top:8px", onclick: () => this.astNewPreset() }, T("＋ Новый пресет"))),
        h("div", { class: "h3z-ast-editor" },
          h("div", null, h("h3", { class: "h3z-ast-sectiontitle" }, builtin ? T("Встроенный режим") : T("Редактор пресета")), h("p", { class: "h3z-ast-sectiondesc" }, builtin ? T("Измените поля черновика и нажмите «Сохранить как копию». Стандартный режим останется без изменений.") : T("Настройте собственный сценарий работы ассистента."))),
          h("div", { class: "h3z-grid2" }, this.field(T("Название"), name), this.field(T("Режим"), mode)),
          h("div", null, h("div", { class: "h3z-lbl" }, T("Системный промпт")), sys),
          h("label", { class: "h3z-ast-switch" }, thinking, h("span", null,
            h("span", { class: "h3z-ast-switchtitle" }, T("Режим мышления")),
            h("div", { class: "h3z-ast-switchdesc" }, T("Включать рассуждения модели и использовать отдельный профиль генерации.")))),
          this.astSamplingControls(d.cfg,
            (profile) => { d.cfg.sampling = { ...d.cfg.sampling, [d.cfg.thinking ? "thinking" : "plain"]: profile }; },
            (value) => { d.cfg.max_tokens = value; }),
          h("div", { class: "h3z-ast-buttonrow" },
            h("button", { class: "h3z-btn primary", onclick: () => this.astSavePreset() }, builtin ? T("Сохранить как копию") : T("Сохранить пресет")),
            h("button", { class: "h3z-btn", onclick: () => this.astApplyPreset(d.id || this.p.assistant.preset) }, T("Применить")),
            !builtin && d.id ? h("button", { class: "h3z-btn danger", onclick: () => this.astDeletePreset(d.id) }, T("Удалить")) : null)));
    },
    astStyleList() {
      const A = this._ast, cfg = this.p.assistant.cfg, query = A.styleQuery.trim().toLowerCase();
      const styles = this.astStyles().filter((s) => (A.styleCategory === "all" || String(s.category || "other") === A.styleCategory) &&
        (!query || `${s.name} ${s.description || ""} ${s.category || ""}`.toLowerCase().includes(query)));
      return h("div", { class: "h3z-ast-stylelist" }, styles.length ? styles.map((style) => {
        const on = cfg.styles.includes(style.id), check = h("input", { type: "checkbox", checked: on || undefined });
        check.onchange = () => {
          const selected = new Set(this.p.assistant.cfg.styles);
          if (check.checked) selected.add(style.id); else selected.delete(style.id);
          this.astApplyCfg({ styles: [...selected] }); this.astPaintStyleList(); this.astPaintComposer();
        };
        return h("div", { class: "h3z-ast-styleitem" + (on ? " on" : "") },
          h("label", { class: "h3z-ast-stylepick" }, check, h("span", null,
            h("span", { class: "h3z-ast-stylename" }, style.name), h("span", { class: "h3z-ast-styledesc" }, style.description || T("Без описания")))),
          h("div", { class: "h3z-ast-styleops" },
            h("button", { class: "h3z-ast-x", title: T("Редактировать стиль"), onclick: () => this.astEditStyle(style.id) }, "✎"),
            h("button", { class: "h3z-ast-x", title: T("Удалить стиль"), onclick: () => this.astDeleteStyle(style.id) }, "×")));
      }) : h("div", { class: "h3z-ast-styleempty" }, T("Ничего не найдено")));
    },
    astPaintStyleList() {
      const A = this._ast; if (!A) return;
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
      return h("div", { class: "h3z-ast-form" },
        h("div", null, h("h3", { class: "h3z-ast-sectiontitle" }, d.id ? T("Редактирование стиля") : T("Новый стиль")),
          h("p", { class: "h3z-ast-sectiondesc" }, T("Название и описание помогают выбрать стиль. В готовый системный промпт попадают его инструкции и приоритет."))),
        this.field(T("Название"), input("name")), this.field(T("Описание"), input("description")),
        h("div", { class: "h3z-ast-grid3" }, this.field(T("Категория"), input("category")), this.field(T("Иконка"), input("icon")), this.field(T("Приоритет"), input("priority", "number"))),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Инструкции")), instructions,
          h("div", { class: "h3z-note" }, T("Приоритет 0–100: при конфликте инструкций выше приоритет стиля с большим числом."))),
        h("div", { class: "h3z-ast-buttonrow" }, h("button", { class: "h3z-btn primary", onclick: () => this.astSaveStyle() }, T("Сохранить стиль")),
          h("button", { class: "h3z-btn", onclick: () => { this._ast.styleDraft = null; this.renderAssistSettings(); } }, T("Отмена"))));
    },
    astSetStyles() {
      const A = this._ast; if (A.styleDraft) return this.astStyleEditor();
      const search = h("input", { class: "h3z-in", type: "search", value: A.styleQuery, placeholder: T("Поиск стилей…") });
      search.oninput = () => { A.styleQuery = search.value; this.astPaintStyleList(); };
      const all = this.astStyles(), categories = [...new Set(all.map((s) => String(s.category || "other")))].sort();
      const cat = (value, label) => h("button", { class: "h3z-ast-stylecat" + (A.styleCategory === value ? " on" : ""), onclick: () => { A.styleCategory = value; this.renderAssistSettings(); } }, label);
      const changed = this.p.assistant.style_deleted.length || this.p.assistant.style_defs.some((s) => PROMPT_STYLES.some((base) => base.id === s.id));
      return h("div", null,
        h("div", null, h("h3", { class: "h3z-ast-sectiontitle" }, T("Стили генерации промпта")),
          h("p", { class: "h3z-ast-sectiondesc" }, T("Создавайте и редактируйте стили. Выбранные стили добавляются в системный промпт в порядке приоритета и сохраняются в пресетах."))),
        h("div", { class: "h3z-ast-stylelayout", style: "margin-top:18px" },
          h("div", { class: "h3z-ast-stylefilters" }, search, cat("all", T("Все стили")), categories.map((c) => cat(c, c))),
          h("div", null, h("div", { class: "h3z-ast-buttonrow", style: "justify-content:space-between;margin-bottom:10px" },
            h("span", { class: "h3z-note h3z-ast-stylecount" }, T("Выбрано: {0}", this.p.assistant.cfg.styles.length)),
            h("button", { class: "h3z-btn sm primary", onclick: () => this.astEditStyle() }, T("＋ Новый стиль")),
            changed ? h("button", { class: "h3z-btn sm", onclick: () => this.astResetStyles() }, T("Восстановить стандартные")) : null,
            h("button", { class: "h3z-btn sm", disabled: !this.p.assistant.cfg.styles.length || undefined, onclick: () => { this.astApplyCfg({ styles: [] }); this.astPaintStyleList(); this.astPaintComposer(); } }, T("Сбросить выбор"))), this.astStyleList())));
    },
    astSetGeneration() {
      const cfg = this.p.assistant.cfg;
      const check = (key, title, desc) => {
        const input = h("input", { type: "checkbox", checked: cfg[key] || undefined });
        input.onchange = () => {
          this.astApplyCfg({ [key]: input.checked });
          if (key === "auto_unload" && !input.checked) clearTimeout(this._astUnloadT);
          this.renderAssistSettings();
        };
        return h("label", { class: "h3z-ast-switch" }, input, h("span", null, h("span", { class: "h3z-ast-switchtitle" }, title), h("div", { class: "h3z-ast-switchdesc" }, desc)));
      };
      const delay = h("input", { class: "h3z-in", type: "number", value: cfg.auto_unload_delay, min: 0, max: 86400, step: 30, disabled: !cfg.auto_unload || undefined });
      delay.onchange = () => { this.astApplyCfg({ auto_unload_delay: Math.max(0, Math.min(86400, Number(delay.value) || 0)) }); this.astScheduleUnload(); };
      return h("div", { class: "h3z-ast-form" }, h("h3", { class: "h3z-ast-sectiontitle" }, T("Параметры текущего чата")),
        h("p", { class: "h3z-ast-sectiondesc" }, T("Эти значения применяются сразу. Чтобы сохранить их в пресет, откройте вкладку «Пресеты» и сохраните копию.")),
        check("thinking", T("Режим мышления"), T("Включать рассуждения модели и использовать отдельный профиль генерации.")),
        check("show_reasoning", T("Показывать размышления"), T("Показывать reasoning под складной шторкой. Модель продолжит мыслить независимо от отображения.")),
        check("engine_defaults", T("Использовать настройки модели по умолчанию"), T("Не отправлять параметры сэмплирования и лимит токенов — сервер LLM применит собственные значения.")),
        this.astSamplingControls(cfg,
          (profile) => this.astApplyCfg({ sampling: { ...cfg.sampling, [cfg.thinking ? "thinking" : "plain"]: profile } }),
          (value) => this.astApplyCfg({ max_tokens: value }), cfg.engine_defaults),
        h("h3", { class: "h3z-ast-sectiontitle" }, T("Память")),
        check("unload_on_generate", T("Выгружать LLM перед видеогенерацией"), T("Освобождать память LLM при каждом запуске H3. Перед запросом к LLM модели ComfyUI выгружаются автоматически.")),
        check("auto_unload", T("Автовыгрузка после ответа"), T("Выгружать LLM после паузы. Новая отправка сбрасывает таймер.")),
        this.field(T("Задержка автовыгрузки, сек"), delay));
    },
    astSetContext() {
      const cfg = this.p.assistant.cfg;
      const check = (key, title, desc) => {
        const input = h("input", { type: "checkbox", checked: cfg[key] || undefined });
        input.onchange = () => this.astApplyCfg({ [key]: input.checked });
        return h("label", { class: "h3z-ast-switch" }, input, h("span", null, h("span", { class: "h3z-ast-switchtitle" }, title), h("div", { class: "h3z-ast-switchdesc" }, desc)));
      };
      const sys = h("textarea", { class: "h3z-ta", style: "min-height:210px", value: cfg.sys || "", placeholder: T("Пусто — использовать системный промпт выбранного пресета"), spellcheck: "false" });
      sys.oninput = () => this.astText("sys", sys);
      return h("div", { class: "h3z-ast-form" }, h("h3", { class: "h3z-ast-sectiontitle" }, T("Что ассистент знает о сцене")),
        h("p", { class: "h3z-ast-sectiondesc" }, T("Контекст текущего отрезка добавляется к системному сообщению при каждой отправке.")),
        check("ctx_refs", T("Референсы и персонажи"), T("Изображения, видео, аудио и включённые карточки персонажей текущего отрезка.")),
        check("ctx_neighbours", T("Соседние отрезки"), T("Промпты предыдущего и следующего отрезков для связности истории.")),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Системный промпт для этого чата")), sys,
          h("div", { class: "h3z-note" }, T("Переопределение не меняет пресет. Очистите поле, чтобы снова использовать промпт пресета."))),
        h("button", { class: "h3z-btn sm", style: "align-self:flex-start", onclick: () => { this.astApplyCfg({ sys: "" }); this.renderAssistSettings(); } }, T("Сбросить переопределение")));
    },
  });
}
