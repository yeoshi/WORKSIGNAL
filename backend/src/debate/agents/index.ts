/**
 * The four Bedrock debate agents (Task 13.1).
 *
 * Barrel re-exporting the Ambition, Realism, Risk, and Opportunity agents and
 * their shared infrastructure (injectable Bedrock invocation, injectable Exa
 * client, prompt builders, and the bounded-retry + verdict-validation core).
 *
 * Each agent owns a fixed system prompt (verbatim from PRD §6) and produces a
 * strict-JSON verdict validated into its typed verdict (Req 10.2-10.5, 10.7);
 * the Risk_Agent additionally performs Exa company research and returns a
 * `caution` insufficient-data verdict on empty research (Req 22.2).
 */

export * from './shared.js';
export * from './ambition.js';
export * from './realism.js';
export * from './risk.js';
export * from './opportunity.js';
