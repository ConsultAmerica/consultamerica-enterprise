/**
 * Creates an admin account for the Neon recruitment system.
 *
 * This is the ONLY way an admin_users row comes into existence from outside the
 * app. There is no public registration anywhere in /admin, by design, so this
 * script is how the first OWNER is bootstrapped and how a locked-out team gets
 * back in.
 *
 * Usage (Node 22+; tsx resolves the @/ path aliases, same as
 * scripts/backfill-resume-profiles.ts):
 *
 *   ADMIN_PASSWORD='…' npx tsx --env-file=.env.local scripts/create-admin.ts \
 *     --email=owner@consultamerica.com --name="Jane Doe" --role=OWNER
 *
 * Reads, in order of preference, the environment then argv:
 *   --email=…     ADMIN_EMAIL
 *   --name=…      ADMIN_NAME
 *   --password=…  ADMIN_PASSWORD      (prefer the env var: see below)
 *   --role=…      ADMIN_ROLE          OWNER | ADMIN | RECRUITER, default OWNER
 *   --must-change-password            sets must_change_password, so the account
 *                                     is forced through /admin/reset-password
 *                                     on first sign-in
 *
 * PREFER ADMIN_PASSWORD OVER --password. A password on the command line is
 * recorded in the shell history file and is visible in `ps` output to every
 * other user on the machine. The script warns when --password is used. Either
 * way the value is hashed with bcrypt before it touches the database and is
 * never printed, logged or echoed back.
 *
 * Refuses to run if an ACTIVE admin already exists for that address. A
 * deactivated row is not in the way: the `lower(email)` unique index still is,
 * so reactivate or delete that row rather than creating a second one.
 *
 * Requires DATABASE_URL (read by lib/neon/client.ts) and db/neon/001_init.sql
 * to have been applied. It does not create tables.
 */

import {
  ADMIN_ROLES,
  type AdminRole,
  AdminUserExistsError,
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  createAdminUser,
  findByEmail,
  isAdminRole,
  normalizeEmail,
} from "@/lib/neon/admin-users";

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message: string): never {
  console.error(`create-admin: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is not set. Pass --env-file=.env.local, or export it.");
  }

  const email = normalizeEmail(flag("email") ?? process.env.ADMIN_EMAIL ?? "");
  const fullName = (flag("name") ?? process.env.ADMIN_NAME ?? "").trim();
  const passwordFromArgv = flag("password");
  const password = passwordFromArgv ?? process.env.ADMIN_PASSWORD ?? "";
  const roleInput = flag("role") ?? process.env.ADMIN_ROLE ?? "OWNER";
  const mustChangePassword = argv.includes("--must-change-password");

  if (!email) fail("--email is required (or set ADMIN_EMAIL).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" does not look like an email address.`);
  if (!fullName) fail("--name is required (or set ADMIN_NAME).");
  if (!password) fail("A password is required. Set ADMIN_PASSWORD, or pass --password=…");
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!isAdminRole(roleInput)) {
    fail(`--role must be one of ${ADMIN_ROLES.join(", ")} (got "${roleInput}").`);
  }
  const role: AdminRole = roleInput;

  if (passwordFromArgv !== undefined) {
    console.warn(
      "create-admin: warning — the password was passed on the command line, so it is now in your " +
        "shell history and was visible in the process list. Prefer ADMIN_PASSWORD, and consider " +
        "changing this password after first sign-in.",
    );
  }

  // Explicit pre-check so the common case gets a clear message and we do not
  // spend ~300ms hashing a password we are about to throw away. createAdminUser
  // repeats the check and also handles the unique-violation race.
  const existing = await findByEmail(email);
  if (existing?.isActive) {
    fail(`an active admin already exists for ${email} (id ${existing.id}). Nothing was changed.`);
  }
  if (existing) {
    fail(
      `a DEACTIVATED admin row already exists for ${email} (id ${existing.id}). ` +
        "The lower(email) unique index will not allow a second row: reactivate or remove that one.",
    );
  }

  const user = await createAdminUser({ email, fullName, password, role, mustChangePassword });

  // The id, and nothing that could be replayed as a credential.
  console.log(
    JSON.stringify(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      null,
      2,
    ),
  );
  console.log(`\nSign in at /admin/login as ${user.email}.`);
}

main().catch((error: unknown) => {
  // Deliberately not dumping the whole error object: a driver error can echo
  // the failing statement, and that statement carries the password hash.
  if (error instanceof AdminUserExistsError || error instanceof WeakPasswordError) {
    fail(error.message);
  }
  fail(error instanceof Error ? error.message : "unknown failure");
});
