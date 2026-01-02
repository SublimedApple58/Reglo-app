export type PlanKey = "core" | "growth" | "scale";

export type PlanTier = {
  key: PlanKey;
  label: string;
  basePrice: number;
  documentsIncluded: number;
  workflowsIncluded: number;
  docBlockSize: number;
  workflowBlockSize: number;
  extraFee: number;
};

export type UsageSnapshot = {
  documentsUsed: number;
  workflowsUsed: number;
};

const planCatalog: Record<PlanKey, PlanTier> = {
  core: {
    key: "core",
    label: "Core",
    basePrice: 159,
    documentsIncluded: 350,
    workflowsIncluded: 20,
    docBlockSize: 200,
    workflowBlockSize: 20,
    extraFee: 49,
  },
  growth: {
    key: "growth",
    label: "Growth",
    basePrice: 259,
    documentsIncluded: 550,
    workflowsIncluded: 40,
    docBlockSize: 200,
    workflowBlockSize: 20,
    extraFee: 49,
  },
  scale: {
    key: "scale",
    label: "Scale",
    basePrice: 429,
    documentsIncluded: 900,
    workflowsIncluded: 80,
    docBlockSize: 200,
    workflowBlockSize: 20,
    extraFee: 49,
  },
};

const getExtraBlocks = (used: number, included: number, blockSize: number) => {
  if (used <= included) return 0;
  return Math.ceil((used - included) / blockSize);
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

export function computePlanUsage(planKey: PlanKey, usage: UsageSnapshot) {
  const plan = planCatalog[planKey];
  const docExtraBlocks = getExtraBlocks(
    usage.documentsUsed,
    plan.documentsIncluded,
    plan.docBlockSize,
  );
  const workflowExtraBlocks = getExtraBlocks(
    usage.workflowsUsed,
    plan.workflowsIncluded,
    plan.workflowBlockSize,
  );

  const docLimit = plan.documentsIncluded + docExtraBlocks * plan.docBlockSize;
  const workflowLimit =
    plan.workflowsIncluded + workflowExtraBlocks * plan.workflowBlockSize;

  const docRemaining = Math.max(docLimit - usage.documentsUsed, 0);
  const workflowRemaining = Math.max(workflowLimit - usage.workflowsUsed, 0);

  const extrasTotal = (docExtraBlocks + workflowExtraBlocks) * plan.extraFee;

  return {
    plan,
    usage,
    docs: {
      used: usage.documentsUsed,
      included: plan.documentsIncluded,
      blockSize: plan.docBlockSize,
      extraBlocks: docExtraBlocks,
      currentLimit: docLimit,
      remainingToNext: docRemaining,
    },
    workflows: {
      used: usage.workflowsUsed,
      included: plan.workflowsIncluded,
      blockSize: plan.workflowBlockSize,
      extraBlocks: workflowExtraBlocks,
      currentLimit: workflowLimit,
      remainingToNext: workflowRemaining,
    },
    extrasTotal,
    nextChargeTotal: plan.basePrice + extrasTotal,
  };
}

export { planCatalog };
