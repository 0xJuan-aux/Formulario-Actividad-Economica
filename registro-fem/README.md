# Registro FEM externo — formulario público

Ruta: `/registro-fem/` en GitHub Pages. Página independiente del formulario principal Actividad Económica.

## Estado actual (18 de noviembre de 2026)

- **Sin usuario ni contraseña en la página pública**: se retiró el bloque de autenticación a solicitud del propietario.
- `vECC`: **ComboBox HTML `<select>` sencillo**, sin login, sin opción de escritura manual y sin modalidades adicionales. Sus opciones provendrán del catálogo cuando esté conectado.
- `vNro_doc`: campo con sugerencias y listado de documentos cargados al elegir `vECC`; continúa admitiendo escritura según su diseño anterior.
- **ComboBox ECC**: se confirmó desde el navegador del propietario que carga los ECC mediante `vCodigo=LISTA_ECC_FAME_COB`, `vModo=ECC` y `ResultSets.Table1[].vECC`. La URL firmada está en `config.js` por elección del propietario.
- **Guardar habilitado para la primera prueba**: utiliza el mismo desencadenador Power Automate ya configurado, con `vCodigo=REGIS_FAME_COB`; el código interpreta `ResultSets.Table1[0]` y exige `bResultado=true`, `vEstado=REGISTRADO` o `YA_REGISTRADO` e `iCod_FEM` positivo. No se ejecutó ningún registro desde este desarrollo.
- **Prueba DOCUMENTOS habilitada en frontend**: al seleccionar `vECC`, el código envía `LISTA_DNI_FAME_COB`, `vModo=DOCUMENTOS` y `vECC` seleccionado (hasta 10 documentos por página, solicitando 11 para detectar siguiente página). El SP requiere `@vECC`; Power Automate debe mapear esa entrada desde `triggerBody()?["vECC"]`. No está comprobado todavía que este código Switch exista y responda en navegador. La URL firmada es públicamente visible y puede habilitar consultas de datos personales.

## Contrato Power Automate ya probado desde PowerShell

Para listar ECC:

```json
{
  "vCodigo": "LISTA_ECC_FAME_COB",
  "vModo": "ECC",
  "iLimite": 10
}
```

Para DNI de un ECC:

```json
{
  "vCodigo": "LISTA_DNI_FAME_COB",
  "vModo": "DOCUMENTOS",
  "vECC": "ECC SELECCIONADO",
  "iLimite": 10
}
```

El usuario confirmó que el modo `ECC` fue corregido en el SP para devolver **solo `vECC`**. La salida esperada es `{"ResultSets":{"Table1":[{"vECC":"..."}]},"OutputParameters":{}}`. La otra modalidad, `DOCUMENTOS`, sigue permitiendo consultar DNI en el mismo desencadenador multipropósito. Las pruebas PowerShell no certifican CORS ni conexión desde un navegador.

Para registrar FEM, el botón Guardar envía directamente al caso `REGIS_FAME_COB` del flujo Power Automate:

```json
{
  "vCodigo": "REGIS_FAME_COB",
  "idSolicitud": "<UUID generado en navegador>",
  "vECC": "<ECC>",
  "vNro_doc": "<documento>",
  "vEstado_Afectacion": "Afectado",
  "vComentario": "Observación obligatoria desde el formulario"
}
```

El SP `DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Registrar` requiere validar pertenencia ECC/documento y controlar acceso en el servidor; **la versión actual del flujo en la captura utiliza `vUsuario_Registro = usuario` como literal**, por lo que no atribuye el registro a una persona autenticada. El frontend confirma éxito únicamente con los datos de resultado SQL. `vCodigo` sirve para el Switch, **no** autentica.

## Seguridad y conexión futura

GitHub Pages sirve código público: una URL con parámetro `sig` quedaría al alcance de cualquiera si se pegara en HTML o JS. Además de posible bloqueo CORS, permitiría consultar nombres y DNI reales. La autorización para usar la URL durante pruebas **no** convierte los datos de clientes en información pública.

El formulario es público y las consultas ECC y DOCUMENTOS se han programado para usar la misma URL firmada. Esto implica que un visitante puede copiarla y consultar registros fuera de la página. Para uso real con DNI de clientes, sustituir por un proxy con control de acceso y rotar la firma expuesta.

