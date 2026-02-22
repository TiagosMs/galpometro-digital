/**
 * Template HTML do relatório PDF.
 * Gera um documento HTML completo pronto para impressão (window.print).
 * O navegador exibe a caixa "Salvar como PDF".
 *
 * @param {Object} d    - Dados calculados (resultado de CalculatorEngine.calculate)
 * @param {Object} meta - Metadados da simulação (cidade, estado, data, etc.)
 * @returns {string} HTML completo do relatório
 */
function buildPdfHtml(d, meta) {
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Galpômetro Digital - Relatório</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Outfit', 'Segoe UI', sans-serif;
            background: #0b0f0d;
            color: #e0e0e0;
            padding: 40px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        @page { size: A4; margin: 15mm; }

        .bar-top {
            height: 4px;
            background: #2ecc71;
            border-radius: 2px;
            margin-bottom: 30px;
        }

        .header { margin-bottom: 28px; }
        .header h1 { font-size: 24px; font-weight: 700; color: #e8e8e8; }
        .header p  { color: #8a9199; font-size: 13px; margin-top: 4px; }

        .info-box {
            background: rgba(46, 204, 113, 0.06);
            border: 1px solid rgba(46, 204, 113, 0.15);
            border-radius: 8px;
            padding: 16px 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 40px;
            margin-bottom: 32px;
            font-size: 12px;
            color: #8a9199;
        }
        .info-box span { color: #e0e0e0; font-weight: 600; }

        .section-title {
            display: flex; align-items: center; gap: 10px;
            margin: 28px 0 14px;
        }
        .section-title .accent {
            width: 4px; height: 20px;
            background: #2ecc71; border-radius: 2px;
        }
        .section-title h2 { font-size: 15px; font-weight: 600; color: #e8e8e8; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        thead th {
            background: #141a17; color: #2ecc71;
            font-size: 11px; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.5px;
            text-align: left; padding: 10px 14px;
            border-bottom: 1px solid rgba(46, 204, 113, 0.12);
        }
        tbody td {
            padding: 9px 14px; font-size: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
        tbody td:last-child { font-weight: 600; color: #e0e0e0; }

        .total-row { background: #2ecc71 !important; }
        .total-row td {
            font-weight: 700 !important; color: #000 !important;
            font-size: 13px; padding: 11px 14px; border: none;
        }

        .footer {
            margin-top: 40px; padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            display: flex; justify-content: space-between;
            font-size: 10px; color: #555d63;
        }

        @media print { body { padding: 0; } }
    </style>
</head>
<body>
    <div class="bar-top"></div>

    <div class="header">
        <h1>GALPÔMETRO DIGITAL</h1>
        <p>Relatório de Simulação Operacional</p>
    </div>

    <div class="info-box">
        <div>Cidade: <span>${meta.city}</span></div>
        <div>Caminhão: <span>${meta.truckType}${meta.customVolume ? ' (' + meta.customVolume + 'm³)' : ''}</span></div>
        <div>Estado: <span>${meta.state}</span></div>
        <div>Data: <span>${meta.date}</span></div>
        <div>População: <span>${d.inputs.population.toLocaleString('pt-BR')}</span></div>
        <div>Abrangência: <span>${d.inputs.abrangencia}%</span></div>
    </div>

    <div class="section-title"><div class="accent"></div><h2>Produção</h2></div>
    <table>
        <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
        <tbody>
            <tr><td>Coleta Mensal</td><td>${d.production.monthlyCollection.toFixed(2)} toneladas</td></tr>
            <tr><td>Coleta Diária</td><td>${d.production.dailyCollection.toFixed(4)} toneladas</td></tr>
            <tr><td>Eficiência de Triagem</td><td>${d.production.efficiency.toFixed(0)}%</td></tr>
        </tbody>
    </table>

    <div class="section-title"><div class="accent"></div><h2>Quadro de Pessoal</h2></div>
    <table>
        <thead><tr><th>Função</th><th>Quantidade</th></tr></thead>
        <tbody>
            <tr><td>Administrativos</td><td>${d.staff.admin}</td></tr>
            <tr><td>Motoristas</td><td>${d.staff.drivers}</td></tr>
            <tr><td>Coletores</td><td>${d.staff.helpers}</td></tr>
            <tr><td>Triadores</td><td>${d.staff.sorters}</td></tr>
            <tr><td>Prensistas</td><td>${d.staff.pressOperators}</td></tr>
            <tr><td>Operadores de Empilhadeira</td><td>${d.staff.forklift}</td></tr>
            <tr><td>Deslocadores</td><td>${d.staff.displacement}</td></tr>
            <tr class="total-row"><td>TOTAL DE COLABORADORES</td><td>${d.staff.total}</td></tr>
        </tbody>
    </table>

    <div class="section-title"><div class="accent"></div><h2>Infraestrutura</h2></div>
    <table>
        <thead><tr><th>Equipamento</th><th>Quantidade</th></tr></thead>
        <tbody>
            <tr><td>Caminhões</td><td>${d.infrastructure.trucks}</td></tr>
            <tr><td>Prensas</td><td>${d.infrastructure.presses}</td></tr>
            <tr><td>Empilhadeiras</td><td>${d.infrastructure.forklift}</td></tr>
            <tr><td>Balanças</td><td>${d.infrastructure.scales}</td></tr>
        </tbody>
    </table>

    <div class="footer">
        <span>Galpômetro Digital</span>
        <span>Página 1 de 1</span>
    </div>

    <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };<\/script>
</body>
</html>`;
}
