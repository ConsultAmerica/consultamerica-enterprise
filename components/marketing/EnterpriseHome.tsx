"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  CAP_ICONS,
  CAPS,
  CLIENTS,
  COUNTERS,
  ECO,
  IND_ICONS,
  INDUSTRIES,
  PROD,
} from "@/data/marketing";
import { AssistantPalette } from "@/components/assistant/AssistantPalette";
import { ExpertForm } from "@/components/marketing/ExpertForm";
import { ContactFab } from "@/components/marketing/ContactFab";
import { INSIGHTS } from "@/data/insights";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CONTACT_CTA, PRIMARY_NAV, navHref, type MegaKey } from "@/components/marketing/nav-config";
import { MobileNavLinks, useMobileMenuEscape } from "@/components/marketing/SiteNav";

const MENU_TOGGLE_ID = "navToggle";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runCountersOnce(done: { current: boolean }) {
  if (done.current) return;
  done.current = true;
  document.querySelectorAll<HTMLElement>(".cv").forEach((el) => {
    const raw = el.dataset.to ?? "0";
    const to = parseFloat(raw);
    const dec = raw.includes(".") ? 1 : 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / 1100, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

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

const CHEV = (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ARROW_BTN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function PathIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function MegaItem({
  title,
  desc,
  icon,
  href,
}: {
  title: string;
  desc: string;
  icon: string;
  href: string;
}) {
  const ext = /^https?:/.test(href);
  // sector pictograms render bare (no tinted chip) at 34px; product/feature
  // artwork keeps the rounded 36px chip; anything else is an inline SVG path
  const isPict = /^\/?img\/sectors\//.test(icon);
  const isImg = /^\/?img\//.test(icon) || /\.(png|jpe?g|svg|webp)$/i.test(icon);
  const src = icon.startsWith("/") ? icon : `/${icon}`;

  return (
    <a className="mitem" href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className={`mi${isPict ? " mi-pict" : isImg ? " mi-img" : ""}`}>
        {isPict ? (
          <img src={src} alt="" />
        ) : isImg ? (
          <img src={src} alt="" width={36} height={36} />
        ) : (
          <PathIcon d={icon} />
        )}
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

function MegaFeature({
  img,
  label,
  title,
  desc,
  href,
}: {
  img: string;
  label: string;
  title: string;
  desc: string;
  href: string;
}) {
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

function MegaPanel({
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

export function EnterpriseHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  useMobileMenuEscape(menuOpen, setMenuOpen, MENU_TOGGLE_ID);
  const [expertOpen, setExpertOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [capSel, setCapSel] = useState(0);
  const [indSel, setIndSel] = useState(0);
  const countersRun = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);
  const heroSources = !reducedMotion;

  const openCmdk = () => setCmdkOpen(true);
  const closeCmdk = useCallback(() => setCmdkOpen(false), []);

  useEffect(() => {
    if (!heroSources || !videoRef.current) return;
    const v = videoRef.current;
    v.load();
    const play = v.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  }, [heroSources]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
          if (entry.target.id === "counters") runCountersOnce(countersRun);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    document.querySelectorAll(".reveal, #counters").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const pxs = [...document.querySelectorAll<HTMLElement>("[data-parallax]")];
    let ticking = false;
    const px = () => {
      ticking = false;
      const vh = window.innerHeight;
      pxs.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const prog = (r.top + r.height / 2 - vh / 2) / vh;
        const sp = parseFloat(el.dataset.parallax ?? "0");
        el.style.transform = `translate3d(0,${(prog * sp).toFixed(1)}px,0)`;
      });
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(px);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", px, { passive: true });
    px();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", px);
    };
  }, [reducedMotion]);

  // Floating nav: once the islands clear the hero media, swap the brand to dark
  // and make the link capsule opaque so it stays readable over light sections.
  useEffect(() => {
    const navEl = document.getElementById("nav");
    if (!navEl) return;
    const heroEl = document.querySelector<HTMLElement>(".hero");
    let ticking = false;
    let lastY = window.scrollY;
    const sync = () => {
      ticking = false;
      const y = window.scrollY;
      const limit = (heroEl?.offsetHeight ?? 600) - 120;
      navEl.classList.toggle("scrolled", y > limit);
      // dissipate once we're past the hero and still heading down; bring it
      // back the moment the user scrolls up or returns to the top
      if (y <= limit) navEl.classList.remove("nav-gone");
      else if (y > lastY + 4) navEl.classList.add("nav-gone");
      else if (y < lastY - 4) navEl.classList.remove("nav-gone");
      lastY = y;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(sync);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    sync();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const ci = (i: number, d: string): [string, string, string, string] => [
    CAPS[i][0],
    d,
    CAP_ICONS[i],
    "#capabilities",
  ];
  const ii = (i: number): [string, string, string, string] => [
    INDUSTRIES[i][0],
    INDUSTRIES[i][1],
    IND_ICONS[i],
    "#industries",
  ];
  const pi = (i: number): [string, string, string, string] => [
    PROD[i][0],
    PROD[i][1],
    PROD[i][3],
    PROD[i][2],
  ];

  const megaPanels: Record<MegaKey, { id: string; panel: ReactNode }> = {
    capabilities: {
      id: "megaCap",
      panel: (
        <MegaPanel
          groups={[
            [
              "Engineering & AI",
              [
                ci(0, "Cloud-native builds, platforms, integrations"),
                ci(1, "GenAI, assistants, and automation in production"),
              ],
            ],
            [
              "Cloud & Transformation",
              [
                ci(2, "Migrate and modernize ERP, HCM, SCM on OCI"),
                ci(3, "Reshape operations around a modern digital core"),
              ],
            ],
            ["Operate & Run", [ci(4, "SLAs, monitoring, and continuous improvement")]],
          ]}
          feature={{
            img: "/img/meeting.jpg",
            label: "How we work",
            title: "Design, build, run",
            desc: "One team from assessment through production and managed operations.",
            href: "#why",
          }}
        />
      ),
    },
    industries: {
      id: "megaInd",
      panel: (
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
            href: "#why",
          }}
        />
      ),
    },
    products: {
      id: "megaProd",
      panel: (
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
            href: "#contact",
          }}
        />
      ),
    },
  };

  return (
    <>
      <header className="nav" id="nav">
        <div className="wrap nav-inner">
          <a href="#top" className="brand">
            <img className="mark" src="/logo-mark3.png?v=m1" alt="" aria-hidden />
            <span className="bt">
              <span className="bw">
                <b>Consult</b> <em>America</em>
              </span>
              <span className="btag">AI Technology and Services</span>
            </span>
          </a>
          <nav className="nav-mid" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const mega = item.mega ? megaPanels[item.mega] : null;
              return mega ? (
                <div className="nav-item has-mega" key={item.label}>
                  <a href={navHref(item, true)}>
                    {item.label} {CHEV}
                  </a>
                  <div className="mega" id={mega.id}>
                    {mega.panel}
                  </div>
                </div>
              ) : (
                <div className="nav-item" key={item.label}>
                  <Link href={navHref(item, true)}>{item.label}</Link>
                </div>
              );
            })}
          </nav>
          <div className="nav-right">
            <button type="button" className="ask-nav" aria-label="Ask Consult America AI" onClick={openCmdk}>
              <span className="spk">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" />
                </svg>
              </span>
              Ask AI
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setExpertOpen(true)}>
              {CONTACT_CTA.label} {ARROW_BTN}
            </button>
            <button
              type="button"
              className="nav-toggle"
              id={MENU_TOGGLE_ID}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-controls="mobileMenu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          </div>
        </div>
        <div className={`mobile-menu${menuOpen ? " open" : ""}`} id="mobileMenu">
          <MobileNavLinks onHome onNavigate={() => setMenuOpen(false)} />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openCmdk();
            }}
          >
            Ask Consult America AI
          </a>
          <button type="button" className="btn btn-primary" onClick={() => { setMenuOpen(false); setExpertOpen(true); }}>
            {CONTACT_CTA.label}
          </button>
        </div>
      </header>

      <a id="top" />

      {/* 1. HERO */}
      <section className="hero">
        <div className="hero-media" data-parallax="90">
          <video
            ref={videoRef}
            id="heroVideo"
            muted
            loop
            playsInline
            preload="metadata"
            poster="/img/hero-poster.jpg"
            aria-hidden
          >
            {heroSources ? (
              <>
                <source src="/img/consult-america-hero.webm" type="video/webm" />
                <source src="/img/consult-america-hero.mp4" type="video/mp4" />
              </>
            ) : null}
          </video>
        </div>
        <div className="wrap hero-inner">
          <h1>
            <span className="l1 h-rise">
              Modernize the <span className="g">digital core.</span>
            </span>
            <span className="l2 h-rise">Build what comes next.</span>
          </h1>
          <p className="sub h-rise">
            Consult America unites engineering, AI, and enterprise consulting, with the specialized technology talent to
            design it, build it, and run it in production.
          </p>
          <div className="hero-actions h-rise">
            <button type="button" className="btn btn-primary" onClick={() => setExpertOpen(true)}>
              Talk to an expert{" "}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <a href="#capabilities" className="btn btn-ghost">
              Explore capabilities{" "}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* 2. BRAND THESIS */}
      <section className="band" id="about">
        <div className="wrap thesis">
          <div className="reveal">
            <span className="eyebrow">Who we are</span>
            <p className="big serif" style={{ marginTop: 22 }}>
              Built where <span className="hl">engineering, AI, and enterprise consulting</span> meet, and backed by the
              specialized talent most firms can only <em>recommend</em>.
            </p>
          </div>
          <div className="thesis-side reveal d1">
            <div className="pill-row">
              <div className="pr">
                <span className="ic">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3 3 7.5l9 4.5 9-4.5z" />
                    <path d="M3 12l9 4.5 9-4.5" />
                    <path d="M3 16.5 12 21l9-4.5" />
                  </svg>
                </span>
                <div>
                  <b>We engineer, not just advise</b>
                  <span>Production systems, not slideware.</span>
                </div>
              </div>
              <div className="pr">
                <span className="ic">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10.5 2.5 12.5 8.5 18.5 10.5 12.5 12.5 10.5 18.5 8.5 12.5 2.5 10.5 8.5 8.5Z" />
                    <path d="M19 3 19.7 4.3 21 5 19.7 5.7 19 7 18.3 5.7 17 5 18.3 4.3Z" />
                    <path d="M5 16.3 5.6 17.4 6.7 18 5.6 18.6 5 19.7 4.4 18.6 3.3 18 4.4 17.4Z" />
                  </svg>
                </span>
                <div>
                  <b>AI-first, operationalized</b>
                  <span>Models that run, monitored and governed.</span>
                </div>
              </div>
              <div className="pr">
                <span className="ic">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="7" r="3" />
                    <path d="M6.5 20a5.5 5.5 0 0 1 11 0" />
                    <circle cx="4.5" cy="9.5" r="2" />
                    <path d="M2.3 18.4a3.1 3.1 0 0 1 4.4-2.8" />
                    <circle cx="19.5" cy="9.5" r="2" />
                    <path d="M21.7 18.4a3.1 3.1 0 0 0-4.4-2.8" />
                  </svg>
                </span>
                <div>
                  <b>Talent on tap</b>
                  <span>Elite engineers and Oracle specialists.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2.5 CLIENTS */}
      <section className="clients" id="clients">
        <p className="clients-kick reveal">Trusted by enterprise &amp; public-sector organizations</p>
        <div className="marquee reveal">
          <div className="marquee-track" id="clientTrack">
            {[0, 1].map((copy) => (
              <div className="marquee-group" key={copy} aria-hidden={copy === 1}>
                {CLIENTS.map(([id, name]) => (
                  <img
                    key={`${copy}-${id}`}
                    className="client-logo"
                    src={`/img/clients/${id}.png`}
                    alt={copy === 0 ? name : ""}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. CAPABILITIES */}
      <section className="band darkbg" id="capabilities">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Capabilities</span>
            <h2>One partner across the transformation.</h2>
            <p>From the first line of code to the systems your teams operate every day.</p>
          </div>
          <div className="cap-feat reveal">
            <div className="cap-stage" id="capStage">
              {CAPS.map(([title, , img], i) => (
                <img key={title} src={img} alt={title} className={i === capSel ? "on" : ""} data-i={i} />
              ))}
            </div>
            <div className="cap-list" id="capList">
              {CAPS.map(([title, desc], i) => (
                <button
                  key={title}
                  type="button"
                  className={`cap-row${i === capSel ? " active" : ""}`}
                  data-i={i}
                  onMouseEnter={() => setCapSel(i)}
                  onFocus={() => setCapSel(i)}
                  onClick={() => setCapSel(i)}
                >
                  <div className="st">
                    <h3>{title}</h3>
                    <span className="nub">0{i + 1}</span>
                  </div>
                  <div className="sd">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. IMMERSIVE AI */}
      <section className="aimoment" id="ai">
        <div className="aimoment-media" data-parallax="80">
          <img src="/img/ai.jpg" alt="Connected intelligence network" />
        </div>
        <div className="wrap aimoment-inner reveal">
          <span className="eyebrow" style={{ color: "var(--cyan)" }}>
            Artificial Intelligence
          </span>
          <h2 style={{ marginTop: 20 }}>
            Where data becomes <span className="g">decisions</span>, and decisions become systems that run themselves.
          </h2>
          <p>
            We connect the enterprise core to AI that forecasts, triages, and automates, then wrap it in the monitoring
            and guardrails that let it hold up in production.
          </p>
          <div className="aimoment-actions">
            <button type="button" className="btn btn-primary" id="aiAsk" onClick={openCmdk}>
              Ask our AI how {ARROW_BTN}
            </button>
            <a href="#capabilities" className="btn btn-ghost">
              Explore AI &amp; Data
            </a>
          </div>
        </div>
      </section>

      {/* 5. PROOF / SCALE */}
      <section className="band tintbg" id="why">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Proof &amp; scale</span>
            <h2>Outcomes you can measure, delivered end-to-end.</h2>
          </div>
          <div className="counters reveal" id="counters">
            {COUNTERS.map(([n, suffix, label]) => (
              <div className="counter" key={label}>
                <div className="n">
                  <span className="cv" data-to={n}>
                    0
                  </span>
                  {suffix}
                </div>
                <div className="l">{label}</div>
              </div>
            ))}
          </div>
          <div className="scale-note reveal">
            <span className="demotag">Demo</span>
            Figures are illustrative placeholders for this showcase, not verified client results.
          </div>
        </div>
      </section>

      {/* 6. CLIENT IMPACT */}
      <section className="impact">
        <div className="impact-media" data-parallax="70">
          <img src="/img/meeting.jpg" alt="Consulting team at work" />
        </div>
        <div className="wrap impact-inner reveal">
          <div className="tagrow">
            <span className="eyebrow" style={{ color: "var(--cyan)" }}>
              Client impact
            </span>
            <span className="demotag">Illustrative scenario</span>
          </div>
          <h2>
            How a global financial-services firm went from a brittle legacy core to{" "}
            <span style={{ color: "var(--cyan)" }}>AI-assisted close</span>, in two quarters.
          </h2>
          <div className="imp-stat">
            <div>
              <div className="n">6-10 wks</div>
              <div className="l">to first production workload</div>
            </div>
            <div>
              <div className="n">40%</div>
              <div className="l">faster financial close</div>
            </div>
            <div>
              <div className="n">24/7</div>
              <div className="l">monitored, in managed service</div>
            </div>
          </div>
          <a href="#" className="arrowlink rm" style={{ color: "#fff" }}>
            Read the scenario {ARR_ICON}
          </a>
        </div>
      </section>

      {/* 7. INDUSTRIES */}
      <section className="band darkbg" id="industries">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Industries</span>
            <h2>Context that shortens the distance to value.</h2>
            <p>Hover an industry to see where modernization moves the needle most.</p>
          </div>
          <div className="ind reveal">
            <div className="ind-list" id="indList">
              {INDUSTRIES.map(([name, tagline], i) => (
                <div
                  key={name}
                  className={`ind-row${i === indSel ? " active" : ""}`}
                  data-i={i}
                  tabIndex={0}
                  onMouseEnter={() => setIndSel(i)}
                  onFocus={() => setIndSel(i)}
                  onClick={() => setIndSel(i)}
                >
                  <div>
                    <h3>{name}</h3>
                  </div>
                  <span className="io">{tagline}</span>
                </div>
              ))}
            </div>
            <div className="ind-stage" id="indStage">
              {INDUSTRIES.map(([name, , , img], i) => (
                <img key={name} src={img} alt={name} className={i === indSel ? "on" : ""} data-i={i} />
              ))}
              <div className="ind-cap" id="indCap">
                <div className="ct">{INDUSTRIES[indSel][0]}</div>
                <div className="cd">{INDUSTRIES[indSel][2]}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. TALENT */}
      <section className="band" id="talent">
        <div className="wrap talent">
          <div className="talent-copy reveal">
            <span className="eyebrow">Talent</span>
            <h3 className="big">Beyond projects, we build and place the teams that run them.</h3>
            <p>
              Consulting and engineering are human businesses. We bring specialized technology talent, embedded in your
              teams or hired direct, so capability outlasts the engagement.
            </p>
            <ul className="talent-points">
              <TalentPoint>Engineers, data scientists, and Oracle specialists</TalentPoint>
              <TalentPoint>Embedded squads or direct-hire placement</TalentPoint>
              <TalentPoint>Vetted for the modern enterprise stack</TalentPoint>
            </ul>
            <div className="talent-actions">
              <a href="#contact" className="btn btn-dark">
                Hire through Consult America {ARROW_BTN}
              </a>
              <Link href="/careers" className="btn btn-outline" style={{ background: "#fff", borderColor: "var(--line)", color: "var(--ink)" }}>
                Join our team
              </Link>
            </div>
          </div>
          <div className="talent-gallery reveal d1">
            <div className="g g1">
              <img src="/img/team2.jpg" alt="Team collaborating" />
            </div>
            <div className="g">
              <img src="/img/dev.jpg" alt="Engineering" />
            </div>
            <div className="g">
              <img src="/img/careers.jpg" alt="Our people" />
            </div>
          </div>
        </div>
      </section>

      {/* 9. TECHNOLOGY ECOSYSTEM */}
      <section className="band darkbg" id="ecosystem">
        <div className="wrap eco">
          <div className="reveal">
            <span className="eyebrow">Technology ecosystem</span>
            <h2 style={{ fontSize: "clamp(30px,3.8vw,46px)", fontWeight: 600, margin: "16px 0 14px" }}>
              We engineer across the modern enterprise stack.
            </h2>
            <p style={{ color: "rgba(255,255,255,.72)", fontSize: 17, maxWidth: "46ch" }}>
              Deep in the Oracle digital core, fluent across cloud, data, and AI, and disciplined about the engineering
              practice that keeps it all running.
            </p>
            <div className="eco-domains" id="ecoDomains">
              {ECO.map(([title, sub], i) => (
                <div className="eco-dom" key={title}>
                  <img className="eco-ill" src={`/img/eco${i + 1}.png`} alt={title} />
                  <b>{title}</b>
                  <span>{sub}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="eco-visual reveal d1">
            <img src="/img/engineer.jpg" alt="Hands-on engineering" />
          </div>
        </div>
      </section>

      {/* 10. INSIGHTS */}
      <section className="band tintbg" id="insights">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Insights</span>
            <h2>Research &amp; perspectives.</h2>
            <p>How enterprises are rebuilding the digital core for an AI-native decade.</p>
          </div>
          <div className="ins reveal">
            <Link className="ins-feat" href={`/insights/${INSIGHTS[0].slug}`}>
              <img src={INSIGHTS[0].image} alt="" />
              <div className="ins-body">
                <div className="ins-meta">
                  <span>{INSIGHTS[0].kind}</span>
                  <span className="dot" />
                  <span className="mut">{INSIGHTS[0].date}</span>
                  <span className="dot" />
                  <span className="mut">{INSIGHTS[0].readTime}</span>
                </div>
                <h3>{INSIGHTS[0].title}</h3>
                <span className="arrowlink rm" style={{ color: "#fff" }}>
                  Read more {ARR_ICON}
                </span>
              </div>
            </Link>
            <div className="ins-col">
              {INSIGHTS.slice(1, 3).map((a) => (
                <Link className="ins-small" href={`/insights/${a.slug}`} key={a.slug}>
                  <img src={a.image} alt="" />
                  <div className="ins-body">
                    <div className="ins-meta">
                      <span>{a.kind}</span>
                      <span className="dot" />
                      <span className="mut">{a.readTime}</span>
                    </div>
                    <h3>{a.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 11. CAREERS */}
      <section className="careers" id="careers">
        <div className="careers-media" data-parallax="70">
          <img src="/img/careers.jpg" alt="Consult America people" />
        </div>
        <div className="wrap careers-inner reveal">
          <span className="eyebrow" style={{ color: "var(--cyan)" }}>
            Careers
          </span>
          <h2 style={{ marginTop: 18 }}>Build what comes next, with us.</h2>
          <p>
            We hire engineers, data scientists, and consultants who want to ship real systems for real enterprises, and
            to keep growing while they do it.
          </p>
          <div className="careers-actions">
            <Link href="/careers" className="btn btn-primary">
              Explore careers {ARROW_BTN}
            </Link>
            <a href="#talent" className="btn btn-ghost">
              Life at Consult America
            </a>
          </div>
        </div>
      </section>

      {/* 12. CTA */}
      <section className="band cta" id="contact">
        <div className="wrap cta-inner reveal">
          <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
            Start the conversation
          </span>
          <h2 style={{ marginTop: 18 }}>Ready to modernize the core?</h2>
          <p>
            Tell us where you are. A specialist will map the fastest path from your legacy systems to AI in production,
            and the team to get you there.
          </p>
          <div className="cta-actions">
            <button type="button" className="btn btn-primary" onClick={() => setExpertOpen(true)}>
              Talk to an expert {ARROW_BTN}
            </button>
            <a href="#" className="btn btn-ghost">
              Book a 30-min call
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />

      {/* Ask AI command palette */}
      <AssistantPalette open={cmdkOpen} onClose={closeCmdk} context={{ page: "home" }} />

      <ContactFab onAskAi={openCmdk} onTalkToExpert={() => setExpertOpen(true)} />
      <ExpertForm open={expertOpen} onClose={() => setExpertOpen(false)} />
    </>
  );
}

function TalentPoint({ children }: { children: ReactNode }) {
  return (
    <li>
      <span className="ck">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {children}
    </li>
  );
}
