import { transport } from '../transport/index.js';
import { makeAgentEdits } from './agentEditRequests.js';

/** "Editar agente" against the office's own transport (agentEditRequests.ts). */
export const { editAgent, setAgentRun, setSupervision, sendTeam } = makeAgentEdits(transport);

export {
  EFFORT_CHOICES,
  MODEL_CHOICES,
  type RunAnswer,
  type RunChoice,
} from './agentEditRequests.js';
