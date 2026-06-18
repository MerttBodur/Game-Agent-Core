# Choosing an Engine: Unity vs Unreal vs Godot

## Overview

The three mainstream choices for indie and solo developers are Unity, Unreal Engine, and Godot. Each excels in different contexts. Picking the wrong engine for your project type, skill level, or target platform creates compounding friction.

## Unity

**Best for:** Mobile games, cross-platform 2D/3D, C# developers, teams leveraging the Asset Store.

**Strengths:**
- Largest third-party Asset Store (templates, plugins, art packs, SDKs).
- Best mobile build pipeline: iOS, Android, WebGL out of the box.
- C# scripting — strongly typed, large talent pool, excellent IDE tooling (Rider, VS).
- Mature 2D pipeline (Tilemaps, Sprite Atlas, 2D Physics).
- Wide platform support: consoles, AR/VR, PC, web.

**Trade-offs:**
- Runtime fee controversy (2023–2024) added uncertainty; evaluate current licensing before committing.
- High-fidelity 3D visuals require significant artist effort — Unity is not a "looks great by default" engine.
- Editor can feel heavy for small 2D projects where Godot would suffice.

**Pick Unity when:** You need mobile deployment, want access to the Asset Store ecosystem, or your team already knows C#.

## Unreal Engine

**Best for:** High-fidelity 3D games, AAA-style visuals, games targeting PC/console with cinematic quality.

**Strengths:**
- Nanite + Lumen: industry-leading real-time global illumination and virtualized geometry.
- Blueprints visual scripting lowers the barrier for non-programmers building 3D prototypes.
- Fab marketplace (formerly Unreal Marketplace) has high-quality 3D assets tuned for Unreal's renderer.
- MetaHuman for realistic character creation; Quixel Megascans for photorealistic environments (free with Unreal).
- Royalty model (5% above $1M revenue) is favourable for small studios.

**Trade-offs:**
- Steep learning curve: C++ is the path to serious customisation; even Blueprints require understanding Unreal concepts.
- Heavy hardware requirements (build times, editor load).
- Overkill for 2D or casual mobile games — excessive complexity, poor mobile performance story vs Unity.

**Pick Unreal when:** You need photorealistic or cinematic 3D visuals, targeting PC/console, and you (or your team) can invest in learning Unreal-specific workflows.

## Godot

**Best for:** Beginners, 2D-first projects, open-source advocates, lightweight 3D prototypes.

**Strengths:**
- Fully open-source (MIT licence) — no royalties, no runtime fees, no vendor lock-in.
- GDScript is Python-like; beginners learn faster here than with C# or C++.
- Best-in-class 2D engine for indie scale — native 2D coordinate system, tilemap editor, animation tools.
- Tiny editor footprint; fast iteration cycles.
- Growing 3D capabilities (Godot 4 with Vulkan renderer) — not AAA, but solid for stylised indie 3D.

**Trade-offs:**
- Asset marketplace is thin compared to Unity or Unreal Fab.
- 3D tooling is still maturing; complex 3D games may hit limitations.
- Smaller community than Unity, though growing rapidly.

**Pick Godot when:** You are a beginner, building a 2D game, have a $0 budget, want open-source freedom, or are prototyping a small stylised 3D title.

## Quick Decision Matrix

| Criteria | Unity | Unreal | Godot |
|---|---|---|---|
| 2D games | Good | Poor | Best |
| Mobile deployment | Best | Limited | Good |
| AAA-style 3D | Good | Best | Poor |
| Beginner friendly | Medium | Low | High |
| Budget $0 | Yes (Personal) | Yes (royalty) | Yes (MIT) |
| Asset ecosystem | Best | Strong | Thin |
