import { describe, expect, it } from "vitest";

import { locationLabels, showWorkplaceType } from "@/lib/jobs/public-model";

/**
 * The duplicate "Remote" on a remote posting.
 *
 * A job carries two independent columns that for a remote role say the same
 * thing: `location` is free text an admin types ("Remote (US)") and
 * `workplace_type` is an enum they pick (REMOTE). Printed together on an
 * unlabelled meta line, a real posting read:
 *
 *   Remote (US) · Remote · Full Time
 *
 * The three rows below are the actual data in the system, and they are the
 * three cases the rule has to get right. CA-2026-0001 proves the rule is not
 * simply "hide the arrangement".
 */
describe("location and workplace label deduplication", () => {
  it("collapses a remote location and a REMOTE arrangement to one label", () => {
    // CA-2026-0003 and CA-2026-0005: location "Remote (US)", type REMOTE.
    expect(showWorkplaceType("Remote (US)", "Remote")).toBe(false);
    expect(locationLabels("Remote (US)", "Remote")).toEqual(["Remote (US)"]);
  });

  it("keeps both for a physical location", () => {
    // CA-2026-0001: location "Ashburn, VA", type HYBRID. Not redundant.
    expect(showWorkplaceType("Ashburn, VA", "Hybrid")).toBe(true);
    expect(locationLabels("Ashburn, VA", "Hybrid")).toEqual(["Ashburn, VA", "Hybrid"]);
  });

  it("keeps both for a hybrid role in a remote-titled location", () => {
    // The case that makes this a two-column rule rather than a one-column one.
    // "Remote (US)" plus HYBRID is information, not repetition: the location
    // names where the role is based and HYBRID says the arrangement is not
    // fully remote. Hiding the arrangement here would publish a hybrid role as
    // though it were remote.
    expect(showWorkplaceType("Remote (US)", "Hybrid")).toBe(true);
    expect(locationLabels("Remote (US)", "Hybrid")).toEqual(["Remote (US)", "Hybrid"]);
    expect(showWorkplaceType("Remote (US)", "On-site")).toBe(true);
  });

  it("keeps both when a remote role names a real place", () => {
    // "Remote" as an arrangement with a city as the location is also not
    // redundant: the city is the eligibility region or the nominal base.
    expect(showWorkplaceType("Austin, TX", "Remote")).toBe(true);
    expect(locationLabels("Austin, TX", "Remote")).toEqual(["Austin, TX", "Remote"]);
  });

  it("matches case-insensitively on both sides", () => {
    // The view-model spells these "Remote" and the Neon row spells them
    // REMOTE, and both call sites exist. One helper has to serve both.
    expect(showWorkplaceType("Remote (US)", "REMOTE")).toBe(false);
    expect(showWorkplaceType("REMOTE - US", "remote")).toBe(false);
    expect(showWorkplaceType("Fully remote, US", "Remote")).toBe(false);
    expect(showWorkplaceType("Ashburn, VA", "REMOTE")).toBe(true);
  });

  it("is a display rule only, so partial words still count as remote", () => {
    // "Remotely" contains "remote" and is the same claim, so it collapses.
    expect(showWorkplaceType("Work remotely from anywhere", "Remote")).toBe(false);
  });

  it("handles missing values without producing an empty separator", () => {
    // Several call sites join these with " · ", so a blank in the list would
    // leave a stranded dot on the page.
    expect(locationLabels("", "Remote")).toEqual(["Remote"]);
    expect(locationLabels("Ashburn, VA", "")).toEqual(["Ashburn, VA"]);
    expect(locationLabels(null, null)).toEqual([]);
    expect(locationLabels("  ", "Hybrid")).toEqual(["Hybrid"]);
    expect(showWorkplaceType("Ashburn, VA", null)).toBe(false);
    expect(showWorkplaceType(null, "Remote")).toBe(true);
  });
});
