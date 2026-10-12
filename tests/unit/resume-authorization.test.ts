import { describe, expect, it, vi } from "vitest";

/*
  Who may open a candidate's résumé.

  The route this covers used to accept any signed-in session, which let the
  lowest-privilege account read every CV in the system by walking application
  ids. These cases pin the replacement rule so a future refactor has to break a
  test before it can break a candidate's privacy.

  The route module pulls in next/server and the Neon client at import time;
  neither is needed to exercise a pure predicate, so both are stubbed. Importing
  the real module (rather than copying the function here) is the point: a test
  against a duplicate of the logic would keep passing after the route stopped
  using it.
*/
vi.mock("server-only", () => ({}));
vi.mock("@/lib/neon/client", () => ({ query: vi.fn() }));
vi.mock("@/lib/neon/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/neon/applications", () => ({ getApplicationById: vi.fn() }));

const { mayOpenResume } = await import("@/app/admin/applications/[id]/resume/route");

type Role = "OWNER" | "ADMIN" | "RECRUITER";

const staff = (role: Role, id = "user-self") =>
  ({
    id,
    email: `${role.toLowerCase()}@consultamerica.com`,
    fullName: role,
    role,
    mustChangePassword: false,
  }) as Parameters<typeof mayOpenResume>[0];

const application = (assignedTo: string | null) =>
  ({ id: "app-1", assigned_recruiter_id: assignedTo }) as Parameters<typeof mayOpenResume>[1];

describe("mayOpenResume", () => {
  it("lets an owner open a résumé assigned to someone else", () => {
    expect(mayOpenResume(staff("OWNER"), application("another-recruiter"))).toBe(true);
  });

  it("lets an admin open a résumé assigned to someone else", () => {
    expect(mayOpenResume(staff("ADMIN"), application("another-recruiter"))).toBe(true);
  });

  it("lets a recruiter open their own assignment", () => {
    expect(mayOpenResume(staff("RECRUITER", "user-self"), application("user-self"))).toBe(true);
  });

  it("lets a recruiter open the unassigned inbound queue", () => {
    // Not a loophole: unassigned applications are shared work, and a recruiter
    // who cannot read the queue cannot pick anything out of it.
    expect(mayOpenResume(staff("RECRUITER"), application(null))).toBe(true);
  });

  it("refuses a recruiter a résumé assigned to a colleague", () => {
    // The case the old "is anyone signed in" check got wrong.
    expect(mayOpenResume(staff("RECRUITER", "user-self"), application("user-other"))).toBe(false);
  });

  it("does not treat an empty-string recruiter id as a match", () => {
    // Guards against a future change that defaults the column to '' rather
    // than NULL: '' is neither "unassigned" nor anyone's id, so it must refuse.
    expect(mayOpenResume(staff("RECRUITER", ""), application("user-other"))).toBe(false);
  });
});
