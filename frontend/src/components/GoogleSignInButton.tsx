import { useEffect, useRef, useState } from "react";
import { isMockMode } from "../lib/api";

type GoogleCredentialResponse = { credential: string };

type GoogleAccountsId = {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; use_fedcm_for_prompt?: boolean }): void;
  renderButton(parent: HTMLElement, options: { theme: "outline"; size: "large"; text: "signin_with" | "signup_with"; shape: "pill"; width: number }): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Không thể tải dịch vụ đăng nhập Google."));
    document.head.append(script);
  });
  return googleScriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential(credential: string): void;
  disabled?: boolean;
  mode?: "signin" | "signup";
}

export function GoogleSignInButton({ onCredential, disabled = false, mode = "signin" }: GoogleSignInButtonProps): JSX.Element | null {
  const host = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [error, setError] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => { onCredentialRef.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!clientId || isMockMode || !host.current) return;
    let cancelled = false;
    void loadGoogleIdentityScript().then(() => {
      if (cancelled || !host.current || !window.google?.accounts.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => { if (!disabled) onCredentialRef.current(credential); },
        use_fedcm_for_prompt: true,
      });
      host.current.replaceChildren();
      window.google.accounts.id.renderButton(host.current, {
        theme: "outline", size: "large", text: mode === "signup" ? "signup_with" : "signin_with", shape: "pill", width: Math.min(360, Math.max(200, host.current.clientWidth)),
      });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Không thể khởi tạo đăng nhập Google.");
    });
    return () => { cancelled = true; };
  }, [clientId, disabled, mode]);

  // Mock mode intentionally does not accept a Google token: only the backend can verify it.
  if (!clientId || isMockMode) return null;
  return <div className={disabled ? "pointer-events-none opacity-50" : ""}>
    <div ref={host} className="flex min-h-11 w-full justify-center" aria-label="Đăng nhập bằng Google" />
    {error && <p className="mt-2 text-center text-xs font-semibold text-rose-700" role="alert">{error}</p>}
  </div>;
}
