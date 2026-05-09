# Section 1: Frontend

## 1. Section Purpose

Section 1 defines the frontend structure of AIssistant - Game Dev Advisor. The frontend is responsible for collecting the user's game idea, asking the required clarification questions, displaying the agent's analysis, and allowing users to view, save, and compare previous analyses.

This section supports the project's main vision: a web-based RAG-powered assistant that gives game development tool advice based on the user's project idea and constraints. The system remains strictly analysis-only. It does not perform autonomous development work, fine-tuning, machine learning model training, or agentic execution.

## 2. Frontend Role in the System

The frontend acts as the user-facing layer of AIssistant. It does not contain backend logic, RAG logic, AI implementation, or tool database logic. Its job is to guide the user through a structured input process and present the returned analysis clearly.

The frontend must make the system feel like a practical advisory dashboard, not a general chatbot. The user should understand that the product analyzes their project idea, scores it, recommends tools, and explains risks.

The frontend must support these primary actions:

- Entering a game idea
- Answering project-context questions
- Viewing the analysis result
- Viewing tool recommendations
- Reading idea score and tool fit scores
- Seeing warnings for weak or incomplete ideas
- Saving and reopening previous analyses
- Comparing saved analyses
- Browsing a basic tool catalog

## 3. Frontend Scope

### 3.1 Included in Section 1

The frontend includes the following:

- Game idea input flow
- Step-by-step clarification question flow
- Analysis result page
- Tool recommendation display
- Idea scoring display
- Warning messages for weak or incomplete ideas
- Project history page
- Saved analyses page
- Comparison page
- Tool catalog page

These features define how the user interacts with the system and how the analysis output is presented.

### 3.2 Excluded from Section 1

The frontend does not include:

- Backend implementation
- API logic
- RAG pipeline implementation
- AI model implementation
- Tool explanation database
- Admin panel
- Authentication or login
- Export features such as PDF, Markdown, or JSON export

These items belong to later project sections. Section 1 only defines the frontend behavior, screens, and user experience boundaries.

## 4. Frontend Tech Stack

The frontend will use:

- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Vite

The architecture should be modern and component-based. The interface should combine a clean SaaS dashboard structure with a game-development-themed dark UI.

The technical direction is frontend-only. Real backend behavior is not implemented in this section. Any backend communication described here is treated as placeholder API interaction for planning purposes.

## 5. Main User Flow

The frontend uses a hybrid chat + form flow.

The system starts with a free-text idea input, then switches into structured one-by-one questioning. This keeps the experience flexible at the start but controlled during data collection.

### 5.1 Flow Steps

1. The user enters their initial game idea as free text.
2. The frontend asks structured clarification questions one by one.
3. The user answers the required project-context questions.
4. The frontend sends the collected data to placeholder API calls.
5. The agent returns the analysis result.
6. The frontend displays:
   - Overall idea score
   - Tool recommendations
   - Tool fit scores
   - Explanations
   - Alternatives
   - Risks and warnings
   - Suggested roadmap
   - Confidence score
7. The user can save and view the analysis in project history.
8. The user can compare multiple saved analyses.

This flow keeps the product focused on structured analysis rather than open-ended conversation.

## 6. Required User Inputs

After the user enters the initial game idea, the frontend must ask the following questions one by one.

### 6.1 Genre

The frontend asks for the game genre.

Examples:

- RPG
- FPS
- Platformer
- Survival
- Strategy

Genre helps the system understand the basic design direction of the project.

### 6.2 2D or 3D

The frontend asks whether the game is 2D or 3D.

This affects engine and tool suitability. For example, a simple 2D platformer may fit different tools than a realistic 3D multiplayer game.

### 6.3 Target Platform

The frontend asks where the game will be released.

Examples:

- PC
- Mobile
- Web
- Console

Platform selection affects engine choice, performance expectations, build pipeline, and deployment difficulty.

### 6.4 Budget

The frontend asks for the project budget.

Budget is used to filter realistic options between free tools, paid tools, asset marketplaces, plugins, and production resources.

### 6.5 Team Size

The frontend asks about the team size.

Examples:

- Solo developer
- 2-5 people
- Small indie team

Team size affects whether the recommended tools should prioritize simplicity, collaboration, scalability, or production depth.

### 6.6 Skill Level

The frontend asks for the user's technical skill level.

Examples:

- Beginner
- Intermediate
- Advanced

Skill level affects whether the recommendations should favor beginner-friendly tools or more complex professional tools.

### 6.7 Available Time

The frontend asks how much time the user has.

Examples:

- 1 month
- 3 months
- 6 months
- 1 year

Available time affects project feasibility and roadmap difficulty.

### 6.8 Art Style

The frontend asks for the intended art style.

Examples:

- Pixel art
- Low-poly
- Stylized 3D
- Realistic 3D

Art style affects engine suitability, asset pipeline, performance requirements, and tool recommendations.

### 6.9 Singleplayer or Multiplayer

The frontend asks whether the game is singleplayer or multiplayer.

Multiplayer increases complexity and may affect backend, networking, hosting, and testing recommendations. The frontend only collects and displays this factor; detailed backend logic belongs to later sections.

## 7. Result Page Logic

The result page must present the analysis in mini-boxes or cards, not as a long document.

The purpose of the result page is to make the recommendation easy to scan. The user should immediately understand the project score, recommended tools, risks, and next development phases.

### 7.1 Overall Idea Score Card

The frontend displays the overall idea score in a clear card.

Example format:

- Overall Idea Score: 72/100

The score reflects how complete, realistic, and well-constrained the user's game idea is.

A high score means the idea has enough detail and realistic constraints. A low score means the idea lacks key information or has scope problems.

### 7.2 Tool Recommendations Card

The frontend displays recommended tools.

Examples:

- Unity
- Unreal Engine
- Godot
- Blender
- GitHub
- Firebase

Each tool recommendation should be shown as a separate card or clear list item.

### 7.3 Tool Fit Score Card

Each recommended tool must include a fit score.

Example format:

- Unity - 85/100
- Godot - 78/100
- Blender - 82/100

The tool fit score shows how well a tool matches the user's project type, platform, budget, skill level, and available time.

### 7.4 Explanation Box

Each recommendation should include a short explanation.

The explanation must be practical and direct. It should explain why the tool fits the user's current project constraints.

Example:

Unity fits this project because it supports 2D and 3D workflows, has strong mobile export support, and is beginner-friendly for small teams.

### 7.5 Alternative Tools Box

The frontend shows secondary options when relevant.

Example:

- Alternative Tools: Godot, Unreal Engine

Alternatives help the user compare possible choices without turning the result page into a full tool database.

### 7.6 Risk / Warning Box

The frontend displays risks and warnings.

Examples:

- Low project detail
- Unrealistic scope
- Weak budget fit
- High multiplayer complexity
- Skill level mismatch
- Too little available time

Warnings must be visible but not block the user from receiving analysis.

### 7.7 Roadmap Box

