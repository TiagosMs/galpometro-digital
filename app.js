// --- 1. CONFIGURAÇÃO DO SUPABASE ---
// (Removido por solicitação do usuário)

// --- 2. SERVIÇO IBGE (API) ---
const IbgeService = {
    // Busca lista de Estados ed
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
            TRIPS_PER_DAY: 1, // Calibrado: 1 viagem por dia

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
            'Bau': { vol: 24, density: 60 },
            'Gaiola': { vol: 12, density: 50 }
        };
    }

    calculate(inputs) {
        const D = this.DB_SIMULATION;
        const truckSpec = this.TRUCK_SPECS[inputs.truckType] || this.TRUCK_SPECS['Compactador'];

        // Usa volume personalizado se fornecido, senão usa a especificação
        const truckVol = inputs.customVolume || truckSpec.vol;
        const truckDensity = truckSpec.density;

        // --- CÁLCULOS ---
        const populacaoAtendida = inputs.population * (inputs.abrangencia / 100);
        const totalWasteGenerated = populacaoAtendida * D.GENERATION_PER_CAPITA;
        const dailyCollectionKg = totalWasteGenerated * (D.CATCH_RATE / 100);
        const monthlyCollectionTon = (dailyCollectionKg * D.WORK_DAYS) / 1000;

        const truckCapacityKg = truckVol * truckDensity;
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
    init() {
        this.cacheDOM();
        this.calculator = new CalculatorEngine();
        this.addEventListeners();
        this.loadStates();
        this.initTheme();
        this.initTruckSelector();
    },

    cacheDOM() {
        this.elements = {
            formSection: document.getElementById('input-section'),
            dashboardSection: document.getElementById('dashboard-section'),
            equipeSection: document.getElementById('equipe-section'),
            infraSection: document.getElementById('infra-section'),
            form: document.getElementById('simulation-form'),
            spinner: document.getElementById('spinnerOverlay'),
            spinnerText: document.getElementById('spinnerText'),
            btnBack: document.getElementById('btn-back'),
            teamList: document.getElementById('team-list-container'),
            ufSelect: document.getElementById('ufSelect'),
            citySelect: document.getElementById('citySelect'),
            populationInput: document.getElementById('population'),
            themeToggle: document.getElementById('theme-toggle')
        };
    },

    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            if (this.elements.themeToggle) {
                this.elements.themeToggle.innerHTML = '<i class="ph ph-moon"></i>';
            }
        }
    },

    toggleTheme() {
        console.log("Alternando tema...");
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');

        if (this.elements.themeToggle) {
            this.elements.themeToggle.innerHTML = isLight ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
        } else {
            console.error("Botão de tema não encontrado!");
        }
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
            console.log("Botão voltar clicado"); // Depuração
            this.switchScreen('input');
        });

        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Navegação de Páginas: Dashboard -> Equipe/Infra
        document.querySelectorAll('.btn-page').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = btn.getAttribute('data-page');
                this.switchPage('dashboard-section', targetPage);
            });
        });

        // Botões de voltar nas sub-páginas
        document.querySelectorAll('.btn-back-page').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = btn.getAttribute('data-page');
                this.switchPage(btn.closest('.dashboard-page').id, targetPage);
            });
        });
    },



    handleSimulation() {
        const customVol = parseFloat(document.getElementById('customVolume').value);
        const inputs = {
            population: parseInt(document.getElementById('population').value),
            abrangencia: parseFloat(document.getElementById('abrangencia').value),
            truckType: document.getElementById('truckType').value,
            customVolume: customVol || null
        };

        this.elements.spinner.classList.add('show');
        this.elements.spinnerText.innerText = "Calculando...";

        const results = this.calculator.calculate(inputs);
        this.renderDashboard(results);

        this.elements.spinner.classList.remove('show');
        this.switchScreen('dashboard');
    },

    renderDashboard(data) {
        document.getElementById('header-coletado').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;

        const popFormatada = data.inputs.population.toLocaleString('pt-BR');
        document.getElementById('header-pop-abr').innerText = `${popFormatada} (${data.inputs.abrangencia}%)`;

        document.getElementById('header-triado').innerText = `${(data.production.monthlyCollection * (data.production.efficiency / 100)).toFixed(0)}t`;
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
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Ocultar todas as páginas
        document.querySelectorAll('.dashboard-page').forEach(p => p.classList.remove('active'));

        if (screenName === 'input') {
            setTimeout(() => {
                this.elements.formSection.classList.add('active');
            }, 300);
        } else {
            this.elements.formSection.classList.remove('active');
            setTimeout(() => {
                this.elements.dashboardSection.classList.add('active');
            }, 300);
        }
    },

    switchPage(fromId, toId) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const fromEl = document.getElementById(fromId);
        const toEl = document.getElementById(toId);

        if (fromEl) fromEl.classList.remove('active');
        setTimeout(() => {
            if (toEl) toEl.classList.add('active');
        }, 300);
    },

    // --- SELETOR DE CAMINHÃO INTERATIVO (SVG) ---
    initTruckSelector() {
        const truckSelect = document.getElementById('truckType');
        const customVolInput = document.getElementById('customVolume');
        const container = document.getElementById('truckInteractive');
        const svg = document.getElementById('truckSvg');

        // Elementos SVG
        const bodyRect = document.getElementById('truckBodyRect');
        const line1 = document.getElementById('truckBodyLine1');
        const line2 = document.getElementById('truckBodyLine2');
        const handle = document.getElementById('truckDragHandle');
        const handleRect = document.getElementById('handleHitArea');
        const wheelBack = document.getElementById('truckWheelBack');
        const wheelBackInner = document.getElementById('truckWheelBackInner');
        const volumeText = document.getElementById('truckVolumeText');

        const gripLines = handle.querySelectorAll('line');

        // Predefinições para seleção no dropdown
        const PRESETS = {
            'Gaiola': { vol: 12 },
            'Compactador': { vol: 15 },
            'Bau': { vol: 24 }
        };

        // Faixa contínua
        const MIN_VOL = 10;
        const MAX_VOL = 100;

        const BODY_X = 70;
        const MIN_W = 60;
        const MAX_W = 270;

        // Converter volume <-> largura SVG (mapeamento linear)
        const volToWidth = (vol) => {
            const t = (vol - MIN_VOL) / (MAX_VOL - MIN_VOL);
            return MIN_W + t * (MAX_W - MIN_W);
        };
        const widthToVol = (w) => {
            const t = (w - MIN_W) / (MAX_W - MIN_W);
            return Math.round(MIN_VOL + t * (MAX_VOL - MIN_VOL));
        };

        // Atualizar todas as posições SVG baseado na largura do baú
        const updateSvgPositions = (w) => {
            const rightEdge = BODY_X + w;

            bodyRect.setAttribute('width', w);

            const l1x = BODY_X + w * 0.33;
            const l2x = BODY_X + w * 0.66;
            line1.setAttribute('x1', l1x);
            line1.setAttribute('x2', l1x);
            line2.setAttribute('x1', l2x);
            line2.setAttribute('x2', l2x);

            handleRect.setAttribute('x', rightEdge - 12);
            gripLines[0].setAttribute('x1', rightEdge - 3);
            gripLines[0].setAttribute('x2', rightEdge - 3);
            gripLines[1].setAttribute('x1', rightEdge + 1);
            gripLines[1].setAttribute('x2', rightEdge + 1);

            const wheelX = rightEdge - 30;
            wheelBack.setAttribute('cx', wheelX);
            wheelBackInner.setAttribute('cx', wheelX);

            const textX = BODY_X + w / 2;
            volumeText.setAttribute('x', textX);
        };

        // Definir o caminhão para um volume específico
        const setVolume = (vol) => {
            vol = Math.max(MIN_VOL, Math.min(MAX_VOL, vol));
            const w = volToWidth(vol);
            updateSvgPositions(w);
            volumeText.textContent = `${vol}m³`;
            customVolInput.value = vol;

            // Verificar se o volume corresponde a uma predefinição → selecioná-la, senão manter atual
            let matched = false;
            for (const [key, spec] of Object.entries(PRESETS)) {
                if (spec.vol === vol) {
                    truckSelect.value = key;
                    matched = true;
                    break;
                }
            }
            // Sem correspondência — não alterar o dropdown (manter como está)
        };

        // --- Sincronização DROPDOWN -> SVG (predefinições) ---
        truckSelect.addEventListener('change', () => {
            const preset = PRESETS[truckSelect.value];
            if (preset) {
                setVolume(preset.vol);
            }
        });

        // --- LÓGICA DE ARRASTE (contínuo) ---
        let isDragging = false;
        let dragStartX = 0;
        let dragStartWidth = 0;

        const screenToSvgX = (screenX) => {
            const pt = svg.createSVGPoint();
            pt.x = screenX;
            pt.y = 0;
            const ctm = svg.getScreenCTM().inverse();
            return pt.matrixTransform(ctm).x;
        };

        const startDrag = (clientX) => {
            isDragging = true;
            dragStartX = screenToSvgX(clientX);
            dragStartWidth = parseFloat(bodyRect.getAttribute('width'));
            container.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
        };

        const moveDrag = (clientX) => {
            if (!isDragging) return;
            const currentX = screenToSvgX(clientX);
            const dx = currentX - dragStartX;
            let newW = dragStartWidth + dx;
            newW = Math.max(MIN_W, Math.min(MAX_W, newW));

            updateSvgPositions(newW);

            // Atualizar texto do volume continuamente
            const vol = widthToVol(newW);
            volumeText.textContent = `${vol}m³`;
            customVolInput.value = vol;
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove('dragging');
            document.body.style.cursor = '';

            // Manter posição atual — sem encaixe
            const currentW = parseFloat(bodyRect.getAttribute('width'));
            const vol = widthToVol(currentW);
            setVolume(vol);
        };

        // Eventos de mouse
        handle.addEventListener('mousedown', (e) => {
            startDrag(e.clientX);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => moveDrag(e.clientX));
        document.addEventListener('mouseup', endDrag);

        // Eventos de toque
        handle.addEventListener('touchstart', (e) => {
            startDrag(e.touches[0].clientX);
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            moveDrag(e.touches[0].clientX);
        }, { passive: false });
        document.addEventListener('touchend', endDrag);

        // Estado inicial a partir da predefinição do dropdown
        const initialPreset = PRESETS[truckSelect.value];
        if (initialPreset) setVolume(initialPreset.vol);
    }
};

document.addEventListener('DOMContentLoaded', () => UI.init());