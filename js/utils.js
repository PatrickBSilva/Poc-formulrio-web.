// ==========================================
// CONFIGURAÇÕES GERAIS E ESTADO
// ==========================================
let totalUnidades = 1;
let beneficiariosCount = 0;
const STORAGE_KEY = 'portfolio_rascunho_pme_v1';

// ==========================================
// MÁSCARAS E EVENTOS
// ==========================================
function execMasq(o, f) { 
    setTimeout(() => { o.value = f(o.value); salvarProgresso(); }, 1); 
}

function mCNPJ(v) { return v.replace(/\D/g,"").replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2"); }
function mTel(v) { return v.replace(/\D/g,"").replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d)(\d{4})$/,"$1-$2"); }
function mCEP(v) { return v.replace(/\D/g,"").replace(/^(\d{5})(\d)/,"$1-$2"); }
function mCPF(v) { return v.replace(/\D/g,"").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); }
function mNum(v) { return v.replace(/\D/g,""); }
function mCNAE(v) { return v.replace(/\D/g,"").replace(/^(\d{4})(\d)/,"$1-$2").replace(/-(\d{1})(\d)/,"-$1/$2"); }
function mNatJur(v) { return v.replace(/\D/g,"").replace(/^(\d{3})(\d)/,"$1-$2"); }

