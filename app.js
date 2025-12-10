// --- 1. CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://dtrtrukejbazwvkbewlr.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cnRydWtlamJhend2a2Jld2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzgwNDIsImV4cCI6MjA4MDQ1NDA0Mn0.Zwxv86iSCY1rTugtL7zIpnlXrOxtTypvlWxtUBS_7g0'; 

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. MOTOR DE CÁLCULO ---
class CalculatorEngine {
    constructor() {
        this.DB_SIMULATION = {
            GENERATION_PER_CAPITA: 0.95, 
            CATCH_RATE: 10,              
            WORK_DAYS: 22,               
            TRIPS_PER_DAY: 1, // Corrigido para 1 viagem conforme solicitado           
            SORTING_CAPACITY_PER_PERSON: 0.19, 
            REJECT_RATE: 0.15, 
            PRESS_RATIO_PERSON: 1.5, 
            HELPERS_PER_TRUCK: 2,       
            ADMIN_RATIO: 15, // MUDANÇA: Agora é 1 admin a cada 15 operacionais           
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

        // --- 1. COLETA ---
        const populacaoAtendida = inputs.population * (inputs.abrangencia / 100);
        const totalWasteGenerated = populacaoAtendida * D.GENERATION_PER_CAPITA;
        const dailyCollectionKg = totalWasteGenerated * (D.CATCH_RATE / 100);
        const monthlyCollectionTon = (dailyCollectionKg * D.WORK_DAYS) / 1000;

        // --- 2. FROTA ---
        const truckCapacityKg = truckSpec.vol * truckSpec.density;
        let trucksNeededRaw = dailyCollectionKg / (truckCapacityKg * D.TRIPS_PER_DAY);
        const trucksCount = Math.max(1, Math.ceil(trucksNeededRaw));

        // --- 3. TRIAGEM ---
        const dailyTriagemMetaTon = dailyCollectionKg / 1000;
        const sortersNeeded = Math.ceil(dailyTriagemMetaTon / D.SORTING_CAPACITY_PER_PERSON);

        // --- 4. PRENSAGEM ---
        const materialToPressTon = dailyTriagemMetaTon * (1 - D.REJECT_RATE);
        const pressesNeeded = Math.ceil(materialToPressTon / inputs.pressCapacity);
        const pressOperators = Math.ceil(materialToPressTon / D.PRESS_RATIO_PERSON);

        // --- 5. APOIO ---
        const drivers = trucksCount;
        const helpers = Math.ceil(trucksCount * D.HELPERS_PER_TRUCK); 
        const forkliftOperators = materialToPressTon > 0.5 ? Math.max(1, Math.ceil(materialToPressTon / D.FORKLIFT_RATIO)) : 0;
        const displacement = Math.ceil(sortersNeeded / D.DISPLACEMENT_RATIO);

        // --- 6. GESTÃO ---
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

// --- 3. UI E BANCO DE DADOS ---
const UI = {
    elements: {
        formSection: document.getElementById('input-section'),
        dashboardSection: document.getElementById('dashboard-section'),
        form: document.getElementById('simulation-form'),
        spinner: document.getElementById('spinnerOverlay'),
        btnBack: document.getElementById('btn-back'),
        teamList: document.getElementById('team-list-container')
    },

    init() {
        this.calculator = new CalculatorEngine();
        this.addEventListeners();
    },

    addEventListeners() {
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSimulation();
        });
        this.elements.btnBack.addEventListener('click', () => {
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
                    capacidade_prensa_dia: inputs.pressCapacity,
                    
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
            truckType: document.getElementById('truckType').value,
            pressCapacity: parseFloat(document.getElementById('pressCapacity').value)
        };

        this.elements.spinner.classList.add('show');
        
        const results = this.calculator.calculate(inputs);
        this.renderDashboard(results);

        this.saveToDatabase(inputs, results).then(() => {
            this.elements.spinner.classList.remove('show');
            this.switchScreen('dashboard');
        });
    },

    renderDashboard(data) {
        document.getElementById('header-coletado').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        
        // MUDANÇA: Exibe População no Header
        const popFormatada = data.inputs.population.toLocaleString('pt-BR');
        document.getElementById('header-pop-abr').innerText = `${popFormatada} (${data.inputs.abrangencia}%)`;
        
        document.getElementById('header-triado').innerText = `${(data.production.monthlyCollection * (data.production.efficiency/100)).toFixed(0)}t`;
        document.getElementById('header-frota').innerText = data.infrastructure.trucks;

        document.getElementById('dial-total-ton').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        document.getElementById('dial-val-coletado-mes').innerText = `${data.production.monthlyCollection.toFixed(1)}t`;
        document.getElementById('dial-val-eficiencia').innerText = `${data.production.efficiency.toFixed(0)}%`;
        document.getElementById('dial-val-coletado-dia').innerText = `${data.production.dailyCollection.toFixed(2)}t`;
        
        // MUDANÇA: Exibe Equipe na Roleta
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