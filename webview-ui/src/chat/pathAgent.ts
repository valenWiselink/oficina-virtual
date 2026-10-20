import { createContext } from 'react';

/** The agent whose answer the chat shows: a relative path it names is looked
 *  up in its folder (the server's openPath). */
export const PathAgentContext = createContext<number | undefined>(undefined);
