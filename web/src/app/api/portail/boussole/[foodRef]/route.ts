import { NextResponse } from 'next/server';
import type { ProtocolDiffusionApproval } from '@/lib/clinical-engine/types';
import { isC5Enabled } from '@/lib/food-compass/featureFlag';
import { resolvePatientFoodCompassView } from '@/lib/food-compass/patientReference';
import type { PatientFoodCompassSafeView } from '@/lib/food-compass/patientSafe';
import { prisma } from '@/lib/prisma';
import { reconstructProtocolDraft } from '@/lib/protocol/fromPrisma';
import { authorizePortail, resolveProtocoleDiffuse } from '@/lib/protocol/portailProtocol';

export const dynamic = 'force-dynamic';

type Response =
  | { ok: true; view: PatientFoodCompassSafeView }
  | { ok: false; reason: 'unauthenticated' | 'not_found'; error: string };

function notFound() {
  return NextResponse.json<Response>(
    { ok: false, reason: 'not_found', error: 'Lecture alimentaire introuvable.' },
    { status: 404 },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ foodRef: string }> },
): Promise<NextResponse<Response>> {
  if (!isC5Enabled(process.env.WN_C5_ENABLED)) return notFound();
  const foodRef = (await params).foodRef.trim();
  if (!/^\d{1,6}$/.test(foodRef)) return notFound();

  try {
    const auth = await authorizePortail(req);
    if ('ok' in auth) {
      if (auth.reason === 'unauthenticated') {
        return NextResponse.json(auth, { status: 401 });
      }
      return notFound();
    }
    const diffuse = await resolveProtocoleDiffuse(auth.idPatient);
    if (!diffuse) return notFound();

    const row = await prisma.protocolDraft.findUnique({
      where: { id: diffuse.protocolDraftId },
      select: { payload: true, inputHash: true },
    });
    if (!row || row.inputHash !== diffuse.protocolDraftInputHash) return notFound();
    const draft = reconstructProtocolDraft(row.payload, row.inputHash);
    const expectedFoodRef = `ciqual-2025-v1:${foodRef}`;
    const actionRef = draft.actions
      .map(action => action.foodCompassRef)
      .find(ref => ref?.foodRef === expectedFoodRef);
    if (!actionRef) return notFound();

    const approval: ProtocolDiffusionApproval = {
      decisionCardInputHash: diffuse.decisionCardInputHash,
      protocolDraftInputHash: diffuse.protocolDraftInputHash,
      approvedAt: diffuse.approvedAt.toISOString(),
      approvedBy: diffuse.approvedBy as 'practitioner',
      confirmation: diffuse.confirmation as 'content_approved_for_diffusion',
    };
    const view = await resolvePatientFoodCompassView({
      idPatient: auth.idPatient,
      approvedDraft: draft,
      approval,
      actionRef,
    });
    return view ? NextResponse.json({ ok: true, view }) : notFound();
  } catch (caught) {
    console.error('[portail/boussole GET]', caught instanceof Error ? caught.message : String(caught));
    return notFound();
  }
}
