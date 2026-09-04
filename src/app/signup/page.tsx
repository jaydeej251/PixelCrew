import { configuredOAuthProviders, oauthErrorMessage } from "@/lib/oauth";
import { SignupForm } from "./signup-form";

type SignupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  return (
    <SignupForm
      initialError={oauthErrorMessage(params.error) ?? ""}
      oauthProviders={configuredOAuthProviders()}
    />
  );
}
