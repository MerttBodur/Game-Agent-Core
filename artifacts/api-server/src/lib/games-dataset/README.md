# games-dataset

Schema for `games.json` - array of game records.

Required fields:
- `title` - string
- `archetype` - one of: `jam` | `prototype` | `indie` | `AA` | `AAA`
- `engine` - string, prefer names from `gameDevTools.ts` (for example: `Unity`, `Unreal Engine`, `Godot`, `GameMaker`, `Phaser`, `Cocos Creator`, `Defold`, `LOVE`, `Construct 3`, `Bevy`, `Custom`)
- `language` - string, prefer names from `gameDevTools.ts` (for example: `C# with .NET`, `C++`, `GDScript`, `Lua`, `JavaScript / TypeScript`, `Rust`, `Haxe`, `Python`, `Custom`)
- `year` - 4-digit integer (release year)

Optional fields:
- `budgetUSD` - number or null
- `teamSize` - integer or null (peak headcount)
- `devYears` - number or null (development duration)
- `source` - string URL or human citation

Target size: >=80 entries; 150 is ideal. Aim for archetype balance:
~10 jam, ~10 prototype, ~50 indie, ~15 AA, ~15 AAA. Strict counts are not required.

`popularity.json` is generated - do not edit by hand. Run:

`pnpm --filter @workspace/api-server run dataset:popularity`

For popularity merging, keep tool-name spelling aligned with `gameDevTools.ts` where possible.
