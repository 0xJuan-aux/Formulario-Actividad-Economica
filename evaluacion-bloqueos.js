/* Evaluación Económica (formulario externo): mismo desbloqueo aprobado en intranet.
 * Etapa 1: los cuatro datos del ejecutivo -> Información del cliente.
 * Etapa 2: los 7 datos del cliente -> Ingresos familiares.
 * Etapa 3: pensiones, rentas y otros ingresos -> Gastos familiares.
 * Etapa 4: los 8 gastos -> Evaluación del Oficio.
 * Etapa 5: los 3 datos del oficio -> Negocio, Observaciones y Guardar.
 * Los campos del negocio son opcionales (no todos los clientes tienen negocio).
 * No modifica el controlador IIS ni las validaciones del servidor Render.
 */
(function (root) {
    "use strict";

    var ejecutivo = ["dniEjecutivo", "nombreEjecutivo", "regionEjecutivo", "supervisor"];
    var cliente = [
        "nroDocumento", "nombreCliente", "direccion", "casado",
        "telefono", "personasCargo", "tipoTrabajo"
    ];
    // Solo campos editables. Los subtotales y totales calculados NO son requisitos.
    var ingresos = ["pensiones", "rentas", "otrosIngresos"];
    var gastos = [
        "viviendaAlquiler", "alimentacion", "educacion", "transporte",
        "salud", "serviciosPublicos", "recreacion", "otrosGastos"
    ];
    var oficio = ["oficio", "ingresoEstadoCuenta", "ingresoTotalOficio"];

    function campoConDato(form, nombre) {
        var campo = form && form.elements && form.elements[nombre];
        if (!campo || String(campo.value == null ? "" : campo.value).trim() === "") {
            return false;
        }
        // Los SELECT con "Seleccione" poseen value="" y no cuentan.
        // 0, introducido expresamente como Personas a cargo, es válido.
        return !campo.validity || campo.validity.valid !== false;
    }

    function todosConDato(form, campos) {
        return campos.every(function (nombre) {
            return campoConDato(form, nombre);
        });
    }

    function evaluarEstado(form) {
        var ejecutivoCompleto = todosConDato(form, ejecutivo);
        var clienteCompleto = ejecutivoCompleto && todosConDato(form, cliente);
        var ingresosCompletos = clienteCompleto && todosConDato(form, ingresos);
        var gastosCompletos = ingresosCompletos && todosConDato(form, gastos);
        var oficioCompleto = gastosCompletos && todosConDato(form, oficio);
        return {
            ejecutivoCompleto: ejecutivoCompleto,
            clienteCompleto: clienteCompleto,
            ingresosCompletos: ingresosCompletos,
            gastosCompletos: gastosCompletos,
            oficioCompleto: oficioCompleto,
            cliente: ejecutivoCompleto,
            ingresos: clienteCompleto,
            gastos: ingresosCompletos,
            oficio: gastosCompletos,
            negocio: oficioCompleto,
            observaciones: oficioCompleto,
            // Ni Rubro del Negocio ni productos ni Observaciones son obligatorios.
            puedeGuardar: oficioCompleto
        };
    }

    function inicializar(form) {
        if (!form || typeof form.querySelectorAll !== "function") return;

        function actualizar() {
            var estado = evaluarEstado(form);

            form.querySelectorAll("[data-etapa-bloqueo]").forEach(function (seccion) {
                var etapa = seccion.getAttribute("data-etapa-bloqueo");
                var habilitada = estado[etapa] === true;

                seccion.classList.toggle("eval-section--locked", !habilitada);
                seccion.setAttribute("aria-disabled", String(!habilitada));
                seccion.querySelectorAll("input, select, textarea").forEach(function (campo) {
                    campo.disabled = !habilitada;
                });
            });

            var guardar = form.querySelector("#btnGuardarEvaluacion");
            if (guardar) guardar.disabled = !estado.puedeGuardar;

            return estado;
        }

        // El botón no es la única vía de envío (por ejemplo, Enter):
        // impedir envíos del piloto mientras alguna etapa obligatoria esté incompleta.
        form.addEventListener("submit", function (event) {
            if (!evaluarEstado(form).puedeGuardar) {
                event.preventDefault();
                event.stopImmediatePropagation();
                actualizar();
            }
        }, true);
        form.addEventListener("input", actualizar);
        form.addEventListener("change", actualizar);
        form.addEventListener("reset", function () {
            // La restauración de valores por el navegador ocurre después del evento reset.
            setTimeout(actualizar, 0);
        });
        actualizar();
        return actualizar;
    }

    var api = { evaluarEstado: evaluarEstado, inicializar: inicializar };
    root.ATDEvaluacionBloqueos = api;
    if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
