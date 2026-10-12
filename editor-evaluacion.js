/*
Editor aislado del formulario de INSERT. No altera #btnGuardarEvaluacion,
no expone intranet, SQL, secretos ni tokens administrativos.
La sesión del editor solo vive en memoria (no localStorage, no cookies).
*/
(function (root) {
    "use strict";
    var API = "https://atd-relay.onrender.com/api/actividad-economica/editor";
    var PERMITIDAS = new Set([
        "vDni_Ejecutivo","vNombre_Ejecutivo","vRegion_Ejecutivo","vSupervisor",
        "vNro_Documento","vNombre_Cliente","vDireccion","vCasado","vTelefono",
        "iPersonas_Cargo","vTipo_Trabajo","nPensiones","nRentas",
        "nOtros_Ingresos","nVivienda_Alquiler","nAlimentacion","nEducacion",
        "nTransporte","nSalud","nServicios_Publicos","nRecreacion",
        "nOtros_Gastos","vOficio","nIngreso_Estado_Cuenta",
        "vRubro_Negocio","vObservaciones"
    ]);
    var NUMERICAS = new Set([
        "iPersonas_Cargo","nPensiones","nRentas","nOtros_Ingresos",
        "nVivienda_Alquiler","nAlimentacion","nEducacion","nTransporte",
        "nSalud","nServicios_Publicos","nRecreacion","nOtros_Gastos",
        "nIngreso_Estado_Cuenta"
    ]);
    var token = null;
    var usuario = null;
    var pendiente = null;
    var edicion = null;
    var recargar = null;
    var habilitado = false;

    function elemento(id) { return document.getElementById(id); }

    function aviso(mensaje) {
        var lugar = elemento("demoStatus");
        if (lugar) lugar.textContent = mensaje;
    }

    async function api(path, options) {
        var o = Object.assign({ cache:"no-store" }, options || {});
        o.headers = Object.assign({}, o.headers || {});
        if (token) o.headers.Authorization = "Bearer " + token;
        var respuesta = await fetch(API + path, o);
        var datos = await respuesta.json().catch(function () { return {}; });
        if (!respuesta.ok || datos.bResultado === false) {
            var error = new Error(datos.detail || "Solicitud rechazada (HTTP " + respuesta.status + ")");
            error.status = respuesta.status;
            throw error;
        }
        return datos;
    }

    function estadoSesion() {
        var abrir = elemento("abrirAccesoEditor");
        var cerrar = elemento("cerrarSesionEditor");
        var texto = elemento("estadoSesionEditor");
        if (abrir) {
            abrir.disabled = !habilitado;
            abrir.textContent = token ? "Edición habilitada" : "Acceso para edición";
        }
        if (cerrar) cerrar.hidden = !token;
        if (texto) texto.textContent = token ? "Editor: " + usuario : "";
    }

    function cerrarSesion() {
        token = null;
        usuario = null;
        cancelarEdicion();
        estadoSesion();
        aviso("La sesión de edición se cerró en este navegador.");
    }

    function solicitarLogin() {
        var dialogo = elemento("dialogoAccesoEditor");
        if (!dialogo) return;
        var error = elemento("estadoAccesoEditor");
        if (error) error.textContent = "";
        if (typeof dialogo.showModal === "function") dialogo.showModal();
    }

    function crearEditor(columna, valor) {
        var editor;
        if (columna === "vCasado") {
            editor = document.createElement("select");
            ["", "SI", "NO"].forEach(function (opcion) {
                var element = document.createElement("option");
                element.value = opcion;
                element.textContent = opcion || "Seleccione";
                editor.appendChild(element);
            });
        } else {
            editor = document.createElement("input");
            editor.type = NUMERICAS.has(columna) ? "number" : "text";
            if (NUMERICAS.has(columna)) {
                editor.min = "0";
                editor.step = columna === "iPersonas_Cargo" ? "1" : "0.01";
            }
        }
        editor.value = valor == null ? "" : String(valor);
        editor.className = "eval-editor-field";
        editor.setAttribute("data-columna", columna);
        editor.setAttribute("aria-label", "Editar " + columna);
        return editor;
    }

    function cancelarEdicion() {
        if (!edicion) return;
        var registro = edicion;
        edicion = null;
        registro.cells.forEach(function (entry) {
            entry.td.textContent = entry.publicText;
            entry.td.className = entry.className;
            if (entry.title !== null) entry.td.title = entry.title;
        });
        registro.row.classList.remove("eval-row-editing");
        registro.button.textContent = "✎";
        registro.button.title = "Editar esta evaluación";
        registro.button.disabled = false;
        var cancelar = registro.cancelar;
        if (cancelar && cancelar.parentNode) cancelar.parentNode.removeChild(cancelar);
    }

    function configurarFila(id, row, button, datos) {
        cancelarEdicion();
        var celdas = [];
        row.querySelectorAll("td[data-columna]").forEach(function (td) {
            var nombre = td.getAttribute("data-columna");
            if (!PERMITIDAS.has(nombre)) return;
            celdas.push({
                td: td, columna: nombre,
                publicText: td.textContent, className: td.className,
                title: td.getAttribute("title"),
                initial: datos[nombre] == null ? "" : String(datos[nombre])
            });
        });
        if (!celdas.length) {
            aviso("No hay campos editables visibles. Utiliza 'Ver estructura completa de la intranet'.");
            return;
        }
        celdas.forEach(function (x) {
            x.td.textContent = "";
            x.td.className = "";
            x.td.appendChild(crearEditor(x.columna, x.initial));
        });
        row.classList.add("eval-row-editing");
        button.textContent = "💾";
        button.title = "Guardar cambios de esta evaluación";
        var cancelar = document.createElement("button");
        cancelar.type = "button";
        cancelar.className = "eval-edit-btn";
        cancelar.textContent = "×";
        cancelar.title = "Cancelar edición";
        cancelar.setAttribute("aria-label", "Cancelar edición");
        cancelar.addEventListener("click", cancelarEdicion);
        button.parentNode.appendChild(cancelar);
        edicion = {id: id, row: row, button: button, cells: celdas, cancelar: cancelar};
        aviso("Editando evaluación " + id + ". Solo se modificará lo que guardes con 💾.");
    }

    async function guardarEdicion() {
        if (!edicion || !token) return;
        var e = edicion;
        var valores = {};
        for (var item of e.cells) {
            var control = item.td.querySelector(".eval-editor-field");
            if (!control) continue;
            if (!control.checkValidity()) {
                control.reportValidity();
                return;
            }
            var actual = control.value.trim();
            if (actual !== item.initial.trim()) {
                if (NUMERICAS.has(item.columna) && actual === "") {
                    aviso("El importe de " + item.columna + " debe contener un número; utiliza 0 cuando corresponda.");
                    control.focus();
                    return;
                }
                valores[item.columna] = actual;
            }
        }
        if (Object.keys(valores).length === 0) {
            cancelarEdicion();
            aviso("No hubo cambios para guardar.");
            return;
        }
        e.button.disabled = true;
        aviso("Guardando únicamente la actualización de la evaluación " + e.id + "...");
        try {
            var resp = await api("/actualizar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ iCod_Evaluacion: e.id, valores: valores })
            });
            if (!resp.bResultado || resp.iCod_Evaluacion !== e.id) {
                throw new Error("La actualización no fue confirmada.");
            }
            cancelarEdicion();
            aviso("Evaluación " + e.id + " actualizada correctamente.");
            if (recargar) await recargar();
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                token = null;
                usuario = null;
                estadoSesion();
            }
            aviso("No se confirmó la actualización: " + error.message);
            if (edicion === e) e.button.disabled = false;
        }
    }

    async function abrir(id, row, button) {
        var codigo = Number(id);
        if (!Number.isSafeInteger(codigo) || codigo <= 0) return;
        if (edicion && edicion.id === codigo) {
            await guardarEdicion();
            return;
        }
        if (!habilitado) {
            aviso("La edición de registros está pendiente de habilitación administrativa. Guardar Evaluación sigue funcionando.");
            return;
        }
        if (!token) {
            pendiente = {id: codigo, row: row, button: button};
            solicitarLogin();
            return;
        }
        button.disabled = true;
        try {
            var datos = await api("/registro/" + codigo);
            if (!datos.bResultado || !datos.registro) throw new Error("Registro no disponible");
            configurarFila(codigo, row, button, datos.registro);
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                token = null; usuario = null; estadoSesion();
                pendiente = {id:codigo,row:row,button:button};
                solicitarLogin();
            } else {
                aviso("No se pudo abrir la evaluación: " + error.message);
            }
        } finally {
            button.disabled = false;
        }
    }

    function inicializar(options) {
        recargar = options && options.refrescar;
        var abrirAcceso = elemento("abrirAccesoEditor");
        var cerrarAcceso = elemento("cerrarSesionEditor");
        var salir = elemento("cerrarDialogoEditor");
        var dialogo = elemento("dialogoAccesoEditor");
        var formulario = elemento("formularioAccesoEditor");
        if (abrirAcceso) abrirAcceso.addEventListener("click", solicitarLogin);
        if (cerrarAcceso) cerrarAcceso.addEventListener("click", cerrarSesion);
        if (salir) salir.addEventListener("click", function(){dialogo.close();});
        if (formulario) formulario.addEventListener("submit", async function(event) {
            event.preventDefault();
            var error = elemento("estadoAccesoEditor");
            var usuarioInput = elemento("usuarioEditor");
            var claveInput = elemento("claveEditor");
            if (error) error.textContent = "Verificando credenciales...";
            try {
                var resultado = await api("/login", {
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body:JSON.stringify({usuario: usuarioInput.value.trim(), contrasena: claveInput.value})
                });
                token = resultado.access_token;
                usuario = resultado.usuario;
                claveInput.value = ""; // No conservar contraseñas en el DOM.
                dialogo.close();
                estadoSesion();
                aviso("Acceso de edición habilitado. Se cerrará automáticamente al vencer la sesión.");
                var target = pendiente;
                pendiente = null;
                if (target) await abrir(target.id, target.row, target.button);
            } catch(err) {
                if(error) error.textContent = "No se pudo iniciar sesión: " + err.message;
                if (claveInput) claveInput.value = "";
            }
        });
        estadoSesion();
        // No afectar Guardar Evaluación si los accesos de edición aún no se publicaron.
        api("/config").then(function(config) {
            habilitado = config.edicionHabilitada === true;
            estadoSesion();
        }).catch(function() {
            habilitado = false;
            estadoSesion();
        });
    }

    var exported = {
        inicializar:inicializar, abrir:abrir, cancelarEdicion:cancelarEdicion,
        get camposEditables(){ return new Set(PERMITIDAS); }
    };
    root.ATDEditorExterno = exported;
    if (typeof module === "object" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
