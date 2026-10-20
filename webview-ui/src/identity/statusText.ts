/**
 * Spanish display for the status strings. The server keeps producing them in
 * English on purpose: the webview re-parses those prefixes elsewhere
 * (toolUtils, subagent labels) and tests assert them, so they are translated
 * only here, at the moment they are shown.
 */
const PREFIXES: Array<[RegExp, string]> = [
  [/^Reading /, 'Leyendo '],
  [/^Editing notebook$/, 'Editando un notebook'],
  [/^Editing /, 'Editando '],
  [/^Writing /, 'Escribiendo '],
  [/^Running subtask$/, 'Corriendo una subtarea'],
  [/^Running: /, 'Corriendo: '],
  [/^Searching files$/, 'Buscando archivos'],
  [/^Searching code$/, 'Buscando en el código'],
  [/^Fetching web content$/, 'Leyendo una página web'],
  [/^Searching the web$/, 'Buscando en la web'],
  [/^Subtask: /, 'Subtarea: '],
  [/^Subtask$/, 'Subtarea'],
  [/^Waiting for your answer$/, 'Esperando tu respuesta'],
  [/^Waiting for input$/, 'Esperando tu respuesta'],
  [/^Planning$/, 'Planificando'],
  [/^Creating team/, 'Armando un equipo'],
  [/^Sending message$/, 'Mandando un mensaje'],
  [/^Using /, 'Usando '],
  [/^Needs approval$/, 'Necesita tu permiso'],
  [/^Idle$/, 'Sin tarea'],
  [/^Thinking$/, 'Pensando…'],
];

export function statusText(status: string): string {
  for (const [pattern, spanish] of PREFIXES) {
    if (pattern.test(status)) return status.replace(pattern, spanish);
  }
  return status;
}