// ==========================================
// PERSISTÊNCIA DE DADOS (LOCAL STORAGE)
// ==========================================
function salvarProgresso() {
    if (totalUnidades < 1) return;

    const dados = {
        ts: Date.now(),
        total: totalUnidades,
        campos: Array.from(document.querySelectorAll('.unidade-content input:not([type="file"]), .unidade-content select, .unidade-content textarea'))
            .reduce((acc, el) => {
                if (el.id && !el.closest('.vida-item')) acc[el.id] = el.value;
                return acc;
            }, {}),
        vidas: Array.from({ length: totalUnidades }, (_, i) => i + 1)
            .reduce((acc, f) => {
                const vidasAba = Array.from(document.querySelectorAll(`#listaBeneficiarios_${f} .vida-item`));
                if (vidasAba.length) {
                    acc[f] = vidasAba.map(div => 
                        Array.from(div.querySelectorAll('input, select'))
                            .reduce((v, el) => {
                                if (el.name) v[el.name] = el.value;
                                return v;
                            }, {})
                    );
                }
                return acc;
            }, {})
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

function carregarProgresso() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const { ts, total, campos = {}, vidas = {} } = JSON.parse(raw);
    if (Date.now() - ts > 172800000) { // Expira em 48h
        localStorage.removeItem(STORAGE_KEY);
        return;
    }

    const selQtd = document.getElementById('qtdUnidades');
    if (total && selQtd) {
        selQtd.value = String(total);
        iniciarPreenchimento(); // Gera as abas
    }

    // Restaura Campos Gerais
    Object.entries(campos).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Restaura Vidas
    Object.entries(vidas).forEach(([f, vidasAba]) => {
        if (!vidasAba.length) return;

        const container = document.getElementById(`listaBeneficiarios_${f}`);
        if (container) container.innerHTML = '';
        
        vidasAba.forEach((vData, idx) => {
            adicionarBeneficiario(f);
            const lastDiv = document.querySelectorAll(`#listaBeneficiarios_${f} .vida-item`)[idx];
            const idVida = lastDiv?.id.replace('beneficiario_bloco_', '');
            
            Object.entries(vData).forEach(([name, val]) => {
                const field = lastDiv?.querySelector(`[name="${name}"]`);
                if (field) {
                    field.value = val;
                    if (name === 'b_vinculo') handleRegraVinculo(field, idVida, f);
                }
            });
        });
    });
}

// ==========================================
// REGRAS DE NEGÓCIO
// ==========================================
function handleRegraVinculo(select, idVida, f) {
    const isDep = select.value === 'Dependente';
    const container = document.getElementById(`listaBeneficiarios_${f}`);
    
    const temTitular = Array.from(container.querySelectorAll('.vida-item')).some(v => 
        v.id !== `beneficiario_bloco_${idVida}` && 
        v.querySelector('[name="b_vinculo"]')?.value === 'Titular'
    );

    if (isDep && !temTitular) {
        alert("⚠️ Ação não permitida: Cadastre primeiro um Titular nesta unidade.");
        select.value = '';
        salvarProgresso();
    }
}

function validarMinimoVidas(f) {
    return document.querySelectorAll(`#listaBeneficiarios_${f} .vida-item`).length >= 1;
}

// ==========================================
// INTEGRAÇÃO COM APIS PÚBLICAS
// ==========================================
async function buscarCNPJ(f) {
    const inputCnpj = document.getElementById(`cnpj_${f}`);
    if (!inputCnpj) return;
    
    const cnpjLimpo = inputCnpj.value.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const labelLoad = document.getElementById(`loadCnpj_${f}`);
    
    // Lista de campos que serão desbloqueados caso a API falhe
    const camposAuto = ['razaoSocial', 'nomeFantasia', 'emailUnidade', 'tel1', 'cnae', 'descCnae', 'natJuridicaCod', 'natJuridicaNome', 'dataAbertura', 'situacaoCadastral', 'porte', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'uf'];
    
    if (cnpjLimpo.length !== 14) return;

    if (labelLoad) { 
        labelLoad.style.display = 'inline'; 
        labelLoad.innerText = " (Consultando...)"; 
        labelLoad.style.color = "var(--marca-primary)"; 
    }

    try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
        if (!response.ok) throw new Error("CNPJ não encontrado");
        
        const data = await response.json();
        
        // --- 1. Informações Gerais ---
        document.getElementById(`razaoSocial_${f}`).value = data.razao_social || "";
        document.getElementById(`nomeFantasia_${f}`).value = data.nome_fantasia || "";
        document.getElementById(`cnae_${f}`).value = mCNAE(String(data.cnae_fiscal || ""));
        document.getElementById(`descCnae_${f}`).value = data.cnae_fiscal_descricao || "";
        document.getElementById(`natJuridicaCod_${f}`).value = mNatJur(String(data.codigo_natureza_juridica || ""));
        document.getElementById(`natJuridicaNome_${f}`).value = data.natureza_juridica || "";
        document.getElementById(`dataAbertura_${f}`).value = data.data_inicio_atividade || ""; // API já retorna YYYY-MM-DD perfeito pro input type="date"
        document.getElementById(`situacaoCadastral_${f}`).value = data.descricao_situacao_cadastral || "";
        document.getElementById(`porte_${f}`).value = data.porte || "";
        
        // Contatos (Se a API retornar)
        if (data.email) document.getElementById(`emailUnidade_${f}`).value = data.email;
        if (data.ddd_telefone_1) document.getElementById(`tel1_${f}`).value = mTel(data.ddd_telefone_1);

        // --- 2. Endereço ---
        document.getElementById(`cep_${f}`).value = mCEP(String(data.cep || ""));
        
        // Concatena "ALAMEDA" + "ARAGUAIA"
        const tipoLog = data.descricao_tipo_de_logradouro ? data.descricao_tipo_de_logradouro + " " : "";
        const logradouro = data.logradouro || "";
        document.getElementById(`endereco_${f}`).value = (tipoLog + logradouro).trim();
        
        document.getElementById(`numero_${f}`).value = data.numero || "";
        document.getElementById(`complemento_${f}`).value = data.complemento || "";
        document.getElementById(`bairro_${f}`).value = data.bairro || "";
        document.getElementById(`cidade_${f}`).value = data.municipio || "";
        document.getElementById(`uf_${f}`).value = data.uf || "";

        if (labelLoad) { labelLoad.innerText = " (✓ OK)"; labelLoad.style.color = "var(--marca-green)"; }
        salvarProgresso();
        
    } catch(e) {
        if (labelLoad) { labelLoad.innerText = " (⚠️ Falha na busca. Preencha manualmente)"; labelLoad.style.color = "orange"; }
        
        // Libera os campos para edição manual caso a API falhe
        camposAuto.forEach(campo => {
            const el = document.getElementById(`${campo}_${f}`);
            if(el) { el.readOnly = false; el.style.backgroundColor = "#fff"; }
        });
    }
    setTimeout(() => { if(labelLoad) labelLoad.style.display = 'none'; }, 4000);
}

