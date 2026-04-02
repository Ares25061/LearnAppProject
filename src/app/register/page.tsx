import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/library");
  }

  return (
    <div className="page-shell">
      <SiteHeader user={null} />
      <main className="page-content">
        <AuthForm mode="register" />
      </main>
    </div>
  );
}
