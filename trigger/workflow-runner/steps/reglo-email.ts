import { sendDynamicEmail } from "@/email";
import { interpolateTemplate } from "@/lib/workflows/engine";

export const executeRegloEmail = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
}: {
  prisma: any;
  run: { id: string };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
}) => {
  const rawTo = settings.to?.trim();
  const rawSubject = settings.subject?.trim();
  const rawBody = settings.body ?? "";
  if (!rawTo) {
    throw new Error("Destinatario email obbligatorio");
  }
  if (!rawSubject) {
    throw new Error("Oggetto email obbligatorio");
  }
  if (!rawBody.trim()) {
    throw new Error("Corpo email obbligatorio");
  }
  const to = interpolateTemplate(rawTo, context);
  const subject = interpolateTemplate(rawSubject, context);
  const body = interpolateTemplate(rawBody, context);
  const from = settings.from?.trim() || undefined;
  await sendDynamicEmail({ to, subject, body, from });
  const output = { to, subject };
  stepOutputs[nodeId] = output;
  await prisma.workflowRunStep.updateMany({
    where: { runId: run.id, nodeId },
    data: {
      status: "completed",
      output,
      finishedAt: new Date(),
    },
  });
  return { branch: null };
};
