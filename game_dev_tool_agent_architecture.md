# Game Dev Tool Recommendation Agent — Architecture Specification

> **Hedef:** Kullanıcının serbest formatlı doğal dil promptunu analiz edip, game development alanında en uygun tool'ları öneren bir AI Agent.
>
> **Bu doküman bir coding agent için yazılmıştır.** Her bölüm implement edilecek bir bileşeni tanımlar.

---

## 1. Genel Bakış

### Mimari Özet

```
Kullanıcı Promptu
      │
      ▼
[Step 1: Analyze]   ← Küçük LLM (intent extraction)
      │                 category_tree.json kullanır
      │ kategoriler + engine + multiplayer flag
      ▼
[Step 2: Retrieve]  ← LLM YOK (sadece SQL query)
      │                 SQLite DB kullanır
      │                 Constraint sistemi çalışır
      │ 3-15 uyumlu tool
      ▼
[Step 3: Recommend] ← Büyük LLM (scoring + açıklama)
      │
      ▼
Kullanıcıya cevap (top 3 öneri + gerekçe)
```

### Teknoloji Kararları

| Bileşen | Karar | Neden |
|---|---|---|
| Workflow engine | **LangGraph** | Multi-step state machine, conditional edge, cycle desteği |
| Tool storage | **SQLite** | Structured query, kolay güncelleme, sıfır kurulum |
| Navigasyon | **category_tree.json** | Küçük kalır, LLM tree reasoning için yeterli |
| Retrieval yaklaşımı | **Vectorless tree-based RAG** | Embedding gereksiz, açıklanabilir, deterministik |
| Step 1 modeli | **Küçük LLM** (Haiku / GPT-4o-mini) | Intent extraction için yeterli, ucuz |
| Step 2 modeli | **Yok** | Sadece SQL query |
| Step 3 modeli | **Büyük LLM** (Sonnet / GPT-4o) | Kullanıcının gördüğü çıktı, kalite önemli |

---

## 2. LangGraph State Tanımı

Agent'ın her step'te taşıdığı state:

```python
from typing import TypedDict, Optional

class AgentState(TypedDict):
    # Input
    user_prompt: str

    # Step 1 çıktıları
    engine: str                  # "Unity" | "Unreal" | "Godot" | "Custom" | "unknown"
    multiplayer: bool
    team_size: str               # "solo" | "team" | "unknown"
    target_categories: list[str] # ["2d_physics", "sprite_engine", ...]

    # Step 2 çıktıları
    candidate_tools: dict        # {category: [tool, ...] | {"type": "locked", ...} | {"type": "skipped", ...}}
    tool_count: int

    # Step 3 çıktıları
    final_answer: str
```

---

## 3. Dosya / Klasör Yapısı

```
project/
├── agent/
│   ├── graph.py             # LangGraph graph tanımı
│   ├── steps/
│   │   ├── analyze.py       # Step 1
│   │   ├── retrieve.py      # Step 2
│   │   ├── check.py         # Tool count check (conditional edge)
│   │   └── recommend.py     # Step 3
│   ├── constraints.py       # Constraint sistemi
│   └── prompts.py           # LLM prompt şablonları
│
├── data/
│   ├── category_tree.json   # Navigasyon ağacı (tool detayı YOK)
│   └── tools.db             # SQLite veritabanı
│
└── db/
    ├── schema.sql            # Tablo tanımları
    └── seed.py              # İlk veri yükleme scripti
```

---

## 4. Veri Katmanı

### 4.1 category_tree.json

**Amaç:** Sadece LLM navigasyonu için. Tool detayı içermez. Her yaprak bir `leaf_category` ID'sidir.

```json
{
  "game_development": {
    "engine": ["game_engine"],
    "graphics": {
      "2d": ["sprite_engine", "tilemap_tool", "animation_2d"],
      "3d": ["render_engine", "shader_tool", "animation_3d"],
      "vfx": ["particle_system", "vfx_tool"]
    },
    "physics": {
      "2d": ["physics_2d"],
      "3d": ["physics_3d"]
    },
    "audio": {
      "engine": ["audio_middleware", "spatial_audio"],
      "music": ["adaptive_audio", "procedural_audio"]
    },
    "ui": ["ui_framework"],
    "networking": {
      "multiplayer": ["relay_service", "p2p_networking", "dedicated_server"],
      "backend": ["baas_platform", "matchmaking_service"]
    },
    "art_asset": ["asset_marketplace", "texture_tool", "model_tool"],
    "version_control": ["vcs_tool"],
    "deployment": ["build_tool", "platform_sdk", "ci_cd_tool"],
    "programming_language": ["language_info"]
  }
}
```