async function buscarCep(input, targetPrefix) {
    const cepLimpo = input.value.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await res.json();
        if (data.erro) throw new Error("CEP inválido");

        document.getElementById(`${targetPrefix}endereco`).value = data.logradouro || "";
        document.getElementById(`${targetPrefix}bairro`).value = data.bairro || "";
        document.getElementById(`${targetPrefix}cidade`).value = data.localidade || "";
        document.getElementById(`${targetPrefix}uf`).value = data.uf || "";
        salvarProgresso();
    } catch(e) {
        console.error("Erro ViaCEP:", e);
    }
}

// ==========================================
// GESTÃO DE DOM E INTERFACE (ABAS E ACCORDION)
// ==========================================
document.addEventListener("DOMContentLoaded", carregarProgresso);

function mudarPagina(num) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step${num}`)?.classList.add('active');
    
    const widths = { 0: '33%', 1: '66%', 2: '100%' };
    const barra = document.getElementById('progressFill');
    if (barra) barra.style.width = widths[num] || '33%';
    window.scrollTo(0,0);
}

function alternarAba(idTab) {
    document.querySelectorAll('.unidade-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.unidade-content').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`btn_aba_${idTab}`)?.classList.add('active');
    document.getElementById(`content_aba_${idTab}`)?.classList.add('active');
}

function toggleAccordion(elementoHeader) {
    elementoHeader.classList.toggle('active');
    elementoHeader.nextElementSibling?.classList.toggle('active');
}

function iniciarPreenchimento() {
    totalUnidades = parseInt(document.getElementById('qtdUnidades')?.value || 1);
    gerarEstruturaUnidades();
    mudarPagina(1);
    salvarProgresso();
}

function gerarEstruturaUnidades() {
    const tabsContainer = document.getElementById('unidadeTabsContainer');
    const formsContainer = document.getElementById('unidadesFormsContainer');
    
    tabsContainer.innerHTML = '';
    formsContainer.innerHTML = '';

    for (let f = 1; f <= totalUnidades; f++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn_aba_unidade_${f}`;
        btn.className = `unidade-tab-btn ${f === 1 ? 'active' : ''}`;
        btn.innerText = `Unidade ${f}`;
        btn.onclick = () => alternarAba(`unidade_${f}`);
        tabsContainer.appendChild(btn);

        const content = document.createElement('div');
        content.id = `content_aba_unidade_${f}`;
        content.className = `unidade-content ${f === 1 ? 'active' : ''}`;
        content.innerHTML = renderHTMLUnidadePadrao(f);
        formsContainer.appendChild(content);

        // Se for novo preenchimento e não restauração, adiciona a vida 1
        if (document.querySelectorAll(`#listaBeneficiarios_${f} .vida-item`).length === 0) {
            adicionarBeneficiario(f);
        }
    }

    const btnSign = document.createElement('button');
    btnSign.type = 'button';
    btnSign.id = `btn_aba_assinaturas`;
    btnSign.className = `unidade-tab-btn`;
    btnSign.innerText = `✍️ Assinaturas`;
    btnSign.onclick = () => alternarAba('assinaturas');
    tabsContainer.appendChild(btnSign);

    const contentSign = document.createElement('div');
    contentSign.id = `content_aba_assinaturas`;
    contentSign.className = `unidade-content`;
    contentSign.innerHTML = renderPainelAssinaturas();
    formsContainer.appendChild(contentSign);
}

