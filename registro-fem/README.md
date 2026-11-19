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
