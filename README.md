# Assessment · Especialista en Automatización y Agentes de IA
**Fundación Génesis Empresarial · Área: Planeación Estratégica**

Sistema de análisis estratégico automatizado con pipeline Multi-LLM, RAG semántico, detección de semáforos y notificaciones ejecutivas en tiempo real. Diseñado para la evaluación de 100 puntos del proceso de contratación — Área de TI / Automatización.

---

## Tabla de contenido

1. [Arquitectura del sistema](#arquitectura-del-sistema)
2. [Agentes IA — Multi-LLM](#agentes-ia--multi-llm)
3. [Fuentes de datos integradas](#fuentes-de-datos-integradas)
4. [Lógica de semáforos](#lógica-de-semáforos)
5. [Trazabilidad: run\_id, logs y evidencias](#trazabilidad-run_id-logs-y-evidencias)
6. [Requisitos e instalación](#requisitos-e-instalación)
7. [Ejecución paso a paso](#ejecución-paso-a-paso)
8. [API REST del dashboard](#api-rest-del-dashboard)
9. [Páginas del dashboard web](#páginas-del-dashboard-web)
10. [Variables de entorno](#variables-de-entorno)
11. [Notas de diseño y supuestos](#notas-de-diseño-y-supuestos)

---

## Arquitectura del sistema

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                          FUENTES DE DATOS                                    ║
║  ┌──────────────────┐  ┌───────────────┐  ┌────────────────────────────┐    ║
║  │  SQLite .db      │  │  CSV / Excel  │  │  Mock API (JSON + OpenAPI) │    ║
║  │  (primaria)      │  │  (fallback)   │  │  (fuente externa simulada) │    ║
║  │  432 ind · 130p  │  │  7 archivos   │  │  /data/mock_api/*.json     │    ║
║  └────────┬─────────┘  └───────┬───────┘  └─────────────┬──────────────┘    ║
╚═══════════╪════════════════════╪══════════════════════════╪═══════════════════╝
            │  pandas_reader     │  csv_reader              │  mock_api_reader
            └─────────────┬──────┘──────────────────────────┘
                          ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║              PIPELINE ORQUESTADO — pipeline/orchestrator.py                  ║
║                                                                               ║
║  Fase 1 ▶ INGESTA ──────── Unifica SQLite + CSV + Mock API → pandas DF      ║
║  Fase 2 ▶ DETECCIÓN ──────── detect.py → Semáforo por indicador/proyecto    ║
║  Fase 3 ▶ RAG INDEX ──────── ChromaDB + sentence-transformers (embeddings)  ║
║  Fase 4 ▶ AGENT 1 ──────── Alertas ejecutivas por evento de desviación      ║
║          ┌─────────────────────────────────────────────────────────────┐    ║
║          │  Proveedor A: Google Gemini Flash  (gemini_agent.py)        │    ║
║          │  Proveedor B: Claude Haiku         (haiku_agent.py)  ← FB   │    ║
║          │  → Auto-selección vía GOOGLE_API_KEY env var                │    ║
║          └─────────────────────────────────────────────────────────────┘    ║
║  Fase 5 ▶ AGENT 2 ──────── Resumen ejecutivo + Índice RAG en ChromaDB       ║
║          ┌─────────────────────────────────────────────────────────────┐    ║
║          │  Proveedor B: Anthropic Claude Sonnet (claude_agent.py)     │    ║
║          │  → RAG: retriever.py → ChromaDB → contexto semántico        │    ║
║          └─────────────────────────────────────────────────────────────┘    ║
║  Fase 6 ▶ GRÁFICAS ──────── charts.py → Matplotlib PNG (3 tipos)            ║
║  Fase 7 ▶ NOTIFICACIONES ── WhatsApp real + Email HTML ejecutivo             ║
║  Fase 8 ▶ TRAZABILIDAD ──── MySQL → run_id + timestamps + log completo      ║
╚══════════════════════════════════════════════════════════════════════════════╝
                          │
                          ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                    DASHBOARD WEB (Next.js 16 + React 19)                     ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │  /          Dashboard ejecutivo: KPIs, semáforos, alertas, pipeline    │  ║
║  │  /datos     Explorador DB + preview tablas + upload drag-and-drop      │  ║
║  │  /settings  Config WhatsApp + SMTP email con prueba integrada          │  ║
║  │  /audit     Trazabilidad completa: run_logs + chat_history + AI logs   │  ║
║  │  Chat IA    Botón flotante: Claude Sonnet + Ollama + Gemini + gráficas │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Agentes IA — Multi-LLM

El sistema implementa **dos agentes independientes** con distintos proveedores LLM, cada uno con un rol diferenciado. Ambos heredan de `BaseAgent` (patrón Strategy / Abstract Factory).

### Tabla comparativa de agentes

| | **Agente 1 — Insights Ejecutivos** | **Agente 2 — Chat + RAG** |
|---|---|---|
| **Proveedor principal** | Google Gemini Flash | Anthropic Claude Sonnet |
| **Proveedor fallback** | Claude Haiku (auto si no hay GOOGLE_API_KEY) | Ollama local → OpenAI |
| **Archivo** | `pipeline/agents/gemini_agent.py` | `pipeline/agents/claude_agent.py` |
| **Modelo** | `gemini-2.0-flash` | `claude-sonnet-4-20250514` |
| **Rol** | Genera alerta ejecutiva por cada desviación detectada (rojo/amarillo) | Responde preguntas en lenguaje natural con contexto RAG |
| **RAG** | No | Sí — ChromaDB + sentence-transformers |
| **Evidencia** | `alertas` en MySQL + `evidence/alertas_sample.json` | `chat_history` en MySQL + `evidence/chat_demo_q1.txt` |
| **Dashboard web** | Sección "Alertas Ejecutivas" en `/` | Chat flotante + `/api/chat/stream` |

### Abstracción por proveedor

```python
# pipeline/agents/base_agent.py — Contrato común para todos los agentes
class BaseAgent(ABC):
    @abstractmethod
    def generate(self, prompt: str, system: str | None = None) -> str: ...

    @property
    def provider(self) -> str: ...
    # Valores: "google-gemini" | "anthropic-haiku" | "anthropic-sonnet" | "openai" | "ollama"

# Implementaciones concretas:
class GeminiInsightsAgent(BaseAgent):   # pipeline/agents/gemini_agent.py
    provider = "google-gemini"
    model    = "gemini-2.0-flash"

class HaikuInsightsAgent(BaseAgent):    # pipeline/agents/haiku_agent.py
    provider = "anthropic-haiku"
    model    = "claude-haiku-4-5-20251001"

class ClaudeAgent(BaseAgent):           # pipeline/agents/claude_agent.py
    provider = "anthropic-sonnet"
    model    = "claude-sonnet-4-20250514"

# Orquestador selecciona Agent 1 automáticamente:
agent1 = GeminiInsightsAgent() if os.getenv("GOOGLE_API_KEY") else HaikuInsightsAgent()
agent2 = ClaudeAgent()
```

> **Cambiar de proveedor** = una sola variable de entorno. Sin modificar código.

### Chat Multi-LLM en el Dashboard Web

El chat flotante soporta 4 proveedores en tiempo real (seleccionables desde la UI):

| Proveedor | Modelo | Uso |
|---|---|---|
| **Claude** | `claude-sonnet-4-20250514` | Chat completo con herramientas (BD, gráficas, WhatsApp, email) |
| **Ollama** | Configurable (`deepseek-r1`, `llama3`, etc.) | Modelo local / remoto; contexto pre-cargado desde MySQL |
| **Gemini** | `gemini-2.0-flash` | Alternativa rápida y económica |
| **OpenAI** | `gpt-4o-mini` | Fallback final |

---

## Fuentes de datos integradas

| Fuente | Tipo | Archivo | Descripción |
|---|---|---|---|
| **SQLite** | Primaria | `data/assessment_planeacion.db` | 432 registros indicadores, 130 proyectos, 3 años (2023–2025) |
| **CSV** | Fallback | `data/indicadores_*.csv`, `data/proyectos_*.csv` | 7 archivos, misma semántica que SQLite |
| **Mock API** | Externa simulada | `data/mock_api/*.json` | Simula API REST externa; incluye `openapi.yaml` para documentación |

### Esquema de tablas MySQL (`assessment_db`)

```sql
-- Tablas de dimensiones
indicadores_dim      (indicador_id, nombre, unidad, direccion, meta_anual, run_id)
proyectos_dim        (proyecto_id, nombre, responsable, area_responsable, descripcion, run_id)
relacion_indicador_proyecto (indicador_id, proyecto_id, run_id)

-- Tablas de hechos (series mensuales)
indicadores_fact     (indicador_id, periodo, meta, realizado, semafor, desviacion_pct, run_id)
proyectos_fact       (proyecto_id, periodo, avance_planificado_pct, avance_real_pct, semafor, desviacion_pct, run_id)

-- Trazabilidad y auditoría (ver sección completa abajo)
run_logs             (run_id, status, created_at, finished_at, fuentes_usadas, total_indicadores, ...)
alertas              (id, run_id, tipo, entidad_id, nombre_entidad, periodo, semafor, ...)
chat_history         (id, run_id, session_id, proveedor, modelo, contenido, tokens_usados, ...)
app_config           (clave, valor, updated_at)
```

---

## Lógica de semáforos

### Indicadores (`detect.py`)

| Tipo de dirección | Verde | Amarillo | Rojo |
|---|---|---|---|
| `higher_is_better` (ej: % clientes digitales) | Realizado ≥ Meta | Desviación ≤ 5% bajo meta | Desviación > 5% bajo meta |
| `lower_is_better` (ej: tasa morosidad) | Realizado ≤ Meta | Desviación ≤ 5% sobre meta | Desviación > 5% sobre meta |

### Proyectos (avance real vs planificado)

| Verde | Amarillo | Rojo |
|---|---|---|
| Brecha ≤ 5 puntos porcentuales | Brecha entre 5 y 15 pp | Brecha > 15 pp |

### Fórmula de desviación

```python
# Para indicadores higher_is_better:
desviacion_pct = ((realizado - meta) / meta) * 100

# Para proyectos:
brecha_pp = avance_planificado_pct - avance_real_pct
```

---

## Trazabilidad: run\_id, logs y evidencias

Esta sección documenta el sistema completo de trazabilidad implementado. Cada ejecución del pipeline genera un identificador único `run_id` (UUID v4) que actúa como **clave primaria de auditoría** a lo largo de toda la cadena de procesamiento.

### Ciclo de vida del run\_id

```
python3 pipeline/run.py
        │
        ▼
 logger.py: run_id = str(uuid.uuid4())
        │   → INSERT run_logs (run_id, status='running', created_at=NOW())
        │
        ▼
 orchestrator.py — 8 fases, todas reciben run_id como parámetro
        │
        ├─ Fase 1: Ingesta  → fuentes_usadas guardado en run_logs
        ├─ Fase 2: Detect   → indicadores_fact / proyectos_fact (run_id en cada fila)
        ├─ Fase 3: RAG      → embeddings_meta (run_id en cada chunk)
        ├─ Fase 4: Agent 1  → alertas.run_id (alerta vinculada al run)
        ├─ Fase 5: Agent 2  → chat_history.run_id (resumen vinculado al run)
        ├─ Fase 6: Charts   → nombre de archivo incluye run_id (semaforo_<run_id>.png)
        ├─ Fase 7: Notify   → alertas.whatsapp_log + email confirmado
        └─ Fase 8: Close    → UPDATE run_logs SET status='completed', finished_at=NOW()
```

### Tablas de trazabilidad en MySQL

#### `run_logs` — Metadatos de cada ejecución

```sql
CREATE TABLE run_logs (
  run_id             VARCHAR(36)  PRIMARY KEY,          -- UUID v4
  status             ENUM('running','completed','failed') NOT NULL,
  created_at         DATETIME     NOT NULL DEFAULT NOW(),
  finished_at        DATETIME,
  fuentes_usadas     JSON,         -- ["sqlite","csv","mock_api"]
  total_indicadores  INT,
  total_proyectos    INT,
  alertas_generadas  INT,
  rag_chunks         INT,
  error_msg          TEXT          -- NULL si exitoso
);
```

**Ejemplo real de un registro:**
```json
{
  "run_id":            "94786500-ab12-4c3d-8ef0-123456789abc",
  "status":            "completed",
  "created_at":        "2025-04-26 09:14:32",
  "finished_at":       "2025-04-26 09:16:08",
  "fuentes_usadas":    ["sqlite", "mock_api"],
  "total_indicadores": 432,
  "total_proyectos":   130,
  "alertas_generadas": 10,
  "rag_chunks":        562,
  "error_msg":         null
}
```

#### `alertas` — Alertas ejecutivas generadas por el Agente 1

```sql
CREATE TABLE alertas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  run_id          VARCHAR(36)  NOT NULL,  -- FK → run_logs
  tipo            ENUM('indicador','proyecto'),
  entidad_id      VARCHAR(20),             -- Ej: 'I001C', 'P002'
  nombre_entidad  VARCHAR(200),
  periodo         VARCHAR(7),              -- Ej: '2024-11'
  semafor         ENUM('rojo','amarillo'),
  meta            DECIMAL(12,2),
  realizado       DECIMAL(12,2),
  desviacion_pct  DECIMAL(8,2),
  texto_alerta    TEXT,                    -- Generado por Gemini/Haiku
  proveedor_llm   VARCHAR(50),             -- 'google-gemini' | 'anthropic-haiku'
  modelo_llm      VARCHAR(100),
  whatsapp_log    TEXT,                    -- Respuesta API WA (JSON)
  created_at      DATETIME DEFAULT NOW()
);
```

**Ejemplo real de alerta generada:**
```
🔴 ALERTA EJECUTIVA – CRECIMIENTO DIGITAL EN RIESGO
Período: 2024-11 | Indicador: I001C | Desviación: -53.33%

CONTEXTO:
El crecimiento de clientes digitales en noviembre alcanzó únicamente 42 clientes
frente a la meta de 90, representando una brecha de -53.33%.
El proyecto Onboarding Digital 2.0, responsable de impulsar esta métrica, 
mantiene estatus rojo con 18pp de brecha frente al avance planificado.

IMPACTO POTENCIAL:
Esta desviación crítica compromete objetivos anuales de transformación digital
y afecta directamente los ingresos proyectados del canal online.

RECOMENDACIONES:
1. Auditoría urgente de Onboarding Digital 2.0: identificar bloqueos en 48h.
2. Plan de contingencia: recuperar ≥50 clientes antes del cierre del trimestre.
3. Escalación de recursos o apoyo externo especializado.

Trazabilidad: run_id=94786500-ab12-4c3d, periodo=2024-11,
              fuente=sqlite:assessment_planeacion.db,
              agente=google-gemini (gemini-2.0-flash)
```

#### `chat_history` — Auditoría de interacciones con el Chat IA

```sql
CREATE TABLE chat_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  run_id         VARCHAR(36),              -- FK → run_logs (puede ser NULL en chat libre)
  session_id     VARCHAR(100),             -- UUID de la sesión de chat
  rol            ENUM('user','assistant'),
  proveedor      VARCHAR(50),              -- 'claude' | 'gemini' | 'ollama' | 'openai'
  modelo         VARCHAR(100),             -- Nombre exacto del modelo usado
  contenido      TEXT,
  tokens_usados  INT,
  chunks_usados  JSON,                     -- IDs de chunks RAG utilizados
  created_at     DATETIME DEFAULT NOW()
);
```

#### `embeddings_meta` — Metadata del índice RAG

```sql
CREATE TABLE embeddings_meta (
  chunk_id    VARCHAR(100) PRIMARY KEY,    -- ID en ChromaDB
  run_id      VARCHAR(36),                 -- FK → run_logs
  tipo        ENUM('indicador','proyecto','alerta'),
  entidad_id  VARCHAR(20),
  periodo     VARCHAR(7),
  texto       TEXT,                        -- Texto del chunk indexado
  created_at  DATETIME DEFAULT NOW()
);
```

### Log de ejecución (`outputs/pipeline.log`)

Cada ejecución produce un log estructurado en `outputs/pipeline.log`. Formato:

```
2025-04-26 09:14:32 [INFO]  run_id=94786500 | INICIO pipeline
2025-04-26 09:14:32 [INFO]  run_id=94786500 | Fase 1: Ingesta SQLite → 432 indicadores, 130 proyectos
2025-04-26 09:14:33 [INFO]  run_id=94786500 | Fase 1: Ingesta Mock API → 6 proyectos adicionales
2025-04-26 09:14:34 [INFO]  run_id=94786500 | Fase 2: Detección semáforos → 83 rojo, 72 amarillo, 277 verde
2025-04-26 09:14:38 [INFO]  run_id=94786500 | Fase 3: RAG indexado → 562 chunks en ChromaDB
2025-04-26 09:14:39 [INFO]  run_id=94786500 | Fase 4: Agent 1 (google-gemini/gemini-2.0-flash) → 10 alertas
2025-04-26 09:14:52 [INFO]  run_id=94786500 | Fase 4: WA enviado → 10/10 exitosos
2025-04-26 09:15:10 [INFO]  run_id=94786500 | Fase 5: Agent 2 (anthropic-sonnet) → resumen ejecutivo
2025-04-26 09:15:18 [INFO]  run_id=94786500 | Fase 6: Gráficas generadas → 3 PNG en outputs/charts/
2025-04-26 09:16:08 [INFO]  run_id=94786500 | COMPLETADO en 96s | status=completed
```

### Consultas útiles de trazabilidad

```sql
-- Ver todos los runs con su estado y duración
SELECT run_id, status,
       TIMESTAMPDIFF(SECOND, created_at, finished_at) AS duracion_seg,
       alertas_generadas, total_indicadores
FROM run_logs
ORDER BY created_at DESC LIMIT 10;

-- Alertas del último run exitoso
SELECT a.entidad_id, a.nombre_entidad, a.periodo,
       a.semafor, a.desviacion_pct, a.proveedor_llm, a.texto_alerta
FROM alertas a
JOIN run_logs r ON r.run_id = a.run_id
WHERE r.status = 'completed'
ORDER BY r.created_at DESC, ABS(a.desviacion_pct) DESC;

-- Historial de conversaciones por sesión
SELECT session_id, rol, proveedor, modelo,
       LEFT(contenido, 100) AS preview, tokens_usados
FROM chat_history
ORDER BY created_at DESC LIMIT 20;

-- Chunks RAG usados en el último run
SELECT entidad_id, tipo, periodo, LEFT(texto, 80) AS preview
FROM embeddings_meta
WHERE run_id = (SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1);
```

### Archivos de evidencia

```
evidence/
├── pipeline_run_sample.log     ← Log completo de una ejecución real (INFO/WARNING/ERROR)
├── alertas_sample.json         ← 10 alertas ejecutivas generadas (run_id, texto, WA log)
├── chat_demo_q1.txt            ← Consulta 1 al Chat IA + respuesta Claude Sonnet
├── chat_demo_q2.txt            ← Consulta 2 + gráfica generada bajo demanda
└── charts/
    ├── semaforo_sample.png     ← Donut: distribución verde/amarillo/rojo
    ├── proyectos_sample.png    ← Barras: avance real vs planificado (top 10)
    └── serie_I001C_sample.png  ← Serie temporal 2023–2025 (meta vs realizado)
```

---

## Requisitos e instalación

### Requisitos de sistema

- **Python 3.9+**
- **Node.js 18+**
- **MySQL 5.7+** (XAMPP local o Cloud SQL)
- **API key Anthropic** — requerida para Agent 2 y chat
- **API key Google AI** — recomendada para Agent 1 (gratuita en [aistudio.google.com](https://aistudio.google.com))

### Paso 1 — Variables de entorno

```bash
cd assessment/
cp .env.example .env
```

Editar `.env` con los valores mínimos requeridos:

```env
# ── Obligatorio ──────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# ── Recomendado (Agent 1 — alertas con Gemini) ───────────
GOOGLE_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── MySQL ─────────────────────────────────────────────────
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=assessment_db
```

Copiar para el dashboard web:

```bash
cp .env web/.env.local
```

### Paso 2 — Base de datos MySQL

```bash
# Con XAMPP (sin password):
mysql -u root -e "CREATE DATABASE IF NOT EXISTS assessment_db;"
mysql -u root assessment_db < schema.sql

# Verificar:
mysql -u root assessment_db -e "SHOW TABLES;"
# Debe mostrar: run_logs, indicadores_dim, indicadores_fact, proyectos_dim,
#               proyectos_fact, relacion_indicador_proyecto, alertas,
#               chat_history, app_config, embeddings_meta
```

### Paso 3 — Dependencias Python

```bash
cd assessment/
pip3 install -r pipeline/requirements.txt
```

Paquetes principales:
```
anthropic>=0.40.0           # Claude Sonnet + Haiku
google-generativeai>=0.8.0  # Gemini Flash
mysql-connector-python>=8.3  # MySQL
chromadb>=0.5.0             # Vector DB para RAG
sentence-transformers>=3.0  # Embeddings semánticos
matplotlib>=3.8             # Gráficas PNG
pandas>=2.0                 # Manipulación de datos
python-dotenv>=1.0          # Variables de entorno
```

### Paso 4 — Dashboard web (Next.js)

```bash
cd assessment/web/
npm install
```

---

## Ejecución paso a paso

### Opción A — CLI (pipeline completo)

```bash
cd assessment/

# Ejecutar pipeline completo end-to-end:
python3 pipeline/run.py --data-dir data --sqlite data/assessment_planeacion.db

# Salida esperada en consola:
# [INFO]  run_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# [INFO]  Fase 1: Ingesta completada → 432 indicadores, 130 proyectos
# [INFO]  Fase 2: Semáforos → 83 rojo, 72 amarillo, 277 verde
# [INFO]  Fase 3: RAG → 562 chunks indexados en ChromaDB
# [INFO]  Fase 4: Agent 1 (Gemini Flash) → 10 alertas generadas
# [INFO]  Fase 5: Agent 2 (Claude Sonnet) → resumen ejecutivo generado
# [INFO]  Fase 6: 3 gráficas PNG guardadas en outputs/charts/
# [INFO]  Fase 7: WhatsApp enviado (10/10)
# [INFO]  Fase 8: run_id guardado en MySQL → status=completed
```

**Salida JSON del pipeline:**
```json
{
  "run_id":    "94786500-ab12-4c3d-8ef0-123456789abc",
  "status":    "completed",
  "indicadores": 432,
  "proyectos":   130,
  "alertas":     10,
  "rag_chunks":  562,
  "charts": [
    "outputs/charts/semaforo_94786500.png",
    "outputs/charts/proyectos_2024-12_94786500.png",
    "outputs/charts/serie_I001C_94786500.png"
  ],
  "duracion_seg": 96
}
```

### Opción B — Dashboard web (recomendado)

```bash
cd assessment/web/
npm run dev
# Dashboard en: http://localhost:3000
```

**Flujo desde el dashboard:**
1. Abrir `http://localhost:3000`
2. Botón **"Ejecutar Pipeline"** → corre las 8 fases y muestra progreso en vivo
3. Al finalizar: KPIs y semáforos actualizados, alertas visibles
4. **Chat IA** (botón flotante abajo-derecha) → preguntas en lenguaje natural
5. **`/datos`** → explorador de archivos + upload drag-and-drop + ingest automático
6. **`/audit`** → ver run_logs, chat_history, alertas por run_id

### Opción C — Chat IA por CLI

```bash
# Consulta directa con RAG (requiere haber ejecutado el pipeline antes):
python3 pipeline/chat_cli.py "¿Cuál es el indicador con mayor desviación en 2024?" \
        --session-id demo-session-01

# Consulta de gráfica:
python3 pipeline/chart_cli.py --run-id 94786500-ab12-4c3d-8ef0-123456789abc
```

---

## API REST del dashboard

| Endpoint | Método | Descripción |
|---|---|---|
| `GET /api/dashboard` | GET | Último run: KPIs + semáforos + top alertas + peores indicadores |
| `GET /api/alerts` | GET | Lista alertas con filtros: `?semafor=rojo&run_id=xxx&limit=10` |
| `POST /api/chat` | POST | Chat Claude Sonnet + RAG. Body: `{pregunta, session_id, historial}` |
| `GET /api/chat/stream` | GET | Chat SSE streaming multi-LLM con herramientas (BD, gráficas, WA, email) |
| `POST /api/pipeline` | POST | Ejecutar pipeline Python completo desde el dashboard web |
| `POST /api/upload` | POST | Subir archivos multipart + ejecutar ingesta automática |
| `GET /api/data` | GET | Lista archivos en `data/` categorizados por tipo |
| `GET /api/data/info?file=X` | GET | Preview tabla: SQLite / CSV / JSON (primeras 50 filas) |
| `GET /api/ai-logs` | GET | Historial de llamadas IA (proveedor, modelo, tokens) |
| `GET /api/audit` | GET | run_logs + chat_history + alertas agrupadas por run_id |
| `GET /api/settings` | GET | Leer config WhatsApp + SMTP almacenada en `app_config` |
| `POST /api/settings` | POST | Guardar config WA + SMTP |
| `POST /api/settings/test-wa` | POST | Probar envío WhatsApp en tiempo real |
| `POST /api/settings/test-email` | POST | Probar envío email HTML |
| `GET /api/charts/[file].png` | GET | Servir gráficas PNG generadas por el pipeline |
| `POST /api/media/gamma` | POST | Generar presentación Gamma.app desde texto/datos |
| `POST /api/media/image` | POST | Generar infografía con gpt-image-2 / DALL-E 3 |
| `POST /api/media/tts` | POST | Text-to-speech (Minimax TTS) |

---

## Páginas del dashboard web

| Ruta | Descripción |
|---|---|
| `/` | Dashboard ejecutivo: KPIs globales, distribución semáforos, top alertas, botón pipeline |
| `/datos` | Explorador de archivos + vista previa de tablas + upload drag-and-drop |
| `/settings` | Configuración WhatsApp + SMTP email con pruebas integradas desde UI |
| `/audit` | Trazabilidad completa: run_logs, alertas, chat_history agrupados por run_id |
| `/ai-logs` | Auditoría de todas las llamadas a LLMs (proveedor, modelo, tokens, contenido) |
| Chat flotante | Botón bottom-right: chat Claude/Ollama/Gemini + gráficas + presentaciones + infografías |

---

## Variables de entorno

Archivo de referencia: `.env.example` (en la raíz del proyecto). El dashboard web usa `web/.env.local`.

| Variable | Descripción | Requerida |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key Anthropic (Agent 2 + fallback Agent 1 + chat) | ✅ Sí |
| `GOOGLE_API_KEY` | API key Google AI (Agent 1 — Gemini Flash) | Recomendada |
| `ANTHROPIC_MODEL_HAIKU` | Modelo Haiku | No — default: `claude-haiku-4-5-20251001` |
| `ANTHROPIC_MODEL_SONNET` | Modelo Sonnet | No — default: `claude-sonnet-4-20250514` |
| `GOOGLE_MODEL` | Modelo Gemini | No — default: `gemini-2.0-flash` |
| `OPENAI_API_KEY` | API key OpenAI (fallback + gpt-image-2 infografías) | Opcional |
| `OPENAI_IMAGE_MODEL` | Modelo de imagen | No — default: `gpt-image-2` |
| `MYSQL_HOST` | Host MySQL | No — default: `localhost` |
| `MYSQL_PORT` | Puerto MySQL | No — default: `3306` |
| `MYSQL_USER` | Usuario MySQL | No — default: `root` |
| `MYSQL_PASSWORD` | Password MySQL | No — vacío para XAMPP |
| `MYSQL_DATABASE` | Base de datos | No — default: `assessment_db` |
| `OLLAMA_BASE_URL` | URL Ollama local/remoto | Opcional — ej: `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo Ollama | Opcional — ej: `deepseek-r1:7b` |
| `WHATSAPP_URL` | URL API WhatsApp Business | Opcional (configurable en `/settings`) |
| `WHATSAPP_NUMBER` | Número destino WA | Opcional (configurable en `/settings`) |
| `MINIMAX_API_KEY` | API key Minimax TTS | Opcional |
| `MINIMAX_GROUP_ID` | Group ID Minimax | Opcional |
| `GAMMA_API_KEY` | API key Gamma.app (presentaciones) | Opcional |
| `PYTHON_BIN` | Ejecutable Python | No — default: `python3` |
| `ASSESSMENT_ROOT` | Ruta raíz del proyecto | Necesaria en web/.env.local |
| `CHAT_PROVIDER` | Proveedor chat por defecto | No — default: `claude` |

---

## Notas de diseño y supuestos

### Supuestos de implementación

1. **Umbrales de semáforo**: Se usaron los valores sugeridos en el enunciado (5% para indicadores; 5pp/15pp para proyectos). Ajustables en `pipeline/detect.py`.
2. **SQLite > CSV**: Si se carga SQLite, los CSVs se omiten para evitar duplicados en MySQL. Los datos son equivalentes.
3. **Mock API siempre activa**: Se carga como fuente complementaria (no reemplaza SQLite/CSV). Simula integración con API externa.
4. **Deduplicación ChromaDB**: Se usa `seen: set` antes de hacer upsert para evitar `DuplicateIDError` en reejecutar el pipeline.
5. **WhatsApp**: Se usa API real en `http://161.97.129.17:3001/send`. Si falla, el error se persiste en `alertas.whatsapp_log` y el pipeline continúa.
6. **Fallback automático LLM**: Si Gemini falla (rate limit, error de red), el orquestador activa Claude Haiku automáticamente sin intervención del usuario.
7. **Idioma del chat**: El sistema fuerza respuestas en español para todas las interacciones del chat del dashboard.

### Escalabilidad institucional

- **Agregar proveedor LLM**: Crear `NuevoAgent(BaseAgent)` + variable de entorno. Sin modificar el orquestador.
- **Agregar fuente de datos**: Implementar `ingest_nueva_fuente()` siguiendo el patrón de `sqlite_reader.py`.
- **Migrar RAG**: Reemplazar el cliente ChromaDB por Pinecone / Weaviate cambiando únicamente `indexer.py`.
- **Despliegue en nube**: Next.js → Vercel; Pipeline → Cloud Run / AWS Lambda; MySQL → Cloud SQL; ChromaDB → Pinecone.

### Estructura de directorios completa

```
assessment/
├── pipeline/                    # Motor Python del pipeline
│   ├── agents/                  # Agentes Multi-LLM
│   │   ├── base_agent.py        # ABC — contrato común
│   │   ├── gemini_agent.py      # Agent 1: Google Gemini Flash
│   │   ├── haiku_agent.py       # Agent 1 fallback: Claude Haiku
│   │   ├── claude_agent.py      # Agent 2: Claude Sonnet + RAG
│   │   ├── openai_agent.py      # Último fallback
│   │   ├── ollama_agent.py      # Ollama local/remoto
│   │   └── langchain_factory.py # Factory multi-LLM
│   ├── ingest/                  # Lectores de fuentes
│   │   ├── sqlite_reader.py
│   │   ├── csv_reader.py
│   │   ├── pandas_reader.py
│   │   └── mock_api_reader.py
│   ├── rag/                     # Búsqueda semántica
│   │   ├── embedder.py          # sentence-transformers
│   │   ├── indexer.py           # ChromaDB persistence
│   │   └── retriever.py         # Query + formatting
│   ├── orchestrator.py          # PipelineOrchestrator (8 fases)
│   ├── detect.py                # Lógica semáforos
│   ├── charts.py                # Matplotlib PNG
│   ├── notifier.py              # WhatsApp API
│   ├── email_notifier.py        # SMTP + HTML
│   ├── db.py                    # MySQL connector
│   ├── logger.py                # run_id tracking + Python logger
│   ├── ai_logger.py             # Auditoría IA en BD
│   ├── run.py                   # Punto de entrada CLI
│   ├── chat_cli.py              # Chat + RAG desde terminal
│   ├── chart_cli.py             # Gráficas desde terminal
│   └── requirements.txt
├── web/                         # Dashboard Next.js 16
│   ├── src/app/api/             # 15+ rutas API REST
│   ├── src/components/          # UI components (FloatingChat, etc.)
│   ├── src/lib/                 # DB pool, settings, aiLog, etc.
│   └── package.json
├── data/                        # Archivos de datos
│   ├── assessment_planeacion.db # SQLite primaria (432 ind, 130 proy)
│   ├── *.csv                    # Fallback CSV
│   └── mock_api/                # Fuente externa simulada + openapi.yaml
├── outputs/                     # Artefactos generados
│   ├── pipeline.log             # Log completo con run_id
│   └── charts/                  # PNG generadas (run_id en nombre)
├── evidence/                    # Evidencia de ejecución
│   ├── pipeline_run_sample.log
│   ├── alertas_sample.json
│   ├── chat_demo_q1.txt
│   ├── chat_demo_q2.txt
│   └── charts/
├── schema.sql                   # DDL completo MySQL
├── .env.example                 # Plantilla variables de entorno
└── README.md                    # Este archivo
```

---

*Fundación Génesis Empresarial · Sistema de Planeación Estratégica con IA · Guatemala 2025*
*Postulante: Assessment TI — Especialista en Automatización y Agentes de IA*
