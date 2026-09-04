import { configuredOAuthProviders, oauthErrorMessage } from "@/lib/oauth";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <LoginForm
      initialError={oauthErrorMessage(params.error) ?? ""}
      oauthProviders={configuredOAuthProviders()}
    />
  );
}