The roadmap box displays suggested development phases.

Example structure:

- Phase 1: Prototype core gameplay
- Phase 2: Build basic art and UI
- Phase 3: Add tool pipeline
- Phase 4: Test and polish

The roadmap should stay high-level. Detailed implementation planning belongs to later sections.

### 7.8 Confidence Score Box

The frontend displays how confident the system is in the recommendation.

Example format:

- Confidence Score: 80/100

Confidence should help the user understand whether the recommendation is based on strong project detail or limited information.

## 8. Weak Idea and Low Detail Handling

The frontend must not block analysis when the user gives an incomplete idea.

If the idea is weak or lacks detail, the frontend still displays the result page, but the score should be lower and the warning should explain why.

### 8.1 Example Weak Input

- I want to make an RPG.

### 8.2 Example Frontend Warning

Your idea scored 35/100 because the concept lacks details about gameplay mechanics, target platform, scope, art style, and development constraints.

The system should guide the user by showing what is missing. It should not reject the input.

This behavior is important because early-stage users may not know how to describe their game idea properly. The frontend should turn weak input into useful feedback instead of stopping the analysis.

## 9. Placeholder API Interaction

Section 1 only describes placeholder API calls. It does not define real backend logic, request validation, database behavior, RAG behavior, or AI response generation.

The following endpoints are frontend planning placeholders.

### 9.1 Analyze Project

- POST /analyze-project

Purpose:

- Sends the initial game idea and structured answers for analysis

Frontend responsibility:

- Collect user input
- Send the complete project context
- Receive the analysis result
- Display the returned result cards

### 9.2 Saved Analyses

- GET /saved-analyses

Purpose:

- Fetches saved project analyses

Frontend responsibility:

- Display saved analyses in history and saved analysis pages
- Show score preview, project title or idea preview, and date created

### 9.3 Tool Catalog

- GET /tool-catalog

Purpose:

- Fetches available tools for the tool catalog page

Frontend responsibility:

- Display tool name
- Display tool category
- Display basic tag or label

The frontend must not display deep tool explanations on this page. Tool information depth belongs to Section 2.

### 9.4 Compare Analyses

- POST /compare-analyses

Purpose:

- Sends selected saved analyses for comparison

Frontend responsibility:

- Let the user select two or more analyses
- Display comparison results
- Compare scores, recommended tools, risks, and roadmap difficulty

These placeholder endpoints define frontend expectations only. Full API implementation belongs to Section 5.

## 10. Screen Structure

### 10.1 Landing / Start Screen

Purpose:

The Landing / Start Screen introduces AIssistant - Game Dev Advisor and lets the user enter their initial game idea.

Main Elements:

- App title
- Short product description
- Game idea text input
- Start analysis button

Behavior:

The user writes their game idea in free text. After pressing the start button, the frontend moves to the clarification flow.

The screen should make the product's role clear: AIssistant analyzes a game idea and recommends development tools. It should not imply that the system will build the game for the user.

### 10.2 Clarification Flow Screen

Purpose:

The Clarification Flow Screen collects structured project information after the initial idea.

Main Elements:

- Current question card
- Input field or selectable options
- Progress indicator
- Back button
- Next button

Question Order:

- Genre
- 2D or 3D
- Target platform
- Budget
- Team size
- Skill level
- Available time
- Art style
- Singleplayer or multiplayer

Behavior:

The screen should feel like a guided setup process. The user should always know which question they are answering and how much progress remains.

The flow should not feel like a long static form. The one-by-one structure keeps the input process controlled and reduces confusion.

### 10.3 Result Page

Purpose:

The Result Page displays the agent's analysis clearly.

Main Elements:

- Overall idea score
- Tool recommendation cards
- Tool fit score cards
- Warning box
- Explanation box
- Alternatives box
- Roadmap box
- Confidence score box
- Save analysis button

Behavior:

The result must be card-based. The page should avoid long paragraphs and should prioritize scanability.

The user should be able to quickly answer these questions:

- How strong is my game idea?
- Which tools fit my project?
- Why do these tools fit?
- What are the alternatives?
- What risks should I care about?
- What phases should I follow next?
- How confident is the system?

### 10.4 Project History Page

Purpose:

The Project History Page lets users view previous analyses.

Main Elements:

- Saved project cards
- Project title or game idea preview
- Score preview
- Date created
- Open analysis button

Behavior:

No login is included in the MVP. History can be treated as local or session-based for planning.

Each saved project card should provide enough information for the user to recognize the analysis without opening every item.

### 10.5 Saved Analyses Page

Purpose:

The Saved Analyses Page shows saved analysis results in detail.

Main Elements:

- Saved analysis list
- Score summary
- Recommended tools
- Open result page button

Behavior:

This page gives users a structured way to revisit saved recommendations. It should focus on analysis summaries and access to full result views.

### 10.6 Comparison Page

Purpose:

The Comparison Page lets users compare multiple saved analyses.

Main Elements:

- Selection interface for two or more analyses
- Score comparison
- Recommended tool comparison
- Risk comparison
- Roadmap difficulty comparison

Behavior:

The comparison page helps users decide which game idea is more realistic, which one has better tool fit, and which one has higher development risk.

The comparison should stay focused on analysis output. It should not become a project management page.

### 10.7 Tool Catalog Page

Purpose:

The Tool Catalog Page displays available tools only.

Main Elements:

- Tool name
- Tool category
- Basic tag or label

Behavior:

This page is a simple frontend catalog view. It should not include detailed explanations, long descriptions, tutorials, or decision logic.

Tool information depth belongs to Section 2. The frontend only displays the basic catalog structure.

## 11. Design Direction

The frontend should use a hybrid style:

- Game-development-themed dark UI
- Clean SaaS dashboard layout

The interface should look technical and focused, but not overloaded.

### 11.1 Visual Guidelines

The frontend should use:

- Dark background
- Clear cards and mini-boxes
- Dashboard-style spacing
- Visual score indicators
- Smooth transitions with Framer Motion
- Readable typography
- Minimal visual clutter

### 11.2 UI Tone

The interface should feel like a serious development advisor. It should avoid excessive decoration, noisy game UI effects, and unnecessary animation.

Game-themed styling is allowed, but readability has priority.

### 11.3 Card-Based Layout

Cards should be used for:

- Scores
- Tool recommendations
- Warnings
- Alternatives
- Roadmap phases
- Confidence score
- Saved analyses
- Comparison blocks

This keeps the frontend aligned with the analysis-focused nature of the product.

## 12. Frontend Boundaries

Section 1 defines the user-facing experience only.

It describes:

- Screens
- User flow
- Input collection logic
- Result display logic
- Placeholder API interaction
- History and comparison behavior
- Tool catalog frontend behavior
- Visual design direction

It does not deeply define:

- Component architecture
- State management
- Validation rules
- Backend data model
- RAG logic
- AI implementation
- API implementation details

Those belong to later sections.

## 13. Final Section Definition

