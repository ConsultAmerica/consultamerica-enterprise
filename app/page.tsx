import type { Metadata } from "next";

import { EnterpriseHome } from "@/components/marketing/EnterpriseHome";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <EnterpriseHome />;
}
