import { validateProductionSecurityConfig } from "@/lib/security-config";

export function register() {
  validateProductionSecurityConfig();
}