The frontend of AIssistant - Game Dev Advisor is a structured web interface that turns a raw game idea into an organized advisory flow.

It begins with a free-text game idea, collects essential project constraints through one-by-one questions, sends the collected information through placeholder API calls, and presents the returned analysis in clear dashboard cards.

The frontend must make the system's limits visible: AIssistant gives analysis, scores the idea, recommends tools, explains fit, shows risks, and supports comparison. It does not build the game, train a model, execute autonomous workflows, or replace the backend, RAG, AI, or API layers.

# Section 2: Tool Information

## Purpose of the Tool Information Layer

Section 2 defines the Tool Information layer of AIssistant - Game Dev Advisor. This layer acts as the structured knowledge foundation used for tool recommendation, comparison support, explanation generation, and RAG retrieval compatibility. The system architecture defines AIssistant as a RAG-powered assistant agent rather than a fine-tuned machine learning model or autonomous agent system.

The purpose of this section is to establish how game development tools and AI tools are represented inside the system, how their metadata is structured, and how that information supports recommendation analysis. This section does not implement AI reasoning logic, ranking execution, or autonomous workflows. Those responsibilities belong to later architectural sections.

The Tool Information layer exists to provide:

- Structured tool knowledge
- Retrieval-friendly metadata
- Score-ready information
- Recommendation explanation support
- Expandable catalog architecture
- Consistent category organization
- User-constraint compatibility

The system is only permitted to analyze and recommend tools. It does not autonomously execute development tasks, install software, generate projects, or replace user decision-making.

## Scope of Tool Representation

Within AIssistant - Game Dev Advisor, a tool represents any software, platform, service, or AI product that supports a user during the game development process. The Tool Information layer must support both traditional game development software and AI-assisted development tools.

The MVP scope includes two primary groups:

- Game Development Tools
- AI Tools

### Game Development Tools

Game development tools include software directly used during development workflows such as:

- Game engines
- IDEs and code editors
- Version control systems
- Art and asset creation software
- Audio production tools
- Deployment and publishing platforms

These tools support the technical, artistic, collaborative, and publishing phases of development.

### AI Tools

AI tools include products that assist development workflows through generation, assistance, or acceleration features. Supported AI tool categories include:

- AI coding assistants
- AI-assisted art tools
- AI-assisted asset generation tools

AI art tools are not treated as a standalone top-level category. They are grouped under Art / Asset Creation to preserve consistent category structure and retrieval organization.

## MVP Tool Categories

The MVP catalog is organized around a fixed set of required categories. These categories represent the minimum structured knowledge coverage required for recommendation generation. The catalog is intentionally expandable and should not be treated as a complete industry-wide database.

The required MVP categories are:

- Game Engine
- IDE / Code Editor
- Version Control
- Art / Asset Creation
- Audio
- AI Coding Assistant
- Deployment / Publishing

Each category contains commonly used and widely adopted tools relevant to solo developers, students, indie teams, and small production groups. The target audience explicitly excludes large enterprise production pipelines.

## Structured Tool Entry Model

Every tool inside the system must be represented as a structured knowledge base entry. The recommendation system depends on metadata consistency because retrieval, comparison, explanation generation, and score calculation all require predictable fields.

Each tool entry must contain the following fields:

- Tool Name
- Category
- Description
- Best Use Case
- Supported Platforms
- Pricing
- Difficulty Level
- Beginner Suitability
- Team-Size Fit
- Genre Fit
- 2D / 3D Fit
- Pros
- Cons
- Alternatives

The catalog must remain standardized across all categories to preserve compatibility with retrieval pipelines and future category expansion.

## Tool Metadata Definitions

### Tool Name

The Tool Name field stores the official product or platform name.

Examples include:

- Unity
- Unreal Engine
- Godot
- Blender
- GitHub
- FMOD
- Steamworks

The field exists primarily for retrieval indexing, recommendation output formatting, and catalog consistency.

### Category

The Category field defines the primary workflow group of the tool.

Examples include:

- Game Engine
- Art / Asset Creation
- AI Coding Assistant

A tool should belong to one primary category even if it supports multiple workflows. This prevents retrieval ambiguity and keeps scoring logic consistent.

### Description

The Description field contains a concise explanation of what the tool does.

Descriptions must remain factual, short, and retrieval-friendly. The system should avoid tutorial-style explanations inside the metadata layer. This field exists to support recommendation explanations and retrieval summarization.

### Best Use Case

The Best Use Case field defines the strongest project scenario for the tool.

Examples include:

- Godot for lightweight indie-focused 2D projects
- Unreal Engine for high-fidelity 3D games
- Aseprite for pixel-art production workflows
- GitHub for collaborative version control

This field is critical for fit analysis because user project goals directly influence recommendation scoring.

### Supported Platforms

The Supported Platforms field defines which operating systems or target environments the tool supports.

Examples include:

- Windows
- macOS
- Linux
- Web
- Mobile
- Console

This metadata directly affects compatibility filtering during recommendation analysis.

### Pricing

The Pricing field defines the monetization structure of the tool.

Supported pricing labels include:

- Free
- Open-source
- Freemium
- Paid
- Subscription
- Revenue-share based
- Enterprise pricing

Budget is one of the core inputs collected by the frontend layer, therefore pricing must directly affect recommendation fit scoring.

### Difficulty Level

The Difficulty Level field defines the learning complexity of the tool.

Suggested labels include:

- Beginner
- Intermediate
- Advanced

This field is intended to support future numeric scoring and compatibility evaluation against user skill level.

### Beginner Suitability

The Beginner Suitability field defines how appropriate a tool is for inexperienced users or users with limited technical background.

This field should remain score-ready.

Example:

- Beginner Suitability: 85/100

This metadata is essential because the frontend collects user skill level and experience information during the project analysis flow.

### Team-Size Fit

The Team-Size Fit field defines which development scales the tool supports effectively.

Supported classifications include:

- Solo developers
- Small teams
- Medium teams
- Larger teams

The MVP prioritizes solo developers, students, indie creators, and small collaborative teams rather than enterprise-scale production structures.

### Genre Fit

The Genre Fit field defines which game genres commonly align well with the tool.

Supported genre examples include:

- Platformer
- RPG
- FPS
- Puzzle
- Visual Novel
- Racing
- Simulation
- Strategy
- Horror

Genre compatibility is mandatory because genre selection is one of the primary frontend inputs.

### 2D / 3D Fit

The 2D / 3D Fit field defines whether the tool is optimized for:

- 2D workflows
- 3D workflows
- Both

This field is especially important for engines, art tools, animation tools, and asset creation systems.

### Pros

The Pros field contains concise strengths of the tool.

Pros exist to explain why a tool may be recommended for a given project scenario. The information must remain short, direct, and comparison-friendly.

### Cons

The Cons field contains concise weaknesses or limitations of the tool.

The recommendation system must provide honest analysis rather than exclusively positive outputs. Cons are mandatory because recommendation transparency is part of the system design philosophy.

