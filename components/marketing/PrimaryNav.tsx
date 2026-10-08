"use client";

import { CAP_ICONS, CAPS, IND_ICONS, INDUSTRIES, PROD } from "@/data/marketing";

/**
 * The Capabilities / Industries / Products mega-menus, shared by sub-page
 * headers so they match the homepage. The link list itself lives in
 * nav-config.ts.
 *
 * `base` is "" on the homepage (plain #anchors) and "/" elsewhere, so a
 * sub-page sends you home to the right section.
 */

export const CHEV = (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const EXT_ICON = (
  <svg className="ext" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const ARR_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

function PathIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function MegaItem({ title, desc, icon, href }: { title: string; desc: string; icon: string; href: string }) {
  const ext = /^https?:/.test(href);
  // sector pictograms render bare at 34px; product artwork keeps the 36px chip
  const isPict = /^\/?img\/sectors\//.test(icon);
  const isImg = /^\/?img\//.test(icon) || /\.(png|jpe?g|svg|webp)$/i.test(icon);
  const src = icon.startsWith("/") ? icon : `/${icon}`;

  return (
    <a className="mitem" href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className={`mi${isPict ? " mi-pict" : isImg ? " mi-img" : ""}`}>
        {isPict ? <img src={src} alt="" /> : isImg ? <img src={src} alt="" width={36} height={36} /> : <PathIcon d={icon} />}
      </span>
      <span className="mtx">
        <span className="mt">
          {title}
          {ext ? <> {EXT_ICON}</> : null}
        </span>
        <span className="md">{desc}</span>
      </span>
    </a>
  );
}

export function MegaFeature({ img, label, title, desc, href }: { img: string; label: string; title: string; desc: string; href: string }) {
  return (
    <a className="mega-feature" href={href}>
      <span className="mf-img" style={{ backgroundImage: `url('${img}')` }} />
      <span className="mf-body">
        <span className="mf-label">{label}</span>
        <span className="mf-title">
          {title} {ARR_ICON}
        </span>
        <span className="mf-desc">{desc}</span>
      </span>
    </a>
  );
}

export function MegaPanel({
  groups,
  feature,
}: {
  groups: [string, [string, string, string, string][]][];
  feature: { img: string; label: string; title: string; desc: string; href: string };
}) {
  return (
    <div className="mega-inner">
      {groups.map(([header, items]) => (
        <div className="mega-col" key={header}>
          <div className="mega-h">{header}</div>
          {items.map(([title, desc, icon, href]) => (
            <MegaItem key={title} title={title} desc={desc} icon={icon} href={href} />
          ))}
        </div>
      ))}
      <MegaFeature {...feature} />
    </div>
  );
}

export const MEGA_IDS = { capabilities: "megaCap", industries: "megaInd", products: "megaProd" } as const;

/** One mega panel by section, so headers that render their own link list can reuse the panels. */
export function NavMegaPanel({ mega, base = "" }: { mega: keyof typeof MEGA_IDS; base?: "" | "/" }) {
  const a = (hash: string) => `${base}${hash}`;

  const ci = (i: number, d: string): [string, string, string, string] => [
    CAPS[i][0],
    d,
    CAP_ICONS[i],
    a("#capabilities"),
  ];
  const ii = (i: number): [string, string, string, string] => [
    INDUSTRIES[i][0],
    INDUSTRIES[i][1],
    IND_ICONS[i],
    a("#industries"),
  ];
  const pi = (i: number): [string, string, string, string] => [PROD[i][0], PROD[i][1], PROD[i][3], PROD[i][2]];

  if (mega === "capabilities") {
    return (
      <MegaPanel
        groups={[
          ["Engineering & AI", [ci(0, "Cloud-native builds, platforms, integrations"), ci(1, "GenAI, assistants, and automation in production")]],
          ["Cloud & Transformation", [ci(2, "Migrate and modernize ERP, HCM, SCM on OCI"), ci(3, "Reshape operations around a modern digital core")]],
          ["Operate & Run", [ci(4, "SLAs, monitoring, and continuous improvement")]],
        ]}
        feature={{
          img: "/img/meeting.jpg",
          label: "How we work",
          title: "Design, build, run",
          desc: "One team from assessment through production and managed operations.",
          href: a("#why"),
        }}
      />
    );
  }
  if (mega === "industries") {
    return (
      <MegaPanel
        groups={[
          ["Regulated", [ii(0), ii(3)]],
          ["Operations", [ii(1), ii(2)]],
          ["Commerce", [ii(4)]],
        ]}
        feature={{
          img: "/img/finance.jpg",
          label: "Client impact",
          title: "Proof in production",
          desc: "Outcomes delivered across regulated, high-stakes industries.",
          href: a("#why"),
        }}
      />
    );
  }
  return (
    <MegaPanel
      groups={[
        ["AI products", [pi(1), pi(2), pi(4), pi(5)]],
        ["Commerce & retail", [pi(6), pi(10), pi(3), pi(7), pi(9)]],
        ["Platforms", [pi(0), pi(8)]],
      ]}
      feature={{
        img: "/img/ai.jpg",
        label: "Built by Consult America",
        title: "11 live products",
        desc: "Real, deployed apps across AI, commerce, healthcare, and booking.",
        href: a("#contact"),
      }}
    />
  );
}
