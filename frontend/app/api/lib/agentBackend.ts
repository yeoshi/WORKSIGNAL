import { loadBackendModule } from './loadWorkspaceModule';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentBackendModules = Record<string, any>;

let modulesPromise: Promise<AgentBackendModules> | null = null;

export function loadAgentBackendModules(): Promise<AgentBackendModules> {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      loadBackendModule<{ createOpportunityScanner: AgentBackendModules['createOpportunityScanner'] }>(
        'discovery/opportunityScanner.ts',
      ),
      loadBackendModule<{ preFilter: AgentBackendModules['preFilter'] }>('preFilter/preFilter.ts'),
      loadBackendModule<{ runAmbitionAgent: AgentBackendModules['runAmbitionAgent'] }>(
        'debate/agents/ambition.ts',
      ),
      loadBackendModule<{ runRealismAgent: AgentBackendModules['runRealismAgent'] }>(
        'debate/agents/realism.ts',
      ),
      loadBackendModule<{ runRiskAgent: AgentBackendModules['runRiskAgent'] }>('debate/agents/risk.ts'),
      loadBackendModule<{ runOpportunityAgent: AgentBackendModules['runOpportunityAgent'] }>(
        'debate/agents/opportunity.ts',
      ),
      loadBackendModule<{ persistAgentVerdicts: AgentBackendModules['persistAgentVerdicts'] }>(
        'debate/verdictPersistence.ts',
      ),
      loadBackendModule<{ hasAnyValidVerdict: AgentBackendModules['hasAnyValidVerdict'] }>(
        'orchestrator/degradedResolution.ts',
      ),
      loadBackendModule<{ resolveEnriched: AgentBackendModules['resolveEnriched'] }>(
        'orchestrator/resolveEnriched.ts',
      ),
      loadBackendModule<{ isInvalidVerdict: AgentBackendModules['isInvalidVerdict'] }>(
        'debate/verdictValidator.ts',
      ),
    ]).then(
      ([
        opportunityScanner,
        preFilterMod,
        ambitionMod,
        realismMod,
        riskMod,
        opportunityMod,
        verdictPersistence,
        degradedResolution,
        resolveEnrichedMod,
        verdictValidator,
      ]) => ({
        createOpportunityScanner: opportunityScanner.createOpportunityScanner,
        preFilter: preFilterMod.preFilter,
        runAmbitionAgent: ambitionMod.runAmbitionAgent,
        runRealismAgent: realismMod.runRealismAgent,
        runRiskAgent: riskMod.runRiskAgent,
        runOpportunityAgent: opportunityMod.runOpportunityAgent,
        persistAgentVerdicts: verdictPersistence.persistAgentVerdicts,
        hasAnyValidVerdict: degradedResolution.hasAnyValidVerdict,
        resolveEnriched: resolveEnrichedMod.resolveEnriched,
        isInvalidVerdict: verdictValidator.isInvalidVerdict,
      }),
    );
  }

  return modulesPromise;
}