### Alternatives

Every tool entry must include at least one alternative tool.

Examples include:

- Unity -> Godot
- Unreal Engine -> Unity
- Blender -> Maya
- GitHub -> GitLab
- VS Code -> JetBrains Rider

Alternatives do not need to be equally strong. Less suitable alternatives should still remain visible so the user can understand why one tool scored lower than another.

## Score-Ready Recommendation Structure

The Tool Information layer must support numerical recommendation scoring. Tools must therefore contain metadata compatible with score generation logic.

Recommendation outputs are expected to produce a 0-100 fit score.

Example:

- Unity: 88/100
- Godot: 91/100
- Unreal Engine: 72/100

The Tool Information layer itself does not execute ranking logic. Instead, it provides the structured metadata required for scoring systems implemented in later architectural layers.

## Weighted Fit Principles

Tool recommendation scoring must not operate as a simple equal-weight average across all categories. Certain production tools carry significantly higher technical impact than others.

### Critical Category Weighting

Game Engine compatibility must carry the highest importance because a poor engine selection creates foundational technical mismatches that supporting tools cannot compensate for.

Strong asset tools or audio systems cannot correct a fundamentally incompatible engine choice.

### Conceptual Weighting Structure

The Tool Information layer must support the following weighting principles:

- Core production tools receive higher importance
- Supporting tools receive lower importance
- User constraints modify recommendation quality
- Critical mismatches reduce total recommendation quality

The execution logic for weighting belongs to the AI implementation layer rather than the metadata layer itself.

### Suggested Category Priority

The recommended category priority order is:

1. Game Engine
2. IDE / Code Editor
3. Version Control
4. Art / Asset Creation
5. AI Coding Assistant
6. Audio
7. Deployment / Publishing

This ordering reflects the relative impact each category has on production feasibility and workflow stability.

## User Input Compatibility

All user inputs collected from the frontend layer must influence recommendation quality and tool selection logic.

The Tool Information layer must support evaluation against:

- Genre
- 2D / 3D
- Target Platform
- Budget
- Team Size
- Skill Level
- Available Time
- Art Style
- Singleplayer / Multiplayer

Each tool entry must therefore contain enough structured information to support compatibility analysis against these inputs.

## Retrieval-Compatible Knowledge Base Design

AIssistant is designed as a RAG-powered system. Tool entries must therefore remain retrieval-friendly and structurally consistent.

Each entry must be:

- Structured
- Categorized
- Searchable
- Comparison-friendly
- Consistent across categories
- Short enough for efficient retrieval
- Detailed enough for recommendation explanation

The catalog must not be treated as permanently hardcoded. The architecture must support future expansion including:

- Additional engines
- Additional AI tools
- Additional deployment platforms
- Additional project categories beyond game development

## Recommendation Explanation Support

The Tool Information layer must support explainable recommendations rather than simple tool listings.

Recommendation outputs should explain:

- Why a tool was selected
- Which user inputs affected the score
- Which constraints increased or reduced compatibility
- Why alternatives scored lower
- Which development phase the tool supports

The explanation system depends on the metadata quality and consistency established within this section.

## Project Phase Mapping

Tools must be mapped to major game development phases so the recommendation system can contextualize recommendations across production workflows.

### Planning

Planning-related workflows may include:

- Project management tools
- Documentation systems

### Programming

Programming workflows include:

- Game Engines
- IDE / Code Editors
- AI Coding Assistants
- Version Control

### Version Control

Version control workflows include:

- GitHub
- GitLab
- Bitbucket

### Art / Assets

Art and asset workflows include:

- Blender
- Aseprite
- Krita
- Photoshop
- AI art tools

### Audio

Audio workflows include:

- FMOD
- Wwise
- Audacity

### Deployment / Publishing

Publishing workflows include:

- Steamworks
- itch.io
- Google Play Console
- App Store Connect

## Frontend Catalog Boundary

The frontend layer only displays simplified catalog information and user-facing summaries.

Frontend responsibilities include:

- Tool names
- Tool categories
- Basic listings

The Tool Information layer defines:

- Metadata structure
- Tool descriptions
- Pros and cons
- Alternatives
- Score-ready fields
- Recommendation relevance
- Phase mapping

This separation preserves architectural clarity between presentation systems and knowledge systems.

## MVP Tool Coverage

The MVP catalog should initially include commonly adopted tools across all required categories. The catalog remains expandable and is not intended to represent the entire industry ecosystem.

### Game Engine

- Unity
- Unreal Engine
- Godot
- GameMaker
- Construct

### IDE / Code Editor

- Visual Studio
- Visual Studio Code
- JetBrains Rider

### Version Control

- GitHub
- GitLab
- Bitbucket

### Art / Asset Creation

- Blender
- Aseprite
- Krita
- Photoshop
- GIMP
- Midjourney
- Leonardo AI
- Scenario
- Meshy

### Audio

- Audacity
- FMOD
- Wwise
- Reaper

### AI Coding Assistant

- ChatGPT
- GitHub Copilot
- Cursor
- Claude
- Gemini

### Deployment / Publishing

- Steamworks
- itch.io
- Google Play Console
- Apple App Store Connect

## Recommendation Output Structure

Recommendation outputs generated from the Tool Information layer must contain structured explanation-ready fields.

Each recommendation output should include:

- Recommended tool
- Tool category
- Score out of 100
- Recommendation reason
- Relevant user inputs
- Pros
- Cons
- At least one alternative
- Alternative score
- Development phase mapping

This structure ensures recommendation transparency and supports user understanding rather than opaque ranking output.

## Out-of-Scope Boundaries

The Tool Information layer explicitly excludes:

- Fine-tuning systems
- Custom machine learning models
- Live web search requirements
- Autonomous workflows
- Automatic tool installation
- Direct external API execution
- Automatic project generation
- Automatic code writing
- Automatic asset production
- Agentic execution systems

The assistant is strictly limited to analysis and recommendation behavior.

# Section 3: AI Implementation

## Section Objective

Section 3 defines the complete AI architecture and reasoning methodology of AIssistant - Game Dev Advisor. The purpose of this layer is to analyze user project ideas, evaluate technical feasibility, retrieve compatible development tools, generate ranked recommendations, and produce structured project guidance outputs.

The AI system operates as an analysis engine only. It does not function as a fully autonomous agent framework and does not perform autonomous execution tasks. Its responsibilities are limited to reasoning, evaluation, retrieval, scoring, ranking, and recommendation generation.

The implementation follows the constraints defined in the Master Canvas:

- no fine-tuning systems
- no machine learning training pipelines
- no embedding-based retrieval
- no autonomous workflow execution
- no persistent memory architecture
- no external automation systems

The AI layer exists strictly to support project analysis and development guidance generation.

## Core AI Philosophy

### Hybrid AI Architecture

AIssistant uses a hybrid AI architecture composed of:

