import { getChatGPTUser } from "./chatgpt-auth";
import PortalClient from "./portal-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <PortalClient
      displayName={user?.displayName ?? "Richard Martins"}
      email={user?.email ?? "usuario-preview@carmak.local"}
    />
  );
}
