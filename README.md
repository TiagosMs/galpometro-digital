♻️ Galpômetro Digital

O Galpômetro Digital é uma aplicação web inteligente desenvolvida para o planeamento operacional e dimensionamento de galpões de reciclagem e coleta seletiva.

O sistema permite simular cenários reais baseados em dados demográficos (integrados com o IBGE), calculando automaticamente a necessidade de frota, equipamentos (prensas, empilhadeiras) e dimensionamento de equipa (triadores, motoristas, administração).

🚀 Funcionalidades Principais

📍 Integração com API do IBGE:

Seleção automática de Estados e Cidades.

Busca de população em tempo real baseada no Censo 2022 (SIDRA).

🧮 Motor de Cálculo Calibrado:

Dimensionamento automático de equipa operacional e administrativa.

Cálculo de frota baseado no tipo de veículo (Compactador, Baú, Gaiola).

Estimativa de produção mensal e eficiência de triagem.

☁️ Banco de Dados na Nuvem (Supabase):

Histórico persistente de todas as simulações realizadas.

Armazenamento de cenários e requisitos de infraestrutura.

📊 Dashboard Interativo:

Visualização gráfica de metas de coleta e triagem.

Indicadores de performance (KPIs) em tempo real.

🛠️ Tecnologias Utilizadas

Frontend: HTML5, CSS3 (Variáveis CSS e Design Responsivo), JavaScript (ES6+).

Backend/DB: Supabase (PostgreSQL) via supabase-js.

APIs Externas: IBGE (Serviço de Dados e Agregados SIDRA).

UI Assets: Phosphor Icons.

⚙️ Como Usar

Clone o repositório:

git clone [https://github.com/TiagosMs/galpometro-digital.git](https://github.com/TiagosMs/galpometro-digital.git)


Abra o projeto:

Navegue até a pasta do projeto.

Abra o arquivo index.html no seu navegador preferido.

Simule um Cenário:

Selecione o Estado e a Cidade (a população será carregada automaticamente).

Defina a Abrangência da coleta (% da cidade atendida).

Escolha o Tipo de Camião da frota.

Clique em "Calcular Cenário".

Resultado:

O sistema exibirá o Dashboard com todos os recursos necessários.

Os dados serão salvos automaticamente no banco de dados.

🗄️ Estrutura do Banco de Dados

O projeto utiliza duas tabelas principais no Supabase:

1. cenarios

Armazena os parâmetros de entrada e resultados gerais da simulação.

populacao, abrangencia, tipo_caminhao

coleta_total_mes, total_equipe, taxa_eficiencia

2. requisitos_infraestrutura

Armazena o detalhamento físico necessário para a operação.

qtd_caminhoes, qtd_prensas

qtd_empilhadeiras, qtd_balancas

🤝 Contribuição

Este é um projeto de código aberto. Sinta-se à vontade para abrir issues ou enviar pull requests com melhorias na lógica de cálculo ou interface.

Desenvolvido para otimizar a gestão de resíduos sólidos urbanos. 🌍
