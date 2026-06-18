# Low-Budget, Weak-Art-Skill Playbook

## The Situation

You want to ship a game that looks good. You have a limited budget (under $500) and limited art skills. You cannot model, paint, rig, or compose at a professional level. Here is how to succeed anyway.

## Core Principle: Don't Fight Your Constraints

Trying to become a 3D artist, composer, and animator while also building a game is a recipe for never shipping. Accept the constraint and route around it with tools and assets designed for non-artists.

## Recommended Stack

### Engine
- **Godot 4** (free, MIT, beginner-friendly) for 2D or stylised 3D.
- **Unity Personal** if you need mobile or a larger asset store.
- Avoid Unreal — its power is wasted on stylised or 2D games, and the learning curve is punishing for beginners.

### Art Assets
- **Meshy** (free tier) for 3D models — generate props and characters from text prompts.
- **Kenney.nl** — massive free CC0 asset library covering UI, 2D sprites, 3D packs, sound effects.
- **itch.io asset packs** — searchable by engine, style, and licence. Many are free or under $10.
- **Midjourney / Leonardo.ai** — generate 2D concept art, texture references, and UI elements.
- Lean into **stylised aesthetics** (flat colours, cel-shading, pixel art, low-poly) — these read as intentional rather than unfinished, and AI/asset packs cover them well.

### Audio
- **Suno** (free tier) for background music — generate loopable tracks that match your game's mood.
- **Freesound.org / ZapSplat** for SFX — free, searchable, enormous catalogs.
- Skip custom music production entirely until you have revenue.

### VFX and Shaders
- Use built-in particle systems (Godot's CPUParticles2D, Unity's Particle System).
- Download free shader packs from the engine's community (Godot Shader Library, Unity Asset Store free section).

### Workflow Tips
- **Placeholder first, polish later.** Block out the entire game with colored rectangles and placeholder audio. Add real assets only when the design is locked.
- **Stylised over realistic.** Realistic assets require high fidelity and skilled production. Stylised art forgives lower-resolution assets and AI generation artifacts.
- **Asset packs before custom.** A $10 asset pack often represents 40+ hours of professional work. Buy it.
- **Keep scope tiny.** One mechanic, one environment, one win condition. Ship that. Then expand.
