/**
 * Ready-made starts for a new agent: a nickname and its first message
 * (editable in the dialog before launching). "Sin plantilla" starts empty.
 * Single line, without " % ! ^ & | < >: an npm-installed claude goes through
 * cmd.exe, where the server refuses those (windowsCommand.ts).
 */
export interface AgentTemplate {
  id: string;
  label: string;
  nickname: string;
  prompt: string;
}

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  { id: 'nada', label: 'Sin plantilla', nickname: '', prompt: '' },
  {
    id: 'revisor',
    label: 'Revisor de PR',
    nickname: 'Revisor',
    prompt:
      'Revisá el PR que te paso a continuación: buscá bugs, casos borde y problemas de seguridad, y decime qué arreglarías antes de mergear. PR: ',
  },
  {
    id: 'bug',
    label: 'Arreglar bug',
    nickname: 'Bugfix',
    prompt:
      'Encontrá la causa de este bug en el código, arreglalo con el cambio más chico posible y agregá un test que lo cubra. El bug: ',
  },
  {
    id: 'investigar',
    label: 'Investigar',
    nickname: 'Investigador',
    prompt:
      'Investigá cómo funciona esto en el código y explicámelo con los archivos y funciones clave, sin cambiar nada: ',
  },
];