- reasoning-based RAG pipelines
- structured retrieval systems
- deterministic filtering logic
- weighted scoring systems
- reasoning-based evaluation layers

The architecture intentionally avoids becoming:

- a purely rule-based system
- a purely LLM-driven system
- an embedding-driven retrieval system
- a fine-tuned AI ecosystem

Instead, the implementation combines deterministic logic and reasoning-based interpretation into a controlled analysis pipeline. The AI layer interprets project requirements while retrieval systems provide structured compatibility outputs. Final recommendations are generated through ranking, validation, and weighted evaluation logic rather than semantic similarity search.

## System Architecture Definition

### Architecture Type

The implementation uses:

- modular pipelines
- controlled orchestration logic
- reasoning-based retrieval
- deterministic validation systems

The term agent refers only to orchestration and reasoning coordination. The system is not a fully autonomous multi-agent infrastructure. No component independently performs execution tasks outside the controlled analysis flow.

The architecture is designed around controlled analysis boundaries. The AI system never:

- deploys software
- modifies user projects
- executes workflows
- manages infrastructure
- writes production-ready implementations
- performs external automated actions

All outputs are advisory and analytical in nature.

## AI Responsibilities

### Allowed Operations

The AI layer is permitted to:

- analyze project ideas
- interpret project constraints
- evaluate technical feasibility
- retrieve matching tools
- rank recommendations
- compare alternatives
- generate warnings
- generate architecture suggestions
- generate roadmap guidance
- generate stack analysis
- generate implementation sequencing guidance
- calculate category scores
- calculate weighted averages
- reject impossible scopes

The system is designed as a reasoning and evaluation layer rather than an execution layer. Its outputs are informational and strategic.

### Forbidden Operations

The AI system must never:

- generate production code automatically
- autonomously execute workflows
- manage infrastructure
- save persistent memory
- call external services independently
- override explicit user preferences
- continue analysis below trust-score thresholds

These restrictions enforce deterministic boundaries and reduce uncontrolled AI behavior within the MVP architecture.

## Input Interpretation Pipeline

### Frontend Question Collection

Frontend systems collect user inputs through hard-coded question structures. The AI layer does not dynamically generate onboarding questions. Frontend collection remains deterministic and controlled.

Collected inputs include:
- game genre
- 2D or 3D preference
- target platform
- art style
- team size
- budget
- experience level
- available development time
- multiplayer or singleplayer preference
- free-text project description

These structured inputs create the foundation for all downstream reasoning and retrieval operations.

## AI Interpretation Logic

The AI layer interprets:

- structured frontend inputs
- free-text descriptions
- project limitations
- feasibility indicators
- compatibility requirements

Interpretation is performed through:

- reasoning-based classification
- contextual constraint analysis
- deterministic evaluation support
- retrieval alignment logic

The system does not use:

- embeddings
- vector databases
- semantic nearest-neighbor retrieval
- vector similarity search

All interpretation logic remains reasoning-based and constraint-driven.

## Retrieval Architecture

### Retrieval Methodology

The retrieval pipeline follows a sequential reasoning structure:

1. Input interpretation
2. Constraint extraction
3. Tool category matching
4. Rule-based filtering
5. Reasoning-based retrieval
6. Recommendation ranking
7. Alternative generation

Each phase narrows the recommendation space through deterministic constraints before reasoning-based ranking occurs. Retrieval outputs are therefore controlled and bounded rather than probabilistic or unrestricted.

### Vectorless Reasoning-Based RAG

AIssistant uses a vectorless reasoning-based RAG architecture. Retrieval is performed using:

- structured tool metadata
- compatibility logic
- category filtering
- deterministic constraints
- reasoning-based matching

The system intentionally avoids:

- embedding similarity search
- vector indexing systems
- semantic nearest-neighbor retrieval

Tool selection is based on structured compatibility evaluation rather than semantic distance calculations. This design reduces hallucination risk and increases recommendation determinism.

## Tool Recommendation Logic

### Recommendation Structure

Each recommendation output contains:

- one primary recommendation
- minimum one alternative
- maximum two alternatives

Every recommendation includes:

- reasoning explanation
- strengths
- weaknesses
- compatibility analysis
- use-case justification

Recommendations are designed to explain why a tool fits a project rather than simply listing tools.

### Recommendation Priorities

Recommendation generation prioritizes:

- user constraints
- feasibility
- technical compatibility
- workflow compatibility
- scalability
- beginner suitability
- platform support

Explicit user preference always overrides optimization logic. If a technically higher-ranked tool conflicts with the user's chosen ecosystem, the recommendation layer adapts around the user preference rather than force-overriding it.

Example:

- Unreal Engine may receive the highest technical score
- User may explicitly prefer Unity
- Recommendation system adapts around Unity-based workflows

The AI system never overrides explicit user intent.

## Scoring System

### Scoring Architecture

The scoring layer uses:

- per-category scoring
- weighted category systems
- weighted total averages

Each category contains:

- independent score
- category weight
- reasoning explanation

Scoring exists to evaluate realism, compatibility, and implementation viability across multiple dimensions simultaneously.

### Example Scoring Categories

Potential scoring categories include:

- technical feasibility
- budget compatibility
- team compatibility
- scope realism
- learning curve compatibility
- production scalability
- genre suitability
- development speed

These categories collectively determine the final recommendation quality and overall project realism evaluation.

### Weighted Average Logic

Not all categories hold equal importance. Critical systems receive higher weighting inside the recommendation pipeline.

Example:

- game engine compatibility is more critical than auxiliary tooling quality
- feasibility carries more importance than optional workflow optimization

Weighted scoring directly influences:

- recommendation ranking
- trust-score calculations
- analysis validity

The scoring layer therefore acts as both a ranking system and a validation system.

## Trust Score System

### Purpose

The trust score system determines whether full analysis generation is permitted. The score measures:

- project realism
- feasibility
- scope consistency
- constraint compatibility

The purpose of the system is to prevent unrealistic project outputs and unsupported recommendation generation.

### Critical Failure Logic

If trust score falls below a critical threshold:

- recommendation generation stops
- analysis generation stops
- warning output is produced instead

Example scenario:

- solo developer
- zero budget
- AAA MMORPG scope
- unrealistic development timeline

Result:

- trust score approaches zero
- recommendation pipeline is terminated

This validation layer prevents the AI from legitimizing impossible scopes.

## AI Reasoning Layer

### Decision Logic

The reasoning layer performs:

- contradiction detection
- feasibility analysis
- compatibility evaluation
- scope realism validation
- recommendation ranking

This layer exists above retrieval logic. Retrieval alone does not determine outputs. Final recommendations are produced only after reasoning validation is complete.

### Contradiction Handling

The AI detects conflicting constraints such as:

- impossible timelines
- unrealistic scope
- incompatible budget
- unsupported team scale

Detected contradictions may:

- reduce category scores
- reduce trust score
- terminate analysis generation

This validation logic prevents internally inconsistent recommendation outputs.

## Hallucination Mitigation

