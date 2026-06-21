# RAG Pipeline Rehberi — Indie Game Dev Tool Asistanı

Bu doküman, indie game geliştiricilere en iyi tool'ları öneren bir RAG (Retrieval-Augmented Generation) destekli yapay zeka asistanı inşa etmek için uçtan uca mimari rehberdir.

---

## Pipeline Genel Bakış

RAG pipeline'ı iki ana fazdan oluşur:

**Offline (hazırlık):** Ham veri toplama → Chunking → Embedding → Vector DB'ye yazma

**Online (kullanıcı sorgusu):** Sorgu embedding → Semantic search → Chunk retrieval → Prompt augmentation → LLM generation → Cevap

---

## 1. Knowledge Base Hazırlığı

### Veri Kaynakları

Indie game dev tool'ları hakkında veri toplanacak kaynaklar:

- Tool'ların resmi dokümantasyonları ve changelog'ları
- Steam, itch.io developer forumları
- Reddit (`r/gamedev`, `r/IndieDev`, `r/gamedevtools`)
- YouTube review ve karşılaştırma videoları (transkript olarak)
- Game jam post-mortem yazıları
- GitHub README'leri ve release note'ları

### Veri Yapısı

Her tool için toplanması gereken minimum bilgi seti:

```json
{
  "tool_name": "Aseprite",
  "category": ["2D", "pixel_art", "animation"],
  "price": "$19.99 one-time",
  "price_type": "paid",
  "platforms": ["Windows", "macOS", "Linux"],
  "use_cases": ["pixel art", "sprite animation", "tilemap editing"],
  "pros": ["onion skinning", "tilemap editor", "aktif topluluk"],
  "cons": ["ücretli", "başlangıçta öğrenme eğrisi"],
  "alternatives": ["Pixelorama", "LibreSprite", "Piskel"],
  "last_updated": "2025-03-15",
  "source_urls": ["https://www.aseprite.org/docs/"]
}
```

---

## 2. Chunking Stratejisi

### Yaklaşım: Semantic Chunking

Her chunk tek bir anlam birimi taşımalı. Aynı tool'un fiyat bilgisi ile özellik listesi ayrı chunk'larda durmalı.

### Parametreler

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Chunk boyutu | 200–500 token | Çok küçük → bağlam kaybı, çok büyük → gürültü |
| Overlap | 50–100 token | Chunk sınırlarında bilgi kaybını önler |
| Splitter | Semantic / recursive character | Paragraf ve başlık sınırlarına göre böl |

### Chunk Örnekleri

Bir Aseprite dökümanından oluşacak chunk'lar:

- **Chunk 1 — Genel bilgi:** "Aseprite, pixel art ve sprite animasyon için tasarlanmış bir editördür..."
- **Chunk 2 — Fiyatlandırma:** "$19.99 tek seferlik ödeme, Steam üzerinden satın alınabilir..."
- **Chunk 3 — Özellikler:** "Onion skinning, tilemap editor, layer desteği, palette management..."
- **Chunk 4 — Kullanıcı yorumları:** "Indie geliştiriciler arasında en popüler pixel art aracı..."
- **Chunk 5 — Alternatifler:** "Pixelorama (ücretsiz, Godot tabanlı), LibreSprite (Aseprite fork)..."

### Metadata Enrichment

Her chunk'a eklenmesi gereken metadata alanları:

```json
{
  "chunk_id": "aseprite_pricing_001",
  "tool_name": "Aseprite",
  "category": "2D",
  "subcategory": "pixel_art",
  "price_range": "paid",
  "platform": ["Windows", "macOS", "Linux"],
  "content_type": "pricing",
  "source_url": "https://www.aseprite.org",
  "last_updated": "2025-03-15"
}
```

Bu metadata'lar retrieval sırasında filtreleme için kullanılır. Kullanıcı "ücretsiz 2D tool" dediğinde `price_range=free AND category=2D` filtresiyle arama alanı daraltılır.

---

## 3. Embedding

### Model Seçenekleri

| Model | Boyut | Avantaj | Dezavantaj |
|-------|-------|---------|------------|
| `text-embedding-3-small` (OpenAI) | 1536 | Yaygın, ucuz | Vendor lock-in |
| `text-embedding-3-large` (OpenAI) | 3072 | Yüksek kalite | Maliyet yüksek |
| `voyage-3` (Voyage AI) | 1024 | Retrieval için optimize | Daha az yaygın |
| `bge-large-en-v1.5` (BAAI) | 1024 | Açık kaynak, self-host | Altyapı gerektirir |
| `nomic-embed-text` | 768 | Açık kaynak, hafif | Daha düşük kalite |

