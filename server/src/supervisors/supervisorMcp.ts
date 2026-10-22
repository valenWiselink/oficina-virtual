/**
 * The office's MCP endpoint for supervisors: POST /mcp, Streamable HTTP,
 * stateless (a fresh server per request). Each supervisor is launched with a
 * token of its own (supervision.ts), which says who it is and limits every
 * tool to its team; the office's own token is never handed to an agent.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { normalizeHostname } from '../wsAuth.js';
import { type JarvisDeps, JarvisTools, registerJarvisTools } from './jarvisTools.js';
import { MCP_SERVER_NAME } from './supervision.js';
import { SupervisorTools } from './supervisorTools.js';

/** The bearer token of a request, if any. */
export function bearerOf(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** The MCP server one supervisor talks to (its tools, bound to its team). The
 *  supervisor of everyone is Jarvis, with tools of its own (jarvisTools.ts). */
export function supervisorMcpServer(deps: JarvisDeps, supervisorId: number): McpServer {
  const isJarvis = deps.store.get(supervisorId)?.supervision?.kind === 'all';
  const jarvis = isJarvis ? new JarvisTools(deps, supervisorId) : undefined;
  const tools = jarvis ?? new SupervisorTools(deps, supervisorId);
  const server = new McpServer({ name: MCP_SERVER_NAME, version: '1.0.0' });
  if (jarvis) registerJarvisTools(server, jarvis);

  server.registerTool(
    'equipo',
    {
      description:
        'Tu equipo: cada agente que supervisás con su id, en qué está (trabajando, te necesita, terminó, sin tarea), su carpeta, lo último que dijo y sus permisos pendientes con el id para aprobarlos o rechazarlos.',
    },
    () => text(tools.equipo()),
  );
  server.registerTool(
    'ultima_respuesta',
    {
      description: 'La última respuesta completa de uno de tus agentes.',
      inputSchema: { agente: z.string().describe('Nombre o id del agente') },
    },
    ({ agente }) => text(tools.ultimaRespuesta(agente)),
  );
  server.registerTool(
    'aprobar_permiso',
    {
      description:
        'Aprueba un permiso pendiente de uno de tus agentes. Sólo lo claramente seguro (leer, buscar, tests/lint/build locales, editar en su carpeta): la oficina rechaza lo peligroso y te dice que se lo pidas a Valentín.',
      inputSchema: { id: z.string().describe('El id del permiso (está en el aviso y en equipo)') },
    },
    ({ id }) => text(tools.aprobarPermiso(id)),
  );
  server.registerTool(
    'rechazar_permiso',
    {
      description:
        'Rechaza un permiso pendiente de uno de tus agentes, con el motivo que le llega al agente.',
      inputSchema: {
        id: z.string().describe('El id del permiso'),
        motivo: z.string().optional().describe('Por qué, para que el agente lo sepa'),
      },
    },
    ({ id, motivo }) => text(tools.rechazarPermiso(id, motivo)),
  );
  server.registerTool(
    'escribir_a_agente',
    {
      description:
        'Le escribe un mensaje a uno de tus agentes en su terminal y lo envía (si está en medio de un turno, le queda en cola). Sirve para pasarle la respuesta de Valentín, pedirle que siga o coordinarlo con otro.',
      inputSchema: {
        agente: z.string().describe('Nombre o id del agente'),
        mensaje: z.string().describe('Lo que le querés decir'),
      },
    },
    ({ agente, mensaje }) => text(tools.escribirAAgente(agente, mensaje)),
  );
  return server;
}

/** POST /mcp: authenticate the supervisor by its token, then serve its tools. */
export function registerSupervisorMcp(
  app: FastifyInstance,
  deps: JarvisDeps,
  allowedHostnames: ReadonlySet<string>,
): void {
  app.all('/mcp', async (request, reply) => {
    // Loopback (or a configured host) only: a page elsewhere cannot reach it
    // through DNS rebinding even if it guessed a token.
    const host = normalizeHostname(request.headers.host);
    if (!host || !allowedHostnames.has(host)) {
      return reply.code(403).send({ error: 'forbidden host' });
    }
    const supervisorId = deps.registry.supervisorByToken(bearerOf(request.headers.authorization));
    if (supervisorId === undefined) return reply.code(401).send({ error: 'unauthorized' });
    if (request.method !== 'POST') {
      return reply.code(405).header('allow', 'POST').send({ error: 'method not allowed' });
    }

    const server = supervisorMcpServer(deps, supervisorId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
}