> **Not:** `programming_language` ve `ui` engine_locked constraint'e tabidir, tool önerilmez.

### 4.2 SQLite Schema

```sql
-- schema.sql

CREATE TABLE tools (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    leaf_category   TEXT NOT NULL,      -- category_tree.json'daki yaprak node ile eşleşir
    description     TEXT,
    price_model     TEXT,               -- "free" | "freemium" | "paid" | "subscription"
    compatible_engines TEXT,            -- JSON array: ["Unity", "Unreal", "Godot", "Custom"]
    tool_type       TEXT,               -- "builtin" | "plugin" | "asset" | "external" | "service"
    platforms       TEXT,               -- JSON array: ["PC", "Mobile", "Console", "Web"]
    pros            TEXT,
    cons            TEXT,
    url             TEXT,
    rating          REAL DEFAULT 0.0,
    last_updated    DATE
);

CREATE TABLE engine_constraints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    engine          TEXT NOT NULL,      -- "Unity" | "Unreal" | "Godot"
    category        TEXT NOT NULL,      -- hangi kategori için
    constraint_type TEXT NOT NULL,      -- "engine_locked" | "feature_required" | "context_dependent"
    condition_json  TEXT,               -- koşul (JSON)
    result_json     TEXT NOT NULL       -- sonuç (JSON)
);

-- Örnek veriler:
INSERT INTO engine_constraints VALUES
(NULL, 'Unity',  'programming_language', 'engine_locked', NULL,
 '{"locked_to": ["C#"], "note": "Unity sadece C# destekler"}'),

(NULL, 'Unreal', 'programming_language', 'engine_locked', NULL,
 '{"locked_to": ["C++", "Blueprint"], "note": "Blueprint visual scripting, C++ full kontrol"}'),

(NULL, 'Godot',  'programming_language', 'engine_locked', NULL,
 '{"locked_to": ["GDScript", "C#"], "note": "GDScript Godot-native, C# opsiyonel"}'),

(NULL, 'Unity',  'physics_2d', 'engine_locked', NULL,
 '{"locked_to": ["Unity 2D Physics (Box2D-based)"], "note": "Harici 2D fizik motoru kullanılamaz"}'),

(NULL, 'Unity',  'ui', 'engine_locked', NULL,
 '{"locked_to": ["Unity UI Toolkit", "uGUI"], "note": "UI Toolkit yeni projelerde önerilir"}'),

(NULL, 'Unreal', 'ui', 'engine_locked', NULL,
 '{"locked_to": ["UMG - Unreal Motion Graphics"], "note": "Blueprint ile kullanılır"}'),

(NULL, '*', 'networking', 'feature_required',
 '{"requires": "multiplayer", "value": true}',
 '{"active": true}'),

(NULL, '*', 'backend', 'feature_required',
 '{"requires": "multiplayer", "value": true}',
 '{"active": true}'),

(NULL, '*', 'version_control', 'context_dependent',
 '{"team_size": "solo"}',
 '{"recommend_ids": ["git"], "note": "Solo geliştirici için Git yeterli"}'),

(NULL, '*', 'version_control', 'context_dependent',
 '{"team_size": "team", "engine": "Unreal"}',
 '{"recommend_ids": ["perforce", "git_lfs"], "note": "Unreal büyük binary dosyalar üretir"}'),

(NULL, '*', 'version_control', 'context_dependent',
 '{"team_size": "team", "engine": "Unity"}',
 '{"recommend_ids": ["plastic_scm", "git_lfs"], "note": "PlasticSCM Unity ile entegre"}');
```

---

## 5. LangGraph Graph Tanımı

