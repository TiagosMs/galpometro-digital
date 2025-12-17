// --- 1. CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://dtrtrukejbazwvkbewlr.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cnRydWtlamJhend2a2Jld2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzgwNDIsImV4cCI6MjA4MDQ1NDA0Mn0.Zwxv86iSCY1rTugtL7zIpnlXrOxtTypvlWxtUBS_7g0'; 

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. SERVIÇO IBGE (API) ---
const IbgeService = {
    // Busca lista de Estados
    async getStates() {
        try {
            const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            return await response.json();
        } catch (error) {
            console.error("Erro IBGE UF:", error);
            return [];
        }
    },

    // Busca cidades de um Estado (UF)
    async getCities(ufSigla) {
        try {
            const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufSigla}/municipios`);
            return await response.json();
        } catch (error) {
            console.error("Erro IBGE Cidades:", error);
            return [];
        }
    },

    // CORREÇÃO: Busca População no Censo 2022 (SIDRA)
    // Esse endpoint é mais confiável para municípios do que o de projeções
    async getPopulation(cityCode) {
        try {
            // URL da API de Agregados (Tabela 4714 = Censo 2022, Variável 93 = População)
            const url = `https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[${cityCode}]`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            // O retorno é complexo, precisamos navegar até o valor
            const pop = data[0]?.resultados[0]?.series[0]?.serie['2022'];
            return pop;
        } catch (error) {
            console.error("Erro IBGE População:", error);
            return null;
        }
    }
};

// --- 3. MOTOR DE CÁLCULO ---
class CalculatorEngine {
    constructor() {
        this.DB_SIMULATION = {
            GENERATION_PER_CAPITA: 0.95, 
            CATCH_RATE: 10,              
            WORK_DAYS: 22,               
            TRIPS_PER_DAY: 1, // Calibrado: 1 viagem
            
            // Produtividade calibrada
            SORTING_CAPACITY_PER_PERSON: 0.19, 
            REJECT_RATE: 0.15, 
            
            // Ratios de Equipe
            PRESS_CAPACITY_DEFAULT: 8.0, // Predefinido (8 toneladas/dia)
            PRESS_RATIO_PERSON: 1.5, 
            HELPERS_PER_TRUCK: 2,       
            ADMIN_RATIO: 15, // Calibrado: 1 a cada 15         
            DISPLACEMENT_RATIO: 3, 
            FORKLIFT_RATIO: 15     
        };

        this.TRUCK_SPECS = {
            'Compactador': { vol: 15, density: 250 },
            'Bau':         { vol: 24, density: 60 },
            'Gaiola':      { vol: 12, density: 50 }
        };
    }

    calculate(inputs) {
        const D = this.DB_SIMULATION; 
        const truckSpec = this.TRUCK_SPECS[inputs.truckType] || this.TRUCK_SPECS['Compactador'];

        // --- CÁLCULOS ---
        const populacaoAtendida = inputs.population * (inputs.abrangencia / 100);
        const totalWasteGenerated = populacaoAtendida * D.GENERATION_PER_CAPITA;
        const dailyCollectionKg = totalWasteGenerated * (D.CATCH_RATE / 100);
        const monthlyCollectionTon = (dailyCollectionKg * D.WORK_DAYS) / 1000;

        const truckCapacityKg = truckSpec.vol * truckSpec.density;
        let trucksNeededRaw = dailyCollectionKg / (truckCapacityKg * D.TRIPS_PER_DAY);
        const trucksCount = Math.max(1, Math.ceil(trucksNeededRaw));

        const dailyTriagemMetaTon = dailyCollectionKg / 1000;
        const sortersNeeded = Math.ceil(dailyTriagemMetaTon / D.SORTING_CAPACITY_PER_PERSON);

        const materialToPressTon = dailyTriagemMetaTon * (1 - D.REJECT_RATE);
        // Usa a capacidade padrão da prensa (8 toneladas)
        const pressesNeeded = Math.ceil(materialToPressTon / D.PRESS_CAPACITY_DEFAULT);
        const pressOperators = Math.ceil(materialToPressTon / D.PRESS_RATIO_PERSON);

        const drivers = trucksCount;
        const helpers = Math.ceil(trucksCount * D.HELPERS_PER_TRUCK); 
        const forkliftOperators = materialToPressTon > 0.5 ? Math.max(1, Math.ceil(materialToPressTon / D.FORKLIFT_RATIO)) : 0;
        const displacement = Math.ceil(sortersNeeded / D.DISPLACEMENT_RATIO);

        const operationalStaff = sortersNeeded + pressOperators + drivers + helpers + forkliftOperators + displacement;
        const admins = Math.ceil(operationalStaff / D.ADMIN_RATIO);

        return {
            inputs: {
                population: inputs.population,
                abrangencia: inputs.abrangencia
            },
            defaultsUsed: {
                generation: D.GENERATION_PER_CAPITA,
                catchRate: D.CATCH_RATE,
                workDays: D.WORK_DAYS,
                truckVol: truckSpec.vol,
                trips: D.TRIPS_PER_DAY
            },
            production: {
                monthlyCollection: monthlyCollectionTon,
                dailyCollection: dailyCollectionKg / 1000,
                efficiency: (1 - D.REJECT_RATE) * 100
            },
            staff: {
                admin: admins,
                drivers: drivers,
                helpers: helpers,
                sorters: sortersNeeded,
                pressOperators: pressOperators,
                forklift: forkliftOperators,
                displacement: displacement,
                total: operationalStaff + admins
            },
            infrastructure: {
                trucks: trucksCount,
                presses: Math.max(1, pressesNeeded),
                scales: monthlyCollectionTon > 30 ? 1 : 0,
                forklift: forkliftOperators
            }
        };
    }
}

// --- 4. CONTROLE DA INTERFACE ---
const UI = {
    elements: {
        formSection: document.getElementById('input-section'),
        dashboardSection: document.getElementById('dashboard-section'),
        form: document.getElementById('simulation-form'),
        spinner: document.getElementById('spinnerOverlay'),
        spinnerText: document.getElementById('spinnerText'),
        btnBack: document.getElementById('btn-back'),
        teamList: document.getElementById('team-list-container'),
        ufSelect: document.getElementById('ufSelect'),
        citySelect: document.getElementById('citySelect'),
        populationInput: document.getElementById('population')
    },

    init() {
        this.calculator = new CalculatorEngine();
        this.addEventListeners();
        this.loadStates();
    },

    async loadStates() {
        this.elements.ufSelect.innerHTML = '<option value="">Carregando...</option>';
        const states = await IbgeService.getStates();
        
        let options = '<option value="">Selecione o Estado</option>';
        states.forEach(state => {
            options += `<option value="${state.sigla}">${state.nome}</option>`;
        });
        this.elements.ufSelect.innerHTML = options;
    },

    async loadCities(uf) {
        this.elements.citySelect.innerHTML = '<option value="">Carregando...</option>';
        this.elements.citySelect.disabled = true;
        
        const cities = await IbgeService.getCities(uf);
        
        let options = '<option value="">Selecione a Cidade</option>';
        cities.forEach(city => {
            options += `<option value="${city.id}">${city.nome}</option>`;
        });
        
        this.elements.citySelect.innerHTML = options;
        this.elements.citySelect.disabled = false;
    },

    async loadPopulation(cityId) {
        this.elements.populationInput.placeholder = "Buscando IBGE...";
        this.elements.populationInput.value = "";
        
        const pop = await IbgeService.getPopulation(cityId);
        
        if (pop) {
            this.elements.populationInput.value = pop;
            this.elements.populationInput.style.backgroundColor = "#2f5c47";
            setTimeout(() => {
                this.elements.populationInput.style.backgroundColor = ""; 
            }, 500);
        } else {
            this.elements.populationInput.placeholder = "Não encontrado. Digite manualmente.";
        }
    },

    addEventListeners() {
        this.elements.ufSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadCities(e.target.value);
            } else {
                this.elements.citySelect.innerHTML = '<option value="">Selecione o Estado primeiro</option>';
                this.elements.citySelect.disabled = true;
            }
        });

        this.elements.citySelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadPopulation(e.target.value);
            }
        });

        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSimulation();
        });
        this.elements.btnBack.addEventListener('click', () => {
            console.log("Botão voltar clicado"); // Debug
            this.switchScreen('input');
        });
    },

    async saveToDatabase(inputs, results) {
        console.log("Salvando...");
        const used = results.defaultsUsed;

        try {
            const { data: cenario, error: errCenario } = await dbClient
                .from('cenarios')
                .insert([{
                    nome_projeto: `Simulação ${new Date().toLocaleTimeString()}`,
                    populacao: inputs.population,
                    abrangencia: inputs.abrangencia,
                    tipo_caminhao: inputs.truckType,
                    capacidade_prensa_dia: 8.0, // Valor padrão fixo
                    
                    taxa_captura: used.catchRate,
                    dias_trabalhados_mes: used.workDays,
                    vol_capacidade_caminhao: used.truckVol,
                    viagens_caminhao_dia: used.trips,
                    
                    coleta_total_mes: results.production.monthlyCollection,
                    total_equipe: results.staff.total,
                    taxa_eficiencia: results.production.efficiency
                }])
                .select()
                .single();

            if (errCenario) throw errCenario;

            const { error: errInfra } = await dbClient
                .from('requisitos_infraestrutura')
                .insert([{
                    cenario_id: cenario.id,
                    qtd_caminhoes: results.infrastructure.trucks,
                    qtd_prensas: results.infrastructure.presses,
                    qtd_empilhadeiras: results.infrastructure.forklift,
                    qtd_balancas: results.infrastructure.scales
                }]);
            
            if (errInfra) throw errInfra;

            alert(`Cenário salvo! ID: ${cenario.id}`);

        } catch (error) {
            console.error("Erro:", error);
            alert("Erro ao salvar: " + error.message);
        }
    },

    handleSimulation() {
        const inputs = {
            population: parseInt(document.getElementById('population').value),
            abrangencia: parseFloat(document.getElementById('abrangencia').value),
            truckType: document.getElementById('truckType').value
        };

        this.elements.spinner.classList.add('show');
        this.elements.spinnerText.innerText = "Calculando...";
        
        const results = this.calculator.calculate(inputs);
        this.renderDashboard(results);

        this.saveToDatabase(inputs, results).then(() => {
            this.elements.spinner.classList.remove('show');
            this.switchScreen('dashboard');
        });
    },

    renderDashboard(data) {
        document.getElementById('header-coletado').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        
        const popFormatada = data.inputs.population.toLocaleString('pt-BR');
        document.getElementById('header-pop-abr').innerText = `${popFormatada} (${data.inputs.abrangencia}%)`;
        
        document.getElementById('header-triado').innerText = `${(data.production.monthlyCollection * (data.production.efficiency/100)).toFixed(0)}t`;
        document.getElementById('header-frota').innerText = data.infrastructure.trucks;

        document.getElementById('dial-total-ton').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        document.getElementById('dial-val-coletado-mes').innerText = `${data.production.monthlyCollection.toFixed(1)}t`;
        document.getElementById('dial-val-eficiencia').innerText = `${data.production.efficiency.toFixed(0)}%`;
        document.getElementById('dial-val-coletado-dia').innerText = `${data.production.dailyCollection.toFixed(2)}t`;
        
        document.getElementById('dial-val-equipe').innerText = data.staff.total;

        const teamMap = [
            { label: 'Admin', icon: 'ph-users-three', val: data.staff.admin },
            { label: 'Motoristas', icon: 'ph-steering-wheel', val: data.staff.drivers },
            { label: 'Coletores', icon: 'ph-hand-grabbing', val: data.staff.helpers },
            { label: 'Triadores', icon: 'ph-magnifying-glass', val: data.staff.sorters },
            { label: 'Prensistas', icon: 'ph-package', val: data.staff.pressOperators },
            { label: 'Empilhadeira', icon: 'ph-warehouse', val: data.staff.forklift },
            { label: 'Deslocadores', icon: 'ph-arrows-left-right', val: data.staff.displacement }
        ];

        this.elements.teamList.innerHTML = teamMap.map(item => `
            <div class="team-item">
                <h5>${item.val}</h5>
                <p><i class="ph ${item.icon}"></i> ${item.label}</p>
            </div>
        `).join('');
        
        document.getElementById('team-total').innerText = data.staff.total;

        document.getElementById('res-caminhoes').innerText = data.infrastructure.trucks;
        document.getElementById('res-prensas').innerText = data.infrastructure.presses;
        document.getElementById('res-empilhadeiras').innerText = data.infrastructure.forklift;
        document.getElementById('res-balancas').innerText = data.infrastructure.scales;
    },

    switchScreen(screenName) {
        // CORREÇÃO: Rola para o topo ao trocar de tela
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (screenName === 'input') {
            this.elements.dashboardSection.classList.remove('active');
            setTimeout(() => {
                this.elements.formSection.classList.add('active');
            }, 300);
        } else {
            this.elements.formSection.classList.remove('active');
            setTimeout(() => {
                this.elements.dashboardSection.classList.add('active');
            }, 300);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => UI.init());