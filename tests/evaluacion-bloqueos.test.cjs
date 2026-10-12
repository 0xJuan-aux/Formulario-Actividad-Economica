const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const bloqueos = require("../evaluacion-bloqueos.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "..", "evaluacion-bloqueos.js"), "utf8");

const EJECUTIVO = ["dniEjecutivo", "nombreEjecutivo", "regionEjecutivo", "supervisor"];
const CLIENTE = ["nroDocumento", "nombreCliente", "direccion", "casado", "telefono", "personasCargo", "tipoTrabajo"];
const INGRESOS = ["pensiones", "rentas", "otrosIngresos"];
const GASTOS = ["viviendaAlquiler", "alimentacion", "educacion", "transporte", "salud", "serviciosPublicos", "recreacion", "otrosGastos"];
const OFICIO = ["oficio", "ingresoEstadoCuenta", "ingresoTotalOficio"];
const OTROS = ["rubroNegocio", "observaciones", "ingresoTotalNegocio"];
const ALL = [...EJECUTIVO, ...CLIENTE, ...INGRESOS, ...GASTOS, ...OFICIO, ...OTROS];

function fakeForm() {
    const elements = Object.fromEntries(ALL.map(name => [name, {name, value: "", validity: {valid: true}, addEventListener() {}}]));
    return {elements};
}
function completar(form, names, value="0") {
    for (const name of names) form.elements[name].value = value;
}
function completarHasta(form, etapa) {
    completar(form,EJECUTIVO,"ejecutivo");
    if (etapa === "cliente") return;
    completar(form,CLIENTE,"cliente");
    form.elements.casado.value="NO";
    form.elements.tipoTrabajo.value="DEPENDIENTE";
    form.elements.personasCargo.value="0";
    if (etapa === "ingresos") return;
    completar(form,INGRESOS);
    if (etapa === "gastos") return;
    completar(form,GASTOS);
    if (etapa === "oficio") return;
    completar(form,OFICIO);
    form.elements.oficio.value="Empleado";
}

test("la secuencia completa exige datos, no los subtotales calculados", () => {
    const f=fakeForm();
    let e=bloqueos.evaluarEstado(f);
    assert.equal(e.cliente,false); assert.equal(e.puedeGuardar,false);
    completarHasta(f,"cliente"); e=bloqueos.evaluarEstado(f);
    assert.equal(e.cliente,true); assert.equal(e.ingresos,false);
    completarHasta(f,"ingresos"); e=bloqueos.evaluarEstado(f);
    assert.equal(e.ingresos,true); assert.equal(e.gastos,false);
    completarHasta(f,"gastos"); e=bloqueos.evaluarEstado(f);
    assert.equal(e.gastos,true); assert.equal(e.oficio,false);
    completarHasta(f,"oficio"); e=bloqueos.evaluarEstado(f);
    assert.equal(e.oficio,true); assert.equal(e.negocio,false);
    completarHasta(f,"negocio"); e=bloqueos.evaluarEstado(f);
    assert.equal(e.negocio,true); assert.equal(e.observaciones,true);
    assert.equal(e.puedeGuardar,true);
    assert.equal(f.elements.rubroNegocio.value,"");
    assert.equal(f.elements.observaciones.value,"");
});

test("cada campo obligatorio bloquea Guardar si está vacío", () => {
    for (const name of [...EJECUTIVO,...CLIENTE,...INGRESOS,...GASTOS,...OFICIO]) {
        const f=fakeForm();
        completarHasta(f,"negocio");
        f.elements[name].value="";
        assert.equal(bloqueos.evaluarEstado(f).puedeGuardar,false,name);
    }
});

test("0 escrito explícitamente cuenta; valor numérico inválido no cuenta", () => {
    const f=fakeForm();
    completarHasta(f,"negocio");
    assert.equal(bloqueos.evaluarEstado(f).puedeGuardar,true);
    f.elements.rentas.validity.valid=false;
    assert.equal(bloqueos.evaluarEstado(f).puedeGuardar,false);
    f.elements.rentas.validity.valid=true;
    f.elements.otrosGastos.value="  ";
    assert.equal(bloqueos.evaluarEstado(f).puedeGuardar,false);
});

test("retroceder a una etapa anterior vuelve a bloquear sin borrar datos", () => {
    const f=fakeForm();
    completarHasta(f,"negocio");
    f.elements.regionEjecutivo.value="";
    const e=bloqueos.evaluarEstado(f);
    assert.equal(e.cliente,false);
    assert.equal(e.ingresos,false);
    assert.equal(e.gastos,false);
    assert.equal(e.oficio,false);
    assert.equal(e.negocio,false);
    assert.equal(e.puedeGuardar,false);
    assert.equal(f.elements.oficio.value,"Empleado");
});

test("estructura y sombreado en la versión externa sin mensajes superpuestos", () => {
    assert.match(html, /<script src="\.\/evaluacion-bloqueos\.js"><\/script>/);
    for(const step of ["cliente","ingresos","gastos","oficio","negocio","observaciones"]){
        assert.match(html,new RegExp('data-etapa-bloqueo="'+step+'"'));
    }
    assert.match(html,/\.eval-section--locked \.eval-field input:disabled/);
    assert.match(html,/\.eval-section--locked \.eval-field select:disabled/);
    assert.doesNotMatch(html,/evalBloqueoEstado|eval-gate-status|data-bloqueo-mensaje|\.eval-section--locked::after/);
    assert.match(html,/name="personasCargo"[^>]*placeholder="0 si no tiene personas a cargo"[^>]*disabled/);
    assert.doesNotMatch(html,/name="personasCargo"[^>]*value="0"/);
    assert.match(html,/id="btnGuardarEvaluacion" disabled/);
    assert.match(html,/https:\/\/atd-relay\.onrender\.com\/api\/actividad-economica\/registrar/);
    assert.match(html,/id="btnComprobarGuardar"/);
    assert.match(html,/registroHabilitado/);
    assert.match(html,/campaign_id/);
    assert.match(html,/submission_id/);
    assert.match(html,/sincronizarGuardar\(\)/);
    assert.doesNotMatch(js,/evalBloqueoEstado|mensaje\.textContent/);
});

test("solo se sombrea input/select/textarea y no las etiquetas de secciones", () => {
    const matches=[...html.matchAll(/<section class="eval-section eval-section--locked" data-etapa-bloqueo="([^"]+)"/g)];
    assert.equal(matches.length,6);
    for (const match of matches) {
        const section=html.slice(match.index,html.indexOf("</section>",match.index));
        assert.match(section,/\sdisabled/);
    }
    assert.doesNotMatch(html,/\.eval-section--locked\s*\{\s*position:\s*relative/);
});

function simularNavegador(configHabilitada) {
    const form=fakeForm();
    const listeners={};
    const sections={};
    const cantidades={};
    for (const key of ["cliente","ingresos","gastos","oficio","negocio","observaciones"]) {
        const fields=[{disabled:true},{disabled:true}];
        sections[key]={
            fields, locked:true, attributes:{},
            getAttribute(name) { return name==="data-etapa-bloqueo"?key:null; },
            setAttribute(name,val) {this.attributes[name]=val;},
            classList:{toggle(_name,val){sections[key].locked=val;}},
            querySelectorAll() {return fields;}
        };
    }
    const boton={disabled:true,textContent:""};
    const comprobar={disabled:false,textContent:""};
    const aviso={textContent:""};
    const subtotalIngresos={value:""};
    const subtotalGastos={value:""};
    const totalProductos={value:""};
    const tabRegistro={checked:false};
    const confirmacion={textContent:""};
    const nodes={
        evaluacionEconomicaForm:form,
        btnGuardarEvaluacion:boton,
        btnComprobarGuardar:comprobar,
        estadoGuardadoDemo:aviso,
        subtotalIngresos,subtotalGastos,totalProductos,
        evalVistaRegistro:tabRegistro,
        confirmacionEncuesta:confirmacion
    };
    const calls=[];
    form.addEventListener=(name,callback,capture)=>{(listeners[name]??=[]).push({callback,capture:!!capture});};
    form.querySelectorAll=(selector)=>selector==="[data-etapa-bloqueo]"?Object.values(sections):[];
    form.querySelector=(selector)=>selector==="#btnGuardarEvaluacion"?boton:null;
    form.reset=()=>{
        for (const el of Object.values(form.elements)) el.value="";
        for (const handler of listeners.reset??[]) handler.callback();
    };
    comprobar.addEventListener=(name,cb)=>{(listeners["comprobar:"+name]??=[]).push({callback:cb});};
    const doc={
        handlers:{},
        getElementById:id=>nodes[id]??null,
        addEventListener:(name,cb)=>{doc.handlers[name]=cb;},
        querySelectorAll:(selector)=>{
            if(selector===".js-ingreso")return INGRESOS.map(name=>form.elements[name]);
            if(selector===".js-gasto")return GASTOS.map(name=>form.elements[name]);
            if(selector===".js-ingreso, .js-gasto") return [...INGRESOS,...GASTOS].map(name=>form.elements[name]);
            if(selector==="#productosBody tr")return [];
            return [];
        }
    };
    const fetch=async (url,opts)=>{
        calls.push({url,opts});
        if(url.endsWith("/registro-config")){
            return {ok:true,json:async()=>({bResultado:true,registroHabilitado:configHabilitada,campaign_id:"COB_EVAL_PILOTO_20261009",credencialesRequeridas:false})};
        }
        if(url.endsWith("/registrar")){
            return {ok:true,json:async()=>({bResultado:true,iCod_Evaluacion:1234,replay:false})};
        }
        throw Error("Unexpected URL");
    };
    const sandbox={
        document:doc,
        window:{ATDEvaluacionBloqueos:bloqueos},
        fetch,
        crypto:{randomUUID:()=>"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        setTimeout:(cb)=>cb(),
        console
    };
    const script=html.match(/<script>\s*document\.addEventListener\("DOMContentLoaded", function \(\) \{[\s\S]*?<\/script>/)?.[0];
    assert.ok(script,"Script de registro externo");
    vm.runInNewContext(script.replace(/^<script>/,"").replace(/<\/script>$/,""),sandbox,{timeout:1000});
    doc.handlers.DOMContentLoaded();
    const enviar=async ()=>{
        const event={
            prevented:false,stop:false,
            preventDefault(){this.prevented=true;},
            stopImmediatePropagation(){this.stop=true;}
        };
        for(const item of (listeners.submit??[]).filter(l=>l.capture)){
            item.callback(event);
            if(event.stop)return event;
        }
        for(const item of (listeners.submit??[]).filter(l=>!l.capture)){
            await item.callback(event);
            if(event.stop)break;
        }
        return event;
    };
    const activar=(name)=>{
        for(const l of listeners[name]??[])l.callback({type:name});
    };
    return {form,boton,comprobar,aviso,tabRegistro,confirmacion,sections,calls,enviar,activar};
}
async function completarConfig(){
    // Esperar a que la respuesta simulada del backend termine de procesarse.
    await new Promise(resolve => setImmediate(resolve));
}
test("un servidor habilitado NO habilita Guardar antes de completar la cadena",async()=>{
    const browser=simularNavegador(true);
    await completarConfig();
    assert.equal(browser.boton.disabled,true);
    await browser.enviar();
    assert.equal(browser.calls.filter(c=>c.url.endsWith("/registrar")).length,0);
    completarHasta(browser.form,"gastos");
    browser.activar("input");
    assert.equal(browser.boton.disabled,true);
    completarHasta(browser.form,"oficio");
    browser.activar("change");
    assert.equal(browser.boton.disabled,true);
});

test("sin negocio, un formulario completo registra si Render lo permite",async()=>{
    const browser=simularNavegador(true);
    await completarConfig();
    completarHasta(browser.form,"negocio");
    browser.activar("input");
    assert.equal(browser.sections.negocio.locked,false);
    assert.equal(browser.sections.observaciones.locked,false);
    assert.equal(browser.boton.disabled,false);
    const event=await browser.enviar();
    assert.equal(event.prevented,true);
    const post=browser.calls.filter(c=>c.url.endsWith("/registrar"));
    assert.equal(post.length,1);
    const body=JSON.parse(post[0].opts.body);
    assert.equal(body.campaign_id,"COB_EVAL_PILOTO_20261009");
    assert.equal(body.submission_id,"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(body.evaluation.rubroNegocio,"");
    assert.equal(body.evaluation.productos.length,0);
    assert.equal(browser.confirmacion.textContent.includes("1234"),true);
    assert.equal(browser.tabRegistro.checked,true);
    assert.equal(browser.boton.disabled,true);
});

test("si Render inhabilita el registro, el formulario completo NO puede enviar",async()=>{
    const browser=simularNavegador(false);
    await completarConfig();
    completarHasta(browser.form,"negocio");
    browser.activar("input");
    assert.equal(browser.boton.disabled,true);
    await browser.enviar();
    assert.equal(browser.calls.filter(c=>c.url.endsWith("/registrar")).length,0);
});

test("al borrar un campo obligatorio, Guardar se vuelve a bloquear aunque el servicio siga online",async()=>{
    const browser=simularNavegador(true);
    await completarConfig();
    completarHasta(browser.form,"negocio");
    browser.activar("input");
    assert.equal(browser.boton.disabled,false);
    browser.form.elements.otrosIngresos.value="";
    browser.activar("change");
    assert.equal(browser.boton.disabled,true);
    await browser.enviar();
    assert.equal(browser.calls.filter(c=>c.url.endsWith("/registrar")).length,0);
});

test("el lápiz no revela la dirección interna ni redirige al navegador", () => {
    assert.doesNotMatch(html, /192\.168\.88\.24/);
    assert.doesNotMatch(html, /generarEnlaceEdicionInterna|linkGestionInterna|editarEvaluacion=/);
    assert.match(html, /const lapiz=document\.createElement\('button'\)/);
    assert.match(html, /lapiz\.type='button'/);
    assert.match(html, /lapiz\.addEventListener\('click'/);
    assert.match(html, /id="btnGuardarEvaluacion"/);
    assert.match(html, /https:\/\/atd-relay\.onrender\.com\/api\/actividad-economica\/registrar/);
});