### Kritik Kural

Chunk embedding ve query embedding için **aynı model** kullanılmalıdır. Farklı modellerin vektör uzayları uyumsuz olur.

### Embedding Süreci

```
Ham chunk metni
    ↓
Embedding modeli (ör. text-embedding-3-small)
    ↓
[0.023, -0.041, 0.087, ..., 0.012]  ← 1536 boyutlu vektör
    ↓
Vector DB'ye kaydet (vektör + metadata + orijinal metin)
```

### Vektör Uzayı Mantığı

Embedding modeli, anlamca yakın metinleri vektör uzayında birbirine yakın konumlandırır:

- "Aseprite", "Pixelorama", "LibreSprite" → birbirine yakın (hepsi pixel art tool)
- "Blender", "MagicaVoxel" → farklı küme (3D modelleme)
- "FMOD", "Audacity" → farklı küme (ses/müzik)
- "Godot", "Unity" → farklı küme (game engine)

Bu sayede kullanıcı "pixel art tool" diye sorduğunda, sorgunun vektörü pixel art kümesine düşer ve doğru chunk'lar retrieve edilir.

---

## 4. Vector Database

### Seçenekler

| DB | Özellik | Ne zaman kullan |
|----|---------|-----------------|
| Pinecone | Managed, serverless | Hızlı başlangıç, ölçeklenme |
| Qdrant | Self-host veya cloud | Kontrol istiyorsan |
| Chroma | Lightweight, local | Prototipleme, küçük veri |
| Weaviate | Hybrid search built-in | Keyword + semantic birlikte |
| pgvector | PostgreSQL extension | Zaten Postgres kullanıyorsan |

### Index Yapısı

```
Collection: indie_game_tools
├── Vector: [0.023, -0.041, ...] (1536-d)
├── Metadata:
│   ├── tool_name: "Aseprite"
│   ├── category: "2D"
│   ├── price_range: "paid"
│   └── platform: ["Windows", "macOS", "Linux"]
└── Payload: "Aseprite, pixel art için tasarlanmış bir editördür..."
```

---

## 5. Retrieval (Online Faz)

### Akış

```
Kullanıcı sorusu: "2D pixel art için en iyi tool?"
    ↓
1. Query embedding (aynı model ile)
    ↓
2. Metadata filtering (opsiyonel): category=2D
    ↓
3. Similarity search: cosine similarity, top-K=5
    ↓
4. Sonuçlar (skor ile):
   - Aseprite genel bilgi     → 0.94
   - Pixelorama genel bilgi   → 0.91
   - LibreSprite genel bilgi  → 0.87
   - Aseprite özellikler      → 0.84
   - Piskel genel bilgi       → 0.79
```

### Hybrid Search (Önerilen)

Sadece semantic search bazen özel isimleri kaçırır. BM25 (keyword search) ile semantic search'ü birleştir:

```
Final skor = α × semantic_score + (1 - α) × bm25_score
```

`α = 0.7` iyi bir başlangıç değeri. Pinecone, Qdrant ve Weaviate bu özelliği native destekler.

### Reranking (Opsiyonel ama Önerilen)

İlk retrieval'dan gelen top-20 chunk'ı bir reranker model ile yeniden sırala, en iyi 5'ini LLM'e ver:

```
Top-20 chunk (ilk retrieval)
    ↓
Reranker model (Cohere Rerank / bge-reranker-v2)
    ↓
Top-5 chunk (yüksek kalite)
    ↓
LLM prompt'una ekle
```

Bu adım retrieval precision'ı önemli ölçüde artırır.

---

## 6. Prompt Augmentation

### Prompt Template

```
SYSTEM:
Sen indie game geliştiricilere tool öneren uzman bir asistansın.
Aşağıdaki CONTEXT bölümündeki bilgilere DAYANARAK cevap ver.
Context'te olmayan bilgiyi UYDURMA.
Eğer context yeterli değilse, bunu açıkça belirt.

Cevap verirken:
- Tool ismini, fiyatını ve platformunu belirt
- Artılarını ve eksilerini listele
- Alternatifleri öner
- Kullanıcının ihtiyacına göre kişiselleştirilmiş öneride bulun

CONTEXT:
---
{retrieved_chunk_1}
---
{retrieved_chunk_2}
---
{retrieved_chunk_3}
---
{retrieved_chunk_4}
---
{retrieved_chunk_5}
---

USER:
{user_query}
```