function renderHTMLUnidadePadrao(f) {
    return `
        <div class="section">
            <h3 class="accordion-header active" onclick="toggleAccordion(this)">
                1. Informações da Empresa (Unidade ${f}) <span class="accordion-icon">▼</span>
            </h3>
            <div class="accordion-content active">
                <div class="grid-row">
                    <div>
                        <label for="cnpj_${f}">CNPJ * <span id="loadCnpj_${f}" class="loading-msg"></span></label>
                        <input type="text" id="cnpj_${f}" required placeholder="00.000.000/0000-00" maxlength="18" oninput="execMasq(this, mCNPJ)" onblur="buscarCNPJ(${f})">
                    </div>
                    <div>
                        <label for="razaoSocial_${f}">Razão social *</label>
                        <input type="text" id="razaoSocial_${f}" readonly required style="background: #f1f5f9;" oninput="this.value = this.value.toUpperCase(); salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="nomeFantasia_${f}">Nome fantasia</label>
                        <input type="text" id="nomeFantasia_${f}" readonly style="background: #f1f5f9;" oninput="this.value = this.value.toUpperCase(); salvarProgresso()">
                    </div>
                    <div>
                        <label for="emailUnidade_${f}">E-mail Corporativo *</label>
                        <input type="email" id="emailUnidade_${f}" required oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="cnae_${f}">CNAE *</label>
                        <input type="text" id="cnae_${f}" readonly required placeholder="0000-0/00" maxlength="10" oninput="execMasq(this, mCNAE)">
                    </div>
                    <div>
                        <label for="descCnae_${f}">Descrição CNAE *</label>
                        <input type="text" id="descCnae_${f}" readonly required oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="natJuridicaCod_${f}">Cód. Natureza Jurídica *</label>
                        <input type="text" id="natJuridicaCod_${f}" readonly required placeholder="000-0" maxlength="5" oninput="execMasq(this, mNatJur)">
                    </div>
                    <div>
                        <label for="natJuridicaNome_${f}">Natureza Jurídica *</label>
                        <input type="text" id="natJuridicaNome_${f}" readonly required oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="dataAbertura_${f}">Data de Abertura *</label>
                        <input type="date" id="dataAbertura_${f}" readonly required oninput="salvarProgresso()">
                    </div>
                    <div>
                        <label for="situacaoCadastral_${f}">Situação Cadastral *</label>
                        <input type="text" id="situacaoCadastral_${f}" readonly required oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="porte_${f}">Porte da Empresa</label>
                        <input type="text" id="porte_${f}" readonly oninput="salvarProgresso()">
                    </div>
                    <div>
                        <label for="tel1_${f}">Telefone Principal *</label>
                        <input type="text" id="tel1_${f}" required placeholder="(00) 00000-0000" oninput="execMasq(this, mTel)" maxlength="15">
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <h3 class="accordion-header active" onclick="toggleAccordion(this)">
                2. Endereço da Unidade <span class="accordion-icon">▼</span>
            </h3>
            <div class="accordion-content active">
                <div class="grid-row">
                    <div>
                        <label for="cep_${f}">CEP *</label>
                        <input type="text" id="cep_${f}" readonly required placeholder="00000-000" maxlength="9" oninput="execMasq(this, mCEP)" onblur="buscarCepGenerico(this, '')">
                    </div>
                    <div>
                        <label for="endereco_${f}">Endereço (Logradouro) *</label>
                        <input type="text" id="endereco_${f}" readonly required oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div>
                        <label for="numero_${f}">Número *</label>
                        <input type="text" id="numero_${f}" readonly required oninput="execMasq(this, mNum)">
                    </div>
                    <div>
                        <label for="complemento_${f}">Complemento</label>
                        <input type="text" id="complemento_${f}" readonly oninput="salvarProgresso()">
                    </div>
                </div>
                <div class="grid-row">
                    <div><label>Bairro *</label><input type="text" id="bairro_${f}" readonly required oninput="salvarProgresso()"></div>
                    <div><label>Cidade *</label><input type="text" id="cidade_${f}" readonly required oninput="salvarProgresso()"></div>
                    <div><label>UF *</label><input type="text" id="uf_${f}" readonly required style="text-transform:uppercase" oninput="this.value = this.value.replace(/[^a-zA-Z]/g, '').toUpperCase(); salvarProgresso()"></div>
                </div>
            </div>
        </div>

        <div class="section">
            <h3 class="accordion-header active" onclick="toggleAccordion(this)">
                3. Cadastro de Beneficiários <span class="accordion-icon">▼</span>
            </h3>
            <div class="accordion-content active">
                <div id="listaBeneficiarios_${f}"></div>
                <button type="button" class="btn" style="border: 2px solid var(--marca-primary); color: var(--marca-primary); background:white" onclick="adicionarBeneficiario(${f})">+ Incluir Beneficiário</button>
            </div>
        </div>
    `;
}