ATD-Relay dispone de un módulo de proxy FEM de lectura en código, pero **no está conectado a la página actual** ni se declara activo; su activación requeriría autorización y configuración separadas.

Archivos: `index.html`, `styles.css`, `app.js`, `config.js`.

## Actualización 18/11/2026 — conexión directa del ComboBox ECC

La página pública cargó los ECC reales desde el flujo existente según confirmación del propietario. Se programó después la consulta de documentos `LISTA_DNI_FAME_COB` al cambiar `vECC`; el propietario verificó que muestra documentos en el navegador. El botón Guardar se activó para prueba con `REGIS_FAME_COB`, pendiente de su primera confirmación SQL real. La firma expuesta permite ejecutar las modalidades que tenga habilitadas el flujo, por lo que se recomienda sustituirla por un endpoint con autorización y rotarla.

## Búsqueda por coincidencia en `vNro_doc` (19/11/2026)

El campo de texto existente `vNro_doc` también funciona como buscador de coincidencias parciales: al escribir uno o varios caracteres se realiza, tras una breve pausa, una consulta `LISTA_DNI_FAME_COB` con `vModo=DOCUMENTOS`, `vECC` del ComboBox y `vBuscar` igual al texto introducido. SQL usa `CHARINDEX(@buscar, resultado.vNro_doc) > 0`, por lo que compara cualquier posición, no solo el comienzo. Si se borra el texto se vuelve a consultar la lista inicial del ECC. `Cargar más documentos` conserva `vBuscar` y agrega `vDespues` para paginación. La lista visible también filtra localmente cualquier fila que no contenga la coincidencia, pero **para buscar en todos los documentos** es imprescindible que el caso Power Automate pase `triggerBody()?['vBuscar']` al parámetro SQL `@vBuscar`; en caso contrario solo podría examinar los documentos de la página que devolvió el flujo.

No se modifican el SP, el ComboBox ECC, ni Guardar. La URL firmada en el frontend sigue siendo pública; la consulta de DNI debería protegerse mediante control de acceso para producción.

## Optimización del buscador DNI (19/11/2026)

En una página pública, cargar todos los DNI para cada ECC no es recomendable por privacidad, consumo de datos y tiempo de primera carga. La búsqueda se optimizó sin modificar el diseño:

- Se conserva temporalmente **en memoria** el lote de documentos ya consultados de la cabecera ECC, no se escribe en almacenamiento persistente.
- Cada tecla filtra inmediatamente solo los documentos ya cargados en el navegador, sin llamar a Power Automate.
- Al escribir **cuatro o más dígitos** y dejar de teclear 850 ms, se consulta con `LISTA_DNI_FAME_COB`, `vModo=DOCUMENTOS`, `vECC` y `vBuscar` para encontrar también los documentos que aún no se cargaron. Por debajo de cuatro dígitos se muestran únicamente coincidencias locales.
- Al borrar la búsqueda, se restaura el lote en memoria sin solicitarlo nuevamente. «Cargar más documentos» conserva la paginación de la lista base.

El caso de Power Automate debe mapear `vBuscar` a `@vBuscar`; de lo contrario la consulta SQL no buscará en la totalidad del ECC. No se modificaron el SP, la URL, el ComboBox ni Guardar.

## Primera prueba de Guardar — 19/11/2026

El caso Power Automate de la captura se llama `REGIS_FAME_COB`, llama `SP_COB_Registro_FEM_Registrar`, y su respuesta HTTP `200` contiene el **Cuerpo** del conector SQL. El JavaScript envía `idSolicitud` UUID, `vECC`, `vNro_doc`, `vEstado_Afectacion` y `vComentario`. Los otros dos parámetros SQL se asignan en el flujo: `vUsuario_Registro` es literalmente `usuario`, `vCanal_Registro` es `Externo`. El SP normaliza el canal a `EXTERNO`.

La página interpreta la respuesta SQL en `ResultSets.Table1[0]`, o el formato aplanado, y no informa éxito únicamente por HTTP 200: exige un resultado positivo, `iCod_FEM` válido y `REGISTRADO` o `YA_REGISTRADO`. Reutiliza el UUID si una solicitud no obtuvo confirmación y se reintenta sin cambios, para evitar insertar duplicados. El éxito real sigue **pendiente de prueba por usuario**.

