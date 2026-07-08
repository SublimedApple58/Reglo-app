import { BackofficeSupportPage } from "@/components/pages/Backoffice/BackofficeSupportPage";
import { getBackofficeSupportThreads } from "@/lib/actions/support.actions";

export default async function BackofficeSupportRoute() {
  const res = await getBackofficeSupportThreads();
  const threads = res.success && res.data ? res.data : [];

  return <BackofficeSupportPage initialThreads={threads} />;
}