function adicionarBeneficiario(f) {
    beneficiariosCount++;
    const idItem = beneficiariosCount;
    const container = document.getElementById(`listaBeneficiarios_${f}`);
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'vida-item';
    div.id = `beneficiario_bloco_${idItem}`;

    div.innerHTML = `
        <button type="button" style="position:absolute; top:15px; right:15px; color:var(--marca-error); border:none; background:none; cursor:pointer; font-weight:bold" onclick="this.parentElement.remove(); salvarProgresso();">Remover</button>
        <h4 style="color:var(--marca-primary); margin-top:0;">Beneficiário</h4>
        
        <div class="grid-row">
            <div><label>Nome Completo *</label><input type="text" name="b_nome" required oninput="this.value = this.value.toUpperCase(); salvarProgresso()"></div>
            <div>
                <label>Vínculo *</label>
                <select name="b_vinculo" required onchange="handleRegraVinculo(this, ${idItem}, ${f}); salvarProgresso()">
                    <option value="">Selecione...</option>
                    <option value="Titular">Titular (Funcionário)</option>
                    <option value="Dependente">Dependente</option>
                </select>
            </div>
        </div>
        <div class="grid-row">
            <div><label>CPF *</label><input type="text" name="b_cpf" required placeholder="000.000.000-00" oninput="execMasq(this, mCPF)" maxlength="14"></div>
            <div><label>Data de Nascimento *</label><input type="date" name="b_nasc" required oninput="salvarProgresso()"></div>
        </div>
        <div class="grid-row">
            <div><label>CEP (Busca Automática) *</label><input type="text" name="b_cep" id="b_cep_${idItem}" required placeholder="00000-000" oninput="execMasq(this, mCEP)" onblur="buscarCep(this, 'b_${idItem}_')" maxlength="9"></div>
            <div><label>Endereço *</label><input type="text" name="b_endereco" id="b_${idItem}_endereco" required oninput="salvarProgresso()"></div>
        </div>
        <div class="grid-row">
            <input type="hidden" name="b_bairro" id="b_${idItem}_bairro">
            <input type="hidden" name="b_cidade" id="b_${idItem}_cidade">
            <input type="hidden" name="b_uf" id="b_${idItem}_uf">
        </div>
    `;
    container.appendChild(div);
    salvarProgresso();
}

function renderPainelAssinaturas() {
    return `
    <div class="accordion-header active">Configuração de Assinaturas Eletrônicas</div>
    <div class="accordion-content active">
        <p style="margin-bottom:20px; color:#666">Defina os representantes legais que irão assinar a documentação do contrato.</p>
        
        <div style="background:#f9f9f9; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0">
            <h4 style="margin-top:0; color:var(--marca-primary)">Signatário Principal (Matriz)</h4>
            <div class="grid-row">
                <div><label>Nome Completo *</label><input type="text" id="sign_matriz_nome" required oninput="salvarProgresso()"></div>
                <div><label>Cargo *</label><input type="text" id="sign_matriz_cargo" required oninput="salvarProgresso()"></div>
            </div>
            <label>E-mail Corporativo *</label><input type="email" id="sign_matriz_email" required oninput="salvarProgresso()">
        </div>

        <div style="background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #e2e8f0">
            <h4 style="margin-top:0; color:var(--marca-primary)">Signatário Secundário (Testemunha/Diretoria)</h4>
            <div class="grid-row">
                <div><label>Nome Completo *</label><input type="text" id="sign_sec_nome" required oninput="salvarProgresso()"></div>
                <div><label>Cargo *</label><input type="text" id="sign_sec_cargo" required oninput="salvarProgresso()"></div>
            </div>
            <label>E-mail Corporativo *</label><input type="email" id="sign_sec_email" required oninput="salvarProgresso()">
        </div>
    </div>`;
}

