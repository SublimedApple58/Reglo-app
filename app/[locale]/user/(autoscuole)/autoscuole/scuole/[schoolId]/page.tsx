import { ConsorzioSchoolDetailPage } from "@/components/pages/Consorzio/ConsorzioSchoolDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  return <ConsorzioSchoolDetailPage schoolId={schoolId} />;
}