### Prevention Responsibilities

Section 3 includes explicit hallucination mitigation responsibilities. The architecture must reduce:

- unsupported recommendations
- fabricated compatibility claims
- non-existent tooling references
- unrealistic project suggestions

The AI layer is restricted to validated retrieval outputs and approved metadata structures.

### Mitigation Methods

Hallucination mitigation methods include:

- restricted tool catalogs
- deterministic filtering
- rule-supported retrieval
- structured output formatting
- trust-score validation
- controlled response boundaries

The AI only analyzes information available inside:

- predefined tool catalogs
- validated metadata systems
- approved retrieval outputs

This architecture limits uncontrolled generation and increases consistency across analyses.

## Memory and Context Handling

### MVP Scope Limitations

The MVP architecture does not contain:

- persistent memory systems
- long-term user profiling
- project continuity storage
- session persistence layers

The AI only operates using:

- current session inputs
- current retrieval outputs
- frontend-provided session data

All reasoning remains session-scoped within the MVP architecture.

## Future Expansion Compatibility

### Expandable Architecture

Although autonomous systems remain outside MVP scope, the architecture is intentionally modular enough to support future evolution toward:

- autonomous workflows
- project planning agents
- multi-agent collaboration systems

The implementation is designed so future expansion can occur without requiring a complete architectural redesign.

## Implementation Boundaries

### Explicitly Out-of-Scope Systems

The following systems remain outside Section 3:

- model fine-tuning
- machine learning training pipelines
- vector embedding architectures
- backend persistence systems
- API implementation details
- frontend implementation details
- deployment infrastructure

These responsibilities belong to other architectural sections and must not be merged into the AI reasoning layer.

# Section 4: Vectorless Reasoning-Based RAG Implementation

AIssistant uses a controlled retrieval architecture designed specifically for grounded recommendation generation without relying on embeddings, semantic vector search, fine-tuning, or custom ML systems. The purpose of this layer is to retrieve relevant tool knowledge from a structured catalog before the reasoning system performs scoring, feasibility analysis, and final response generation. This section defines the architecture, retrieval flow, tree navigation logic, fallback behavior, and hallucination-control mechanisms of the vectorless reasoning-based RAG layer.

## Purpose of the Retrieval Layer

Section 4 exists to provide grounded internal context for the reasoning pipeline defined in Section 3. The retrieval layer itself does not produce final user-facing recommendations, weighted scores, trust scores, or feasibility judgments. Its responsibility is limited to retrieving the most relevant structured tool records from the knowledge base.

The architecture intentionally avoids traditional vector database systems. The MVP does not use embeddings, cosine similarity search, semantic indexing, fine-tuned retrieval models, or external ML ranking systems. Instead, retrieval is performed through structured reasoning over a hierarchical knowledge tree.

This design keeps the system aligned with the project constraints established in the Master Canvas:

- The system is not a fine-tuned model.
- The system is not an ML training platform.
- AI is permitted only to perform analysis.
- The system is not allowed to execute autonomous agentic behavior.

## Core Retrieval Methodology

The retrieval architecture uses a vectorless reasoning-based RAG approach. Instead of embedding every document into vector space, the system organizes knowledge as a hierarchical table-of-contents tree structure. The LLM navigates this structure through reasoning-based traversal.

The retrieval flow operates as follows:

1. The frontend collects structured project signals and the free-text game idea.
2. The retrieval layer interprets the project requirements.
3. The system identifies relevant top-level branches of the knowledge tree.
4. The LLM performs tree navigation into deeper subcategories.
5. Relevant tool entries are retrieved from matching branches.
6. Retrieved entries are packaged into structured internal context.
7. Section 3 consumes this context to perform final reasoning and scoring.

The RAG layer itself does not decide whether a project is realistic, optimal, or impossible. It only retrieves grounded knowledge candidates from the catalog.

## Hierarchical Knowledge Base Structure

The MVP knowledge base contains only structured tool information. The retrieval system does not index:

- general game design theory
- legal systems
- backend implementation policies
- impossible-scope warnings
- autonomous execution logic
- external unstructured internet knowledge

The catalog is organized as a hierarchical tree structure that groups tools by development category.

Example structure:

```
Tool Knowledge Base
|- Game Engine
|  |- Unity
|  |- Unreal Engine
|  |- Godot
|- IDE / Code Editor
|  |- Visual Studio
|  |- VS Code
|  |- Rider
|- Version Control
|  |- GitHub
|  |- GitLab
|- Art / Asset Creation
|- Audio
|- AI Coding Assistant
|- Deployment / Publishing
```

Each tool entry acts as a structured knowledge object. These records contain the information defined in Section 2, including category, supported platforms, pricing model, beginner suitability, workflow compatibility, and use-case fit. Section 4 retrieves these entries but does not reinterpret or invent their contents.

## Retrieval Inputs

The retrieval system must use all project signals collected by the frontend layer. Retrieval quality depends entirely on the completeness and consistency of these inputs.

Required retrieval inputs include:

- genre
- 2D or 3D target
- target platform
- budget
- team size
- skill level
- available development time
- art style
- singleplayer or multiplayer structure
- free-text project description

The free-text project idea is not directly vector searched. Instead, the LLM interprets the idea semantically and uses reasoning to navigate the hierarchical catalog structure.

For example:

- A solo beginner creating a 2D pixel-art mobile platformer may prioritize lightweight engines, beginner-friendly editors, and simple deployment pipelines.
- A mid-sized experienced team targeting realistic 3D multiplayer PC development may trigger retrieval from high-performance engine branches and advanced workflow tooling.

The reasoning system uses project context to decide which catalog branches deserve exploration.

## Tree Search Navigation Logic

The retrieval layer performs reasoning-based tree traversal instead of similarity-based ranking. The process begins with category identification and progressively narrows toward specific tool records.

The navigation process follows these stages:

### Stage 1 - Top-Level Category Identification

The system determines which major development domains are relevant to the project. Example categories include:

- Game Engine
- IDE / Code Editor
- Version Control
- Art / Asset Creation
- Audio
- AI Coding Assistant
- Deployment / Publishing

Irrelevant branches are ignored to reduce retrieval noise.

### Stage 2 - Subcategory Navigation

After identifying relevant branches, the system traverses deeper nodes based on project requirements.

Example:

- If the project targets stylized 2D mobile development with low budget constraints, the system may prioritize branches associated with lightweight engines and low-overhead tooling.
- If the project requires high-end 3D rendering and multiplayer architecture, the system may traverse toward advanced engine ecosystems and scalable collaboration tooling.

### Stage 3 - Candidate Retrieval

The system retrieves tool records from the selected branches. Every retrieved candidate must already exist inside the knowledge base. No generated or fabricated tool entries are permitted.

The retrieval layer may retrieve:

- strong-fit candidates
- conditional-fit candidates
- weak-fit alternatives
- explicitly rejected candidates

The final interpretation of these candidates belongs to Section 3.