// ==========================================
// SUBMISSÃO DE DADOS (GERAÇÃO DE PAYLOAD)
// ==========================================
function validarEEnviar() {
    const form = document.getElementById('propostaForm');
    
    // 1. Validação Inteligente
    if (!form.checkValidity()) {
        const invalidos = Array.from(form.querySelectorAll(':invalid'));
        const primeiroErro = invalidos[0];
        
        // Pula para a aba onde está o erro
        const abaPai = primeiroErro?.closest('.unidade-content');
        if (abaPai && abaPai.id) {
            const idTab = abaPai.id.replace('content_aba_', ''); // Ex: 'unidade_1' ou 'assinaturas'
            alternarAba(idTab);
        }

        // Abre a sanfona (accordion) se ela estiver fechada
        const accordionContent = primeiroErro?.closest('.accordion-content');
        if (accordionContent && !accordionContent.classList.contains('active')) {
            accordionContent.classList.add('active');
            if (accordionContent.previousElementSibling) {
                accordionContent.previousElementSibling.classList.add('active');
            }
        }

        // Coleta até 5 nomes únicos de campos com erro para não poluir o alert
        const nomesUnicos = [...new Set(
            invalidos.slice(0, 5).map(obterNomeDoCampoInvalido).filter(Boolean)
        )];

        alert(`⚠️ Por favor, corrija os campos obrigatórios ou inválidos.\n\nFaltando ou incorretos:\n- ${nomesUnicos.join("\n- ")}`);
        
        // Foca no campo do erro para o usuário digitar
        primeiroErro?.focus();
        return;
    }

    // 2. Validação de Regra de Negócio (Mínimo de 1 vida por filial)
    for (let f = 1; f <= totalUnidades; f++) {
        if (!validarMinimoVidas(f)) {
            alternarAba(`unidade_${f}`);
            alert(`⚠️ Atenção: A Unidade ${f} precisa de pelo menos 1 beneficiário cadastrado.`);
            return;
        }
    }

    const btn = document.getElementById('btnFinalizar');
    btn.disabled = true;
    btn.innerText = "Gerando Payload...";

    // 3. Construção do Payload JSON
    const payload = {
        meta: {
            geradoEm: new Date().toISOString(),
            totalUnidades: totalUnidades
        },
        assinaturas: [
            {
                tipo: "Matriz",
                nome: document.getElementById('sign_matriz_nome').value,
                cargo: document.getElementById('sign_matriz_cargo').value,
                email: document.getElementById('sign_matriz_email').value
            },
            {
                tipo: "Secundario",
                nome: document.getElementById('sign_sec_nome').value,
                cargo: document.getElementById('sign_sec_cargo').value,
                email: document.getElementById('sign_sec_email').value
            }
        ],
        unidades: []
    };

    // Coleta de dados das Unidades
    for (let f = 1; f <= totalUnidades; f++) {
        const unidadeObj = {
            idUnidade: f,
            empresa: {
                cnpj: document.getElementById(`cnpj_${f}`).value,
                razaoSocial: document.getElementById(`razaoSocial_${f}`).value,
                email: document.getElementById(`emailUnidade_${f}`).value,
                telefone: document.getElementById(`tel1_${f}`).value,
                inicioVigencia: document.getElementById(`dataVigencia_${f}`).value
            },
            endereco: {
                cep: document.getElementById(`cep_${f}`).value,
                logradouro: document.getElementById(`endereco_${f}`).value,
                numero: document.getElementById(`numero_${f}`).value,
                bairro: document.getElementById(`bairro_${f}`).value,
                cidade: document.getElementById(`cidade_${f}`).value,
                uf: document.getElementById(`uf_${f}`).value
            },
            beneficiarios: []
        };

        // Coleta de Beneficiários
        const cardsVidas = document.querySelectorAll(`#listaBeneficiarios_${f} .vida-item`);
        cardsVidas.forEach(card => {
            const benef = {};
            card.querySelectorAll('input, select').forEach(v => {
                if (v.name) benef[v.name] = v.value;
            });
            unidadeObj.beneficiarios.push(benef);
        });

        payload.unidades.push(unidadeObj);
    }

    console.warn("🚀 PAYLOAD GERADO COM SUCESSO! ABAIXO ESTÁ O JSON ESTRUTURADO:");
    console.log(JSON.stringify(payload, null, 2));
    
    // Simula protocolo e avança
    setTimeout(() => {
        document.getElementById('confirmationCode').innerText = "PORTFOLIO-" + Math.floor(Math.random() * 999999);
        localStorage.removeItem(STORAGE_KEY);
        mudarPagina(2);
    }, 1000);
}

function obterNomeDoCampoInvalido(el) {
    let label = (el.id && document.querySelector(`label[for="${el.id}"]`));
    
    // Se não achou pelo ID, tenta achar a label mais próxima na estrutura
    if (!label) {
        const container = el.closest('div');
        label = container?.querySelector('label') || container?.parentElement?.querySelector('label');
    }
    
    // Última tentativa: procura a label como elemento irmão anterior
    if (!label) {
        let node = el;
        while ((node = node.previousElementSibling)) {
            if (node.tagName === 'LABEL') { label = node; break; }
        }
    }

    // Pega só o texto útil da label (tira o * e o (Opcional))
    const nomeCampo = label 
        ? label.textContent.split('*')[0].replace('(Opcional)', '').trim() 
        : (el.placeholder || el.name || "Campo");
        
    return `${nomeCampo} (${el.validationMessage || "Valor incompleto"})`;
}