```python
# agent/graph.py

from langgraph.graph import StateGraph, START, END
from .steps.analyze import analyze
from .steps.retrieve import retrieve
from .steps.check import check_tool_count
from .steps.recommend import recommend
from .state import AgentState

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("analyze",   analyze)
    graph.add_node("retrieve",  retrieve)
    graph.add_node("recommend", recommend)

    graph.add_edge(START, "analyze")
    graph.add_edge("analyze", "retrieve")

    # Conditional edge: tool count kontrolü
    graph.add_conditional_edges(
        "retrieve",
        check_tool_count,
        {
            "broaden":    "retrieve",   # < 3 tool → tekrar retrieve (genişletilmiş)
            "pre_filter": "retrieve",   # > 15 tool → tekrar retrieve (daraltılmış)
            "recommend":  "recommend",  # 3-15 tool → devam
        }
    )

    graph.add_edge("recommend", END)

    return graph.compile()
```

---

## 6. Step Implementasyonları

### 6.1 Step 1: Analyze

```python
# agent/steps/analyze.py

import json
from ..state import AgentState
from ..prompts import ANALYZE_PROMPT

def analyze(state: AgentState) -> dict:
    """
    Kullanıcı promptunu analiz eder.
    - LLM: Küçük model (Haiku / GPT-4o-mini)
    - Giriş: user_prompt + category_tree.json
    - Çıkış: engine, multiplayer, team_size, target_categories
    """
    with open("data/category_tree.json") as f:
        tree = json.load(f)

    prompt = ANALYZE_PROMPT.format(
        user_prompt=state["user_prompt"],
        category_tree=json.dumps(tree, ensure_ascii=False, indent=2)
    )

    response = small_llm.invoke(prompt)      # Haiku veya GPT-4o-mini
    parsed = json.loads(response)

    return {
        "engine":           parsed.get("engine", "unknown"),
        "multiplayer":      parsed.get("multiplayer", False),
        "team_size":        parsed.get("team_size", "unknown"),
        "target_categories": parsed.get("target_categories", [])
    }
```

**Analyze prompt şablonu** (`agent/prompts.py`):

```python
ANALYZE_PROMPT = """
Kullanıcının game development ihtiyacını analiz et.

Kullanıcı: {user_prompt}

Kategori ağacı (sadece bu ağaçtaki yaprak node'ları kullan):
{category_tree}

Yalnızca aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{{
  "engine": "<Unity|Unreal|Godot|Custom|unknown>",
  "multiplayer": <true|false>,
  "team_size": "<solo|team|unknown>",
  "target_categories": ["<leaf_node_1>", "<leaf_node_2>", ...]
}}

Kurallar:
- target_categories sadece ağaçtaki yaprak node isimlerini içermeli
- Kullanıcı belirtmediyse engine = "unknown"
- Multiplayer belirtilmediyse false kabul et
"""
```

---

### 6.2 Step 2: Retrieve

```python
# agent/steps/retrieve.py

import json
import sqlite3
from ..state import AgentState
from ..constraints import apply_constraints

def retrieve(state: AgentState) -> dict:
    """
    Her kategori için constraint kontrolü yapar, SQLite'dan tool çeker.
    LLM KULLANMAZ.
    """
    conn = sqlite3.connect("data/tools.db")
    conn.row_factory = sqlite3.Row
    
    results = {}
    total = 0

    for category in state["target_categories"]:
        result = apply_constraints(
            category=category,
            engine=state["engine"],
            multiplayer=state["multiplayer"],
            team_size=state["team_size"],
            conn=conn
        )

        if result["action"] == "fetch":
            tools = fetch_tools(conn, category, state["engine"])
            results[category] = tools
            total += len(tools)

        elif result["action"] == "locked":
            results[category] = {
                "type": "locked",
                "value": result["locked_to"],
                "note":  result["note"]
            }

        elif result["action"] == "skip":
            results[category] = {
                "type": "skipped",
                "reason": result["reason"]
            }

        elif result["action"] == "context":
            tools = fetch_tools_by_ids(conn, result["recommend_ids"])
            results[category] = tools
            total += len(tools)

    conn.close()
    return {
        "candidate_tools": results,
        "tool_count": total
    }


def fetch_tools(conn, category: str, engine: str) -> list:
    query = """
        SELECT * FROM tools
        WHERE leaf_category = ?
        AND (compatible_engines LIKE ? OR compatible_engines LIKE '%"Custom"%')
        ORDER BY rating DESC
    """
    rows = conn.execute(query, [category, f'%"{engine}"%']).fetchall()
    return [dict(row) for row in rows]


def fetch_tools_by_ids(conn, ids: list) -> list:
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT * FROM tools WHERE id IN ({placeholders})", ids
    ).fetchall()
    return [dict(row) for row in rows]
```