**Seguridad antes de producción:** la URL del desencadenador con firma ya está publicada en GitHub Pages. Con el caso de escritura habilitado, terceros que copien la firma pueden intentar insertar registros y no existe un usuario verificado en el flujo mostrado. Se debe proteger la escritura, validar en el servidor que el documento pertenezca al ECC, atribuir cada registro a una identidad confiable y rotar la URL firmada expuesta. La autorización de una prueba funcional no reemplaza estas medidas.

## Diagnóstico de primera prueba Guardar (19/11/2026)

La captura enviada desde GitHub Pages mostró «No se pudo confirmar el registro». El mensaje anterior era genérico y ocultaba el origen del fallo. Se actualizó `app.js` para diferenciar HTTP distinto de 2xx, respuesta no JSON, JSON sin `ResultSets.Table1[0]` válido, y error de red/CORS. Nunca se reintenta automáticamente y se conserva `idSolicitud` si se reenvía sin cambios. No se muestran en consola datos personales, URL firmada ni respuesta SQL cruda.

Comprobación ATD145 de solo lectura `COB_FEM_DIAG_REGISTRO_20261118_01`: **0** registros recientes que cumplan simultáneamente `vComentario='Prueba'`, `vEstado_Afectacion='Afectado'`, canal `EXTERNO` y fecha UTC de las últimas dos horas. Una segunda consulta de solo lectura `COB_FEM_DIAG_RESUMEN_20261118_01` obtuvo **0 registros totales en la tabla**, por lo que hasta ese instante no se había confirmado ninguna inserción (y no era solo un problema de filtrar el comentario). Se desconoce todavía qué acción del flujo falló.

**Siguiente diagnóstico:** antes de reintentar, mirar el historial de la ejecución reciente de Power Automate y el estado de las acciones `registrar fem` y `out reg fem`, sin compartir información personal. Si `registrar fem` está completada pero la página no confirma, revisar la forma de la salida de `out reg fem`; si está fallida, revisar el error del conector SQL. La URL firmada permite escritura anónima y debe protegerse antes de uso real.

## Condiciones de habilitación de Guardar (19/11/2026)

Sin modificar el SP ni el contrato Power Automate, el botón Guardar está inicialmente deshabilitado y solo se activa cuando el formulario tiene ECC y documento, se ha elegido exactamente un estado `Afectado` o `No Afectado`, y `vComentario` contiene texto no vacío después de quitar espacios. La etiqueta del comentario presenta asterisco de obligatorio; el control de habilitación se recalcula en cambios del ComboBox, selección de documento, radiobutton y escritura del comentario. Durante un envío se deshabilita Guardar y después de un registro exitoso permanece inactivo para los mismos valores, evitando un segundo envío involuntario. El SP conserva su parámetro `@vComentario` técnicamente nullable; esta obligatoriedad se aplica en la interfaz.

## Limpieza al cambiar de documento (19/11/2026)

Al elegir un DNI distinto desde la lista, cambiar el DNI escrito en `vNro_doc` o cambiar de cabecera ECC (lo que descarta el DNI anterior), el frontend desmarca el radiobutton `Afectado/No Afectado`, vacía el comentario y reinicia su contador a `0`. Si el DNI es el mismo, no borra la evaluación. `Guardar` permanece inhabilitado hasta seleccionar otra vez el estado y escribir un comentario, manteniendo las demás validaciones y el control de duplicados. No hay cambios en SQL ni en Power Automate.

## Limpieza tras Guardar exitoso (19/11/2026)

Cuando el caso `REGIS_FAME_COB` devuelve una confirmación SQL válida (`bResultado` verdadero, `vEstado` en `REGISTRADO` o `YA_REGISTRADO` e `iCod_FEM` positivo), el formulario borra el DNI de `vNro_doc`, desmarca el DNI de la lista, desmarca el estado `Afectado/No Afectado`, vacía `vComentario` y reinicia su contador. **Conserva el ECC y los documentos ya cargados** para que el operador elija el siguiente DNI sin repetir la consulta. Guardar vuelve a quedar deshabilitado mientras no se complete la evaluación siguiente. El resultado de éxito y código FEM permanecen visibles. Cada nuevo envío completo recibe un nuevo `idSolicitud`.

Si el envío falla o no se confirma, **no se limpian campos** y se conserva el UUID original para investigar/reintentar sin duplicar. Si el usuario modificó el formulario durante el envío, se conservan sus nuevas entradas en vez de borrarlas.

