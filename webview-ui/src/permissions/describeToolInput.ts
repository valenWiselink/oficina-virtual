/** One block of an approval card: a label and the exact text it refers to. */
export interface ToolInputSection {
  label: string;
  text: string;
  /** Monospace + preserved whitespace (commands, code, file contents). */
  code: boolean;
}

/** What an approval card shows for one tool call. */
export interface ToolInputDescription {
  /** Short Spanish verb phrase for the card title. */
  title: string;
  sections: ToolInputSection[];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function section(label: string, value: unknown, code = true): ToolInputSection[] {
  const text = str(value);
  return text === undefined ? [] : [{ label, text, code }];
}

function json(input: Record<string, unknown>): ToolInputSection[] {
  return [{ label: 'Datos', text: JSON.stringify(input, null, 2), code: true }];
}

/**
 * Describe a tool call for the approval card. The card must show exactly what
 * will run (requirement: approve only after seeing the full command), so every
 * branch passes the raw values through untouched; anything unknown falls back
 * to the full JSON input rather than a summary that could hide something.
 */
export function describeToolInput(
  toolName: string,
  input: Record<string, unknown>,
): ToolInputDescription {
  const described = describeKnownTool(toolName, input);
  // A known tool missing its usual fields must still show what it carries.
  return described.sections.length > 0 ? described : { ...described, sections: json(input) };
}

function describeKnownTool(toolName: string, input: Record<string, unknown>): ToolInputDescription {
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      return {
        title: `Quiere correr un comando (${toolName})`,
        sections: [
          ...section('Comando', input.command),
          ...section('Para qué', input.description, false),
        ],
      };
    case 'Edit':
      return {
        title: 'Quiere editar un archivo',
        sections: [
          ...section('Archivo', input.file_path),
          ...section('Reemplaza', input.old_string),
          ...section('Por', input.new_string),
          ...(input.replace_all === true
            ? [{ label: 'Alcance', text: 'Todas las apariciones', code: false }]
            : []),
        ],
      };
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
      return {
        title: `Quiere hacer ${edits.length} cambios en un archivo`,
        sections: [
          ...section('Archivo', input.file_path),
          ...edits.flatMap((edit, i) => [
            ...section(`Cambio ${i + 1}: reemplaza`, edit.old_string),
            ...section(`Cambio ${i + 1}: por`, edit.new_string),
          ]),
        ],
      };
    }
    case 'Write':
      return {
        title: 'Quiere escribir un archivo',
        sections: [...section('Archivo', input.file_path), ...section('Contenido', input.content)],
      };
    case 'NotebookEdit':
      return {
        title: 'Quiere editar un notebook',
        sections: [
          ...section('Notebook', input.notebook_path),
          ...section('Celda', input.new_source),
        ],
      };
    case 'WebFetch':
      return {
        title: 'Quiere abrir una página web',
        sections: [...section('URL', input.url), ...section('Qué busca', input.prompt, false)],
      };
    case 'WebSearch':
      return {
        title: 'Quiere buscar en la web',
        sections: section('Búsqueda', input.query, false),
      };
    case 'Agent':
    case 'Task':
      return {
        title: 'Quiere lanzar un subagente',
        sections: [
          ...section('Tarea', input.description, false),
          ...section('Instrucciones', input.prompt),
        ],
      };
    case 'ExitPlanMode':
      return { title: 'Terminó el plan y quiere avanzar', sections: section('Plan', input.plan) };
  }
  if (toolName.startsWith('mcp__')) {
    const [, server = '', tool = ''] = toolName.split('__');
    return { title: `Quiere usar ${tool} (${server})`, sections: json(input) };
  }
  return { title: `Quiere usar ${toolName}`, sections: json(input) };
}