---

### 6.3 Constraint Sistemi

```python
# agent/constraints.py

import json
import sqlite3

def apply_constraints(
    category: str,
    engine: str,
    multiplayer: bool,
    team_size: str,
    conn: sqlite3.Connection
) -> dict:
    """
    Bir kategori için uygulanacak constraint'i bulur ve eylem döndürür.

    Dönüş örnekleri:
      {"action": "fetch"}
      {"action": "locked", "locked_to": ["C#"], "note": "..."}
      {"action": "skip",   "reason": "multiplayer gerekli"}
      {"action": "context","recommend_ids": ["git"]}
    """

    # Önce engine-specific, sonra wildcard ("*") constraint ara
    rows = conn.execute("""
        SELECT * FROM engine_constraints
        WHERE category = ?
        AND (engine = ? OR engine = '*')
        ORDER BY engine DESC
    """, [category, engine]).fetchall()

    if not rows:
        return {"action": "fetch"}   # Bağımsız kategori

    for row in rows:
        ctype  = row["constraint_type"]
        result = json.loads(row["result_json"])
        cond   = json.loads(row["condition_json"]) if row["condition_json"] else {}

        if ctype == "engine_locked":
            return {
                "action":    "locked",
                "locked_to": result["locked_to"],
                "note":      result.get("note", "")
            }

        elif ctype == "feature_required":
            requires = cond.get("requires")
            value    = cond.get("value", True)
            actual   = {"multiplayer": multiplayer}.get(requires)

            if actual == value:
                return {"action": "fetch"}
            else:
                return {
                    "action": "skip",
                    "reason": f"{requires} = {value} gerekli ama aktif değil"
                }

        elif ctype == "context_dependent":
            if _matches_context(cond, engine, team_size):
                return {
                    "action":       "context",
                    "recommend_ids": result.get("recommend_ids", []),
                    "note":          result.get("note", "")
                }

    return {"action": "fetch"}


def _matches_context(cond: dict, engine: str, team_size: str) -> bool:
    if "team_size" in cond and cond["team_size"] != team_size:
        return False
    if "engine" in cond and cond["engine"] != engine:
        return False
    return True
```

---

### 6.4 Check: Conditional Edge

```python
# agent/steps/check.py

from ..state import AgentState

MIN_TOOLS = 3
MAX_TOOLS = 15

def check_tool_count(state: AgentState) -> str:
    """
    Tool count'a göre sonraki node'u belirler.
    - < 3  → "broaden"    (retrieve tekrar çalışır, genişletilmiş arama)
    - > 15 → "pre_filter" (retrieve tekrar çalışır, platform/fiyat filtresi)
    - 3-15 → "recommend"
    """
    count = state.get("tool_count", 0)

    if count < MIN_TOOLS:
        return "broaden"
    elif count > MAX_TOOLS:
        return "pre_filter"
    else:
        return "recommend"
```

> **Not:** `broaden` ve `pre_filter` durumlarında `retrieve` tekrar çalışır.
> `retrieve` fonksiyonu state'teki bir `retry_mode` flag'ını okuyarak davranışını ayarlar.
> `broaden` → komşu yaprak kategorileri de sorgula.
> `pre_filter` → SQL query'e `WHERE price_model = 'free' AND platforms LIKE '%{platform}%'` ekle.

---

### 6.5 Step 3: Recommend

