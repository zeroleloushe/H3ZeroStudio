// Help, English text. Mirrors h3s_help_ru.js: same section ids, same order (tests check it).
import { K } from "./h3s_help_ru.js";
export const HELP_EN = [
  ["what", "What is H3ZeroStudio", `
<p><b>H3ZeroStudio</b> is a ComfyUI node with a CapCut-style editor for the <b>MiniMax H3</b> model (video + sound). A video is built on a timeline from <b>segments</b> of 5–15 s. Each segment has its own prompt and references. Segments are generated one after another, and each can <b>continue</b> the previous one, so picture and sound flow without jumps.</p>
<ul><li>Finished segments are cached. A new run recomputes only what changed.</li>
<li>Every generation of a segment is a <b>take</b>: compare takes and pick the best.</li>
<li>There are drafts, upscaling, a live preview, a results gallery and a project list.</li>
<li>The whole project lives inside the workflow, in a hidden field of the node, and is also autosaved to “Projects”.</li></ul>`],
  ["start", "Quick start", `
<ol><li>Add the <b>“H3ZeroStudio · Timeline”</b> node (category <code>MiniMax H3/H3ZeroStudio</code>).</li>
<li>Connect the <code>model</code> (H3, turbo LoRA optional), <code>clip</code> and <code>vae</code> inputs, and <code>audio_vae</code> for sound. Without <code>audio_vae</code> only video is generated. The <code>audio</code> input is optional: you can also upload your own sound as an asset.</li>
<li>Click <b>“Expand”</b> on the node (or double-click it): the editor opens full-window.</li>
<li>In the segment card on the right, write the <b>segment prompt</b>. In the “Video” card below it, write the <b>global prompt</b> (style, characters, world).</li>
<li>In the “Assets” tab on the left, drop in pictures of characters and locations, then drag them onto a clip or into the card's “References”.</li>
<li>Click <b>“Generate”</b> (${K("Ctrl+Enter")}). The run joins the ComfyUI queue; progress shows in the header and on the clip.</li>
<li>Add the next segment (${K("E")} or “+ Segment”): by default it <b>continues</b> the previous one. “Generate” again: the finished first segment comes from the cache.</li>
<li>When the video is assembled, click <b>“Save video”</b>.</li></ol>
<p>Collapse the editor with ${K("Esc")} or the button in the top-right corner.</p>`],
  ["header", "Header", `
<ul><li><b>Project name</b>: the field on the left, rename it any time.</li>
<li><b>Chips</b>: number of segments, length and frames, resolution, total steps, estimated time. ${"<b>⚠ N</b>"} lists pre-run warnings (outside the 124–362 frame range, empty prompts, markers with no effect); click it to see them.</li>
<li><b>Undo / Redo</b> (${K("Ctrl+Z")} / ${K("Ctrl+Shift+Z")}).</li>
<li><b>Save video</b>: the mp4 export dialog.</li>
<li><b>↑ Final from drafts</b>: appears when drafts exist; makes finals of all drafted segments or only the selected one.</li>
<li><b>↑ Upscale</b>: upscale the whole video (right-click for another method or size).</li>
<li><b>Generate</b>: queue a run. The badge on the button shows the mode, e.g. “final ↑” in “2 stages” mode.</li>
<li>While generating, the buttons are replaced by a <b>progress bar</b> with status and a <b>“Stop”</b> button.</li></ul>`],
  ["left", "Left tabs", `
<ul><li><b>Assets</b>: your files — pictures (characters, locations, other), audio and video. Upload by dropping, with the button or ${K("Ctrl+V")} (picture from the clipboard). Double-click opens the asset editor, right-click opens the menu.</li>
<li><b>Gallery</b>: every generation result; versions of one video are grouped into stacks.</li>
<li><b>Projects</b>: saved projects, new project, zip import and export.</li>
<li><b>Settings</b>: rarely changed parameters — stages, sampling, upscale, sound, cache, preview, models, interface language.</li>
<li><b>Keys</b>: keyboard shortcuts.</li>
<li><b>Help</b>: this page. <b>Info</b>: a short note on how generation works.</li></ul>
<p>Drag the dividers to resize the left and right panels and the timeline. Double-click a divider to reset it.</p>`],
  ["right", "Right panel", `
<p>Things you change often.</p>
<ul><li><b>Segment card</b>:
<ul><li>name and color;</li>
<li>link to the previous one (“Continuation” / “New scene”);</li>
<li>duration (H3 grid of 17k+5 frames);</li>
<li>segment prompt, references;</li>
<li>“Final prompt”: what actually goes to the model;</li>
<li>“Segment overrides”: seed, steps, cfg and more for this segment only;</li>
<li>takes and action buttons.</li></ul></li>
<li><b>Video</b>: global prompt, negative (works with cfg &gt; 1), resolution (aspect ratio + megapixels, or your own W×H in multiples of 32), seed. The summary line at the bottom opens “Settings”.</li>
<li>When a marker or an audio clip is selected, its card appears at the top.</li></ul>`],
  ["timeline", "Timeline and tracks", `
<ul><li><b>Video</b>: segment clips. Drag to reorder, drag the right edge to change length (in H3 grid steps). The seam between two clips can be dragged: one gets longer, its neighbour shorter; with ${K("Shift")} all following clips move.</li>
<li>Toolbar above the tracks:
<ul><li>“+ Segment”;</li>
<li>“Split” at the playhead (${K("S")}), duplicate (${K("D")}), delete (${K("Del")});</li>
<li>“Marker” (${K("M")});</li>
<li>“✂ Span” (${K("R")}): select and regenerate part of the video, see “✂ Span: regenerate part of the video”;</li>
<li>“Video length” and zoom: slider, ${K("+")} ${K("−")}, ${K("Ctrl")}+wheel, “fit the whole video”.</li></ul></li>
<li>Clips show frame thumbnails, the hatched overlap “⟷ N”, “ready / changed” tags and a takes badge. On hover: “Generate”, “Another take”, “↑ Final”, “↑”. Right-click opens a menu with every action.</li>
<li><b>Audio</b> (two tracks) and <b>Music</b>: see “Sound: audio track and music”.</li>
<li>While you drag the end flag, the playhead, a marker, an edge or a seam, the timeline stays put and the item follows the cursor. The view scrolls smoothly only at the very edge.</li></ul>`],
  ["markers", "Markers and video length", `
<ul><li><b>Marker</b> (${K("M")}): a flag on the ruler. Drag it; it has a name and a color. Effects:
<ul><li><b>✎ Note</b>: just for you;</li>
<li><b>✦ Event</b>: the text goes into the segment prompt as “At 2.5s: …”;</li>
<li><b>★ Character</b>: strengthens the likeness of the chosen character through the prompt (H3 has no reference strength).</li></ul></li>
<li><b>End marker</b>: the red “end” flag. Everything after it is dimmed and not generated.
<ul><li><b>Auto</b>: the end always sits at the end of the last clip.</li>
<li><b>Fixed</b>: the marker stays where it is. If you delete or shorten clips, an empty area remains before it (“Extend” fills it).</li>
<li>Type the length into “Video length … s” or drag the flag (${K("Shift")} snaps to seconds).</li></ul></li></ul>`],
  ["prompts", "Segments and prompts", `
<ul><li>The <b>global prompt</b> (“Video” card) is placed at the start of <i>every</i> segment's prompt. Put style, characters and world there.</li>
<li>The <b>segment prompt</b> is what happens in this piece: action, camera, lines.</li>
<li>“Final prompt” in the segment card shows the combined text with <code>&lt;Picture N&gt;</code> numbers, the continuation phrase and marker events.</li>
<li>Keep segments within H3's training range: 5–15 s (124–362 frames). Split a long scene into several continuations.</li>
<li>“Segment overrides” change seed, steps, cfg and more for one segment only.</li></ul>`],
  ["presets", "📦 Model presets and LoRA", `
<ul><li>A preset = base model (diffusion model + dtype, or a checkpoint), text encoder, video VAE, audio VAE and an ordered LoRA list (on/off, model and encoder strength). The library is shared by all projects. Everything is in the <b>“Models”</b> tab on the left (next to “Projects”): the preset bar on top (project preset, the one being edited, new / save as / duplicate / delete / export / import / refresh lists), the LoRA stack on the left, base model, encoder and VAE on the right.</li>
<li><b>LoRA stack.</b> “＋ Add LoRA” opens a picker with search and the models/loras folders (folders with file counts and ›, “All” and the path on top; searching all folders shows each file's folder; ↑↓ Enter, Esc). Each row: name (click to change), strength with ▲▼ (mouse wheel in the field steps 0.05), ⓘ for the path and a separate encoder strength, an on/off switch (a disabled LoRA stays listed and is not in the cache key), ✕ to remove, ⋮⋮ to drag. The master switch on top toggles all, next to “N / M on”.</li>
<li>Pick the project preset in the “Models” tab or in the “Video” card; a clip's card has “Clip model preset” (default “as project”; your own applies to that clip only). Without a preset the node works as before, from its wires. A wired model / clip / vae / audio_vae input wins over the preset's file; the preset's LoRAs go on top of any base.</li>
<li>Models are cached between runs: changing only LoRAs doesn't reload the base; an unneeded base is unloaded before the next one loads.</li>
<li>LoRA files and strengths are part of the cache key only with a preset, so older clips without a preset stay ready. If the preset changes, the clip becomes “changed”. “↺ Restore” shows e.g. “LoRA x 0.8 → 0.5” and brings back the old values (the preset is shared, so the library changes too). The console logs the reason: <code>[H3ZS] cache miss: … reason: …</code> (the log is in Russian).</li></ul>`],
  ["seams", "〰 Seam quality, brightness at joints, clicks, VRAM reserve", `
<ul>
<li><b>Seam score.</b> After generation every “⟶ Continuation” joint is measured: the picture jump at the seam divided by the normal frame-to-frame motion next to it. Below 1.2 the <b>seam is invisible</b> (green dot on the timeline), up to 1.8 a <b>slight jump</b> (yellow), above that a <b>hard seam</b> (red). Sound: the loudness jump at the joint in dB. The score shows in the clip card, on the dot above the joint (hover for details) and in the gallery. If a seam is visible, try “Another take”: a new seed usually gives a smoother joint.</li>
<li><b>Clicks at cuts.</b> Where sound is cut hard (new scene, footage, export and trim edges), it fades over ~5 ms on each side: no click, and a 10 ms dip is inaudible. “Settings” → “Continuation and sound” → “Remove clicks at cuts”.</li>
<li><b>Brightness and color matching.</b> At “⟶ Continuation” joints the brightness, contrast and color of both sides are blended toward a shared average: strongest at the seam, fading out over the “transition window” (12 frames each side by default). Only the finished picture is adjusted (whole video and export); latents, cache and takes don't change, nothing is regenerated. The shift is capped at ±20/255: a real lighting change is softened, not erased. The seam score shows “after” and, in brackets, “without matching”. “Settings” → “Picture at joints”.</li>
<li><b>Gaps and “🧲 Magnet”.</b> The “🧲 Magnet” button above the timeline (off by default, remembered in settings). Magnet off: just drag a clip and it (and everything after it) moves, leaving a gap; within 10 px of the previous clip it snaps; drag it over the previous clip to swap order. Magnet on: clips stick together and dragging reorders them. Alt (or Ctrl) while dragging toggles the mode temporarily. A gap is black frames and silence, followed by a new scene; it survives clip deletion, reloads and saves. On the gap itself: <b>“✂ Fill”</b> (bridge or prologue, the span card opens right away) and <b>✕</b> (remove). Once generated, the gap shows as a clip: take frames, “✂ Bridge / Prologue”, seams; click for the card, right-click for “↻ Regenerate” and “✕ Remove fill”; an outdated take is dimmed with ↺; click it to select (Del removes it); the length can also be set in the clip card.</li>
<li><b>Bridges.</b> A ✂ span may cross a cut or a gap: the tail of the scene before and the start of the next become context, and the middle is regenerated (a bridge). Before the first clip it's a prologue (following context only), after the last one a continuation (preceding context only). Edges follow the 17-frame grid, sound is stitched sample-accurately, the result is cached together with the gaps. Idea from obvpm-timeline (GPL-3.0), own code.</li>
<li><b>Color.</b> All MP4s are written in BT.709 (TV range) with explicit tags, so colors match in the browser, players and editors.</li>
<li><b>VRAM reserve.</b> “Settings” → “⚙ Generation” → “Components and VRAM” → “VRAM reserve during generation”: how much video memory ComfyUI keeps free while generating (the standard <code>--reserve-vram</code>; a larger reserve set at launch is never lowered). If steps suddenly run several times slower with a browser open or screen recording, raise it to 2–3 GB.</li>
</ul>`],
  ["prompted", "✎ Prompt editor", `
<ul><li>Every prompt field has an <b>✎ Edit</b> button: segment prompt, global prompt, negative, ✂ span prompt, marker event, the continuation phrase in “Settings”. It opens a large editor window.</li>
<li><b>@ links a reference.</b> Type ${"<code>@</code>"}: a list of this prompt's references with thumbnails appears (pictures ${"<code>&lt;Picture N&gt;</code>"}, video ${"<code>&lt;Video N&gt;</code>"}, audio ${"<code>&lt;Audio N&gt;</code>"}, the continuation frame). Keep typing part of a name or number to filter; ↑/↓ and Enter or Tab insert the tag. The same references sit above the text as chips: click to insert the tag at the cursor.</li>
<li>Tags are highlighted. A <span style="color:var(--err)">red wave</span> means no such reference (or ${"<code>&lt;Image N&gt;</code>"} was written; H3 expects ${"<code>&lt;Picture N&gt;</code>"}). Yellow means the tag is missing in some segments (for the global prompt) or exceeds H3's limit.</li>
<li>For the global prompt and the negative the list covers all segments: ${"<code>&lt;Picture 1&gt;</code>"} differs per segment, and you can see who it is in which segment.</li>
<li><b>Editing:</b> undo/redo (${K("Ctrl")}+${K("Z")} / ${K("Ctrl")}+${K("Y")}, text only, not the project), find ${K("Ctrl")}+${K("F")}, replace ${K("Ctrl")}+${K("H")}, word wrap, line numbers, monospace font, font size (${K("Ctrl")}+${K("=")} / ${K("Ctrl")}+${K("−")}), auto-indent, multiple cursors (${K("Alt")}+click), copy / paste / clear. At the bottom: words, characters, approximate tokens and cursor position.</li>
<li>${K("Ctrl")}+${K("Enter")} applies, ${K("Esc")} cancels (asks if the text changed). Applying is one studio undo step.</li>
<li><b>H3 structure</b> (right-hand panel): recommended sections ${"<code>subject_definitions</code>"} (who is who), ${"<code>summary</code>"} ([task type] + a paragraph), ${"<code>retention_analysis</code>"} (what to keep: fully_preserved…), ${"<code>detailed_description</code>"} (frame-by-frame description, 350–500 words), ${"<code>overall_soundscape</code>"} (ambient sound), ${"<code>non_diegetic_music</code>"} (score, or N/A). Each has a hint, a status and quick inserts; the description has a live word count. “⊕ Insert template” inserts the skeleton (reference tags fill in automatically, existing text moves to detailed_description); “⇣ Tags → subject_definitions” adds lines for new references.</li></ul>`],
  ["refs", "References", `
<ul><li><b>Pictures</b>: up to 9 per segment, including the continuation frame. The order is always “characters → locations → other”, and <code>&lt;Picture N&gt;</code> numbers are assigned automatically. Refer to them in the prompt.</li>
<li><b>Video</b>: up to 3 per segment (<code>&lt;Video N&gt;</code>): drag a video asset onto a clip or into the card.</li>
<li><b>Audio references</b>: up to 3 per segment (<code>&lt;Audio N&gt;</code>). This is only a <b>hint</b> for the model: sound is still generated anew. To get exactly your sound, put the file on the “Audio” track.</li>
<li>References downscaled in the asset editor speed up generation. Reference size (match / max 2048) is set in “Settings” → “Continuation and sound”.</li></ul>`],
  ["chars", "◈ Characters (cards)", `
<ul><li>A <b>card</b> is a pre-encoded reference: a character, location, outfit, style, motion or voice. The RefMod file (.safetensors) is stored in <code>output/h3zerostudio/_characters</code> with a preview; ready RefMod files from <code>models/refmods</code> are listed too (read-only). The library is shared by all projects: deleting a project, “Clean up unused”, duplicating, zip and moving a project don't touch it — the project stores only the card's id and signature.</li>
<li><b>“+ Create”</b> in the “Characters” tab: name, folder, type; <b>photos</b> from assets or straight from disk (📁, drop files from your file manager, Ctrl+V; such files sit temporarily in the library's shared folder and are deleted after the card is created or after a day; they don't enter the project or “Assets”) (order ← →, ✂ crop — the first photo sets the aspect ratio, the rest are cropped to it), an optional <b>clip</b> (a video asset or a finished segment; 1–4 frames or 5, 22, 39… — the 17-frame rule) and a <b>voice</b> (trim, ≈80 tokens per second). <b>Full</b> keeps all latent tokens, <b>Compressed</b> squeezes the latent to a grid (cheaper). At the bottom: how many tokens the card will take. A VAE is needed: the one wired into the studio node (loaded right away, no run needed), otherwise from the project's model preset or the last run. <b>✎ Edit</b> renames the card's files; the old name stays as an alias, so projects using the card still find it and finished clips don't go out of date.</li>
<li><b>Description</b> (in English): subject name (one word), appearance, what to keep, voice — stored in the card's metadata.</li>
<li><b>Apply</b>: click a card to add it to the selected clip or ✂ span, or drag it onto a clip / into the clip card's “Characters” block. The card goes in whole after the regular references: its <code>&lt;Picture N&gt;</code> / <code>&lt;Video N&gt;</code> / <code>&lt;Audio N&gt;</code> tags continue the numbering. Click a chip to insert its tag into the prompt; if the prompt doesn't mention the card, a line based on the card type is added to the final prompt.</li>
<li><b>Weight</b>: ×2–×4 feeds the card 2–4 times (stronger), 0.25–0.75 a weakened copy. ● turns it on/off without removing; 👁 / 🎙 — appearance only or voice only. Cards are part of the cache key, takes and “↺ Restore”.</li>
<li>Right-click a card in the library to edit name / folder / description (no re-encoding) or delete it.</li>
<li><b>In the prompt editor</b> (✎): card tags are in the @ list and the chips. <b>“◈ Draft from characters”</b> fills subject_definitions and retention_analysis: <code>&lt;Subject N&gt; Name — tags: role. appearance; keep …; voice: …</code> (with no structure yet it inserts the whole template, existing text moves to detailed_description). <b>!Name</b> opens the character list; on “Apply” each <code>!Name</code> becomes <code>&lt;Subject N&gt; Name</code>. The <b>🎙 Name</b> buttons insert a line <code>&lt;Subject N&gt; Name says: &lt;d&gt;[English] …&lt;/d&gt;</code>.</li>
<li>The status line warns about cards whose tags the prompt doesn't mention (an auto line is added), unknown <code>&lt;Subject N&gt;</code> and <code>!Name</code>, disabled cards the prompt names, and voices in a ✂ span (not fed).</li></ul>`],
  ["audio", "Sound: audio track and music", `
<ul><li>The <b>“Audio” track</b> (🔒, two lanes) is a <b>hard lock</b>. Under a clip, your sound is pinned in the latent at every step and the video adapts to it (rhythm, lip sync). Add as many clips as you like; move, trim, split (${K("S")} with an audio clip selected) and delete them.</li>
<li>The <b>“Music” track</b> is <b>layered over</b> the video's finished sound and takes no part in generation. The video sound's volume under the music is set in the audio clip card. The mix applies in the player and in “Save video”.</li>
<li>Audio in <b>references</b> is only a hint (see “References”).</li>
<li>With no clips on the track, H3 generates the sound itself. At continuation joints the sound carries on (settings: “Continuation and sound”).</li></ul>`],
  ["extend", "Continuation and overlap", `
<ul><li><b>Continuation</b>: the tail of the previous segment (the <b>overlap</b> frames) is copied to the start of the new one and pinned, and the last frame is added as a reference. The new segment carries on the motion, light and sound.</li>
<li><b>New scene</b>: a hard cut with no continuation.</li>
<li>Overlap follows the H3 grid: 22, 39, 56 … frames. The default is set in “Settings” → “Continuation and sound”; for a single joint use the segment card or right-click → “Overlap”. More overlap gives a smoother transition but a longer generation.</li>
<li>“Sound: previous segment's context”: how many seconds of the previous sound the continuation hears.</li></ul>`],
  ["stages", "1 stage or 2 stages", `
<p>Choose in “Settings” → “Generation”.</p>
<ul><li><b>1 stage</b>: “Generate” makes each segment at full size right away.</li>
<li><b>2 stages</b>: each segment is first made as a quick <b>draft</b> (smaller, set in MP), then immediately as a <b>final</b>: the draft is upscaled and refined by a short H3 pass. The draft's composition, motion and sound are kept.</li>
<li>“Main pass”, “Stage 1 · Draft” and “Stage 2 · Final” each have their own steps, cfg, sampler and scheduler. An empty field means “as in the main pass”. The draft has a size; the final has a refine strength σ (0.4 recommended) and an upscale method.</li></ul>`],
  ["perclip", "✎ Draft, ✦ Final and ↑ Final", `
<ul><li><b>✎ Draft</b> and <b>✦ Final</b> in the segment card and the clip menu run one stage <i>for this clip only</i> with that stage's parameters from “Settings”. The project mode doesn't change.</li>
<li>What <b>✦ Final</b> does:
<ul><li>in “2 stages” mode it makes the final from the clip's draft (creating the draft if there is none);</li>
<li>in “1 stage” mode it generates full size right away.</li></ul></li>
<li><b>↑ Final</b> on a clip, “↑ Final from draft” in the card and menu, and <b>“↑ Final from drafts”</b> in the header make the final from exactly the selected draft take.</li>
<li>If the segment is already done, clicking again does nothing. For a new variant, click “Another take”.</li></ul>`],
  ["upscale", "↑ Upscale", `
<ul><li><b>↑ Upscale in the header</b>: the whole video. Each segment is upscaled in its own window and refined by a short H3 pass; the sound stays 1:1. Finished parts come from the cache and an interrupted run resumes. Right-click for a different method or size this time.</li>
<li><b>↑ Upscale segment</b> (the ↑ button on a clip, the clip menu, the card): this clip only. The result is a new take; the old one can be restored.</li>
<li><b>Footage “as is”</b> is upscaled too: its frames are VAE-encoded and go through the chosen method + refine (fine details may change slightly); with <b>RTX VSR</b> the file's frames are upscaled directly, without VAE or refine. The sound is untouched.</li>
<li><b>↑ Upscale span</b> (right-click a ✂ bridge / prologue / span, or the span card): the span take is upscaled in its own window + refine, with the same method and profile; the result is cached with the take, and both seams are re-matched after upscaling. “↑ Upscale” in the header covers clips, footage and applied spans.</li>
<li><b>Each method has its own profile</b>: size, refine σ and steps, sampler, RTX quality, tiles and time chunks (on/off, length, overlap). Switching the method only shows its profile and resets nothing. The upscale menus in the header and on clips use the selected method's profile. By default chunks are on for latent and RTX, off for tiles.</li>
<li>Methods (choose in “Settings” → “Upscale”):
<ul><li><b>Latent + refine</b>: H3's trained latent upscaler, the default — fast, no decode/encode.</li>
<li><b>RTX VSR → refine</b>: frame-by-frame NVIDIA RTX Video Super Resolution, “quality” preset. Also the fallback when the upscaler model is missing.</li>
<li><b>Tiles (SyncTile)</b>: after upscaling, refine with synchronized tiles; each sees the segment's prompt and references. Set tile size and overlap; the resulting grid (e.g. 3×3) is shown right away. Default refine strength is <b>σ 0.60</b> (recommended): lower values hardly affect the picture, 0.60 keeps consistency very well and barely changes details; the list goes up to σ 1.00.</li></ul></li>
<li><b>Size</b> is in megapixels: presets 1.0–4.0 MP or a “custom size”. The resulting W×H is shown next to it (project aspect ratio, multiples of 32). The same choice is in the header's and clip's “↑ Upscale” menus (method ▸ size). Old ×1.5 / ×2 values were converted to MP with the same size; finished upscales stayed cached.</li>
<li><b>Time chunks</b> keep VRAM in check (e.g. 12 GB): a long clip is upscaled in chunks of ≈ N seconds (5 s = 124 frames by default, snapped to the H3 grid) with overlap (22 frames by default). Chunks run one by one, each with its own upscale and refine (tiles work inside a chunk); memory is freed between chunks. Each chunk continues the clean tail of the previous one, as in a continuation; frames blend smoothly at the joint. The number of chunks is automatic (“whole clip in one chunk” turns it off). Status and console show chunk i/N, step, tile and percent.</li>
<li>If neither the upscaler nor RTX VSR is available, the run stops with a clear error (see “Models”).</li></ul>`],
  ["live", "Live preview and progress", `
<ul><li>While generating, the player shows the predicted frame of each step. With <b>taeh3</b> in <code>models/vae_approx</code> the preview is full resolution; without it, rough latent→RGB colors.</li>
<li>Under the player, “Sampling dynamics”: σ and Δ per step and step time.</li>
<li>The header shows status: segment, stage, step, ETA. When upscaling: window, step, tile, % and ETA; the current tile is outlined over the player.</li>
<li>A detailed <code>[H3ZS]</code> log in the ComfyUI console is enabled in “Settings” → “Live preview and log”.</li>
<li>Playback never starts by itself — only with Play or ${K("Space")}.</li></ul>`],
  ["takes", "Takes and “Another take”", `
<ul><li>Every generation of a segment is saved as a take, up to 12 per segment. Pick one by its thumbnail in the card (“Takes”), by the badge on the clip, or in the clip menu.</li>
<li>The selected take goes into the video and is what the next segment continues. Switching it marks the following segments “changed”; switching back clears the mark.</li>
<li><b>Generate</b> (on the clip and in the card): this segment only, if it changed. <b>Another take</b>: this segment with a new seed; earlier takes stay.</li>
<li><b>🔒 Lock</b>: the take is never regenerated and survives “Clear cache”. <b>🔓 Unlock</b> undoes it.</li></ul>`],
  ["region", "✂ Span: regenerate part of the video", `
<p>Don't like a piece <b>in the middle</b> of a segment, at the joint of two, or across a cut or gap? Regenerate just that piece. Video and sound <b>before</b> and <b>after</b> stay as they are and serve H3 as context, so the new piece continues what came before and leads into what follows. Works for generated clips and footage alike.</p>
<ol><li>Click <b>“✂ Span”</b> on the toolbar above the timeline (${K("R")}). The button lights up and the cursor becomes a crosshair.</li>
<li>Drag along the video track from the start to the end of the piece. A simple click selects ≈1.4 s around the point.</li>
<li>A pink frame appears (what gets regenerated) with blue hatching on both sides (context before and after, unchanged). Drag the frame's edges, or the “✂ N” label to move the whole span.</li>
<li>In the card above the timeline: <b>span prompt</b> (prefilled with the segment prompt; the global prompt is added), references (pick or drop an asset onto the card), <b>seed</b>, <b>context before / after</b>.</li>
<li><b>“↻ Regenerate”</b> runs it. Finished segments come from the cache; only the span window is sampled. Progress and live preview work as for segments.</li>
<li>${K("Esc")} or clicking the button again leaves the mode. Outside the mode the timeline works as usual.</li></ol>
<ul><li><b>Takes</b>: every result is a span take. The card's “Original / 1 / 2…” lets you compare or switch back. “↻ Regenerate” with the same settings uses a new seed. If the segments under the span change later, the take is marked “outdated” and stays out of the video.</li>
<li><b>H3 grid</b>: the model slices time in blocks of 17 frames (≈0.71 s). Span edges snap to the nearest block boundaries, and the card shows exactly what is regenerated. Generation window = context before + span + context after, always 17·k+5 frames.</li>
<li><b>Context</b>: “as in settings” = the continuation overlap. Before: 17·N frames, after: 17·N+5. More context gives a smoother transition but a longer generation.</li>
<li><b>Seam</b>: video is replaced frame for frame. Sound is spliced sample-accurately: the offset is found by correlation over the context zones, levels are matched, and short crossfades are placed at the quietest points.</li>
<li><b>2 stages</b>: the window is drafted first, then upscaled and refined at final size. The draft sound is kept.</li>
<li><b>Bridge, prologue, continuation</b>: a selection may cross a cut or a gap — that's a <b>bridge</b> (purple frame): the tail of the scene before and the start of the next are context, and the middle is generated over the joined video. Starting in a gap before a scene makes a <b>prologue</b> (following context only); ending past a scene's edge in a gap makes a <b>continuation</b> (preceding context only). In “2 stages” mode a bridge is made in one final pass. You can't go past the end of the timeline — add a gap or a segment.</li>
<li><b>Both seams</b>: after generation, brightness and color are matched at the span's start and end (as at continuation joints, if enabled) and each seam gets a score — colored dots on the frame and a “Seams” line in the card (with the pre-matching value and the sound jump).</li>
<li><b>↺ Restore</b>: if the selected take went out of date because you changed the span's edges, context, prompt, references or seed, the button in “Span takes” brings them back and the take applies again.</li>
<li>Another way: right-click a clip → “↻ Regenerate span…”.</li></ul>
<p class="h3z-note">The idea of a time mask for H3 comes from open projects: ComfyUI (native H3 temporal inpaint, GPL-3.0), panghea/ComfyUI-MiniMax-H3-Inpaint-Tools (GPL-3.0), filliptm/ComfyUI-FL-MiniMaxH3 “Temporal Reshot” (Apache-2.0), red-polo/ComfyUI-MiniMaxH3FrameInfill (GPL-3.0). No code was copied.</p>`],
  ["player", "“Whole video” and “Previous result”", `
<ul><li><b>Whole video</b> is always the <i>current</i> timeline. If the final file matches the timeline exactly, that file plays. Otherwise the video is assembled on the fly from finished takes, footage and placeholders for ungenerated segments (plus the audio and music tracks).</li>
<li><b>Segment N</b>: only the selected segment.</li>
<li>⛶ / ${K("F")}: full-screen player; the magnifier or a double-click on the frame opens the “Viewer” (zoom, frame by frame, speed, loop).</li>
<li><b>Previous result</b> (yellow dot): the last assembled file that no longer matches the timeline. It opens only in this tab and disappears once any of its segments is gone.</li></ul>`],
  ["viewer", "Full screen and the “Viewer”", `
<ul><li>The ⛶ button under the player (or ${K("F")}) makes the player full screen. ${K("Esc")} exits.</li>
<li>The <b>Viewer</b>: the magnifier button next to ⛶ or a double-click on the frame; also from a clip's right-click menu and from the Gallery. It shows whatever is in the player: the live “Whole video” assembly (frame stepping then follows the timeline), a single clip, a take or a file. Video doesn't start by itself.</li>
<li>Zoom: “Fit”, ${K("×1")} (pixel for pixel), ${K("×2")}, ${K("×4")}; the mouse wheel zooms smoothly at the cursor, double-click toggles fit / ×2. Drag the frame to pan. ${K("▦")}: crisp pixels without smoothing.</li>
<li>A scrub bar with timecode (m:ss:frame) and frame number. Speed 0.25× / 0.5× / 1× / 2×, volume, loop: ${K("I")} in, ${K("O")} out, ${K("L")} on/off.</li>
<li>Keys: ${K("Space")} play/pause; ${K("←")} ${K("→")} or ${K(",")} ${K(".")} frame back/forward, with ${K("Shift")} by 1 s; ${K("Home")} / ${K("End")}; ${K("0")} ${K("1")} ${K("2")} ${K("4")} zoom; ${K("M")} sound; ${K("F")} full-screen window; ${K("Esc")} close. After closing, the editor is as it was and the playhead sits on the last frame viewed in the assembly.</li></ul>`],
  ["assetedit", "Asset editor", `
<p>Double-click an asset or choose “✎ View / edit…” in its menu. Edits are non-destructive: a copy is created, and “↺ Reset” brings back the original file.</p>
<ul><li><b>Picture</b>: crop (free or by aspect ratio, including “as project”), rotate, mirror, downscale.</li>
<li><b>Audio</b>: trim on the waveform, volume and normalization, fades.</li>
<li><b>Video</b>: trim in time, downscale, crop, rotate, mirror, “🖼 Grab frame” and “♪ Grab sound” (new assets).</li></ul>`],
  ["footage", "Video as footage", `
<ul><li>Drop a video asset onto an <b>empty part of the video track</b> to make a footage clip. The next segment continues it.</li>
<li>Footage mode in the card: <b>as is</b> (the file's frames unchanged) or <b>↻ Regenerate</b> — H3 redraws the piece from the prompt, keeping motion and composition (strength = denoise).</li>
<li>Video dropped <b>onto a segment</b> becomes a <code>&lt;Video N&gt;</code> reference.</li></ul>`],
  ["export", "Save video", `
<ul><li><b>“Save video”</b> in the header: the whole video, a fragment (from – to; the “⌖ playhead” button fills in the current time) or a single segment.</li>
<li>Any folder on the ComfyUI machine (default <code>ComfyUI/output/h3zerostudio/export</code>). The file is mp4 H.264 + AAC; an existing file is never overwritten (_2, _3… is appended).</li>
<li>If there is music, turn on “Mix”: the music and the video sound's volume go into the file.</li>
<li>The whole video and fragments are saved only when the result is ready and matches the timeline; otherwise “Generate” first. A single segment is saved from its finished take. A fragment of one segment is also in the clip menu: “💾 Save fragment”.</li></ul>`],
  ["projects", "Projects and autosave", `
<ul><li>The project is stored in the workflow (save the workflow in ComfyUI as usual) and is automatically copied to <code>output/h3zerostudio/_projects</code> — the <b>“Projects”</b> tab.</li>
<li>At the top of the tab is the current project: name, “Save”, “Duplicate”, “Export zip”. Below are all projects: click to open; “⋯” or right-click for “Open”, “Duplicate”, “Rename…”, “Export zip…”, “Delete…”.</li>
<li><b>“+ New”</b> starts an empty project (the current one is saved). <b>“Import”</b> loads a zip project together with its assets.</li></ul>`],
  ["gallery", "Gallery", `
<ul><li>All results: takes, drafts, finals, upscales, locked segments and assembled videos — of <b>this project</b> or <b>all projects</b>.</li>
<li>Search by prompt, name and seed, filters by type (including “✂ Spans”) and ★ favorites. Cards have a fixed size; if they don't fit, the list scrolls, and the scroll position survives refreshes.</li>
<li><b>Stacks.</b> Versions of one video are grouped into one card: draft, final ↑, upscales with different methods and sizes, redone takes and regenerated spans of a segment; the project's assembled videos form one stack too. The cover shows the most finished version (upscale → final → take → span → draft; the newest among equals), a “▣ N” badge and stage chips. Click to open a stack like a folder: all versions with captions (stage, method, resolution and MP, seed, date); “← Gallery” goes back. Versions are linked by segment and origin (upscale → its final → its draft); older files without this data are linked by project takes and segment number, otherwise the card stays separate. The “☰ List” switch shows everything without stacks.</li>
<li>Double-click to watch. ${K("Ctrl")}+click two cards → “⇄ Compare selected”: A/B side by side with synced playback and a choice of sound. The selection survives moving between stacks, so you can compare versions from different stacks. If side A or B belongs to a stack, a list under it switches to another version of that stack without closing the comparison.</li>
<li><b>Zoom in A/B:</b> ${K("×1")} ${K("×2")} ${K("×4")} buttons (plus the mouse wheel at the cursor and double-click). The window doesn't grow — only the frame inside it is magnified. A and B zoom and pan together: drag to inspect a spot. ${K("▦")}: pixels without smoothing.</li>
<li>Right-click a card: (on a stack) “▣ Open stack”, “⇄ Compare the two latest versions”; “▶ Watch”, “⇄ Compare with selected”, select the take on the timeline, “To timeline (footage)”, into the segment's references, “↑ Upscale segment”, “↑ Final from draft”, “💾 Save to folder…”, favorite, “Delete…”.</li></ul>`],
  ["settings", "Settings: for all projects or per project", `
<ul><li><b>For all projects</b>: changes are saved globally (<code>output/h3zerostudio/_settings.json</code>). Such projects pick them up every time they open; new projects work this way.</li>
<li><b>This project only</b>: the project keeps its own settings. Projects from earlier versions open this way so their finished clips don't become “changed”. “Make global” writes the project's settings as the shared ones.</li>
<li>Sections: Generation, Stage 1 · Draft, Stage 2 · Final, Upscale, Continuation and sound, Cache (including “Clear project cache”), Live preview and log, Models.</li>
<li><b>🌐 Interface language</b> (top of “Settings”): Auto (as in ComfyUI), Русский or English. It applies to all projects and takes effect after a page reload.</li></ul>`],
  ["keys", "Keyboard shortcuts", `
<table class="h3z-hkeys">
<tr><td>${K("Space")}</td><td>play / pause</td></tr>
<tr><td>${K("F")}</td><td>full-screen player (in the “Viewer”: full-screen window)</td></tr>
<tr><td>${K("S")} / ${K("D")} / ${K("E")}</td><td>split at the playhead (with an audio clip selected — split it) / duplicate / extend</td></tr>
<tr><td>${K("Del")}, ${K("Backspace")}</td><td>delete the segment (or the selected audio clip)</td></tr>
<tr><td>${K("M")}</td><td>marker at the playhead</td></tr>
<tr><td>${K("R")}</td><td>“✂ Span”: select part of the video to regenerate (Esc exits)</td></tr>
<tr><td>${K("←")} ${K("→")}, ${K("Shift")}</td><td>frame back / forward, with Shift by 1 s</td></tr>
<tr><td>${K("Home")} / ${K("End")}</td><td>to start / to end</td></tr>
<tr><td>${K("[")} / ${K("]")}</td><td>previous / next segment</td></tr>
<tr><td>${K("+")} ${K("−")}, ${K("Ctrl")}+wheel</td><td>timeline zoom</td></tr>
<tr><td>${K("Ctrl+Z")} / ${K("Ctrl+Shift+Z")}, ${K("Ctrl+Y")}</td><td>undo / redo</td></tr>
<tr><td>${K("Ctrl+Enter")}</td><td>generate</td></tr>
<tr><td>${K("Ctrl+V")}</td><td>paste a picture into assets</td></tr>
<tr><td>${K("Esc")}</td><td>close a menu / leave “✂ Span” / clear the selection / collapse the editor</td></tr></table>
<p>While the editor is open, ComfyUI's own shortcuts (including its Ctrl+Z) are off.</p>`],
  ["models", "Required models and where they go", `
<ul><li><b>MiniMax H3</b>: model, text encoder and VAE — as in a regular H3 workflow, connected to the <code>model</code>, <code>clip</code>, <code>vae</code> inputs. Needs a ComfyUI with native H3 support.</li>
<li><b>Audio VAE</b> (<code>minimax_h3_audio_vae</code>) → the <code>audio_vae</code> input: no sound without it.</li>
<li><b>taeh3.safetensors</b> → <code>models/vae_approx</code>: full-resolution live preview (optional).</li>
<li><b>Trained latent upscaler</b>: the <code>MinimaxH3LatentUpscaler3D</code> node and the <code>minimax_h3_latent_upscaler_3d_bf16.safetensors</code> model → <code>models/latent_upscale_models</code> (folders from <code>extra_model_paths.yaml</code> work too).</li>
<li><b>RTX VSR</b>: the <code>nvidia-vfx</code> Python package and an NVIDIA RTX GPU.</li></ul>
<p>What was found and what is missing is shown in “Settings” → “Models”, along with the folder paths. After installing a model or node, restart ComfyUI.</p>`],
  ["faq", "Questions and problems", `
<dl>
<dt>I updated H3ZeroStudio — restart or Ctrl+F5?</dt>
<dd>If only interface files changed (<code>web/js</code>), reloading the page with ${K("Ctrl+F5")} is enough. If <code>.py</code> files changed, or you installed a new node or model, restart ComfyUI, then ${K("Ctrl+F5")}.</dd>
<dt>Segment 2 has grayed-out ✎ Draft / ✦ Final / “Generate”</dt>
<dd>It is a continuation and needs the tail of segment 1. Generate segment 1 first (or pick a finished take of it), or switch segment 2 to “New scene”. The button's tooltip explains why. The buttons are also disabled during generation and past the end marker.</dd>
<dt>Why is a clip marked “changed”?</dt>
<dd>Its finished take was made under different conditions: the prompt, references, length, seed, stage parameters or settings changed, or a different take of the previous segment was selected. Following continuation segments become “changed” too. Click “Generate” and only what changed is recomputed. Reverting clears the mark: the <b>“↺ Restore”</b> button in such a clip's card shows exactly what changed (segment fields, project fields, the selected take of the previous segment — “was → now”) and restores the checked items in one undo step. Project fields affect all clips. The ComfyUI console also says why the key didn't match: <code>[H3ZS] cache miss: … — reason: …</code>.</dd>
<dt>A segment is marked “past the end”</dt>
<dd>It is after the video's end marker and isn't generated. Move the marker or use “Marker → end”.</dd>
<dt>“Whole video” doesn't play what I expected</dt>
<dd>It always shows the current timeline: ungenerated parts as placeholders, changed ones with their earlier takes. The old file is available only in the “Previous result” tab.</dd>
<dt>“Upscale unavailable”</dt>
<dd>Neither the trained upscaler model nor RTX VSR is present — see “Models”. Restart ComfyUI after installing.</dd>
<dt>No sound</dt>
<dd>Connect <code>audio_vae</code>. Check the player's sound button: if the browser muted autoplay, it is highlighted and the first click turns sound on.</dd>
<dt>Generation is slow</dt>
<dd>Use “2 stages” or ✎ Draft while tuning prompts, keep segments at 5–15 s, downscale references in the asset editor. Turbo LoRA: about 4 steps, cfg 1. Progress by steps and tiles shows in the header and in the console (<code>[H3ZS]</code>).</dd>
<dt>Free up disk space</dt>
<dd>“Settings” → “Cache” → “Clear project cache”. Finished takes are kept: each has its latent, recipe, master frames and sound next to it, so continuation, “↑ Final” and assembling the video work without generation and without a VAE. “…and takes” deletes them too (except 🔒 locked ones). A copy of the same reference file (zip import, re-saving) no longer resets the cache — the content is compared.</dd>
<dt>Where are the project files?</dt>
<dd>All in one folder: <code>ComfyUI/output/h3zerostudio/&lt;project id&gt;/</code> — uploaded assets (<code>assets/</code>, identical files stored once), their processed versions (<code>assets/derived/</code>), video posters (<code>thumbs/</code>), generations, cache, takes, gallery and the default export (<code>export/</code>; a custom export folder is left alone). Projects from older versions copy their files from the shared <code>input/h3zerostudio</code> into their own folder when opened (originals stay, finished clips don't go out of date). “Delete…” in “Projects” with “Delete all project files” checked shows how much space will be freed and deletes the whole folder. Duplicating and zip export take the assets along. “Settings” → “Clean up unused” deletes shared files from older versions that no saved project references (it shows the count and size first).</dd>
</dl>`],
];
