/** One stop of the guided tour: what it points at and what it says. */
export interface TourStep {
  /** The `data-tour` mark of the element it points at. A stop whose element
   *  is not on screen (no terminal yet, the graph showing) is skipped. */
  target: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'agente',
    title: 'Sumá agentes',
    text: 'Con «+ Agente» elegís una carpeta y arranca un Claude nuevo ahí. Podés tener varios trabajando a la vez.',
  },
  {
    target: 'pestanas',
    title: 'Tus agentes',
    text: 'Cada pestaña es un agente. El puntito dice cómo está: ámbar te necesita, azul está trabajando, verde terminó y gris no tiene tarea.',
  },
  {
    target: 'terminal',
    title: 'Hablale',
    text: 'Le escribís desde el chat o lo mirás en la terminal; arriba elegís cuál. Si es tu primera vez con Claude Code, abrí la terminal: ahí te pide iniciar sesión.',
  },
  {
    target: 'te-necesita',
    title: 'Lo que te toca',
    text: 'Acá aparece quien te pide permiso, te hizo una pregunta o te dejó algo para revisar, como un PR. Los permisos se aprueban desde la misma tarjeta.',
  },
  {
    target: 'vistas',
    title: 'Tablero o grafo',
    text: 'El tablero ordena a los agentes por estado. El grafo muestra quién trabaja con quién, y las juntas de subagentes.',
  },
  {
    target: 'historial',
    title: 'Lo que pasó hoy',
    text: 'Todo lo que hicieron tus agentes en el día, con la hora.',
  },
  {
    target: 'ajustes',
    title: 'A tu gusto',
    text: 'De qué lado va la terminal, los sonidos y más. Desde acá podés volver a ver esta guía cuando quieras.',
  },
];
