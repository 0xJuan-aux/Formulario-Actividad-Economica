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
  const loadMore = document.getElementById("loadMore");
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
  const maxPage = 10; // Prueba: máximo 10 documentos visibles por página.

  let docsAfter = "";
  let activeDocFilter = "";
  // Memoria temporal por ECC: solamente páginas que el usuario ya consultó.
  // Nunca descargar todos los DNI automáticamente a una página pública.
  let browseCache = { ecc: "", documents: [], after: "", more: false };
  let hasMore = false;
  let docLoaded = 0;
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

  function fillOptions(container, items) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      if (typeof item !== "string" || !item.trim()) continue;
      const option = document.createElement("option");
      option.value = item;
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
    docsAfter = "";
    activeDocFilter = "";
    browseCache = { ecc: "", documents: [], after: "", more: false };
    docLoaded = 0;
    hasMore = false;
    loadMore.hidden = true;
    docCount.textContent = "0 cargados";
    docsMessage.textContent = "";
    fillOptions(docList, []);
    documentEmpty(message);
  }

  function displayDocs(documents, append) {
    const list = append ? docItems.querySelector(".document-list") : null;
    const section = list || document.createElement("div");
    section.className = "document-list";
    for (const number of documents) {
      if (typeof number !== "string" || !number.trim()) continue;
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
      span.textContent = number;
      label.append(radio, span);
      section.appendChild(label);
    }
    if (!list) docItems.replaceChildren(section);
    const options = [...docList.querySelectorAll("option")].map(x => x.value).concat(documents);
    fillOptions(docList, [...new Set(options)]);
  }

  async function loadDocs(first = true) {
    const selectedECCValue = selectedECC();
    if ((!powerAutomateFlowUrl && !catalogUrl) || !selectedECCValue) return;
    if (!first && !hasMore) return;
    const version = ++requestVersion;
    if (first) {
      queryAbort?.abort();
      queryAbort = new AbortController();
      docsAfter = "";
      const typed = documentInput.value.trim().slice(0, 40);
      activeDocFilter = typed.length >= 4 ? typed : "";
      docLoaded = 0;
      hasMore = false;
      loadMore.hidden = true;
      docCount.textContent = "0 cargados";
      fillOptions(docList, []);
      documentEmpty(activeDocFilter
        ? "Buscando documentos que contengan: " + activeDocFilter
        : "Consultando documentos del ECC seleccionado...");
    }

    loadMore.disabled = true;
    docsMessage.textContent = "Consultando documentos...";
    const requestBody = {
      vCodigo: "LISTA_DNI_FAME_COB",
      vModo: "DOCUMENTOS",
      vECC: selectedECCValue,
      iLimite: maxPage + 1
    };
    // Misma coincidencia parcial en todas las páginas, no solo en la primera.
    // El caso LISTA_DNI_FAME_COB debe mapear vBuscar -> @vBuscar del SP.
    if (activeDocFilter) requestBody.vBuscar = activeDocFilter;
    if (!first && docsAfter) requestBody.vDespues = docsAfter;

    try {
      // La clave vECC del JSON se mapea al parámetro @vECC del SP mediante el caso Power Automate.
      // El usuario solicitó LISTA_DNI_FAME_COB, no cambiar el caso de ECC.
      let rows;
      if (powerAutomateFlowUrl) {
        const response = await fetch(powerAutomateFlowUrl, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(requestBody),
          signal: queryAbort.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.ResultSets?.Table1))
          throw new Error("Respuesta DOCUMENTOS no disponible.");
        rows = data.ResultSets.Table1;
      } else {
        rows = await queryCatalog(requestBody, queryAbort.signal);
      }
      if (version !== requestVersion || selectedECC() !== selectedECCValue) return;
      const numbers = rows
        .map(row => typeof row?.vNro_doc === "string" ? row.vNro_doc.trim() : "")
        .filter(Boolean);
      // Evitar mostrar un DNI que no coincida si el flujo omitió @vBuscar.
      // Para buscar en todo el catálogo, el filtro también debe aplicarse en SQL.
      const matches = activeDocFilter
        ? numbers.filter(number => number.includes(activeDocFilter))
        : numbers;
      const page = matches.slice(0, maxPage);
      hasMore = matches.length > maxPage;
      docsAfter = page.length ? page[page.length - 1] : "";
      docLoaded += page.length;

      if (!activeDocFilter) {
        if (first || browseCache.ecc !== selectedECCValue) {
          browseCache = { ecc: selectedECCValue, documents: [], after: "", more: false };
        }
        browseCache.documents.push(...page);
        browseCache.after = docsAfter;
        browseCache.more = hasMore;
      }
      if (page.length) displayDocs(page, !first);
      else if (first) documentEmpty(activeDocFilter
        ? "No se encontraron coincidencias con ese documento."
        : "No se encontraron documentos para este ECC.");
      docCount.textContent = numberFormat.format(docLoaded) +
        (hasMore ? "+ cargados" : " cargados");
      loadMore.hidden = !hasMore;
      docsMessage.textContent = hasMore ? "Puedes cargar más documentos." : "";
    } catch (error) {
      if (error?.name === "AbortError" || version !== requestVersion) return;
      docsMessage.textContent = "No se pudo consultar la lista de documentos.";
      if (first) documentEmpty("La consulta autorizada de documentos no está disponible.");
      loadMore.hidden = true;
    } finally {
      if (version === requestVersion) loadMore.disabled = false;
    }
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

  function onECCChange() {
    documentInput.value = "";
    onDocumentValueChanged(true);
    resetDocs(powerAutomateFlowUrl || catalogUrl ? "Consultando documentos del ECC seleccionado..." : "Catálogo de documentos pendiente de conexión.");
    if ((powerAutomateFlowUrl || catalogUrl) && selectedECC()) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void loadDocs(true); }, 450);
    }
  }

  ecc.addEventListener("change", onECCChange);

  documentInput.addEventListener("input", () => {
    onDocumentValueChanged();
    if ((!powerAutomateFlowUrl && !catalogUrl) || !selectedECC()) return;

    clearTimeout(searchTimer);
    queryAbort?.abort();
    queryAbort = new AbortController();
    requestVersion++;

    const term = documentInput.value.trim().slice(0, 40);
    const available = browseCache.ecc === selectedECC()
      ? browseCache.documents : [];
    const localMatches = term
      ? available.filter(number => number.includes(term))
      : available;

    // Respuesta inmediata, sin pedir a Power Automate por cada tecla.
    fillOptions(docList, []);
    if (localMatches.length) displayDocs(localMatches, false);
    else documentEmpty(term
      ? "Sin coincidencias entre los documentos ya cargados."
      : "No se han cargado documentos para este ECC.");

    activeDocFilter = "";
    docsAfter = browseCache.after;
    hasMore = browseCache.more;
    docLoaded = available.length;
    docCount.textContent = numberFormat.format(localMatches.length) +
      (term ? " coincidencias locales" : " cargados");
    loadMore.disabled = false;
    loadMore.hidden = Boolean(term) || !hasMore;

    if (term.length >= 4) {
      docsMessage.textContent = "Buscando también en los demás documentos...";
      // Una consulta tras una pausa: búsqueda SQL para valores aún no cargados.
      searchTimer = setTimeout(() => { void loadDocs(true); }, 850);
    } else if (term) {
      docsMessage.textContent = "Resultados inmediatos entre los cargados. Escribe 4 dígitos para buscar en el resto.";
    } else {
      docsMessage.textContent = hasMore ? "Puedes cargar más documentos." : "";
    }
  });
  form.addEventListener("change", refreshChanged);
  comment.addEventListener("input", () => {
    charCount.textContent = numberFormat.format(comment.value.length);
    refreshChanged();
  });
  loadMore.addEventListener("click", () => { void loadDocs(false); });

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
        savedSnapshot = signature;
        setStatus((estado === "YA_REGISTRADO" ? "Solicitud ya registrada" : "Registro guardado correctamente") +
          ". Código FEM: " + code + ".", "success");
      } else {
        savedSnapshot = null;
        setStatus("Registro " + code + " guardado. Hay cambios nuevos pendientes.", "success");
      }
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