### Prompt Tasarım Kuralları

1. **Grounding talimatı:** "Context'te olmayan bilgiyi uydurma" → hallucination'ı azaltır
2. **Yapılandırılmış çıktı:** Tool ismi, fiyat, platform gibi alanları iste → tutarlı cevaplar
3. **Failsafe:** "Context yeterli değilse belirt" → güvenilirliği artırır
4. **Chunk ayırıcı:** Her chunk arasında `---` kullan → LLM hangi bilginin nereden geldiğini ayırt eder

---

## 7. LLM Generation

### Model Seçenekleri

| Model | Avantaj | Dezavantaj |
|-------|---------|------------|
| Claude (Anthropic) | Uzun context, talimat uyumu | API maliyeti |
| GPT-4o (OpenAI) | Yaygın ekosistem | API maliyeti |
| Llama 3 (Meta) | Açık kaynak, self-host | Altyapı gerekli |
| Mistral | Hafif, hızlı | Daha düşük kalite |

### Generation Sonrası

LLM'in ürettiği cevabı doğrudan kullanıcıya sunmadan önce opsiyonel olarak:

- **Source attribution:** Hangi chunk'lardan bilgi kullanıldığını belirt
- **Confidence scoring:** Cevabın context'e ne kadar dayandığını ölç
- **Fallback:** Context yetersizse genel bilgi yerine "bu konuda yeterli bilgim yok" de

---

## 8. İleri Seviye Öneriler

### Agentic RAG

Basit tek seferlik retrieval yerine, bir agent loop kur:

```
Kullanıcı sorusu
    ↓
Agent karar verir: Hangi arama stratejisi?
    ↓
├── Genel arama: "2D tool öner"
├── Karşılaştırma: "Aseprite vs Pixelorama"
├── Filtrelenmiş arama: "ücretsiz Linux audio tool"
└── Multi-hop: "Godot ile uyumlu pixel art tool"
    ↓
Retrieval (gerekirse birden fazla sorgu)
    ↓
Agent: Yeterli bilgi var mı? → Hayır → Yeni sorgu
    ↓ Evet
Cevap üret
```

### Evaluation Pipeline

RAG sistemi kalitesini ölç:

- **Retrieval metrikleri:** Precision@K, Recall@K, MRR
- **Generation metrikleri:** Faithfulness (hallucination oranı), relevance, completeness
- **End-to-end:** Kullanıcı memnuniyeti, doğru öneri oranı

Araçlar: Ragas, LangSmith, Phoenix (Arize)

### Knowledge Base Güncelleme

Game dev tool'ları sürekli güncellenir. Periyodik pipeline kur:

```
Haftalık/aylık cron job
    ↓
Web scraping + API calls (yeni tool'lar, versiyon güncellemeleri, fiyat değişiklikleri)
    ↓
Chunk → Embed → Upsert (vector DB)
    ↓
Eski/geçersiz chunk'ları sil veya güncelle
```

---

## 9. Örnek Tech Stack

Hızlı başlangıç için önerilen minimal stack:

```
Embedding:      text-embedding-3-small (OpenAI)
Vector DB:      Qdrant (self-host) veya Pinecone (managed)
LLM:            Claude Sonnet (Anthropic API)
Framework:      LangChain veya LlamaIndex
Backend:        Python (FastAPI)
Frontend:       Next.js veya Streamlit (prototip için)
Veri toplama:   BeautifulSoup + requests
Orchestration:  LangGraph (agentic RAG için)
Evaluation:     Ragas
```

---

## 10. Dikkat Edilmesi Gerekenler

- **Chunk boyutu:** Çok küçük → bağlam kaybı, çok büyük → gürültü. 200–500 token test ederek başla.
- **Embedding model tutarlılığı:** Chunk ve query embedding için her zaman aynı modeli kullan.
- **Metadata filtering:** Semantic search'ten önce metadata filtresi uygula → hem hız hem doğruluk kazanırsın.
- **Hallucination kontrolü:** Prompt'ta "context dışı bilgi uydurma" talimatı mutlaka olsun.
- **Güncellik:** Tool bilgileri eskiyebilir. Düzenli güncelleme pipeline'ı kur.
- **Hybrid search:** Sadece semantic search yetmez. BM25 ile birleştir.
- **Reranking:** İlk retrieval'dan sonra reranker ekle. Maliyet artışı minimaldir, kalite artışı büyüktür.
- **Overlap:** Chunk'lar arası 50–100 token overlap bırak. Aksi halde bağlam kırılır.
