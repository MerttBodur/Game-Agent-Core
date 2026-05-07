import { retrieveContext } from "./rag/treeNavigator.js";
import type { RetrievedContextPackage } from "../types/tree.js";

export interface ProjectInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  paidPriorityCategories?: string[];
  otherConstraints?: string | null;
  adviseAnyway?: boolean;
  pinnedToolIds?: string[];
}

export async function retrieveAdvisorKnowledge(input: ProjectInput): Promise<{
  retrieval: RetrievedContextPackage;
}> {
  const retrieval = await retrieveContext({
    projectIdea: input.projectIdea,
    budget: input.budget,
    timeLimit: input.timeLimit,
    skillLevel: input.skillLevel,
    teamSize: input.teamSize,
    platformTarget: input.platformTarget,
    artCapability: input.artCapability,
    otherConstraints: input.otherConstraints,
  });

  return { retrieval };
}
