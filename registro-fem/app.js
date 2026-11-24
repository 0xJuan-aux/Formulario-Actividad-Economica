(() => {
  "use strict";

  const form = document.getElementById("femForm");
  if (!form) return;

  const ecc = document.getElementById("vECC");
  const documentInput = document.getElementById("vNro_doc");
  const comment = document.getElementById("vComentario");
  const docList = document.getElementById("docList");
  const docItems = document.getElementById("documentItems");
  const docCount = document.getElementById("docCount");
  const docsMessage = document.getElementById("docsMessage");
  const eccHelp = document.getElementById("eccHelp");
  const pagination = document.getElementById("docPagination");
  const refreshDocsButton = document.getElementById("refreshDocs");
  const charCount = document.getElementById("charCount");
  const saveButton = document.getElementById("saveButton");
  const saveLabel = document.getElementById("saveLabel");
  const saveMessage = document.getElementById("saveMessage");
  const saveText = document.getElementById("saveText");

  // La URL del flujo Power Automate nunca debe estar en código público.
  const config = window.REGISTRO_FEM_PUBLIC_CONFIG || {};
  const safeGateway = value => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) return "";
      if (/(^|\.)(powerplatform\.com|powerautomate\.com|logic\.azure\.com|logicapps\.azure\.com|flow\.microsoft\.com)$/i.test(url.hostname))
        return "";
      if (/(?:^|\.)github\.io$/i.test(url.hostname)) return "";
      return url.href;
    } catch {
      return "";
    }
  };
  const apiUrl = safeGateway(config.apiUrl);
  const catalogUrl = safeGateway(config.catalogUrl);
  // URL directa de Power Automate: ECC y DOCUMENTOS comparten el desencadenador.
  // La firma ya figura en config.js público; este archivo no la duplica.
  const powerAutomateFlowUrl = (() => {
    if (typeof config.eccOnlyFlowUrl !== "string" || !config.eccOnlyFlowUrl.trim()) return "";
    try {
      const url = new URL(config.eccOnlyFlowUrl.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";
      if (!/^[a-z0-9.-]+\.environment\.api\.powerplatform\.com$/i.test(url.hostname)) return "";
      if (!url.pathname.startsWith("/powerautomate/") || !url.pathname.endsWith("/invoke")) return "";
      if (!url.searchParams.get("sig")) return "";
      return url.href;
    } catch { return ""; }
  })();
  // Guardar utiliza el mismo desencadenador con vCodigo=REGIS_FAME_COB.
  // No copiar la firma a otro archivo ni confundir HTTP 200 con INSERT confirmado.
  const saveUrl = apiUrl || powerAutomateFlowUrl;
  const isDirectSave = !apiUrl && Boolean(powerAutomateFlowUrl);
  const numberFormat = new Intl.NumberFormat("es-PE");
  const maxPage = 10;
  const downloadBatch = 500;
  const cacheLifetimeMs = 5 * 60 * 1000;
  // Una copia temporal por ECC, únicamente en esta pestaña.
  const documentCache = new Map();
  let docsPage = 1;
  let docSearch = "";
  let docsLoading = false;
  let requestVersion = 0;
  let queryAbort = null;
  let searchTimer = null;
  let saving = false;
  let pendingSubmission = null;
  let savedSnapshot = null;
  let lastDocumentValue = documentInput.value.trim();

  function setStatus(message, kind = "") {
    saveText.textContent = message;
    saveMessage.className = "save-message" + (kind ? " " + kind : "");
  }

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto?.getRandomValues) throw new Error("El navegador no admite identificadores seguros.");
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
  }

  function selectedECC() {
    return ecc.value.trim();
  }

  function payload() {
    return {
      vCodigo: "REGIS_FAME_COB",
      vECC: selectedECC(),
      vNro_doc: documentInput.value.trim(),
      vEstado_Afectacion: form.querySelector('input[name="vEstado_Afectacion"]:checked')?.value || "",
      vComentario: comment.value.trim() || null
    };
  }

  function snapshot(body) {
    return JSON.stringify([body.vCodigo,body.vECC,body.vNro_doc,body.vEstado_Afectacion,body.vComentario]);
  }

  function validate(body) {
    if (!body.vECC) return "Selecciona o ingresa el vECC.";
    if (!body.vNro_doc) return "Ingresa o selecciona el documento del cliente.";
    if (body.vECC.length > 250 || body.vNro_doc.length > 40) return "Los campos vECC o vNro_doc superan el límite permitido.";
    if (!["Afectado","No Afectado"].includes(body.vEstado_Afectacion)) return "Selecciona Afectado o No Afectado.";
    if (!body.vComentario?.trim()) return "Escribe un comentario antes de guardar.";
    if (body.vComentario.length > 2000) return "El comentario no puede superar 2000 caracteres.";
    return "";
  }

  // El valor siempre es vNro_doc; el nombre del cliente es SOLO para mostrar.
  function documentNumber(item) {
    return typeof item === "string" ? item.trim() :
      (typeof item?.vNro_doc === "string" ? item.vNro_doc.trim() : "");
  }

  function documentClient(item) {
    return typeof item?.vCliente === "string" ? item.vCliente.trim() : "";
  }

  function documentLabel(item) {
    const number = documentNumber(item);
    const client = documentClient(item);
    return client ? number + " - " + client : number;
  }

  function fillOptions(container, items) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const number = documentNumber(item);
      if (!number) continue;
      const option = document.createElement("option");
      option.value = number;
      const client = documentClient(item);
      if (client) {
        option.label = documentLabel(item);
        option.dataset.cliente = client;
      }
      fragment.appendChild(option);
    }
    container.replaceChildren(fragment);
  }

  // Se llama SOLO al proxy HTTPS autenticado. Nunca a la URL firmada de Power Automate.
  // El proxy conserva la firma como secreto y devuelve el contrato SQL ResultSets.Table1.
  async function queryCatalog(requestBody, signal) {
    const response = await fetch(catalogUrl, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.bResultado === false)
      throw new Error("No se pudo consultar el catálogo autorizado.");
    if (!Array.isArray(body?.ResultSets?.Table1))
      throw new Error("Formato de respuesta SQL inesperado.");
    return body.ResultSets.Table1;
  }

  function documentEmpty(message) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = message;
    docItems.replaceChildren(p);
  }

  function resetDocs(message) {
    requestVersion++;
    queryAbort?.abort();
    docsLoading = false;
    docsPage = 1;
    docSearch = "";
    pagination.replaceChildren();
    pagination.hidden = true;
    refreshDocsButton.disabled = !selectedECC();
    docItems.removeAttribute("aria-busy");
    docCount.textContent = "0 documentos";
    docsMessage.textContent = "";
    fillOptions(docList, []);
    documentEmpty(message);
  }

  function displayDocs(documents) {
    const section = document.createElement("div");
    section.className = "document-list";
    for (const item of documents) {
      const number = documentNumber(item);
      if (!number) continue;
      const label = document.createElement("label");
      label.className = "doc-choice";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "documentChoice";
      radio.value = number;
      radio.checked = documentInput.value === number;
      radio.addEventListener("change", () => {
        documentInput.value = number;
        onDocumentValueChanged();
      });
      const span = document.createElement("span");
      span.textContent = documentLabel(item);
      label.append(radio, span);
      section.appendChild(label);
    }
    docItems.replaceChildren(section);
    docItems.scrollTop = 0;
  }

  function renderPagination(totalPages) {
    pagination.replaceChildren();
    pagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;
    const addButton = (text, page, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-button";
      button.textContent = text;
      button.disabled = disabled;
      button.setAttribute("aria-label", /^\d+$/.test(text) ? "Página " + text : text);
      if (page === docsPage && /^\d+$/.test(text)) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        docsPage = page;
        renderDocs();
        const active = pagination.querySelector('[aria-current="page"]');
        active?.focus();
      });
      pagination.appendChild(button);
    };
    addButton("Anterior", docsPage - 1, docsPage === 1);
    const pages = new Set([1, totalPages]);
    for (let page = Math.max(1, docsPage - 1); page <= Math.min(totalPages, docsPage + 1); page++) pages.add(page);
    if (docsPage <= 3) for (let page = 1; page <= Math.min(4, totalPages); page++) pages.add(page);
    if (docsPage >= totalPages - 2) for (let page = Math.max(1, totalPages - 3); page <= totalPages; page++) pages.add(page);
    let previous = 0;
    for (const page of [...pages].sort((a, b) => a - b)) {
      if (previous && page - previous > 1) {
        const gap = document.createElement("span");
        gap.className = "page-gap";
        gap.textContent = "…";
        gap.setAttribute("aria-hidden", "true");
        pagination.appendChild(gap);
      }
      addButton(String(page), page);
      previous = page;
    }
    addButton("Siguiente", docsPage + 1, docsPage === totalPages);
  }

  function renderDocs() {
    const entry = documentCache.get(selectedECC());
    if (!entry || docsLoading) return;
    const matches = docSearch
      ? entry.documents.filter(row => row.vNro_doc.includes(docSearch))
      : entry.documents;
    const totalPages = Math.max(1, Math.ceil(matches.length / maxPage));
    docsPage = Math.max(1, Math.min(docsPage, totalPages));
    const start = (docsPage - 1) * maxPage;
    const page = matches.slice(start, start + maxPage);
    if (page.length) displayDocs(page);
    else documentEmpty(docSearch ? "No se encontraron coincidencias con ese documento." : "No se encontraron documentos pendientes para este ECC.");
    // Las sugerencias también buscan en el catálogo completo; limitar solo el DOM.
    fillOptions(docList, matches.slice(0, 100));
    docCount.textContent = numberFormat.format(matches.length) + (docSearch ? (matches.length === 1 ? " coincidencia" : " coincidencias") : (matches.length === 1 ? " documento" : " documentos"));
    docsMessage.textContent = matches.length
      ? "Mostrando " + numberFormat.format(start + 1) + "–" + numberFormat.format(start + page.length) +
        " de " + numberFormat.format(matches.length) + ". Página " + docsPage + " de " + totalPages + "."
      : "";
    renderPagination(totalPages);
    refreshDocsButton.disabled = false;
  }

  async function fetchDocumentBatch(eccValue, after, signal) {
    const requestBody = { vCodigo: "LISTA_DNI_FAME_COB", vModo: "DOCUMENTOS", vECC: eccValue, iLimite: downloadBatch };
    if (after) requestBody.vDespues = after;
    if (!powerAutomateFlowUrl) return { rows: await queryCatalog(requestBody, signal), complete: false };
    const response = await fetch(powerAutomateFlowUrl, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(requestBody), signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.ResultSets?.Table1)) throw new Error("CATALOGO_NO_DISPONIBLE");
    // El SP entrega Table2 completo para evitar depender del cursor del flujo.
    if (Array.isArray(data.ResultSets.Table2)) return { rows: data.ResultSets.Table2, complete: true };
    const rows = data.ResultSets.Table1;
    const isComplete = row => [true, 1, "true", "1"].includes(row?.bCatalogoCompleto);
    if (rows.length && rows.every(isComplete)) {
      const expected = Number(rows[0].iTotal_Documentos);
      if (!Number.isSafeInteger(expected) || expected !== rows.length ||
          rows.some(row => Number(row.iTotal_Documentos) !== expected)) throw new Error("CATALOGO_INCOMPLETO");
      return { rows, complete: true };
    }
    return { rows, complete: false };
  }

  async function loadDocs(forceRefresh = false) {
    const eccValue = selectedECC();
    if ((!powerAutomateFlowUrl && !catalogUrl) || !eccValue) return;
    const cached = documentCache.get(eccValue);
    if (!forceRefresh && cached && Date.now() - cached.loadedAt < cacheLifetimeMs) {
      renderDocs();
      return;
    }
    const version = ++requestVersion;
    queryAbort?.abort();
    queryAbort = new AbortController();
    const signal = queryAbort.signal;
    docsLoading = true;
    pagination.hidden = true;
    refreshDocsButton.disabled = true;
    docItems.setAttribute("aria-busy", "true");
    fillOptions(docList, []);
    documentEmpty("Descargando todos los documentos pendientes del ECC...");
    docCount.textContent = "0 descargados";
    docsMessage.textContent = "Preparando la lista completa...";
    const downloaded = new Map();
    const cursors = new Set();
    let after = "";
    try {
      // Continuar hasta una página vacía: el flujo puede usar un lote menor que el solicitado.
      while (true) {
        const batch = await fetchDocumentBatch(eccValue, after, signal);
        const rows = batch.rows;
        if (signal.aborted || version !== requestVersion || selectedECC() !== eccValue) return;
        if (!rows.length) break;
        const sizeBefore = downloaded.size;
        for (const row of rows) {
          const number = documentNumber(row);
          if (!number) throw new Error("DOCUMENTO_INVALIDO");
          downloaded.set(number, { vNro_doc: number, vCliente: documentClient(row) });
        }
        if (batch.complete) break;
        const next = documentNumber(rows[rows.length - 1]);
        if (!next || cursors.has(next) || downloaded.size === sizeBefore) throw new Error("PAGINACION_SIN_AVANCE");
        cursors.add(next);
        after = next;
        docCount.textContent = numberFormat.format(downloaded.size) + " descargados";
        docsMessage.textContent = "Descargando lista completa: " + numberFormat.format(downloaded.size) + " documentos...";
      }
      // Un guardado que termina durante la descarga también debe excluirse.
      for (const number of savedDocuments) downloaded.delete(number);
      documentCache.set(eccValue, { documents: [...downloaded.values()], loadedAt: Date.now() });
      docsLoading = false;
      renderDocs();
    } catch (error) {
      if (signal.aborted || version !== requestVersion) return;
      docsLoading = false;
      documentCache.delete(eccValue);
      fillOptions(docList, []);
      docCount.textContent = "Carga incompleta";
      documentEmpty("No se pudo descargar la lista completa. Pulsa Actualizar lista para reintentar.");
      docsMessage.textContent = error?.message === "PAGINACION_SIN_AVANCE"
        ? "La consulta no está avanzando entre lotes. Es necesario revisar su paginación."
        : "No se pudo completar la consulta de documentos.";
    } finally {
      if (version === requestVersion) {
        docsLoading = false;
        docItems.removeAttribute("aria-busy");
        refreshDocsButton.disabled = !selectedECC();
      }
    }
  }

  // Solo confirmaciones SQL de esta pestaña; el filtro del SP sigue siendo la fuente de verdad.
  const savedDocuments = new Set();
  function removeSavedDocument(number) {
    savedDocuments.add(number);
    for (const entry of documentCache.values()) entry.documents = entry.documents.filter(row => row.vNro_doc !== number);
    if (!docsLoading) renderDocs();
  }

  function fillECCOptions(items) {
    const previous = ecc.value;
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona una cabecera ECC";
    fragment.appendChild(placeholder);

    for (const value of items) {
      if (typeof value !== "string" || !value.trim()) continue;
      const name = value.trim();
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      fragment.appendChild(option);
    }

    ecc.replaceChildren(fragment);
    if ([...ecc.options].some(option => option.value === previous)) ecc.value = previous;
  }

  async function loadEcc() {
    if (!powerAutomateFlowUrl && !catalogUrl) {
      fillECCOptions([]);
      eccHelp.textContent = "La lista de ECC aún no está conectada.";
      return;
    }
    eccHelp.textContent = "Consultando cabeceras ECC...";
    try {
      const query = {
        vCodigo: "LISTA_ECC_FAME_COB",
        vModo: "ECC",
        iLimite: 500
      };
      let rows;
      if (powerAutomateFlowUrl) {
        // Opción 1: POST directo; esta llamada solo solicita modo ECC.
        const response = await fetch(powerAutomateFlowUrl, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(query)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.ResultSets?.Table1))
          throw new Error("Respuesta ECC no disponible.");
        rows = data.ResultSets.Table1;
      } else {
        rows = await queryCatalog(query);
      }
      const unique = [...new Set(rows
        .map(row => typeof row?.vECC === "string" ? row.vECC.trim() : "")
        .filter(Boolean))];
      fillECCOptions(unique);
      eccHelp.textContent = unique.length
        ? "Selecciona una cabecera ECC."
        : "No hay cabeceras ECC disponibles.";
    } catch {
      fillECCOptions([]);
      eccHelp.textContent = "La lista de ECC no está disponible. Comprueba la conexión o CORS del flujo.";
    }
  }

  function refreshChanged() {
    // Guardar solo se activa con ECC, DNI, radiobutton y comentario no vacío.
    const body = payload();
    const currentSnapshot = snapshot(body);
    const alreadySaved = savedSnapshot !== null && currentSnapshot === savedSnapshot;
    if (!saving && savedSnapshot !== null && !alreadySaved) {
      savedSnapshot = null;
      setStatus("Cambios pendientes de guardar.");
    }
    saveButton.disabled = saving || !saveUrl || Boolean(validate(body)) || alreadySaved;
  }

  function onDocumentValueChanged(force = false) {
    const currentValue = documentInput.value.trim();
    if (force || currentValue !== lastDocumentValue) {
      lastDocumentValue = currentValue;
      // Cada documento necesita su propia evaluación y comentario.
      form.querySelectorAll('input[name="vEstado_Afectacion"]').forEach(radio => {
        radio.checked = false;
      });
      comment.value = "";
      charCount.textContent = "0";
    }
    refreshChanged();
  }

  function prepareNextRegistration() {
    // Solo tras confirmación SQL; conservar ECC, limpiar selección y refrescar el catálogo.
    documentInput.value = "";
    docItems.querySelectorAll('input[name="documentChoice"]').forEach(radio => {
      radio.checked = false;
    });
    onDocumentValueChanged(true); // Limpia afectación, comentario y contador.
  }

  function onECCChange() {
    documentInput.value = "";
    onDocumentValueChanged(true);
    resetDocs(powerAutomateFlowUrl || catalogUrl ? "Consultando documentos del ECC seleccionado..." : "Catálogo de documentos pendiente de conexión.");
    if ((powerAutomateFlowUrl || catalogUrl) && selectedECC()) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void loadDocs(); }, 150);
    }
  }

  ecc.addEventListener("change", onECCChange);

  documentInput.addEventListener("input", () => {
    onDocumentValueChanged();
    docSearch = documentInput.value.trim().slice(0, 40);
    docsPage = 1;
    renderDocs();
  });
  form.addEventListener("change", refreshChanged);
  comment.addEventListener("input", () => {
    charCount.textContent = numberFormat.format(comment.value.length);
    refreshChanged();
  });
  refreshDocsButton.addEventListener("click", () => {
    clearTimeout(searchTimer);
    void loadDocs(true);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !saveUrl) return;
    const body = payload();
    const error = validate(body);
    if (error) { setStatus(error, "error"); return; }

    const signature = snapshot(body);
    if (savedSnapshot === signature) {
      setStatus("Esta evaluación ya fue registrada. Modifica un campo para registrar otra.", "success");
      return;
    }
    if (pendingSubmission?.signature !== signature)
      pendingSubmission = { id: uuid(), signature };
    const bodyToSend = { ...body, idSolicitud: pendingSubmission.id };

    saving = true;
    saveButton.disabled = true;
    saveLabel.textContent = "Guardando...";
    setStatus("Enviando registro a Power Automate...");
    try {
      const response = await fetch(saveUrl, {
        method: "POST",
        mode: "cors",
        credentials: isDirectSave ? "omit" : "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(bodyToSend)
      });
      if (!response.ok) {
        // Mostrar solo código HTTP; no imprimir el cuerpo SQL, DNI ni URL firmada.
        throw new Error("HTTP_" + response.status);
      }
      let data = await response.json().catch(() => null);
      if (data === null) throw new Error("RESPUESTA_NO_JSON");
      // Power Automate puede envolver el resultado SQL en body/Body o JSON texto.
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { throw new Error("RESPUESTA_NO_JSON"); }
      }
      const sqlBody = data?.body ?? data?.Body ?? data;
      const wrapped = typeof sqlBody === "string" ? (() => {
        try { return JSON.parse(sqlBody); } catch { return null; }
      })() : sqlBody;
      const resultado = wrapped?.ResultSets?.Table1?.[0] ??
        wrapped?.resultsets?.Table1?.[0] ??
        wrapped?.resultSets?.Table1?.[0] ??
        wrapped;
      const confirmado = resultado?.bResultado === true ||
        resultado?.bResultado === 1 || resultado?.bResultado === "true" ||
        resultado?.bResultado === "1";
      const code = Number(resultado?.iCod_FEM);
      const estado = String(resultado?.vEstado || "").trim().toUpperCase();
      // HTTP 200 por sí solo NO confirma la transacción.
      if (!confirmado || !Number.isSafeInteger(code) || code <= 0 ||
          !["REGISTRADO", "YA_REGISTRADO"].includes(estado))
        throw new Error("SIN_CONFIRMACION_SQL");

      pendingSubmission = null;
      if (snapshot(payload()) === signature) {
        savedSnapshot = null; // Permitir un nuevo envío con un UUID diferente.
        prepareNextRegistration();
        setStatus((estado === "YA_REGISTRADO" ? "Solicitud ya registrada" : "Registro guardado correctamente") +
          ". Código FEM: " + code + ". Selecciona otro DNI para continuar.", "success");
      } else {
        savedSnapshot = null;
        setStatus("Registro " + code + " guardado. Hay cambios nuevos pendientes.", "success");
      }
      removeSavedDocument(bodyToSend.vNro_doc);
      if (!documentInput.value.trim()) docSearch = "";
      renderDocs();
    } catch (error) {
      // Un fallo de lectura NO prueba que el INSERT fallara. Nunca reintentar automáticamente.
      // Conservar idSolicitud para evitar duplicaciones si el usuario reintenta tras verificar.
      const reason = String(error?.message || "");
      let detail;
      if (/^HTTP_\d{3}$/.test(reason)) {
        detail = "Power Automate respondió HTTP " + reason.slice(5) + ". Revisa el historial del flujo y la acción «registrar fem».";
      } else if (reason === "RESPUESTA_NO_JSON") {
        detail = "Power Automate no devolvió JSON válido. Revisa el cuerpo de «out reg fem».";
      } else if (reason === "SIN_CONFIRMACION_SQL") {
        detail = "El flujo respondió, pero no devolvió la confirmación SQL (bResultado, vEstado e iCod_FEM). Revisa «out reg fem».";
      } else {
        detail = "No se pudo obtener la respuesta del flujo (red o CORS).";
      }
      setStatus(detail + " Verifica si se insertó antes de volver a pulsar Guardar.", "error");
    } finally {
      saving = false;
      saveLabel.textContent = "Guardar";
      refreshChanged();
    }
  });

  if (saveUrl) {
    setStatus("Selecciona ECC, documento, estado de afectación y escribe un comentario para habilitar Guardar.");
  } else {
    setStatus("Conexión de registro no disponible.");
  }
  refreshChanged();
  resetDocs(powerAutomateFlowUrl || catalogUrl
    ? "Selecciona una cabecera ECC para consultar sus documentos."
    : "El listado se mostrará al conectar el catálogo externo.");
  void loadEcc();
})();