```python
# agent/steps/recommend.py

import json
from ..state import AgentState
from ..prompts import RECOMMEND_PROMPT

def recommend(state: AgentState) -> dict:
    """
    Candidate tool'ları değerlendirir, top 3 önerir.
    - LLM: Büyük model (Sonnet / GPT-4o)
    - Giriş: candidate_tools + tüm state context
    - Çıkış: final_answer (doğal dil)
    """
    prompt = RECOMMEND_PROMPT.format(
        user_prompt=state["user_prompt"],
        engine=state["engine"],
        multiplayer=state["multiplayer"],
        candidate_tools=json.dumps(state["candidate_tools"], ensure_ascii=False, indent=2)
    )

    response = big_llm.invoke(prompt)
    return {"final_answer": response}
```

**Recommend prompt şablonu:**

```python
RECOMMEND_PROMPT = """
Sen bir game development uzmanısın.

Kullanıcı: {user_prompt}
Engine: {engine}
Multiplayer: {multiplayer}

Aday tool'lar (kategori bazlı):
{candidate_tools}

Görevin:
1. "locked" tipindeki kategorileri kısaca açıkla (seçenek yok, bu engine bunu getirir)
2. "skipped" kategorileri için neden atlandığını söyle
3. Geri kalan kategoriler için en iyi 1-2 tool'u öner ve gerekçe ver
4. Her öneri için: neden bu tool, artıları/eksileri, başlangıç noktası

Türkçe cevap ver. Teknik ve net ol.
"""
```

---

## 7. Bağımsız vs Bağımlı Kategori Referansı

| Kategori | Tip | Constraint | Notlar |
|---|---|---|---|
| `game_engine` | Bağımsız | Yok | Her zaman tool öner |
| `art_asset` | Bağımsız | Yok | Her zaman tool öner |
| `animation_2d` | Bağımsız | Yok | Engine uyumluluğu filtrele |
| `animation_3d` | Bağımsız | Yok | Engine uyumluluğu filtrele |
| `vfx_tool` | Bağımsız | Yok | Engine uyumluluğu filtrele |
| `audio_middleware` | Bağımsız | Yok | Engine uyumluluğu filtrele |
| `deployment` | Bağımsız | Yok | Platform'a göre filtrele |
| `programming_language` | **engine_locked** | Engine belirler | Tool önerme, bilgi ver |
| `ui_framework` | **engine_locked** | Engine belirler | Tool önerme, bilgi ver |
| `physics_2d` | **engine_locked** | Unity/Godot built-in | Built-in varsa harici önerme |
| `networking` | **feature_required** | `multiplayer = true` | False ise kategoriyi atla |
| `backend` | **feature_required** | `multiplayer = true` | False ise kategoriyi atla |
| `vcs_tool` | **context_dependent** | team_size + engine | Solo → Git, Team+Unreal → Perforce |

---

## 8. Ölçeklenme Notları

### Tool Sayısı Arttığında

Mevcut mimari şu sınırlara kadar değişiklik gerektirmez:

```
< 500 tool   → Değişiklik yok
500-2000     → category_tree dallarını böl, her yaprakta 5-15 tool kalsın
2000+        → Step 1'i iki aşamaya böl:
                 Step 1a: Hangi alan? (game_dev / software_dev / ai_dev)
                 Step 1b: Hangi alt kategori?
```

### Yeni Alan Eklerken (software_dev, ai_development)

1. `category_tree.json`'a yeni üst dal ekle
2. `tools` tablosuna yeni tool'ları insert et (kod değişikliği yok)
3. `engine_constraints`'e gerekli constraint'leri ekle
4. Mevcut workflow aynı kalır

---

## 9. Bağımlılıklar

```txt
# requirements.txt
langgraph>=0.2.0
langchain-core>=0.2.0
langchain-anthropic>=0.1.0   # veya langchain-openai
sqlite3                       # Python stdlib, kurulum gereksiz
```

---

## 10. Entegrasyon Noktası

```python
# main.py — Agentı çalıştır

from agent.graph import build_graph

app = build_graph()

result = app.invoke({
    "user_prompt": "Unity'de 2D platformer yapıyorum, fizik, animasyon ve ses lazım. Solo geliştirici olarak çalışıyorum."
})

print(result["final_answer"])
```

---

*Bu doküman tüm mimari kararları, veri modelini, constraint sistemini ve step implementasyon iskeletlerini kapsar. Her step'in LLM çağrısı, prompt şablonu ve state güncellemesi bu spec'e göre yazılmalıdır.*
