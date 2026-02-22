/**
 * =============================================================
 * GALPÔMETRO DIGITAL - Aplicação Principal
 * =============================================================
 * Simulador de cenários operacionais para galpões de reciclagem.
 * Calcula equipe, infraestrutura e produção com base na
 * população do município e parâmetros configuráveis.
 *
 * Estrutura do arquivo:
 *   1. IbgeService    - Consulta dados de estados, cidades e população via API do IBGE
 *   2. CalculatorEngine - Lógica de cálculo (produção, equipe, infraestrutura)
 *   3. UI             - Controle da interface (formulário, dashboard, navegação, exportação)
 * =============================================================
 */


// =============================================
// 1. SERVIÇO IBGE - Consulta de dados públicos
// =============================================

const IbgeService = {

    /** Retorna a lista de estados brasileiros ordenados por nome */
    async getStates() {
        try {
            const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            return await response.json();
        } catch (error) {
            console.error("Erro ao buscar estados:", error);
            return [];
        }
    },

    /** Retorna a lista de cidades de um estado pela sigla (ex: "SP") */
    async getCities(ufSigla) {
        try {
            const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufSigla}/municipios`);
            return await response.json();
        } catch (error) {
            console.error("Erro ao buscar cidades:", error);
            return [];
        }
    },

    /**
     * Busca a população de um município pelo código IBGE.
     * Usa a Tabela 4714 (Censo 2022), Variável 93 (População residente).
     */
    async getPopulation(cityCode) {
        try {
            const url = `https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[${cityCode}]`;
            const response = await fetch(url);
            const data = await response.json();
            return data[0]?.resultados[0]?.series[0]?.serie['2022'];
        } catch (error) {
            console.error("Erro ao buscar população:", error);
            return null;
        }
    }
};


// =============================================
// 2. MOTOR DE CÁLCULO
// =============================================

class CalculatorEngine {
    constructor() {
        /**
         * Parâmetros base da simulação.
         * Altere esses valores para calibrar os resultados.
         */
        this.DB_SIMULATION = {
            GENERATION_PER_CAPITA: 0.95,    // kg de resíduo gerado por habitante/dia
            CATCH_RATE: 10,                  // % do resíduo que é coletado seletivamente
            WORK_DAYS: 22,                   // dias úteis por mês
            TRIPS_PER_DAY: 1,                // viagens de coleta por caminhão/dia
            SORTING_CAPACITY_PER_PERSON: 0.19, // toneladas que 1 triador processa/dia
            REJECT_RATE: 0.15,               // % de rejeito na triagem (material não aproveitável)
            PRESS_CAPACITY_DEFAULT: 8.0,     // toneladas que 1 prensa processa/dia
            PRESS_RATIO_PERSON: 1.5,         // toneladas por prensista/dia
            HELPERS_PER_TRUCK: 2,            // coletores por caminhão
            ADMIN_RATIO: 15,                 // 1 administrativo a cada N operacionais
            DISPLACEMENT_RATIO: 3,           // 1 deslocador a cada N triadores
            FORKLIFT_RATIO: 15               // toneladas por operador de empilhadeira/dia
        };

        /** Especificações dos tipos de caminhão disponíveis */
        this.TRUCK_SPECS = {
            'Compactador': { vol: 15, density: 250 },  // volume m³ e peso kg/m³
            'Bau': { vol: 24, density: 60 },
            'Gaiola': { vol: 12, density: 50 }
        };
    }

    /**
     * Executa o cálculo completo da simulação.
     * @param {Object} inputs - { population, abrangencia, truckType, customVolume }
     * @returns {Object} Resultados com produção, equipe e infraestrutura
     */
    calculate(inputs) {
        const D = this.DB_SIMULATION;
        const truckSpec = this.TRUCK_SPECS[inputs.truckType] || this.TRUCK_SPECS['Compactador'];
        const truckVol = inputs.customVolume || truckSpec.vol;

        // Cálculo de produção
        const populacaoAtendida = inputs.population * (inputs.abrangencia / 100);
        const dailyCollectionKg = populacaoAtendida * D.GENERATION_PER_CAPITA * (D.CATCH_RATE / 100);
        const monthlyCollectionTon = (dailyCollectionKg * D.WORK_DAYS) / 1000;

        // Cálculo de frota
        const truckCapacityKg = truckVol * truckSpec.density;
        const trucksCount = Math.max(1, Math.ceil(dailyCollectionKg / (truckCapacityKg * D.TRIPS_PER_DAY)));

        // Cálculo de triagem e prensagem
        const dailyTriagemTon = dailyCollectionKg / 1000;
        const sortersNeeded = Math.ceil(dailyTriagemTon / D.SORTING_CAPACITY_PER_PERSON);
        const materialToPressTon = dailyTriagemTon * (1 - D.REJECT_RATE);
        const pressesNeeded = Math.ceil(materialToPressTon / D.PRESS_CAPACITY_DEFAULT);
        const pressOperators = Math.ceil(materialToPressTon / D.PRESS_RATIO_PERSON);

        // Cálculo de equipe
        const drivers = trucksCount;
        const helpers = Math.ceil(trucksCount * D.HELPERS_PER_TRUCK);
        const forkliftOps = materialToPressTon > 0.5 ? Math.max(1, Math.ceil(materialToPressTon / D.FORKLIFT_RATIO)) : 0;
        const displacement = Math.ceil(sortersNeeded / D.DISPLACEMENT_RATIO);
        const operationalStaff = sortersNeeded + pressOperators + drivers + helpers + forkliftOps + displacement;
        const admins = Math.ceil(operationalStaff / D.ADMIN_RATIO);

        return {
            inputs: { population: inputs.population, abrangencia: inputs.abrangencia },
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
                drivers, helpers,
                sorters: sortersNeeded,
                pressOperators,
                forklift: forkliftOps,
                displacement,
                total: operationalStaff + admins
            },
            infrastructure: {
                trucks: trucksCount,
                presses: Math.max(1, pressesNeeded),
                scales: monthlyCollectionTon > 30 ? 1 : 0,
                forklift: forkliftOps
            }
        };
    }
}


// =============================================
// 3. CONTROLE DA INTERFACE (UI)
// =============================================

const UI = {
    lastResults: null, // guarda o último cálculo para exportação

    /** Inicializa toda a aplicação */
    init() {
        this.cacheDOM();
        this.calculator = new CalculatorEngine();
        this.addEventListeners();
        this.loadStates();
        this.initTheme();
        this.initTruckSelector();
        this.initExport();
    },

    /** Cacheia referências aos elementos HTML usados com frequência */
    cacheDOM() {
        this.elements = {
            formSection: document.getElementById('input-section'),
            dashboardSection: document.getElementById('dashboard-section'),
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

    // -----------------------------------------
    // Tema claro/escuro
    // -----------------------------------------

    /** Aplica o tema salvo no localStorage */
    initTheme() {
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
            this.elements.themeToggle.innerHTML = '<i class="ph ph-moon"></i>';
        }
    },

    /** Alterna entre tema claro e escuro */
    toggleTheme() {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        this.elements.themeToggle.innerHTML = isLight
            ? '<i class="ph ph-moon"></i>'
            : '<i class="ph ph-sun"></i>';
    },

    // -----------------------------------------
    // Carregamento de dados do IBGE
    // -----------------------------------------

    /** Popula o dropdown de estados */
    async loadStates() {
        this.elements.ufSelect.innerHTML = '<option value="">Carregando...</option>';
        const states = await IbgeService.getStates();
        let html = '<option value="">Selecione o Estado</option>';
        states.forEach(s => { html += `<option value="${s.sigla}">${s.nome}</option>`; });
        this.elements.ufSelect.innerHTML = html;
    },

    /** Popula o dropdown de cidades a partir do estado selecionado */
    async loadCities(uf) {
        this.elements.citySelect.innerHTML = '<option value="">Carregando...</option>';
        this.elements.citySelect.disabled = true;
        const cities = await IbgeService.getCities(uf);
        let html = '<option value="">Selecione a Cidade</option>';
        cities.forEach(c => { html += `<option value="${c.id}">${c.nome}</option>`; });
        this.elements.citySelect.innerHTML = html;
        this.elements.citySelect.disabled = false;
    },

    /** Busca e preenche a população do município selecionado */
    async loadPopulation(cityId) {
        this.elements.populationInput.placeholder = "Buscando IBGE...";
        this.elements.populationInput.value = "";

        const pop = await IbgeService.getPopulation(cityId);
        if (pop) {
            this.elements.populationInput.value = pop;
            // Feedback visual rápido: muda cor de fundo por 500ms
            this.elements.populationInput.style.backgroundColor = "#2f5c47";
            setTimeout(() => { this.elements.populationInput.style.backgroundColor = ""; }, 500);
        } else {
            this.elements.populationInput.placeholder = "Não encontrado. Digite manualmente.";
        }
    },

    // -----------------------------------------
    // Eventos do formulário e navegação
    // -----------------------------------------

    /** Registra todos os event listeners da aplicação */
    addEventListeners() {
        // Estado → carrega cidades
        this.elements.ufSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadCities(e.target.value);
            } else {
                this.elements.citySelect.innerHTML = '<option value="">Selecione o Estado primeiro</option>';
                this.elements.citySelect.disabled = true;
            }
        });

        // Cidade → busca população
        this.elements.citySelect.addEventListener('change', (e) => {
            if (e.target.value) this.loadPopulation(e.target.value);
        });

        // Submissão do formulário
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSimulation();
        });

        // Botão "Novo Cálculo" → volta ao formulário
        this.elements.btnBack.addEventListener('click', () => this.switchScreen('input'));

        // Botão de tema
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Botões de navegação do dashboard (Equipe, Infra, Planta)
        document.querySelectorAll('.btn-page').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchPage('dashboard-section', btn.getAttribute('data-page'));
            });
        });

        // Botões "Voltar ao Painel" nas sub-páginas
        document.querySelectorAll('.btn-back-page').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchPage(btn.closest('.dashboard-page').id, btn.getAttribute('data-page'));
            });
        });
    },

    // -----------------------------------------
    // Simulação e renderização do dashboard
    // -----------------------------------------

    /** Coleta os dados do formulário, calcula e exibe os resultados */
    handleSimulation() {
        const customVol = parseFloat(document.getElementById('customVolume').value);
        const inputs = {
            population: parseInt(document.getElementById('population').value),
            abrangencia: parseFloat(document.getElementById('abrangencia').value),
            truckType: document.getElementById('truckType').value,
            customVolume: customVol || null
        };

        // Exibe o spinner de carregamento
        this.elements.spinner.classList.add('show');

        // Executa o cálculo e salva os resultados (incluindo metadados da simulação)
        const results = this.calculator.calculate(inputs);
        this.lastResults = results;
        this.lastResults._meta = {
            city: this.elements.citySelect.selectedOptions[0]?.text || 'N/A',
            state: this.elements.ufSelect.selectedOptions[0]?.text || 'N/A',
            truckType: inputs.truckType,
            customVolume: inputs.customVolume,
            date: new Date().toLocaleDateString('pt-BR')
        };

        this.renderDashboard(results);
        this.elements.spinner.classList.remove('show');
        this.switchScreen('dashboard');
    },

    /** Preenche todos os campos do dashboard com os dados calculados */
    renderDashboard(data) {
        // Cards de estatísticas no topo
        document.getElementById('header-coletado').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        document.getElementById('header-pop-abr').innerText = `${data.inputs.population.toLocaleString('pt-BR')} (${data.inputs.abrangencia}%)`;
        document.getElementById('header-triado').innerText = `${(data.production.monthlyCollection * (data.production.efficiency / 100)).toFixed(0)}t`;
        document.getElementById('header-frota').innerText = data.infrastructure.trucks;

        // Dial central e indicadores ao redor
        document.getElementById('dial-total-ton').innerText = `${data.production.monthlyCollection.toFixed(0)}t`;
        document.getElementById('dial-val-coletado-mes').innerText = `${data.production.monthlyCollection.toFixed(1)}t`;
        document.getElementById('dial-val-eficiencia').innerText = `${data.production.efficiency.toFixed(0)}%`;
        document.getElementById('dial-val-coletado-dia').innerText = `${data.production.dailyCollection.toFixed(2)}t`;
        document.getElementById('dial-val-equipe').innerText = data.staff.total;

        // Grid de equipe (página Quadro de Pessoal)
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

        // Infraestrutura
        document.getElementById('res-caminhoes').innerText = data.infrastructure.trucks;
        document.getElementById('res-prensas').innerText = data.infrastructure.presses;
        document.getElementById('res-empilhadeiras').innerText = data.infrastructure.forklift;
        document.getElementById('res-balancas').innerText = data.infrastructure.scales;
    },

    // -----------------------------------------
    // Navegação entre telas
    // -----------------------------------------

    /**
     * Alterna entre formulário e dashboard.
     * @param {'input'|'dashboard'} screenName
     */
    switchScreen(screenName) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelectorAll('.dashboard-page').forEach(p => p.classList.remove('active'));

        if (screenName === 'input') {
            setTimeout(() => this.elements.formSection.classList.add('active'), 300);
        } else {
            this.elements.formSection.classList.remove('active');
            setTimeout(() => this.elements.dashboardSection.classList.add('active'), 300);
        }
    },

    /**
     * Navega entre sub-páginas do dashboard (Equipe, Infra, Planta).
     * @param {string} fromId - ID da seção atual
     * @param {string} toId   - ID da seção de destino
     */
    switchPage(fromId, toId) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const fromEl = document.getElementById(fromId);
        const toEl = document.getElementById(toId);
        if (fromEl) fromEl.classList.remove('active');
        setTimeout(() => { if (toEl) toEl.classList.add('active'); }, 300);
    },

    // -----------------------------------------
    // Seletor interativo de caminhão (SVG)
    // -----------------------------------------

    /**
     * Configura o arraste do baú do caminhão SVG para ajustar volume.
     * O usuário pode arrastar a borda direita do baú horizontalmente.
     * Faixa: 10m³ a 100m³. Ao soltar, o valor é aplicado ao input hidden.
     */
    initTruckSelector() {
        const truckSelect = document.getElementById('truckType');
        const customVolInput = document.getElementById('customVolume');
        const container = document.getElementById('truckInteractive');
        const svg = document.getElementById('truckSvg');

        // Elementos SVG que mudam de posição durante o arraste
        const bodyRect = document.getElementById('truckBodyRect');
        const line1 = document.getElementById('truckBodyLine1');
        const line2 = document.getElementById('truckBodyLine2');
        const handle = document.getElementById('truckDragHandle');
        const handleRect = document.getElementById('handleHitArea');
        const wheelBack = document.getElementById('truckWheelBack');
        const wheelBackInner = document.getElementById('truckWheelBackInner');
        const volumeText = document.getElementById('truckVolumeText');
        const gripLines = handle.querySelectorAll('line');

        // Volumes predefinidos para cada tipo de caminhão no dropdown
        const PRESETS = { 'Gaiola': { vol: 12 }, 'Compactador': { vol: 15 }, 'Bau': { vol: 24 } };

        // Limites de volume e largura SVG do baú
        const MIN_VOL = 10, MAX_VOL = 100;
        const BODY_X = 70;                    // posição X fixa da esquerda do baú
        const MIN_W = 60, MAX_W = 270;        // largura mínima e máxima do baú em px SVG

        // Converte volume (m³) para largura (px SVG) e vice-versa
        const volToWidth = (vol) => MIN_W + ((vol - MIN_VOL) / (MAX_VOL - MIN_VOL)) * (MAX_W - MIN_W);
        const widthToVol = (w) => Math.round(MIN_VOL + ((w - MIN_W) / (MAX_W - MIN_W)) * (MAX_VOL - MIN_VOL));

        /** Reposiciona todos os elementos SVG de acordo com a largura do baú */
        const updateSvgPositions = (w) => {
            const rightEdge = BODY_X + w;
            bodyRect.setAttribute('width', w);

            // Linhas decorativas no baú (1/3 e 2/3)
            const l1x = BODY_X + w * 0.33;
            const l2x = BODY_X + w * 0.66;
            line1.setAttribute('x1', l1x); line1.setAttribute('x2', l1x);
            line2.setAttribute('x1', l2x); line2.setAttribute('x2', l2x);

            // Handle de arraste
            handleRect.setAttribute('x', rightEdge - 12);
            gripLines[0].setAttribute('x1', rightEdge - 3); gripLines[0].setAttribute('x2', rightEdge - 3);
            gripLines[1].setAttribute('x1', rightEdge + 1); gripLines[1].setAttribute('x2', rightEdge + 1);

            // Roda traseira e texto
            wheelBack.setAttribute('cx', rightEdge - 30);
            wheelBackInner.setAttribute('cx', rightEdge - 30);
            volumeText.setAttribute('x', BODY_X + w / 2);
        };

        /** Define o volume do caminhão e atualiza SVG + input hidden */
        const setVolume = (vol) => {
            vol = Math.max(MIN_VOL, Math.min(MAX_VOL, vol));
            updateSvgPositions(volToWidth(vol));
            volumeText.textContent = `${vol}m³`;
            customVolInput.value = vol;

            // Se o volume corresponde a um preset, seleciona no dropdown
            for (const [key, spec] of Object.entries(PRESETS)) {
                if (spec.vol === vol) { truckSelect.value = key; break; }
            }
        };

        // Quando muda o dropdown, aplica o volume predefinido
        truckSelect.addEventListener('change', () => {
            const preset = PRESETS[truckSelect.value];
            if (preset) setVolume(preset.vol);
        });

        // Lógica de arraste (mouse e touch)
        let isDragging = false, dragStartX = 0, dragStartWidth = 0;

        /** Converte posição da tela para coordenada X do SVG */
        const screenToSvgX = (screenX) => {
            const pt = svg.createSVGPoint();
            pt.x = screenX; pt.y = 0;
            return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
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
            let newW = dragStartWidth + (screenToSvgX(clientX) - dragStartX);
            newW = Math.max(MIN_W, Math.min(MAX_W, newW));
            updateSvgPositions(newW);
            volumeText.textContent = `${widthToVol(newW)}m³`;
            customVolInput.value = widthToVol(newW);
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove('dragging');
            document.body.style.cursor = '';
            setVolume(widthToVol(parseFloat(bodyRect.getAttribute('width'))));
        };

        // Eventos de mouse
        handle.addEventListener('mousedown', (e) => { startDrag(e.clientX); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => moveDrag(e.clientX));
        document.addEventListener('mouseup', endDrag);

        // Eventos de toque (mobile)
        handle.addEventListener('touchstart', (e) => { startDrag(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (isDragging) moveDrag(e.touches[0].clientX); }, { passive: false });
        document.addEventListener('touchend', endDrag);

        // Define o volume inicial com base no tipo selecionado no dropdown
        const initialPreset = PRESETS[truckSelect.value];
        if (initialPreset) setVolume(initialPreset.vol);
    },

    // -----------------------------------------
    // Exportação (PDF e CSV)
    // -----------------------------------------

    /** Configura os eventos do modal de exportação */
    initExport() {
        const overlay = document.getElementById('exportModalOverlay');
        const btnExport = document.getElementById('btn-export');
        const btnClose = document.getElementById('exportModalClose');
        const btnPdf = document.getElementById('btn-export-pdf');
        const btnCsv = document.getElementById('btn-export-csv');

        btnExport.addEventListener('click', () => overlay.classList.add('show'));
        btnClose.addEventListener('click', () => overlay.classList.remove('show'));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('show'); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.remove('show'); });

        btnPdf.addEventListener('click', () => { this.exportPDF(); overlay.classList.remove('show'); });
        btnCsv.addEventListener('click', () => { this.exportCSV(); overlay.classList.remove('show'); });
    },

    /** Exibe um toast de sucesso temporário na parte inferior da tela */
    showToast(message) {
        const existing = document.querySelector('.export-success-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'export-success-toast';
        toast.innerHTML = `<i class="ph ph-check-circle"></i> ${message}`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    },

    /** Gera e baixa um arquivo CSV com todos os dados da simulação */
    exportCSV() {
        if (!this.lastResults) return;
        const d = this.lastResults;
        const meta = d._meta;

        const rows = [
            ['GALPÔMETRO DIGITAL - RELATÓRIO'],
            ['Data', meta.date],
            ['Cidade', meta.city],
            ['Estado', meta.state],
            ['Tipo de Caminhão', meta.truckType],
            ['Volume (m³)', meta.customVolume || 'Padrão'],
            [],
            ['PARÂMETROS DE ENTRADA'],
            ['População', d.inputs.population],
            ['Abrangência (%)', d.inputs.abrangencia],
            [],
            ['PARÂMETROS PADRÃO'],
            ['Geração per capita (kg/hab)', d.defaultsUsed.generation],
            ['Índice de Coleta (%)', d.defaultsUsed.catchRate],
            ['Dias Úteis/mês', d.defaultsUsed.workDays],
            ['Volume do Caminhão (m³)', d.defaultsUsed.truckVol],
            ['Viagens por dia', d.defaultsUsed.trips],
            [],
            ['PRODUÇÃO'],
            ['Coleta Mensal (toneladas)', d.production.monthlyCollection.toFixed(2)],
            ['Coleta Diária (toneladas)', d.production.dailyCollection.toFixed(4)],
            ['Eficiência de Triagem (%)', d.production.efficiency.toFixed(0)],
            [],
            ['QUADRO DE PESSOAL'],
            ['Função', 'Quantidade'],
            ['Administrativos', d.staff.admin],
            ['Motoristas', d.staff.drivers],
            ['Coletores', d.staff.helpers],
            ['Triadores', d.staff.sorters],
            ['Prensistas', d.staff.pressOperators],
            ['Operadores de Empilhadeira', d.staff.forklift],
            ['Deslocadores', d.staff.displacement],
            ['TOTAL', d.staff.total],
            [],
            ['INFRAESTRUTURA'],
            ['Item', 'Quantidade'],
            ['Caminhões', d.infrastructure.trucks],
            ['Prensas', d.infrastructure.presses],
            ['Empilhadeiras', d.infrastructure.forklift],
            ['Balanças', d.infrastructure.scales]
        ];

        // Monta o CSV com BOM (UTF-8) para compatibilidade com Excel
        const bom = '\uFEFF';
        const csvContent = bom + rows.map(row =>
            row.map(cell => {
                const str = String(cell === undefined ? '' : cell);
                // Escapa campos que contêm vírgula, aspas ou quebra de linha
                return (str.includes(',') || str.includes('"') || str.includes('\n'))
                    ? `"${str.replace(/"/g, '""')}"`
                    : str;
            }).join(',')
        ).join('\n');

        // Cria link temporário para download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `galpometro-relatorio-${meta.date.replace(/\//g, '-')}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        this.showToast('Relatório CSV exportado com sucesso!');
    },

    /**
     * Gera o PDF abrindo uma nova aba com o relatório formatado.
     * Usa window.print() do navegador para salvar como PDF.
     * O template HTML fica em pdf-template.js (função buildPdfHtml).
     */
    exportPDF() {
        if (!this.lastResults) return;

        const html = buildPdfHtml(this.lastResults, this.lastResults._meta);
        const printWindow = window.open('', '_blank');

        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            this.showToast('Relatório PDF pronto para salvar!');
        } else {
            alert('Pop-up bloqueado! Permita pop-ups para este site e tente novamente.');
        }
    }
};

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => UI.init());