import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Fastify, { type FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { SupervisionTeams, SupervisorRegistry } from '../src/supervisors/supervision.js';
import { bearerOf, registerSupervisorMcp } from '../src/supervisors/supervisorMcp.js';

function tokenIn(flags: string[]): string {
  const config = JSON.parse(fs.readFileSync(flags[1], 'utf-8'));
  return config.mcpServers.oficina.headers.Authorization.slice('Bearer '.length);
}

describe('the office MCP endpoint for supervisors', () => {
  let dir: string;
  let app: FastifyInstance;
  let url: string;
  let tokens: { jefa: string; otro: string };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));
    const store = new AgentStateStore();
    const registry = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 't.json')), dir);
    registry.attach(store);
    const add = (id: number, nickname: string, extra = {}) =>
      store.set(
        id,
        createAgentState({
          id,
          sessionId: `s${id}`,
          projectDir: '/p',
          jsonlFile: `/p/s${id}.jsonl`,
          isExternal: false,
          nickname,
          isWaiting: true,
          ...extra,
        }),
      );
    add(1, 'Pagos', { lastReply: 'Listo el endpoint.' });
    add(2, 'Web');
    add(10, 'Jefa', { supervision: { kind: 'agents' } });
    add(11, 'Otro', { supervision: { kind: 'agents' } });
    registry.teams.set('s10', ['s1']);
    registry.teams.set('s11', ['s2']);
    app = Fastify();
    registerSupervisorMcp(
      app,
      { store, registry, terminalOf: () => undefined },
      new Set(['127.0.0.1', 'localhost']),
    );
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/mcp`;
    registry.setOfficeUrl(url.replace(/\/mcp$/, ''));
    tokens = {
      jefa: tokenIn(registry.prepareLaunch('s10', { kind: 'agents' })),
      otro: tokenIn(registry.prepareLaunch('s11', { kind: 'agents' })),
    };
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'prueba', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }

  it('lists the seven tools and answers with the supervisor’s own team', async () => {
    const client = await connect(tokens.jefa);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'aprobar_permiso',
      'cerrar_agente',
      'equipo',
      'escribir_a_agente',
      'lanzar_agente',
      'rechazar_permiso',
      'ultima_respuesta',
    ]);
    const team = await client.callTool({ name: 'equipo', arguments: {} });
    const text = (team.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('«Pagos»');
    expect(text).not.toContain('Web');
    const reply = await client.callTool({
      name: 'ultima_respuesta',
      arguments: { agente: 'pagos' },
    });
    expect((reply.content as Array<{ text: string }>)[0].text).toBe('Listo el endpoint.');
    await client.close();
  });

  it('keeps another supervisor out of this team', async () => {
    const client = await connect(tokens.otro);
    const reply = await client.callTool({
      name: 'ultima_respuesta',
      arguments: { agente: 'Pagos' },
    });
    expect((reply.content as Array<{ text: string }>)[0].text).toContain('no está en tu equipo');
    await client.close();
  });

  it('refuses a wrong token and a foreign host', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const bad = await fetch(url, {
      method: 'POST',
      body,
      headers: { ...headers, authorization: 'Bearer nope' },
    });
    expect(bad.status).toBe(401);
    const foreign = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: body,
      headers: { ...headers, host: 'evil.example', authorization: `Bearer ${tokens.jefa}` },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('reads the bearer token', () => {
    expect(bearerOf('Bearer abc')).toBe('abc');
    expect(bearerOf('Basic abc')).toBeUndefined();
    expect(bearerOf(undefined)).toBeUndefined();
  });
});
