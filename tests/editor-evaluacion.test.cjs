const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const code = fs.readFileSync(path.join(__dirname,"..","editor-evaluacion.js"),"utf8");
const ctx = {window:{}, module:{exports:{}}, console, Set};
vm.runInNewContext(code,ctx,{timeout:1000});

test("lápiz edita localmente y nunca se dirige a la intranet",()=>{
    assert.doesNotMatch(html,/192\.168\.88\.24|generarEnlaceEdicionInterna|linkGestionInterna|editarEvaluacion=/);
    assert.match(html,/lapiz\.addEventListener\('click'/);
    assert.match(html,/ATDEditorExterno\.abrir\(record\.iCod_Evaluacion, tr, lapiz\)/);
    assert.match(html,/id="dialogoAccesoEditor"/);
    assert.match(html,/id="formularioAccesoEditor"/);
    assert.match(html,/type="password"/);
});

test("Guardar Evaluación está intacto e independiente del nuevo editor",()=>{
    assert.match(html,/id="btnGuardarEvaluacion"/);
    assert.match(html,/https:\/\/atd-relay\.onrender\.com\/api\/actividad-economica\/registrar/);
    assert.match(html,/submission_id: envioPendiente\.submission_id/);
    assert.doesNotMatch(code,/getElementById\(["\x27]btnGuardarEvaluacion|querySelector\(["\x27]#btnGuardarEvaluacion|form\.reset\(/);
    assert.match(code,/\/actualizar/);
    assert.match(code,/\/login/);
    assert.match(code,/\/registro\//);
    assert.match(code,/\/config/);
});

test("token administrativo SQL/Relay nunca figura en Pages",()=>{
    assert.doesNotMatch(html+code,/ATD_FORM_ADMIN_UPDATE_TOKEN|X-ATD-Form-Admin-Token|ATD_QUERY_TOKEN/);
    assert.doesNotMatch(code,/(?:window\.)?(?:localStorage|sessionStorage)\.(?:getItem|setItem)/);
    assert.match(code,/Authorization = "Bearer " \+ token/);
    assert.match(code,/claveInput\.value = ""/);
});

test("el editor solo permite las 26 columnas expresamente autorizadas",()=>{
    const api = ctx.module.exports;
    assert.equal(typeof api.abrir,"function");
    assert.equal(typeof api.inicializar,"function");
    assert.equal(api.camposEditables.size,26);
    for(const campo of ["iCod_Evaluacion","dFecha_Registro","vUsuario_Registro",
                        "iEstado","nIngreso_Total_Negocio","nIngreso_Total_Oficio"]){
        assert.equal(api.camposEditables.has(campo),false,campo);
    }
    for(const campo of ["iPersonas_Cargo","vTipo_Trabajo","nOtros_Ingresos",
                        "vNombre_Cliente","vObservaciones"]){
        assert.equal(api.camposEditables.has(campo),true,campo);
    }
});

test("el navegador jamás recibe hashes de contraseña ni usuarios completos",()=>{
    assert.match(code,/api\("\/registro\/" \+ codigo\)/);
    assert.match(code,/api\("\/actualizar"/);
    assert.doesNotMatch(code,/vHashHex|vSaltHex|iIteraciones|SELECT \*|form_admin_token/);
});
