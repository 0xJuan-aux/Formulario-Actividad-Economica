/*
  Configuración pública SIN credenciales.
  El backend privado ATD-Relay conserva la URL firmada de Power Automate
  en ATD_FEM_FLOW_URL (variable de entorno del servidor Render).
  No pegar la URL de Power Automate en JavaScript/HTML/GitHub.
  La consulta exige iniciar sesión con un usuario FEM autorizado.
  El formulario Guardar continúa inhabilitado; esta integración es SOLO LECTURA.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  authUrl: "https://atd-relay.onrender.com/api/fem/login",
  catalogUrl: "https://atd-relay.onrender.com/api/fem/catalogo"
});
