import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getSession } from "~/auth/server";

export async function AuthShowcase() {
  const session = await getSession();

  if (!session) {
    return (
      <form className="w-full">
        <button
          type="submit"
          className="bg-sprout text-spruce w-full rounded-full py-3 font-semibold transition-opacity hover:opacity-90"
          formAction={async () => {
            "use server";
            const res = await auth.api.signInSocial({
              body: {
                provider: "google",
                callbackURL: "/",
              },
            });
            if (!res.url) {
              throw new Error("No URL returned from signInSocial");
            }
            redirect(res.url);
          }}
        >
          Sign in with Google
        </button>
      </form>
    );
  }

  return (
    <form className="w-full">
      <button
        type="submit"
        formAction={async () => {
          "use server";
          await auth.api.signOut({
            headers: await headers(),
          });
          redirect("/");
        }}
        className="text-content-tertiary w-full py-2 text-center text-xs underline-offset-4 hover:underline"
      >
        Sign out
      </button>
    </form>
  );
}
