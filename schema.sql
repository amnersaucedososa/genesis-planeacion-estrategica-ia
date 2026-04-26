-- Assessment Planeacion Estrategica - Schema MySQL
-- Ejecutar: mysql -u root -p assessment_db < schema.sql

CREATE DATABASE IF NOT EXISTS assessment_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE assessment_db;

-- Cada ejecucion del pipeline tiene su propio run_id
CREATE TABLE IF NOT EXISTS run_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL UNIQUE,
    status ENUM('running', 'completed', 'failed') DEFAULT 'running',
    fuentes_usadas JSON,
    total_indicadores INT DEFAULT 0,
    total_proyectos INT DEFAULT 0,
    alertas_generadas INT DEFAULT 0,
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
);

-- Archivos subidos por el usuario
CREATE TABLE IF NOT EXISTS uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    tipo ENUM('sqlite', 'csv', 'json') NOT NULL,
    size_bytes INT,
    path_local VARCHAR(500),
    procesado TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dimension indicadores
CREATE TABLE IF NOT EXISTS indicadores_dim (
    id INT AUTO_INCREMENT PRIMARY KEY,
    indicador_id VARCHAR(20) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    unidad VARCHAR(50),
    direccion ENUM('higher_is_better', 'lower_is_better') DEFAULT 'higher_is_better',
    padre_id VARCHAR(20),
    nivel INT DEFAULT 1,
    activo TINYINT(1) DEFAULT 1,
    run_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_indicador_id (indicador_id)
);

-- Hechos mensuales de indicadores
CREATE TABLE IF NOT EXISTS indicadores_fact (
    id INT AUTO_INCREMENT PRIMARY KEY,
    indicador_id VARCHAR(20) NOT NULL,
    periodo VARCHAR(7) NOT NULL,  -- formato: 2024-09
    meta DECIMAL(15,4),
    realizado DECIMAL(15,4),
    semafor ENUM('verde', 'amarillo', 'rojo') DEFAULT 'verde',
    desviacion_pct DECIMAL(8,4),
    run_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ind_periodo (indicador_id, periodo)
);

-- Dimension proyectos
CREATE TABLE IF NOT EXISTS proyectos_dim (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id VARCHAR(20) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    responsable VARCHAR(100),
    fecha_inicio DATE,
    fecha_fin_plan DATE,
    run_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proyecto_id (proyecto_id)
);

-- Hechos mensuales de proyectos
CREATE TABLE IF NOT EXISTS proyectos_fact (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id VARCHAR(20) NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    avance_planificado_pct DECIMAL(8,4),
    avance_real_pct DECIMAL(8,4),
    semafor ENUM('verde', 'amarillo', 'rojo') DEFAULT 'verde',
    desviacion_pct DECIMAL(8,4),
    run_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proy_periodo (proyecto_id, periodo)
);

-- Relacion indicador <-> proyecto
CREATE TABLE IF NOT EXISTS relacion_indicador_proyecto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    indicador_id VARCHAR(20) NOT NULL,
    proyecto_id VARCHAR(20) NOT NULL,
    run_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alertas ejecutivas generadas por Agente 1 (Haiku)
CREATE TABLE IF NOT EXISTS alertas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL,
    tipo ENUM('indicador', 'proyecto') NOT NULL,
    entidad_id VARCHAR(20) NOT NULL,
    nombre_entidad VARCHAR(255),
    periodo VARCHAR(7) NOT NULL,
    semafor ENUM('verde', 'amarillo', 'rojo') NOT NULL,
    meta DECIMAL(15,4),
    realizado DECIMAL(15,4),
    desviacion_pct DECIMAL(8,4),
    texto_alerta TEXT,             -- texto generado por Haiku
    proyectos_relacionados JSON,   -- solo para alertas de indicadores
    whatsapp_simulado TINYINT(1) DEFAULT 0,
    whatsapp_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_run_periodo (run_id, periodo),
    INDEX idx_semafor (semafor)
);

-- Historial del chat con Claude Sonnet
CREATE TABLE IF NOT EXISTS chat_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36),
    session_id VARCHAR(36) NOT NULL,
    rol ENUM('user', 'assistant') NOT NULL,
    proveedor VARCHAR(50),          -- claude | gemini | ollama | openai
    modelo VARCHAR(100),            -- nombre exacto del modelo usado
    contenido TEXT NOT NULL,
    tokens_usados INT,
    grafica_path VARCHAR(500),     -- si la respuesta genero una grafica
    chunks_usados JSON,            -- chunks RAG que se usaron
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id)
);

-- Configuracion de la aplicacion (WhatsApp, Email, SMTP)
CREATE TABLE IF NOT EXISTS app_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

-- Valores por defecto de configuracion
INSERT IGNORE INTO app_config (clave, valor) VALUES
    ('wa_number', '50249899115'),
    ('wa_url', 'https://api.whatsapp.com/send'),
    ('email_to', ''),
    ('email_from', 'noreply@genesis.org.gt'),
    ('smtp_host', 'smtp.gmail.com'),
    ('smtp_port', '587'),
    ('smtp_user', ''),
    ('smtp_pass', ''),
    ('smtp_tls', '1');

-- Metadata de chunks indexados en ChromaDB
CREATE TABLE IF NOT EXISTS embeddings_meta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL,
    chunk_id VARCHAR(100) NOT NULL UNIQUE,
    tipo ENUM('indicador', 'proyecto', 'relacion') NOT NULL,
    entidad_id VARCHAR(20),
    periodo VARCHAR(7),
    texto_chunk TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