## Hallucination Control and Traceability

Traceability is the primary hallucination-control mechanism of the system. Every retrieved recommendation candidate must map directly to an existing catalog entry.

The retrieval system follows these strict constraints:

- tools cannot be recommended if they do not exist in the knowledge base
- unsupported claims cannot be fabricated
- catalog facts cannot be invented dynamically
- the LLM may reason over existing entries but cannot create new entries

This creates a bounded reasoning environment where the AI operates only within verified catalog knowledge. The retrieval architecture therefore acts as a containment layer for recommendation generation.

If the catalog lacks information for a specific domain, the system must acknowledge insufficient retrieval confidence rather than hallucinating unsupported expertise.

## Retrieved Context Package

Section 4 outputs an internal structured retrieval package consumed by Section 3. The user never sees raw retrieval output or intermediate tree navigation reasoning.

The retrieved context package includes:

- relevant categories
- candidate tools
- rejected tools
- tool-entry references
- basic fit explanations
- missing-information notes
- retrieval confidence
- fallback status

This package acts as grounded context for the reasoning layer.

Section 4 does not calculate:

- final weighted averages
- final rankings
- trust scores
- feasibility judgments
- user-facing recommendation summaries

Those operations are exclusively handled by Section 3.

## Fallback and Insufficient Retrieval Handling

The retrieval layer must support controlled fallback behavior when the knowledge base cannot confidently support a recommendation flow.

Fallback is triggered when:

- relevant catalog coverage is weak
- retrieved entries are insufficient
- project requirements are excessively ambiguous
- no strong-fit candidates exist
- required tooling domains are missing from the catalog

In these cases, the system returns a fallback status instead of fabricating recommendations.

Section 3 may then:

- display warnings
- lower trust scores
- request stronger clarification
- reduce confidence in generated analysis

This architecture prevents the system from presenting unsupported conclusions with artificial confidence.

## Contradiction Separation Model

Section 4 intentionally separates retrieval from feasibility reasoning. Contradictions between user ambition and catalog reality are not resolved inside the retrieval layer.

Example:

User Profile:

- Solo developer
- Beginner skill level
- No budget
- Wants AAA MMORPG

Section 4 still retrieves relevant tool records associated with MMO-capable ecosystems and development tooling. However, the retrieval layer does not decide whether the project is realistic.

Section 3 later evaluates:

- feasibility
- scope realism
- trust score
- development risk
- resource mismatch
- recommendation confidence

This separation keeps retrieval deterministic and grounded while centralizing judgment logic inside the reasoning layer.

## MVP Constraints and Architectural Limits

The MVP implementation intentionally limits retrieval complexity to maintain system control, explainability, and predictable behavior.

The following systems are explicitly out of scope:

- vector databases
- embedding pipelines
- semantic similarity search
- fine-tuned retrieval models
- custom ML systems
- autonomous agents
- user-visible chain-of-thought retrieval
- external autonomous execution

The system functions only as an analysis and recommendation platform, fully aligned with the constraints defined in the Master Canvas.

## Expandability and Future Evolution

Although the MVP uses a static structured catalog, the architecture is designed for long-term expansion.

Future backend or admin systems may support:

- adding new tool records
- editing existing entries
- reorganizing category structures
- expanding the knowledge hierarchy
- broadening supported development domains

The tree structure must therefore exist as maintainable structured data rather than only prompt-written static text.

This design supports the broader roadmap defined in the Master Canvas, where the assistant may later expand beyond game development into:

- software projects
- AI product development
- vibe-coding workflows
- broader technical production pipelines

## Final Architectural Position

Section 4 establishes AIssistant's retrieval architecture as a grounded, reasoning-driven RAG system that avoids vector databases entirely. The system retrieves knowledge through hierarchical tree traversal and controlled catalog navigation rather than probabilistic embedding similarity.

Its role is not to generate final recommendations, but to provide traceable, hallucination-resistant internal context for the reasoning systems defined in Section 3. This separation preserves architectural clarity, maintains deterministic retrieval boundaries, and keeps the MVP aligned with its non-ML, non-fine-tuning system philosophy.

# Section 5: API and Backend Implementation

## Purpose of the Backend Layer

The backend architecture exists to coordinate communication between the frontend application, the AI reasoning system, and the vectorless reasoning-based RAG pipeline. Its role is infrastructural and orchestration-oriented, not intelligence-oriented.

The backend provides deterministic control around non-deterministic AI outputs. It routes requests, validates structured data, coordinates reasoning pipelines, stores successful analyses, and exposes standardized APIs for frontend consumption.

In alignment with the system-wide constraints defined in the Master Canvas, the backend never performs autonomous actions, independent planning, or agentic execution. The system remains an analysis assistant only.

## Core Backend Philosophy

The backend layer is intentionally separated from the reasoning layer. Its primary objective is orchestration reliability rather than decision-making intelligence.

Core principles:

- Backend coordinates pipelines.
- AI layers generate reasoning.
- Tool catalog remains static during MVP.
- Persistence exists only for successful analysis sessions.
- Infrastructure must remain deterministic even when AI outputs are probabilistic.

The backend does not:

- generate scoring logic
- rank tools independently
- learn from users
- retrain itself
- execute autonomous workflows
- modify external systems

The system architecture maintains strict separation between orchestration and intelligence layers.

## Backend Technology Stack

### Runtime Environment

- Runtime: Node.js
- Framework: Express 5

The backend architecture uses a modular Express-based structure designed for scalability, separation of concerns, and predictable orchestration flow.

Suggested project structure:

- /src
- /routes
- /controllers
- /services
- /orchestrators
- /middleware
- /data
- /utils
- /types

Each layer has an isolated responsibility:

Layer | Responsibility
--- | ---
routes | API endpoint definitions
controllers | Request/response handling
services | Infrastructure logic
orchestrators | AI pipeline coordination
middleware | Validation, rate limiting, errors
data | Static knowledge sources
utils | Shared utilities
types | Shared type definitions

This structure prevents orchestration logic from leaking into infrastructure logic.

## Database Architecture

### Database Choice

- Database Type: MySQL
- Hosting Model: Managed cloud-hosted MySQL infrastructure

The database layer exists for persistence and metadata storage only.

Stored entities include:

- successful analysis sessions
- project history
- user selections
- analysis metadata
- statistics aggregation

The database is explicitly not used for:

- embeddings
- vector similarity search
- semantic retrieval
- long-term AI memory
- model training
- continuous learning systems

The MVP architecture intentionally avoids embedding infrastructure in order to preserve the reasoning-based retrieval philosophy established in Section 4.

## Backend Responsibilities

### Required Responsibilities

The backend must manage:

- API routing
- request validation
- session persistence
- structured response formatting
- AI orchestration flow
- static tool catalog access
- metadata aggregation
- rate limiting
- error propagation
- statistics generation

The backend acts as the controlled execution environment for all orchestration-related operations.

### Restricted Responsibilities

The backend must never handle:

