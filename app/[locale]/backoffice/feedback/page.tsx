import { BackofficeFeedbackPage } from "@/components/pages/Backoffice/BackofficeFeedbackPage";
import { getBackofficeFeedback } from "@/lib/actions/support.actions";

export default async function BackofficeFeedbackRoute() {
  const res = await getBackofficeFeedback();
  const items = res.success && res.data ? res.data : [];

  return <BackofficeFeedbackPage items={items} />;
}