## Visualización vNro_doc - vCliente (19/11/2026)

Se amplió el modo `DOCUMENTOS` de `DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Consultar` para entregar tres columnas independientes: `vECC`, `vNro_doc` y `vCliente`, tomadas de `DB_CRE_BI.dbo.vw_reporte_diario_operacion` (conservando los filtros actuales). El SP devuelve una fila por DNI; si un DNI aparece varias veces en la vista, selecciona un `vCliente` no vacío mediante `MAX` para no duplicar las opciones o romper la paginación. El modo `ECC` continúa devolviendo solo `vECC`.

En `registro-fem/app.js` los radiobuttons de «Documentos disponibles» y las sugerencias del campo `vNro_doc` muestran `vNro_doc - vCliente`; el `value` del radiobutton y de cada sugerencia permanece estrictamente `vNro_doc`. **El envío `REGIS_FAME_COB` no incluye `vCliente` ni ningún texto concatenado.** Las búsquedas y el cursor `vDespues` operan solo con DNI. Si el origen devuelve `vCliente` nulo, se muestra solo el DNI.

Cambio SQL versionado en AtencionDigital con commit `0382a1a170d25effc75929cd56cdb328cc64360f`, orden ATD146 `COB_FEM_VCLIENTE_DDL_20261119_01`; **despliegue real pendiente de confirmación del resultado del ORQUESTADOR**. El Switch `LISTA_DNI_FAME_COB` en Power Automate debe seguir devolviendo el `Cuerpo` completo del conector SQL (`ResultSets.Table1`), sin proyectar o eliminar la nueva columna. Los datos de DNI y nombre de cliente son personales; no exponerlos en registros de depuración ni copias públicas estáticas.

## Paginación y descarga por ECC — 24/11/2026

El propietario eligió descargar el catálogo completo de la ECC seleccionada en cada navegador. Se sustituye Cargar más por páginas numeradas de 10 documentos, con Anterior/Siguiente y puntos suspensivos para listas largas. La descarga solicita lotes de hasta 500 usando vDespues y continúa hasta recibir una página vacía, incluso si Power Automate entrega lotes menores. Requiere que el caso LISTA_DNI_FAME_COB mapee vDespues al SP. Un cursor repetido o una descarga fallida muestra Carga incompleta; no se declara un total completo ni se almacena un catálogo parcial.

La búsqueda por DNI filtra el catálogo completo descargado y la paginación no hace solicitudes adicionales. Copias temporales por ECC en memoria de la pestaña, reutilizadas durante cinco minutos al cambiar de cabecera; Actualizar lista fuerza una consulta nueva. No se usa localStorage ni sessionStorage: recargar la página descarta la copia y la primera selección necesita descargar otra vez. No se crea un archivo público de DNI ni una caché compartida en la nube. Otros usuarios pueden registrar mientras la copia está abierta: Actualizar lista permite reconciliar esos cambios.

Tras un guardado SQL confirmado, se retira el documento de todas las copias locales sin volver a descargar el catálogo; si una descarga estaba en curso también se excluye al completarse. Se conserva la obligatoriedad del comentario, la limpieza del formulario y la idempotencia UUID del guardado. No cambia SP, flujo Power Automate ni acceso. Pruebas Node: `node --test tests/registro-fem.test.cjs`, cinco casos para descarga completa con lotes menores, páginas/búsqueda sin red, reutilización de ECC, guardado, fallo y reintento, cursor sin avance y cambio durante descarga. La verificación de navegador se documenta aparte al terminar el despliegue.

### Compatibilidad con el flujo existente

La prueba real de la precarga detectó que la respuesta no avanzaba con vDespues. Para no depender de ese mapeo, SP_COB_Registro_FEM_Consultar materializa los pendientes de la ECC una vez: conserva Table1 con la página/búsqueda anterior y añade Table2 con el catálogo completo, sin búsqueda/cursor/límite de página. El frontend prefiere Table2 y completa la descarga en una llamada; conserva el recorrido por cursor para respuestas antiguas o proxies sin Table2. La respuesta Power Automate debe conservar todo el cuerpo ResultSets. Seis pruebas Node aprobadas, incluida respuesta Table2 con cursor ignorado. El ajuste SQL mantiene los filtros y la exclusión de registrados; se despliega por ORQUESTADOR con postcondición, según ATD_BRAIN.