- AI scoring logic
- tool recommendation intelligence
- autonomous decision-making
- embedding generation
- fine-tuning pipelines
- agentic execution
- self-improving systems
- continuous adaptive learning

These constraints preserve architectural clarity between infrastructure and reasoning systems.

## API Architecture

### Tool Endpoints

#### /tools/categories

Purpose:

- returns all available tool categories supported by the system

Examples:

- Game Engines
- IDEs
- Version Control
- Art/Asset Tools
- Audio Tools
- AI Coding Assistants
- Deployment/Publishing

This endpoint exists to support frontend filtering and category rendering.

#### /tools

Purpose:

- returns tool catalog entries
- supports structured querying and filtering

Supported filter examples:

- category
- platform support
- budget suitability
- difficulty level
- team-size compatibility
- 2D/3D compatibility

The endpoint only exposes static knowledge-base data during MVP.

#### /tools/:id

Purpose:

- returns detailed information for a single tool entry

Returned information may include:

- description
- best use cases
- supported platforms
- pricing structure
- beginner suitability
- pros and cons
- alternatives

The endpoint provides deterministic structured information and does not invoke AI reasoning.

### Advisor Endpoints

#### /advisor/analyze

Purpose:

- main orchestration endpoint for project analysis

This endpoint coordinates the complete AI pipeline.

Pipeline flow:

```
Frontend Input
   |
Validation Layer
   |
Pipeline Orchestrator
   |
Section 4 RAG Retrieval
   |
Section 3 AI Reasoning
   |
Tool Matching
   |
Trust Score Validation
   |
Response Formatter
   |
Frontend Response
```

The endpoint must:

- accept project idea input
- accept structured frontend questionnaire data
- trigger orchestrated reasoning flow
- return structured analysis output

The backend coordinates execution flow but does not generate reasoning itself.

#### /advisor/sessions

Purpose:

- returns previously stored successful analyses

Important architectural rule:

- historical sessions do not influence future analyses

Stored sessions function only as historical records and not as adaptive memory.

#### /advisor/sessions/:id

Purpose:

- returns a single stored analysis session

Returned data includes:

- user inputs
- structured selections
- generated scores
- tool recommendations
- final AI summary
- timestamp metadata

This endpoint exists purely for frontend history viewing functionality.

#### /advisor/stats

Purpose:

- returns aggregated metadata and analytical statistics

Possible outputs:

- most analyzed genres
- most recommended engines
- average trust score
- most selected target platforms

This endpoint is analytical only and does not affect orchestration behavior.

## Pipeline Orchestration System

### Centralized Orchestration Layer

The backend communicates with the AI reasoning layer and the RAG retrieval layer through a centralized orchestration system.

The orchestrator is responsible for:

- sequential pipeline execution
- context packaging
- request routing
- response merging
- validation checkpoints
- error propagation

The orchestrator does not:

- generate reasoning
- modify scores
- override AI conclusions
- replace retrieval decisions

Its purpose is coordination, not intelligence.

## Section 4 Integration

### Vectorless Reasoning-Based RAG Coordination

The backend integrates directly with the reasoning-based retrieval system defined in Section 4.

Expected retrieval pipeline:

```
Query Decomposition
   |
Hierarchical Tree Navigation
   |
Node Scoring
   |
Context Retrieval
   |
Ranked Context Delivery
```

The backend coordinates this flow and transports structured context between systems.

The architecture explicitly avoids:

- vector databases
- embedding generation
- semantic similarity infrastructure

This preserves the deterministic reasoning-tree architecture established for the MVP.

## Tool Catalog Architecture

### Static JSON Knowledge Base

During MVP, the tool catalog is implemented using structured static JSON files.

Reasons for this decision:

- simpler infrastructure
- faster development iteration
- predictable retrieval structure
- lower maintenance complexity
- easier portability

Example structure:

```json
{
   "id": "unity",
   "category": "game-engine",
   "name": "Unity",
   "pricing": "Free/Paid",
   "difficulty": "Intermediate",
   "supports2D": true,
   "supports3D": true
}
```

Dynamic admin-managed systems belong only to future roadmap expansion.

## Trust Score Enforcement

### Critical Trust Threshold Handling

Trust score generation belongs to the AI reasoning layer. Backend responsibilities are limited to:

- receiving trust score results
- applying enforcement rules
- blocking invalid persistence operations

If a trust score falls below the critical threshold:

- only a warning response is returned
- full analysis payload is not generated
- session persistence is rejected

Example scenario:

- solo developer
- zero budget
- AAA MMORPG scope

In this situation, the backend enforces system rules without becoming the scoring authority itself.

## Response Architecture

### Structured JSON Responses

Core system endpoints must return deterministic structured JSON.

Examples:

- /tools
- /advisor/sessions
- /advisor/stats

Purpose:

- stable frontend rendering
- predictable contracts
- easier filtering and processing

### Markdown-Ready AI Responses

AI-generated summaries may return Markdown-formatted text.

Examples:

- final analysis summaries
- recommendation explanations
- warning outputs

This content originates from the AI reasoning pipeline rather than the backend itself.

## Persistence Rules

### Persisted Data

Only successful analyses may be stored.

Stored elements include:

- session metadata
- user selections
- generated recommendations
- scores
- final summaries

### Non-Persisted Data

The system must never persist:

- failed analyses
- rejected ideas
- partial orchestration states
- internal reasoning traces
- retrieval scoring trees
- AI chain-of-thought data

This preserves privacy, reduces infrastructure complexity, and prevents hidden adaptive behavior.

## Middleware Requirements

### Rate Limiting Middleware

Purpose:

- prevent API abuse
- protect AI infrastructure resources
- control operational costs

Rate limiting is mandatory during MVP.

### Validation Middleware

Purpose:

- ensure required frontend fields exist
- reject malformed payloads
- normalize structured requests

Validation occurs before orchestration begins.

### Error Handling Middleware

Purpose:

- centralize backend failure handling
- standardize API error responses
- safely terminate orchestration failures

The backend must never expose internal orchestration state through raw error output.

## Session Philosophy

The system supports historical viewing only. Sessions are:

- isolated records
- non-adaptive
- non-learning
- context-independent

Previous analyses do not influence future reasoning behavior. This preserves deterministic orchestration consistency across all sessions.

## Explicitly Out of Scope

The following systems are excluded from MVP implementation:

- authentication systems
- user account infrastructure
- admin dashboards
- embedding databases
- fine-tuning systems
- autonomous multi-agent execution
- background AI workers
- real-time collaboration
- deployment automation infrastructure
- continuous learning systems
- AI self-improvement mechanisms
- auto-updating tool ecosystems

These systems belong only to potential future roadmap expansion.

## Roadmap Alignment

Future expansion paths may include:

- larger tool catalogs
- broader software development domains
- expanded assistant categories
- admin-managed knowledge systems
- more advanced orchestration pipelines

These concepts remain roadmap-only considerations and are not implemented MVP features.
