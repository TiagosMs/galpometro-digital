-- Tabela de Parâmetros Globais (Configurações do Sistema)
-- Permite ajustar produtividade sem mexer no código
CREATE TABLE parametros_globais (
    id SERIAL PRIMARY KEY,
    media_geracao_residuos DECIMAL(5,3) DEFAULT 1.0, -- kg/hab/dia
    densidade_caminhao DECIMAL(5,2) DEFAULT 250.00, -- kg/m3 (média)
    produtividade_triagem DECIMAL(6,2) DEFAULT 1000.00, -- kg/pessoa/dia
    capacidade_prensa DECIMAL(6,2) DEFAULT 8.00, -- ton/dia
    amplitude_controle_admin INT DEFAULT 10 -- 1 admin a cada 10 operacionais
);

-- Tabela de Cenários (Cada simulação salva gera um registro aqui)
CREATE TABLE cenarios (
    id SERIAL PRIMARY KEY,
    nome_projeto VARCHAR(100) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Inputs de Coleta
    populacao INT NOT NULL,
    taxa_captura DECIMAL(5,2) NOT NULL, -- % de abrangência/captura
    dias_trabalhados_mes INT NOT NULL,
    
    -- Inputs de Infraestrutura
    tipo_capacidade_caminhao VARCHAR(20), -- 'compactador', 'bau', 'gaiola'
    vol_capacidade_caminhao DECIMAL(5,2), -- m3
    viagens_caminhao_dia INT,
    
    -- Resultados Calculados (Persistidos para histórico)
    coleta_total_mes DECIMAL(10,2),
    total_equipe INT,
    taxa_eficiencia DECIMAL(5,2)
);

-- Tabela Detalhada de Equipe (Relacionada ao Cenário)
CREATE TABLE composicao_equipe (
    id SERIAL PRIMARY KEY,
    cenario_id INT REFERENCES cenarios(id) ON DELETE CASCADE,
    nome_cargo VARCHAR(50) NOT NULL, -- 'Triador', 'Motorista', 'Prensista'
    quantidade INT NOT NULL
);

-- Tabela de Infraestrutura Calculada
CREATE TABLE requisitos_infraestrutura (
    id SERIAL PRIMARY KEY,
    cenario_id INT REFERENCES cenarios(id) ON DELETE CASCADE,
    qtd_caminhoes INT,
    qtd_prensas INT,
    qtd_empilhadeiras INT,
    qtd_balancas INT
);